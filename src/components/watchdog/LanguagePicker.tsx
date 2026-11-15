"use client";

// Choosing the language an explanation comes back in.
//
// Only the languages SERV has actually been exercised in are offered. The
// interface chrome stays in English; what changes is the part that has to be
// understood under pressure — the verdict, the explanation, the reasoning and
// the answers — which is also what Watchdog reads aloud.

import { Languages } from "lucide-react";
import type { Language } from "@/lib/types";
import { cn } from "@/lib/cn";

export const EXPLAIN_LANGUAGES: { code: Language; label: string; full: string }[] = [
  { code: "en", label: "EN", full: "English" },
  { code: "fr", label: "FR", full: "Français" },
  { code: "es", label: "ES", full: "Español" },
];

export function LanguagePicker({
  value,
  onChange,
  busy,
  dark,
  className,
}: {
  value: Language;
  onChange: (l: Language) => void;
  /** A change re-runs the analysis, so the control locks while that happens. */
  busy?: boolean;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Languages className={cn("h-3.5 w-3.5", dark ? "text-white/45" : "text-ink-soft")} aria-hidden />
      <span className="sr-only" id="explain-language-label">
        Language for the explanation
      </span>
      <div
        role="radiogroup"
        aria-labelledby="explain-language-label"
        className={cn("flex rounded-full p-0.5", dark ? "bg-white/10" : "bg-canvas")}
      >
        {EXPLAIN_LANGUAGES.map((l) => {
          const active = l.code === value;
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={l.full}
              disabled={busy}
              onClick={() => !active && onChange(l.code)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors disabled:opacity-50",
                active
                  ? dark
                    ? "bg-white text-ink"
                    : "bg-ink text-white"
                  : dark
                    ? "text-white/60 hover:text-white"
                    : "text-ink-soft hover:text-ink",
              )}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
