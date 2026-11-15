"use client";

// Listen / stop / mute, plus the automatic read when a transaction is paused.
// Monochrome by design: voice is not a verdict, so it never takes a danger
// colour. The animated bars run regardless of the reduced-motion setting, in
// keeping with the app's ambient motion.

import { Loader2, Volume2, VolumeX } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useVoice } from "./VoiceProvider";

function SpeakingBars({ dark }: { dark?: boolean }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-full", dark ? "bg-white" : "bg-ink")}
          style={{ animation: `watchdog-bar 700ms ${i * 120}ms ease-in-out infinite alternate`, height: "40%" }}
        />
      ))}
    </span>
  );
}

export function ListenButton({
  text,
  id,
  source = "manual",
  dark,
  className,
  label = "Listen",
}: {
  text: string;
  id?: string;
  source?: string;
  dark?: boolean;
  className?: string;
  label?: string;
}) {
  const voice = useVoice();
  if (!voice || !text.trim()) return null;

  const clipId = id ?? text.slice(0, 60);
  const isActive = voice.activeId === clipId;
  const preparing = isActive && voice.state === "preparing";
  const playing = isActive && voice.state === "playing";

  return (
    <button
      type="button"
      onClick={() => (playing || preparing ? voice.stop() : voice.speak(text, { id: clipId, source }))}
      aria-label={playing ? "Stop reading" : `${label}: read this out loud`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase transition-colors",
        dark
          ? "border-line-dark text-white/70 hover:bg-white/10 hover:text-white"
          : "border-line text-ink-soft hover:bg-black/[0.04] hover:text-ink",
        className,
      )}
    >
      {preparing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : playing ? (
        <SpeakingBars dark={dark} />
      ) : (
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
      )}
      {preparing ? "Preparing" : playing ? "Stop" : label}
    </button>
  );
}

export function MuteToggle({ dark, className }: { dark?: boolean; className?: string }) {
  const voice = useVoice();
  if (!voice) return null;
  return (
    <button
      type="button"
      onClick={() => voice.setMuted(!voice.muted)}
      aria-pressed={voice.muted}
      aria-label={voice.muted ? "Turn Watchdog's voice on" : "Turn Watchdog's voice off"}
      title={voice.muted ? "Voice off" : "Voice on"}
      className={cn(
        "relative grid h-7 w-7 place-items-center rounded-full border transition-colors",
        dark ? "border-line-dark text-white/55 hover:bg-white/10" : "border-line text-ink-soft hover:bg-black/[0.04]",
        // While the introduction names this control, draw the eye to it.
        voice.muteHighlight && "border-ink text-ink",
        className,
      )}
    >
      {voice.muteHighlight && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-ink"
          style={{ animation: "watchdog-pulse 1.4s ease-out infinite" }}
          aria-hidden
        />
      )}
      {voice.muted ? <VolumeX className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/**
 * Reads a verdict out loud once, as soon as it arrives. Only for the moment a
 * transaction is actually paused: a safe result does not interrupt anyone.
 */
export function useAutoSpeak(text: string, enabled: boolean, opts: { id?: string; source?: string } = {}) {
  const voice = useVoice();
  const id = opts.id ?? text.slice(0, 60);
  useEffect(() => {
    if (!voice || !enabled || !text.trim() || voice.muted) return;
    void voice.speak(text, { id, source: opts.source ?? "verdict", auto: true });
    // Re-running on every render would re-read the same verdict; the `auto`
    // flag in the provider also guards against that.
  }, [voice, enabled, text, id, opts.source]);
}
