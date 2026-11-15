"use client";

// Watchdog's voice, client side.
//
// One shared <audio> element for the whole app, so two results can never talk
// over each other. Generation runs through /api/voice (ai33pro, Bella); if that
// fails for any reason the device's own speech engine reads the same words, so
// a failure changes the voice rather than silencing it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type VoiceState = "idle" | "preparing" | "playing";

export interface VoiceApi {
  /** Muted means nothing speaks automatically, and the Listen button is a no-op. */
  muted: boolean;
  setMuted: (v: boolean) => void;
  state: VoiceState;
  /** Which clip is preparing or playing, so only that button shows a spinner. */
  activeId: string | null;
  /** True once a clip could not autoplay: the user has to press Listen. */
  needsGesture: boolean;
  speak: (text: string, opts?: { id?: string; source?: string; auto?: boolean }) => Promise<void>;
  stop: () => void;
}

const VoiceContext = createContext<VoiceApi | null>(null);

const MUTE_KEY = "watchdog:voice-muted";

/** Pick a female English voice from the browser's own set, if there is one. */
function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => /^en\b/i.test(v.lang));
  const preferred = english.find((v) => /female|samantha|zira|aria|jenny|libby|sonia/i.test(v.name));
  return preferred ?? english[0] ?? voices[0];
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Guards double-speaking when React re-renders a result.
  const spokenRef = useRef<Set<string>>(new Set());
  const requestRef = useRef(0);

  useEffect(() => {
    try {
      setMutedState(window.localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      // Private mode or blocked storage: default to unmuted.
    }
    // Some browsers populate the voice list asynchronously.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const warm = () => pickBrowserVoice();
      window.speechSynthesis.addEventListener?.("voiceschanged", warm);
      warm();
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", warm);
    }
  }, []);

  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
    try {
      window.localStorage.setItem(MUTE_KEY, v ? "1" : "0");
    } catch {
      // Not worth surfacing: the toggle still works for this session.
    }
    if (v) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setState("idle");
      setActiveId(null);
    }
  }, []);

  const stop = useCallback(() => {
    requestRef.current++;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setState("idle");
    setActiveId(null);
  }, []);

  const browserFallback = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setState("idle");
      setActiveId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickBrowserVoice();
    if (v) u.voice = v;
    u.rate = 1;
    u.onend = () => {
      setState("idle");
      setActiveId(null);
    };
    u.onerror = u.onend;
    setState("playing");
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback(
    async (text: string, opts: { id?: string; source?: string; auto?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (muted) return;

      const id = opts.id ?? trimmed.slice(0, 60);
      // An automatic read happens once per clip; pressing Listen always replays.
      if (opts.auto) {
        if (spokenRef.current.has(id)) return;
        spokenRef.current.add(id);
      }

      const ticket = ++requestRef.current;
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setState("preparing");
      setActiveId(id);

      let audioUrl: string | null = null;
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, source: opts.source ?? "manual" }),
        });
        const body = (await res.json().catch(() => null)) as { audioUrl?: string } | null;
        if (res.ok && body?.audioUrl) audioUrl = body.audioUrl;
      } catch {
        // Offline or blocked: the fallback below still speaks.
      }

      // A newer request started while this one was generating.
      if (ticket !== requestRef.current) return;

      if (!audioUrl) {
        browserFallback(trimmed);
        return;
      }

      const a = (audioRef.current ??= new Audio());
      a.src = audioUrl;
      a.onended = () => {
        if (ticket !== requestRef.current) return;
        setState("idle");
        setActiveId(null);
      };
      a.onerror = () => {
        if (ticket !== requestRef.current) return;
        // The CDN URL did not play; say it with the browser instead.
        browserFallback(trimmed);
      };

      try {
        await a.play();
        if (ticket !== requestRef.current) return;
        setNeedsGesture(false);
        setState("playing");
      } catch {
        // Browsers refuse audio until the user has interacted with the page.
        // Surface that as "press Listen" rather than failing quietly.
        if (ticket !== requestRef.current) return;
        setNeedsGesture(true);
        setState("idle");
        setActiveId(null);
      }
    },
    [browserFallback, muted],
  );

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  const value = useMemo<VoiceApi>(
    () => ({ muted, setMuted, state, activeId, needsGesture, speak, stop }),
    [muted, setMuted, state, activeId, needsGesture, speak, stop],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

/**
 * Voice controls are optional: a component can call this and render nothing
 * when the provider is absent, which keeps it usable in isolation.
 */
export function useVoice(): VoiceApi | null {
  return useContext(VoiceContext);
}
