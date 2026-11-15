"use client";

// The language Watchdog explains in, chosen once and used everywhere.
//
// The interface itself stays in English. What this changes is everything
// Watchdog writes or says: the verdict, the explanation, the reasoning steps,
// the follow-up answers and the spoken version of all of them. That is the
// part someone has to understand while deciding whether to sign.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Language } from "@/lib/types";
import { cn } from "@/lib/cn";
import { getLanguage, initLanguage, setLanguage, SUPPORTED_LANGUAGES, subscribeLanguage } from "@/lib/client/language";

export function LanguageSwitch({ className }: { className?: string }) {
  const [lang, setLang] = useState<Language>(getLanguage);
  const qc = useQueryClient();

  useEffect(() => {
    setLang(initLanguage());
    return subscribeLanguage(setLang);
  }, []);

  const choose = (next: Language) => {
    if (next === lang) return;
    setLanguage(next);
    // Anything already on screen was written in the old language, so ask for
    // it again rather than leaving a mixed-language page.
    void qc.invalidateQueries();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Language for Watchdog's explanations"
      className={cn("flex rounded-full bg-white/85 p-0.5 shadow-[0_0_1px_rgb(30_42_40/.2),0_6px_16px_-6px_rgb(30_42_40/.25)]", className)}
    >
      {SUPPORTED_LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Explain in ${l.full}`}
            title={`Explain in ${l.full}`}
            onClick={() => choose(l.code)}
            className={cn(
              "rounded-full px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors",
              active ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
