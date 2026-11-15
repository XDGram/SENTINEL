"use client";

// Watchdog introducing itself to a first-time visitor.
//
// It cannot simply start talking on load: Chrome, Safari and Firefox all block
// audio until the visitor has interacted with the page. So this tries to play,
// and when the browser refuses it offers a chip to press instead. Either way
// the greeting is one click away rather than a surprise.
//
// The clip is a static file, not a synthesis call: the wording never changes,
// so it plays instantly, costs nothing per visitor and still works if ai33pro
// is unreachable.

import { Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useVoice } from "./VoiceProvider";

const SRC = "/intro-watchdog.mp3";
const SEEN_KEY = "watchdog:intro-seen";

/**
 * When the closing line, "you can turn my voice off with the speaker above",
 * begins. Measured from the audio itself: the last pause ends at 21.2s of
 * 24.2s, so the control lights up just before it is named.
 */
const MUTE_CUE_S = 21;

type Phase = "idle" | "offered" | "playing" | "done";

export function Intro() {
  const voice = useVoice();
  const [phase, setPhase] = useState<Phase>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  const finish = useCallback(() => {
    setPhase("done");
    voice?.setMuteHighlight(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Blocked storage only means it may greet them again next visit.
    }
  }, [voice]);

  const play = useCallback(async (): Promise<boolean> => {
    if (startedRef.current) return true;
    const a = (audioRef.current ??= new Audio(SRC));
    a.preload = "auto";
    try {
      await a.play();
    } catch {
      // Autoplay refused: the chip below asks for the click that allows it.
      return false;
    }
    startedRef.current = true;
    setPhase("playing");
    // Anything Watchdog says later should not talk over the introduction.
    voice?.stop();
    return true;
  }, [voice]);

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
    if ((seen && !forced) || voice?.muted) {
      setPhase("done");
      return;
    }

    let cancelled = false;
    void play().then((ok) => {
      if (cancelled) return;
      if (!ok) setPhase("offered");
    });

    // If the browser refused, the visitor's first click anywhere is a valid
    // gesture. Links are ignored: starting a 24-second greeting as someone
    // navigates away would only follow them with sound.
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("a")) return;
      void play();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onPointerDown);
    };
    // Runs once: this is a greeting, not something that re-arms on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light up the mute control exactly as the voice mentions it.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || phase !== "playing") return;
    const onTime = () => {
      if (a.currentTime >= MUTE_CUE_S) voice?.setMuteHighlight(true);
    };
    const onEnd = () => {
      // Hold the highlight briefly after the sentence lands.
      window.setTimeout(() => voice?.setMuteHighlight(false), 2500);
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
  }, [phase, voice, finish]);

  // Muting part-way through stops the greeting too.
  useEffect(() => {
    if (voice?.muted && phase === "playing") skip();
  }, [voice?.muted, phase, skip]);

  useEffect(() => () => audioRef.current?.pause(), []);

  if (phase === "done" || phase === "idle") return null;

  const playing = phase === "playing";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 sm:inset-x-auto sm:left-6 sm:justify-start">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-white/95 py-2 pr-2 pl-4 shadow-[0_10px_30px_-12px_rgb(0_0_0/.35)] backdrop-blur",
        )}
        role="status"
      >
        <span className="flex items-center gap-2 text-sm text-ink">
          {playing ? (
            <span className="flex h-4 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-ink"
                  style={{ animation: `watchdog-bar 700ms ${i * 110}ms ease-in-out infinite alternate`, height: "35%" }}
                />
              ))}
            </span>
          ) : (
            <Volume2 className="h-4 w-4 text-ink-soft" aria-hidden />
          )}
          {playing ? "Watchdog is introducing itself" : "Hear what Watchdog does"}
          {!playing && <span className="label-mono text-ink-soft">24s</span>}
        </span>

        {playing ? (
          <button
            type="button"
            onClick={skip}
            className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
          >
            Skip
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void play()}
              className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
            >
              Play
            </button>
            <button
              type="button"
              onClick={finish}
              aria-label="Dismiss the introduction"
              className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.05]"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
