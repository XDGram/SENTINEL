"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { motion } from "motion/react";
import type { Verdict } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui";
import { ListenButton, useAutoSpeak } from "@/components/voice";
import { composeVerdictSpeech } from "@/lib/speech-text";

export const VERDICT_META: Record<Verdict, { label: string; icon: typeof ShieldCheck; text: string; bg: string; ring: string; solid: string }> = {
  safe: { label: "Looks safe", icon: ShieldCheck, text: "text-safe", bg: "bg-safe/10", ring: "ring-safe/30", solid: "bg-safe" },
  risky: { label: "Dangerous", icon: ShieldAlert, text: "text-risky", bg: "bg-risky/10", ring: "ring-risky/30", solid: "bg-risky" },
  uncertain: { label: "Be careful", icon: ShieldQuestion, text: "text-uncertain", bg: "bg-uncertain/10", ring: "ring-uncertain/30", solid: "bg-uncertain" },
};

/** Citation tags like [R1] or [I2] belong in the reasoning trace, not in beginner-facing prose. */
export function plain(text: string): string {
  return text.replace(/\s*\[(?:[A-Z]{1,2}\d+|CONTEXT|S\d+)\]/g, "").replace(/\s+([.,;:])/g, "$1").trim();
}

export function VerdictPill({ verdict, className }: { verdict: Verdict; className?: string }) {
  const m = VERDICT_META[verdict];
  const Icon = m.icon;
  return (
    <Pill className={cn(m.bg, m.text, "ring-1", m.ring, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
    </Pill>
  );
}

export function VerdictHeader({
  verdict,
  headline,
  explanation,
  confidence,
  meta,
  dark,
  autoSpeak,
}: {
  verdict: Verdict;
  headline: string;
  explanation?: string;
  confidence?: number;
  meta?: React.ReactNode;
  dark?: boolean;
  /** Read the verdict out loud on arrival. On by default unless it is safe. */
  autoSpeak?: boolean;
}) {
  const m = VERDICT_META[verdict];
  const Icon = m.icon;
  // Spoken through the same rules the server uses, so the voice says exactly
  // what is on screen.
  const spoken = composeVerdictSpeech({ headline, explanation });
  // Only the moment a transaction is paused interrupts; a safe result does not.
  useAutoSpeak(spoken, (autoSpeak ?? verdict !== "safe") && Boolean(spoken), { id: spoken });
  return (
    <div className="flex gap-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white", m.solid)}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </motion.div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictPill verdict={verdict} />
          {confidence != null && (
            <span className={cn("label-mono", dark ? "text-white/45" : "text-ink-soft")}>
              Confidence {Math.round(confidence * 100)}%
            </span>
          )}
          {meta}
          <ListenButton text={spoken} id={spoken} source="verdict" dark={dark} />
        </div>
        <h3 className={cn("mt-2 text-xl leading-snug font-medium tracking-tight sm:text-2xl", dark ? "text-white" : "text-ink")}>
          {plain(headline)}
        </h3>
        {explanation && (
          <p className={cn("mt-2 text-[15px] leading-6", dark ? "text-white/70" : "text-ink-soft")}>{plain(explanation)}</p>
        )}
      </div>
    </div>
  );
}
