"use client";

import { Zap } from "lucide-react";
import { motion } from "motion/react";
import type { Analysis } from "@/lib/types";
import { cn } from "@/lib/cn";

export function MemoryCatchBanner({ analysis, dark }: { analysis: Analysis; dark?: boolean }) {
  if (!analysis.matchedThreatId) return null;
  const mem = analysis.evidence.find((e) => e.source === "threat-memory");
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4",
        dark ? "border-line-dark bg-white/[0.04]" : "border-line bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-white">
          <Zap className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className={cn("font-medium", dark ? "text-white" : "text-ink")}>Caught from verified threat memory</p>
          <p className={cn("mt-1 text-sm leading-6", dark ? "text-white/70" : "text-ink-soft")}>
            Someone else met this attacker first. Reppo verified it, so Watchdog blocked it for you straight away.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Stat dark={dark} label="AI calls" value="0" />
            {analysis.latencyMs != null && <Stat dark={dark} label="Time to block" value={`${analysis.latencyMs} ms`} />}
          </div>
          {mem && <p className={cn("addr mt-3 text-xs", dark ? "text-white/45" : "text-ink-soft")}>{mem.detail}</p>}
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <span className={cn("rounded-lg px-2.5 py-1", dark ? "bg-white/10" : "bg-canvas")}>
      <span className={cn("label-mono mr-2", dark ? "text-white/50" : "text-ink-soft")}>{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", dark ? "text-white" : "text-ink")}>{value}</span>
    </span>
  );
}
