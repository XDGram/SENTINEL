"use client";

// A quiet offer, on the side, when someone first arrives: hear and read
// Watchdog in your own language.
//
// It slides in beside the page rather than blocking it, because a modal asking
// about language before you know what the site is would be worse than useless.
// Choosing one, or dismissing it, puts it away for the rest of the visit.

import { Languages, X } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import type { Language } from "@/lib/types";
import { cn } from "@/lib/cn";
import { initLanguage, setLanguage, SUPPORTED_LANGUAGES } from "@/lib/client/language";

/** Shown once per page load, like the spoken introduction. */
let dismissedThisLoad = false;

export function LanguageInvite() {
  const [show, setShow] = useState(false);
  const [lang, setLang] = useState<Language>("en");
  const qc = useQueryClient();

  useEffect(() => {
    setLang(initLanguage());
    if (dismissedThisLoad) return;
    // Let the page settle first; arriving at the same moment as everything
    // else would read as noise.
    const t = window.setTimeout(() => setShow(true), 1400);
    return () => window.clearTimeout(t);
  }, []);

  const close = () => {
    dismissedThisLoad = true;
    setShow(false);
  };

  const choose = (next: Language) => {
    setLanguage(next);
    setLang(next);
    void qc.invalidateQueries();
    close();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="fixed top-1/2 left-5 z-40 hidden w-[230px] -translate-y-1/2 rounded-[18px] border border-line bg-white/95 p-4 shadow-[0_18px_44px_-20px_rgb(0_0_0/.45)] backdrop-blur lg:block"
          aria-label="Choose a language"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 grid h-6 w-6 place-items-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.05]"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>

          <Languages className="h-4 w-4 text-ink-soft" aria-hidden />
          <p className="mt-2.5 text-[13px] leading-5 font-medium text-ink">Read and hear Watchdog in your language</p>
          <p className="mt-1 text-[11px] leading-4 text-ink-soft">Warnings, explanations and the voice. The menus stay in English.</p>

          <div className="mt-3 flex flex-col gap-1">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => choose(l.code)}
                className={cn(
                  "flex items-center justify-between rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  l.code === lang ? "bg-ink text-white" : "text-ink-soft hover:bg-black/[0.04] hover:text-ink",
                )}
              >
                {l.full}
                <span className="label-mono opacity-60">{l.label}</span>
              </button>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
