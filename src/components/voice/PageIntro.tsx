"use client";

// A spoken introduction to a page, in Watchdog's own voice.
//
// Browsers refuse to play audio before the visitor has interacted with the
// page, failing with NotAllowedError, so a page cannot simply start talking.
// The invitation therefore sits in the reading path as a button; pressing it
// is both the browser's consent and the start of the greeting. Any other click
// on the page starts it too, ignoring links and form fields.
//
// Clips are static files. The wording never changes, so they play instantly,
// cost nothing per visitor, and still work if ai33pro is unreachable.

import { Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useVoice } from "./VoiceProvider";

/** Set once any introduction has been played, so a guided visitor is not
 *  asked again on the next page while someone who ignored it is left alone. */
const TOUR_KEY = "watchdog:intro-tour";

/**
 * Which introductions have already run in THIS page load.
 *
 * Deliberately a module variable rather than storage: a refresh creates a new
 * JavaScript context and clears it, so reloading the site greets you again,
 * while clicking back to a page you have already heard in the same session
 * stays quiet.
 */
const playedThisLoad = new Set<string>();

type Phase = "hidden" | "offered" | "playing";

export interface PageIntroProps {
  /** Static clip under /public. */
  src: string;
  /** Rounded length, shown on the button so nobody is ambushed. */
  seconds: number;
  /** Per-page key, so hearing one page does not silence the others within
   *  the same page load. */
  seenKey: string;
  label?: string;
  /** Seconds at which the mute control should light up, if this clip names it. */
  muteCueS?: number;
  className?: string;
}

export function PageIntro({ src, seconds, seenKey, label = "Hear how Watchdog works", muteCueS, className }: PageIntroProps) {
  const voice = useVoice();
  const [phase, setPhase] = useState<Phase>("hidden");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  // Set synchronously, because the button's own click and the document-wide
  // listener both fire for the same press: without this the clip starts twice.
  const startingRef = useRef(false);
  // The document-wide listener is registered once, so reading `voice` from the
  // closure would see whatever it was at mount. The mute state in particular
  // arrives a tick later, from storage, so it must be read through a ref.
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const finish = useCallback(() => {
    setPhase("hidden");
    voice?.setMuteHighlight(false);
    playedThisLoad.add(seenKey);
  }, [voice, seenKey]);

  const attempt = useCallback(async (explicit = false): Promise<boolean> => {
    if (startedRef.current || startingRef.current) return true;
    // Muted means no sound, but the invitation still shows: pressing it is a
    // clear request to hear this, so it lifts the mute. A click elsewhere on
    // the page is not, and leaves the mute alone.
    const v = voiceRef.current;
    if (v?.muted) {
      if (!explicit) return false;
      v.setMuted(false);
    }
    startingRef.current = true;
    const a = (audioRef.current ??= new Audio(src));
    a.preload = "auto";
    try {
      await a.play();
    } catch {
      // Autoplay refused; allow a later, user-initiated attempt.
      startingRef.current = false;
      return false;
    }
    startedRef.current = true;
    setPhase("playing");
    // Nothing else should talk over an introduction.
    voiceRef.current?.stop();
    try {
      window.sessionStorage.setItem(TOUR_KEY, "1");
    } catch {
      // Not essential.
    }
    return true;
  }, [src]);

  const skip = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    finish();
  }, [finish]);

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("intro") === "1";
    if (playedThisLoad.has(seenKey) && !forced) return;

    setPhase("offered");
    let cancelled = false;
    // Read the mute flag straight from storage: the provider loads it in its
    // own effect, which runs after this one, so trusting context here would
    // try to speak to someone who had turned the voice off.
    let mutedNow = false;
    try {
      mutedNow = window.localStorage.getItem("watchdog:voice-muted") === "1";
    } catch {
      // Unreadable storage just means we treat them as unmuted.
    }
    // Someone already on the tour has audio unlocked, so this just starts.
    if (!mutedNow) {
      void attempt().then((ok) => {
        if (!ok && !cancelled) setPhase("offered");
      });
    }

    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("a, input, textarea, select, form")) return;
      void attempt();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onPointerDown);
    };
    // Runs once per page: a greeting, not something that re-arms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || phase !== "playing") return;
    const onTime = () => {
      if (muteCueS != null && a.currentTime >= muteCueS) voice?.setMuteHighlight(true);
    };
    const onEnd = () => {
      if (muteCueS != null) window.setTimeout(() => voice?.setMuteHighlight(false), 2500);
      finish();
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", finish);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", finish);
    };
  }, [phase, voice, finish, muteCueS]);

  // Muting part-way through stops the greeting too.
  useEffect(() => {
    if (voice?.muted && phase === "playing") skip();
  }, [voice?.muted, phase, skip]);

  // Yield to anything Watchdog is asked to say: a verdict must not have to
  // compete with the introduction still running in the background.
  useEffect(() => {
    if (!voice || phase !== "playing") return;
    return voice.registerInterruptible(() => {
      audioRef.current?.pause();
      finish();
    });
  }, [voice, phase, finish]);

  useEffect(() => () => audioRef.current?.pause(), []);

  if (phase === "hidden") return null;

  if (phase === "playing") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-white/95 py-2 pr-2 pl-4 shadow-[0_10px_30px_-12px_rgb(0_0_0/.35)] backdrop-blur"
          role="status"
        >
          <span className="flex items-center gap-2 text-sm text-ink">
            <span className="flex h-4 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-ink"
                  style={{ animation: `watchdog-bar 700ms ${i * 110}ms ease-in-out infinite alternate`, height: "35%" }}
                />
              ))}
            </span>
            Watchdog is explaining this page
          </span>
          <button
            type="button"
            onClick={skip}
            className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <button
        type="button"
        onClick={() => void attempt(true)}
        className="group relative inline-flex items-center gap-2.5 rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-[0_8px_24px_-14px_rgb(0_0_0/.5)] transition-colors hover:bg-ink hover:text-white"
      >
        <span className="relative grid h-5 w-5 place-items-center">
          <span
            className="absolute inset-0 rounded-full bg-ink/15 group-hover:bg-white/25"
            style={{ animation: "watchdog-pulse 2s ease-out infinite" }}
            aria-hidden
          />
          <Play className="relative h-3 w-3 fill-current" aria-hidden />
        </span>
        {label}
        <span className="label-mono text-ink-soft group-hover:text-white/60">{seconds}s</span>
      </button>
      <button
        type="button"
        onClick={finish}
        aria-label="Dismiss the introduction"
        className="grid h-8 w-8 place-items-center rounded-full text-sm text-ink-soft transition-colors hover:bg-black/[0.05]"
      >
        ✕
      </button>
    </div>
  );
}
