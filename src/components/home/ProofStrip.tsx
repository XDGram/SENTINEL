"use client";

import { animate, useInView, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useStats } from "@/lib/client/hooks";
import { cn, timeAgo } from "@/lib/cn";
import { MonoLabel, Skeleton } from "@/components/ui";
import { Spotlight } from "@/components/ui/Spotlight";

function Count({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    if (inView) {
      const c = animate(mv, value, { duration: 0.9, ease: "easeOut" });
      return () => c.stop();
    }
  }, [inView, value, mv]);
  return <motion.span ref={ref}>{rounded}</motion.span>;
}

export function ProofStrip() {
  const q = useStats();

  if (q.isPending)
    return (
      <div className="grid grid-cols-2 gap-px sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} dark className="h-24" />
        ))}
      </div>
    );
  if (q.isError) return <p className="text-sm text-white/60">Live stats are unavailable right now.</p>;

  const s = q.data;
  const items = [
    { label: "Threats discovered", value: s.discovered },
    { label: "Sent to Reppo", value: s.reppo.submissions },
    { label: "Verified by Reppo", value: s.reppo.verified },
    { label: "Rejected by Reppo", value: s.reppo.rejected },
    { label: "Repeat attacks blocked", value: s.memory.repeatAttacksBlocked, hint: "0 AI calls each" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line-dark bg-line-dark sm:grid-cols-5">
        {items.map((it) => (
          <Spotlight key={it.label} lift={false} className="bg-deep-2 p-5">
            <div className="font-display text-5xl text-white tabular-nums">
              <Count value={it.value} />
            </div>
            <MonoLabel className="mt-2 block text-white/50">{it.label}</MonoLabel>
            {it.hint && <span className="mt-1 block text-xs text-accent">{it.hint}</span>}
          </Spotlight>
        ))}
      </div>

      {s.reppo.latestEvaluations.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line-dark">
          <div className="border-b border-line-dark px-4 py-3">
            <MonoLabel className="text-white/45">Latest Reppo evaluations · live from Supabase</MonoLabel>
          </div>
          <ul>
            {s.reppo.latestEvaluations.slice(0, 5).map((e) => (
              <li key={`${e.evalId}-${e.submittedAt}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-dark px-4 py-3 last:border-0">
                <code className="addr text-xs text-white/70">{e.evalId ?? "—"}</code>
                <span
                  className={cn(
                    "label-mono rounded px-1.5 py-0.5",
                    e.outcome === "verified" ? "bg-safe/20 text-safe" : e.outcome === "rejected" ? "bg-risky/20 text-risky" : "bg-pending/20 text-pending",
                  )}
                >
                  {e.decision ?? e.outcome}
                </span>
                {e.score != null && <span className="font-mono text-sm text-white tabular-nums">{e.score}/100</span>}
                <span className="ml-auto text-xs text-white/40">{timeAgo(e.settledAt ?? e.submittedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-white/40">
        Every number here is read from Watchdog&apos;s threat memory. No benchmark has been run, so we don&apos;t claim a catch rate.
      </p>
    </div>
  );
}
