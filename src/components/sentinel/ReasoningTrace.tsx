"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function ReasoningTrace({
  steps,
  model,
  dark,
  defaultOpen = false,
}: {
  steps: string[];
  model?: string;
  dark?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps.length) return null;
  return (
    <section className={cn("rounded-xl border", dark ? "border-line-dark" : "border-line")}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left", dark ? "text-white" : "text-ink")}
      >
        <span className="flex items-center gap-2">
          <span className={cn("label-mono", dark ? "text-white/45" : "text-ink-soft")}>Reasoning trace</span>
          <span className={cn("label-mono", dark ? "text-white/30" : "text-ink-soft/70")}>
            {steps.length} steps{model ? ` · SERV · ${model}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {steps.map((s, i) => (
              <li
                key={i}
                className={cn(
                  "flex gap-3 border-t px-3 py-2 font-mono text-[12.5px] leading-5",
                  dark ? "border-line-dark text-white/75" : "border-line text-ink",
                )}
              >
                <span className={cn("shrink-0 tabular-nums", dark ? "text-accent" : "text-teal")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </section>
  );
}
