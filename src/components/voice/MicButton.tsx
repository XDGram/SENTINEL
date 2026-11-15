"use client";

// Speaking a question instead of typing it, using the browser's own
// SpeechRecognition. Chrome, Edge and Safari support it; Firefox does not, so
// the button hides itself rather than offering something that cannot work.

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function MicButton({
  onTranscript,
  onSubmit,
  dark,
  className,
}: {
  /** Called as speech is recognised, so the input fills in live. */
  onTranscript: (text: string) => void;
  /** Called with the final transcript when the user stops speaking. */
  onSubmit?: (text: string) => void;
  dark?: boolean;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()));
    return () => recRef.current?.stop();
  }, []);

  if (!supported) return null;

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    finalRef.current = "";
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      onTranscript((finalRef.current + interim).trim());
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      if (text && onSubmit) onSubmit(text);
    };
    rec.onerror = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => (listening ? recRef.current?.stop() : start())}
      aria-label={listening ? "Stop listening" : "Ask by voice"}
      aria-pressed={listening}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors",
        listening
          ? dark
            ? "border-white/40 bg-white/15 text-white"
            : "border-ink/30 bg-ink/10 text-ink"
          : dark
            ? "border-line-dark text-white/60 hover:bg-white/10"
            : "border-line text-ink-soft hover:bg-black/[0.04]",
        className,
      )}
    >
      {listening ? (
        <span className="relative grid place-items-center">
          <span
            className={cn("absolute h-6 w-6 rounded-full", dark ? "bg-white/25" : "bg-ink/20")}
            style={{ animation: "watchdog-pulse 1.4s ease-out infinite" }}
            aria-hidden
          />
          <Square className="relative h-3 w-3" aria-hidden />
        </span>
      ) : (
        <Mic className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
