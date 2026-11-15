"use client";

// Watchdog introducing itself to a first-time visitor.
//
// It cannot simply start talking on load: Chrome, Safari and Firefox block
// audio until the visitor has interacted with the page, and refuse with
// NotAllowedError. So the invitation sits in the hero, in the reading path,
// where it is the obvious next thing to press. Any other click on the page
// starts it too.
//
// The clip is a static file, not a synthesis call: the wording never changes,
// so it plays instantly, costs nothing per visitor and still works if ai33pro
// is unreachable.

import { Play, Volume2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useVoice } from "./VoiceProvider";

const SRC = "/intro-watchdog.mp3";
const SEEN_KEY = "watchdog:intro-seen";

/**
 * When the closing line, "you can turn my voice off with the speaker above",
 * begins. Measured from the audio: the last pause ends at 21.2s of 24.2s, so
 * the control lights up just before it is named.
 */
const MUTE_CUE_S = 21;

type Phase = "offered" | "playing" | "done";

interface IntroApi {
  phase: Phase;
  play: () => void;
  skip: () => void;
  dismiss: () => void;
}

const IntroContext = createContext<IntroApi | null>(null);

export function IntroProvider({ children }: { children: React.ReactNode }) {
  const voice = useVoice();
  const [phase, setPhase] = useState<Phase>("done");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  const finish = useCallback(
    (remember = true) => {
      setPhase("done");
      voice?.setMuteHighlight(false);
      if (!remember) return;
      try {
        window.localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Blocked storage only means it may greet them again next visit.
      }
    },
    [voice],
  );

  const attempt = useCallback(async (): Promise<boolean> => {
    if (startedRef.current) return true;
    const a = (audioRef.current ??= new Audio(SRC));
    a.preload = "auto";
    try {
      await a.play();
    } catch {
      return false;
    }
    startedRef.current = true;
    setPhase("playing");
    voice?.stop();
    return true;
  }, [voice]);

  const play = useCallback(() => void attempt(), [attempt]);

  const skip = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    finish();
  }, [finish]);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Treat unreadable storage as a first visit.
    }
    // ?intro=1 replays it on demand, for recording the demo video.
    const forced = new URLSearchParams(window.location.search).get("intro") === "1";
    if (seen && !forced) return;

    setPhase("offered");
    let cancelled = false;
    void attempt().then((ok) => {
      // A browser that allows autoplay just starts; otherwise the hero button
      // waits for a press. Either way nothing is marked as seen yet.
      if (!ok && !cancelled) setPhase("offered");
    });

    // Any click that is not navigation or typing counts as the gesture.
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
    // Runs once: a greeting, not something that re-arms on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light up the mute control exactly as the voice names it.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || phase !== "playing") return;
    const onTime = () => {
      if (a.currentTime >= MUTE_CUE_S) voice?.setMuteHighlight(true);
    };
    const onEnd = () => {
      window.setTimeout(() => voice?.setMuteHighlight(false), 2500);
      finish();
    };
    const onError = () => finish();
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onError);
    };
  }, [phase, voice, finish]);

  // Muting part-way through stops the greeting too.
  useEffect(() => {
    if (voice?.muted && phase === "playing") skip();
  }, [voice?.muted, phase, skip]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const value = useMemo<IntroApi>(() => ({ phase, play, skip, dismiss: () => finish() }), [phase, play, skip, finish]);
  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>;
}

export function useIntro(): IntroApi | null {
  return useContext(IntroContext);
}

/**
 * The invitation, in the hero. This is the press that lets the browser play
 * audio at all, so it sits in the reading path rather than in a corner.
 */
export function IntroButton({ className }: { className?: string }) {
  const intro = useIntro();
  if (!intro || intro.phase !== "offered") return null;
  return (
    <button
      type="button"
      onClick={intro.play}
      className={cn(
        "group relative inline-flex items-center gap-2.5 rounded-full border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-[0_8px_24px_-14px_rgb(0_0_0/.5)] transition-colors hover:bg-ink hover:text-white",
        className,
      )}
    >
      <span className="relative grid h-5 w-5 place-items-center">
        <span
          className="absolute inset-0 rounded-full bg-ink/15 group-hover:bg-white/25"
          style={{ animation: "watchdog-pulse 2s ease-out infinite" }}
          aria-hidden
        />
        <Play className="relative h-3 w-3 fill-current" aria-hidden />
      </span>
      Hear how Watchdog works
      <span className="label-mono text-ink-soft group-hover:text-white/60">24s</span>
    </button>
  );
}

/** The floating bar shown only while the greeting is speaking. */
export function IntroBar() {
  const intro = useIntro();
  if (!intro || intro.phase !== "playing") return null;
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
          Watchdog is introducing itself
        </span>
        <button
          type="button"
          onClick={intro.skip}
          className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/** Kept for the dismiss affordance beside the hero button. */
export function IntroDismiss({ className }: { className?: string }) {
  const intro = useIntro();
  if (!intro || intro.phase !== "offered") return null;
  return (
    <button
      type="button"
      onClick={intro.dismiss}
      aria-label="Dismiss the introduction"
      className={cn("grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.05]", className)}
    >
      <X className="h-3.5 w-3.5" aria-hidden />
      <Volume2 className="hidden" aria-hidden />
    </button>
  );
}
