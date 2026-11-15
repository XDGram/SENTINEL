"use client";

import { Check, ChevronDown, Copy, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useWalletScan } from "@/lib/client/hooks";
import type { ApprovalFinding } from "@/lib/client/api";
import { cn, shortAddr } from "@/lib/cn";
import { MonoLabel, Pill } from "@/components/ui";
import { ResultError, ResultSkeleton } from "./CheckResult";

type Risk = ApprovalFinding["risk"];
const RISK: Record<Risk, { label: string; dot: string; pill: string; bar: string }> = {
  critical: { label: "Critical", dot: "bg-risky", pill: "bg-risky text-white", bar: "bg-risky" },
  high: { label: "High", dot: "bg-risky", pill: "bg-risky/12 text-risky ring-1 ring-risky/30", bar: "bg-risky/70" },
  medium: { label: "Medium", dot: "bg-uncertain", pill: "bg-uncertain/12 text-uncertain ring-1 ring-uncertain/30", bar: "bg-uncertain" },
  low: { label: "Low", dot: "bg-safe", pill: "bg-safe/12 text-safe ring-1 ring-safe/30", bar: "bg-safe" },
};
const ORDER: Risk[] = ["critical", "high", "medium", "low"];

export function WalletScanReport({ address }: { address: string }) {
  const q = useWalletScan(address);
  if (q.isPending) return <ResultSkeleton label="Reading this wallet's approvals on-chain…" />;
  if (q.isError) return <ResultError error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const total = d.approvalCount;
  const s = d.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-ink-soft">
        <MonoLabel>Wallet scan</MonoLabel>
        <span className="addr text-sm text-ink">{shortAddr(d.address, 6)}</span>
        <span className="text-xs">· {total} live approvals · {(d.tookMs / 1000).toFixed(1)}s</span>
      </div>

      <div>
        <h3 className="text-xl font-medium tracking-tight text-ink sm:text-2xl">
          {s?.headline ?? (total === 0 ? "No live token approvals found." : `${total} live approvals found.`)}
        </h3>
        {s?.explanation && <p className="mt-2 text-[15px] leading-6 text-ink-soft">{s.explanation}</p>}
        {d.servNote && <p className="mt-2 text-xs text-ink-soft">{d.servNote}</p>}
      </div>

      {total > 0 && (
        <div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/5" role="img" aria-label="Approvals by risk">
            {ORDER.map((k) =>
              d.riskCounts[k] ? <div key={k} className={RISK[k].bar} style={{ width: `${(d.riskCounts[k] / total) * 100}%` }} /> : null,
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            {ORDER.map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", RISK[k].dot)} aria-hidden />
                {RISK[k].label} <span className="font-mono tabular-nums text-ink">{d.riskCounts[k] ?? 0}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {s?.whatToDo && (
        <div className="rounded-xl bg-ink/5 p-4 text-sm leading-6">
          <MonoLabel className="text-ink-soft">What to do</MonoLabel>
          <p className="mt-1 text-ink">{s.whatToDo}</p>
        </div>
      )}

      {d.top.length > 0 ? (
        <section>
          <MonoLabel className="mb-3 block text-ink-soft">
            Top {d.top.length} to review{total > d.top.length ? ` of ${total}` : ""}
          </MonoLabel>
          <ul className="space-y-2">
            {d.top.map((a, i) => (
              <ApprovalRow key={`${a.token.address}-${a.spender}-${i}`} a={a} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-safe/10 p-4 text-sm text-ink">
          <ShieldCheck className="h-4 w-4 text-safe" aria-hidden /> Nothing to revoke right now.
        </p>
      )}

      <div className="rounded-xl border border-line p-4">
        <MonoLabel className="text-ink-soft">
          Coverage · mode {d.coverage.mode} · {d.coverage.spendersChecked} spenders checked
        </MonoLabel>
        <ul className="mt-2 space-y-1 font-mono text-[12px] leading-5 text-ink-soft">
          {d.coverage.limitations.map((l, i) => (
            <li key={i}>— {l}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">{d.readOnly}</p>
      </div>
    </div>
  );
}

function ApprovalRow({ a }: { a: ApprovalFinding }) {
  const [open, setOpen] = useState(false);
  const r = RISK[a.risk];
  return (
    <li className="rounded-xl border border-line bg-white/70">
      <button
        className="flex w-full items-center gap-3 p-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", r.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">
            <span className="font-medium">{a.allowanceLabel} {a.token.symbol}</span>
            <span className="text-ink-soft"> → {a.spenderName ?? shortAddr(a.spender)}</span>
          </p>
          <p className="truncate text-xs text-ink-soft">{a.disputed ? "Disputed: flagged by a source, but a widely used protocol" : a.reasons[0]}</p>
        </div>
        <Pill className={r.pill}>{r.label}</Pill>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-soft transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-line p-3 text-sm">
              <ul className="list-disc space-y-1 pl-5 text-ink">
                {a.reasons.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              {a.note && <p className="text-ink-soft">{a.note}</p>}
              <p className="addr text-xs text-ink-soft">spender {a.spender}</p>
              <div className="rounded-lg bg-ink p-3 text-white">
                <MonoLabel className="text-white/50">Revoke transaction (you sign it)</MonoLabel>
                <CopyRow label="to" value={a.revoke.to} />
                <CopyRow label="data" value={a.revoke.data} />
                <p className="mt-2 text-xs text-white/60">You sign this in your own wallet. Sentinel never moves funds.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="label-mono w-10 shrink-0 text-white/50">{label}</span>
      <code className="addr min-w-0 flex-1 truncate text-xs text-white/85">{value}</code>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/10 hover:bg-white/20"
        aria-label={`Copy ${label}`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
