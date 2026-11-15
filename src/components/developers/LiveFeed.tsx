"use client";

import { useFeed, useStats } from "@/lib/client/hooks";
import { Skeleton } from "@/components/ui";

export function LiveFeed() {
  const q = useFeed();
  if (q.isPending) return <Skeleton dark className="h-64" />;
  if (q.isError) return <p className="text-sm text-white/60">Feed unavailable right now.</p>;
  return (
    <pre className="addr max-h-[420px] overflow-auto rounded-xl bg-black/30 p-4 text-[12px] leading-5 text-white/80">
      {JSON.stringify(q.data, null, 2)}
    </pre>
  );
}

export function LiveCounts() {
  const q = useStats();
  const s = q.data;
  const items = [
    ["Verified attackers", s?.reppo.verified],
    ["Reppo evaluations", s?.reppo.submissions],
    ["Repeat attacks blocked", s?.memory.repeatAttacksBlocked],
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line-dark bg-line-dark">
      {items.map(([k, v]) => (
        <div key={k} className="bg-deep-2 p-4">
          <div className="font-mono text-2xl text-white tabular-nums">{v ?? "—"}</div>
          <div className="label-mono mt-1 text-white/45">{k}</div>
        </div>
      ))}
    </div>
  );
}
