"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Check,
  Copy,
  Link2,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ThreatEvent } from "@/lib/types";
import { useFeed, useStats, useThreats, useWalletScan } from "@/lib/client/hooks";
import { cn, shortAddr, timeAgo } from "@/lib/cn";
import { MonoLabel, Skeleton } from "@/components/ui";
import { RingsLoader, Toggle, WalletGlyph } from "@/components/ui/elements";
import { Spotlight } from "@/components/ui/Spotlight";
import { WalletScanReport } from "@/components/watchdog";
import { PageIntro } from "@/components/voice";
import { useT } from "@/lib/client/useT";
import { Logo } from "@/components/site/Logo";

const SAMPLE = { label: "Sample wallet", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", note: "vitalik.eth (public)" };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const card = "rounded-[var(--radius-box)] border border-line bg-surface p-5 sm:p-6";

export function Dashboard() {
  const tr = useT();
  const [tab, setTab] = useState<"sample" | "mine">("sample");
  const [mine, setMine] = useState("");
  const [draft, setDraft] = useState("");
  const [riskyOnly, setRiskyOnly] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const address = tab === "sample" ? SAMPLE.address : ADDRESS.test(mine) ? mine : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-line bg-surface">
            <Logo className="h-7 w-7" />
          </div>
          <div>
            <p className="label-mono flex items-center gap-2 text-ink-soft"><span className="uv-live text-safe" aria-hidden /> {tr("page.dashboardEyebrow")}</p>
            <h1 className="font-display text-[40px] leading-none text-ink">{tr("page.dashboard")}</h1>
          </div>
        </div>
        <HeaderActions />
      </header>

      {/* Spoken explanation of the sample wallet, scanning your own, and that
          Watchdog only ever prepares a revoke for you to sign. */}
      <PageIntro
              page="dashboard"
              seenKey="watchdog:intro-dashboard"
        label="Hear what this dashboard shows"
        className="justify-start pb-1"
      />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <WalletCard
          tab={tab}
          setTab={setTab}
          address={address}
          draft={draft}
          setDraft={setDraft}
          onUse={() => ADDRESS.test(draft.trim()) && setMine(draft.trim())}
          onOpenReport={() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <MemoryCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RiskDonutCard address={address} />
        <PipelineCard />
        <ActivityCard />
      </div>

      <section ref={reportRef} className={cn(card, "scroll-mt-24")}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconBox>
              <ShieldCheck className="h-4 w-4" />
            </IconBox>
            <h2 className="text-lg font-medium text-ink">Approval report</h2>
          </div>
          <label className="flex items-center gap-3 text-sm text-ink-soft">
            Risky only
            <Toggle checked={riskyOnly} onChange={setRiskyOnly} label="Show risky approvals only" />
          </label>
        </div>
        {address ? (
          <WalletScanReport address={address} riskyOnly={riskyOnly} />
        ) : (
          <p className="text-sm text-ink-soft">Paste a wallet address above to see its approvals.</p>
        )}
      </section>
    </div>
  );
}

function HeaderActions() {
  const stats = useStats();
  const blocks = stats.data?.memory.repeatAttacksBlocked;
  return (
    <div className="flex items-center gap-2">
      <Link href="/#check" aria-label="Check an address or link" className="uv-tip grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-white" data-tip="Check an address or link">
        <Search className="h-4 w-4" />
      </Link>
      <Link href="/memory" className="uv-tip flex h-11 items-center gap-2 rounded-full border border-line bg-surface pr-4 pl-3 text-sm text-ink hover:bg-white" data-tip="Repeat attacks blocked from verified memory">
        <span className="relative">
          <Bell className="h-4 w-4" />
          {!!blocks && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-risky" />}
        </span>
        <span className="font-mono tabular-nums">{blocks ?? "—"}</span>
      </Link>
    </div>
  );
}

function IconBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/60 text-ink", className)}>{children}</span>;
}

/* ---------------------------------------------------------------- wallet */

function WalletCard({
  tab,
  setTab,
  address,
  draft,
  setDraft,
  onUse,
  onOpenReport,
}: {
  tab: "sample" | "mine";
  setTab: (t: "sample" | "mine") => void;
  address: string | null;
  draft: string;
  setDraft: (s: string) => void;
  onUse: () => void;
  onOpenReport: () => void;
}) {
  const scan = useWalletScan(address);
  const [copied, setCopied] = useState(false);
  const d = scan.data;
  const atRisk = d ? (d.riskCounts.critical ?? 0) + (d.riskCounts.high ?? 0) : null;
  const validDraft = ADDRESS.test(draft.trim());

  return (
    <Spotlight className={cn(card, "flex flex-col")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative flex rounded-full bg-canvas p-1" role="tablist" aria-label="Watched wallet">
          {(["sample", "mine"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("relative flex h-8 items-center gap-2 rounded-full px-3.5 text-sm transition-colors", tab === t ? "text-white" : "text-ink-soft hover:text-ink")}
            >
              {tab === t && <motion.span layoutId="wallet-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{t === "sample" ? "Sample wallet" : "My wallet"}</span>
            </button>
          ))}
        </div>
        {address && (
          <div className="text-right">
            <p className="text-xs text-ink-soft">{tab === "sample" ? SAMPLE.note : "Watched address"}</p>
            <button
              className="mt-0.5 inline-flex items-center gap-2 font-mono text-[15px] text-ink"
              onClick={() =>
                navigator.clipboard?.writeText(address).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                })
              }
              aria-label="Copy address"
            >
              {shortAddr(address, 6)} {copied ? <Check className="h-3.5 w-3.5 text-safe" /> : <Copy className="h-3.5 w-3.5 text-ink-soft" />}
            </button>
          </div>
        )}
      </div>

      {tab === "mine" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUse();
          }}
          className="mt-4 flex gap-2"
        >
          <label htmlFor="my-wallet" className="sr-only">Your wallet address</label>
          <input
            id="my-wallet"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your wallet address (0x…)"
            className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 py-2.5 font-mono text-sm outline-none focus:border-ink/30"
          />
          <button disabled={!validDraft} className="rounded-full bg-ink px-4 text-sm font-medium text-white disabled:opacity-40">
            Watch
          </button>
        </form>
      )}

      <div className="mt-8 flex items-center gap-3">
        <WalletGlyph className="h-7 w-7" />
        <p className="label-mono text-ink-soft">Approvals at risk</p>
      </div>

      <div className="mt-2 min-h-[72px]">
        {!address ? (
          <p className="text-sm text-ink-soft">No wallet selected yet.</p>
        ) : scan.isPending ? (
          <RingsLoader className="mt-4 text-ink" label="Reading approvals on-chain…" />
        ) : scan.isError ? (
          <p className="text-sm text-risky">{(scan.error as Error).message}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <span className={cn("font-display text-[80px] leading-[0.85] tabular-nums", atRisk ? "text-risky" : "text-ink")}>{atRisk}</span>
            <span className="pb-2 text-sm text-ink-soft">
              of <span className="font-mono text-ink">{d!.approvalCount}</span> live approvals · {(d!.tookMs / 1000).toFixed(1)}s scan
            </span>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-8">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => scan.refetch()}
            disabled={!address || scan.isFetching}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", scan.isFetching && "animate-spin")} /> Rescan
          </button>
          <Link href="/#check" className="inline-flex h-10 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-medium text-ink hover:bg-black/5">
            <Link2 className="h-4 w-4" /> Check a link
          </Link>
        </div>
        <button
          onClick={onOpenReport}
          aria-label="Open the approval report"
          className="uv-tip grid h-16 w-16 place-items-center rounded-full bg-ink text-white shadow-[0_0_0_6px_rgb(30_42_40/.08)] transition-transform hover:scale-105 active:scale-95" data-tip="Open the full approval report"
        >
          <ArrowUpRight className="h-6 w-6" />
        </button>
      </div>
    </Spotlight>
  );
}

/* ---------------------------------------------------------------- memory (deep) */

const SWEEP_S = 4;

/** Stable 0..1 values from an indicator, so each attacker keeps its spot on the radar. */
function spot(id: string): { angle: number; r: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 3600) / 10;
  const r = 0.32 + (((h >>> 12) % 1000) / 1000) * 0.55;
  return { angle: a, r };
}

/**
 * Threat radar: concentric rings with a rotating sweep (adapted from Uiverse.io,
 * Yaya12085/hot-swan-8, MIT). Each blip is one real Reppo-verified attacker from
 * /api/feed and pulses as the sweep passes over it.
 */
function RadarScope({ ids }: { ids: string[] }) {
  return (
    <div className="relative aspect-square w-full max-w-[200px] shrink-0 overflow-hidden rounded-full border border-white/15 bg-[repeating-radial-gradient(circle_at_50%,rgb(255_255_255/.12)_0_1px,transparent_1px_22px)]">
      <span className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
      <div
        className="absolute inset-0 animate-[spin_var(--sweep)_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,rgb(255_255_255/.38),rgb(255_255_255/.06)_55deg,transparent_90deg)] motion-reduce:animate-none"
        style={{ ["--sweep" as string]: `${SWEEP_S}s` }}
      />
      {ids.map((id) => {
        const { angle, r } = spot(id);
        const rad = ((angle - 90) * Math.PI) / 180;
        const x = 50 + Math.cos(rad) * r * 50;
        const y = 50 + Math.sin(rad) * r * 50;
        return (
          <span
            key={id}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span
              className="absolute inset-0 animate-[radar-blip_var(--sweep)_linear_infinite] rounded-full bg-white motion-reduce:animate-none"
              style={{ ["--sweep" as string]: `${SWEEP_S}s`, animationDelay: `${(angle / 360) * SWEEP_S}s` }}
            />
          </span>
        );
      })}
      <span className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
    </div>
  );
}

function MemoryCard() {
  const feed = useFeed();
  const stats = useStats();
  const verified = useMemo(
    () => [...(feed.data?.threats ?? [])].sort((a, b) => (b.verifiedAt ?? "").localeCompare(a.verifiedAt ?? "")),
    [feed.data],
  );
  const today = verified.filter((t) => t.verifiedAt && Date.now() - new Date(t.verifiedAt).getTime() < 86_400_000).length;

  return (
    <Spotlight className="relative flex flex-col rounded-[var(--radius-box)] bg-deep p-5 text-white sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="label-mono flex items-center gap-2 text-white/60">
          <span className="uv-live text-safe" aria-hidden /> Threat radar
        </span>
        <Link href="/memory" className="label-mono inline-flex h-9 items-center gap-2 rounded-full bg-white/10 pr-1 pl-3.5 text-white hover:bg-white/15">
          Memory
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-ink">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <RadarScope ids={verified.map((t) => t.indicator)} />
        <div className="min-w-0">
          <p className="label-mono text-white/50">Verified attackers</p>
          {feed.isPending ? (
            <Skeleton dark className="mt-2 h-14 w-20" />
          ) : (
            <p className="font-display text-[64px] leading-[0.95] tabular-nums">{feed.data?.count ?? "—"}</p>
          )}
          {feed.isSuccess && <span className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">+{today} today</span>}
          <dl className="mt-4 space-y-1 text-xs text-white/55">
            <div className="flex gap-2"><dt>Reppo evaluations</dt><dd className="font-mono text-white">{stats.data?.reppo.submissions ?? "—"}</dd></div>
            <div className="flex gap-2"><dt>Repeat attacks blocked</dt><dd className="font-mono text-white">{stats.data?.memory.repeatAttacksBlocked ?? "—"}</dd></div>
          </dl>
        </div>
      </div>

      <ul className="mt-5 space-y-2 border-t border-line-dark pt-4">
        {verified.slice(0, 3).map((t) => {
          const who = t.domain ?? t.indicator.replace(/^(spender|address|domain):/, "");
          return (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-white/85" title={t.indicator}>
                {who.startsWith("0x") ? shortAddr(who, 5) : who}
              </span>
              {t.reppo.score != null && (
                <span className="uv-tip rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white" data-tip={`Reppo ${t.reppo.decision ?? ""} · eval ${t.reppo.evalId ?? ""}`}>
                  {t.reppo.score}/100
                </span>
              )}
              <span className="w-14 shrink-0 text-right text-xs text-white/45">{t.timesCaught ? `${t.timesCaught}× caught` : "watching"}</span>
            </li>
          );
        })}
        {feed.isSuccess && verified.length === 0 && <li className="text-sm text-white/50">Nothing verified yet. Run the demo to teach Watchdog its first attacker.</li>}
      </ul>
    </Spotlight>
  );
}

/* ---------------------------------------------------------------- donut */

const RISKS = [
  { k: "low", label: "Low", color: "#525252" },
  { k: "medium", label: "Medium", color: "#d99a2b" },
  { k: "high", label: "High", color: "#d9475b" },
  { k: "critical", label: "Critical", color: "#8f1d2c" },
] as const;

function RiskDonutCard({ address }: { address: string | null }) {
  const scan = useWalletScan(address);
  const d = scan.data;
  const total = d?.approvalCount ?? 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const lowShare = d && total ? Math.round(((d.riskCounts.low ?? 0) / total) * 100) : null;

  return (
    <Spotlight className={card}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconBox>
            <ShieldCheck className="h-4 w-4" />
          </IconBox>
          <h2 className="font-medium text-ink">Approval risk</h2>
        </div>
        <span className="uv-tip rounded-full border border-line px-3 py-1 text-xs text-ink-soft" data-tip="Scans read Ethereum mainnet approvals on-chain">Ethereum</span>
      </div>
      <div className="mt-6 grid place-items-center">
        {scan.isPending && address ? (
          <div className="grid h-[150px] place-items-center"><RingsLoader className="text-ink" /></div>
        ) : (
          <div className="relative h-[150px] w-[150px]">
            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Approvals by risk level">
              <circle cx="70" cy="70" r={R} fill="none" stroke="#fafafa" strokeWidth="14" />
              {d &&
                total > 0 &&
                RISKS.map((r) => {
                  const n = d.riskCounts[r.k] ?? 0;
                  if (!n) return null;
                  const len = (n / total) * C;
                  const el = (
                    <motion.circle
                      key={r.k}
                      cx="70"
                      cy="70"
                      r={R}
                      fill="none"
                      stroke={r.color}
                      strokeWidth="14"
                      strokeLinecap="butt"
                      strokeDasharray={`${Math.max(len - 2, 0.5)} ${C}`}
                      strokeDashoffset={-offset}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.6 }}
                    />
                  );
                  offset += len;
                  return el;
                })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="font-display text-4xl tabular-nums text-ink">{d ? total : "—"}</p>
                <p className="text-xs text-ink-soft">approvals</p>
              </div>
            </div>
          </div>
        )}
      </div>
      {lowShare != null && (
        <p className="mx-auto mt-4 w-fit rounded-full border border-line px-3 py-1 text-xs text-ink-soft">
          <span className="font-medium text-ink">{lowShare}%</span> are ordinary, low-risk approvals
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {RISKS.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-ink-soft">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} aria-hidden />
              {r.label}
            </span>
            <span className="font-mono tabular-nums text-ink">{d ? (d.riskCounts[r.k] ?? 0) : "—"}</span>
          </div>
        ))}
      </div>
    </Spotlight>
  );
}

/* ---------------------------------------------------------------- pipeline */

function PipelineCard() {
  const q = useStats();
  const s = q.data;
  const latest = s?.reppo.latestEvaluations.find((e) => e.score != null);
  const rows = s
    ? [
        { label: "Discovered", value: s.discovered },
        { label: "Sent to Reppo", value: s.reppo.submissions },
        { label: "Verified by Reppo", value: s.reppo.verified, highlight: true },
        { label: "Rejected by Reppo", value: s.reppo.rejected },
        { label: "Repeat attacks blocked", value: s.memory.repeatAttacksBlocked },
      ]
    : [];
  const max = Math.max(1, ...rows.map((r) => r.value));
  const rate = s && s.reppo.submissions ? Math.round((s.reppo.verified / s.reppo.submissions) * 100) : null;

  return (
    <Spotlight className={card}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconBox>
            <Radar className="h-4 w-4" />
          </IconBox>
          <h2 className="font-medium text-ink">Learning</h2>
        </div>
        {latest && (
          <span className="uv-tip border-b-2 border-ink pb-0.5 font-mono text-sm text-ink" data-tip={`Latest Reppo score · eval ${latest.evalId}`}>
            ◎ {latest.score}/100
          </span>
        )}
      </div>
      <p className="font-display mt-6 text-[56px] leading-none tabular-nums text-ink">{s ? s.threats.total : "—"}</p>
      <p className="mt-2 text-xs text-ink-soft">
        threats in memory{rate != null && <> · <span className="font-medium text-ink">{rate}%</span> of Reppo evaluations accepted</>}
      </p>
      <div className="mt-6 space-y-4">
        {q.isPending
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7" />)
          : rows.map((r) => (
              <div key={r.label}>
                <div className="flex justify-between text-sm">
                  <span className={r.highlight ? "font-medium text-ink" : "text-ink-soft"}>{r.label}</span>
                  <span className="font-mono tabular-nums text-ink-soft">{r.value}</span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-canvas">
                  <motion.div
                    className={cn("h-full rounded-full", r.highlight ? "bg-ink" : "bg-ink/20")}
                    initial={{ width: 0 }}
                    animate={{ width: `${(r.value / max) * 100}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
      </div>
    </Spotlight>
  );
}

/* ---------------------------------------------------------------- activity */

const KIND: Record<ThreatEvent["kind"], { icon: typeof Radar; label: string; tone: string }> = {
  discovered: { icon: Radar, label: "Threat discovered", tone: "text-ink" },
  submitted: { icon: Send, label: "Sent to Reppo", tone: "text-pending" },
  verified: { icon: BadgeCheck, label: "Verified by Reppo", tone: "text-teal" },
  rejected: { icon: X, label: "Rejected by Reppo", tone: "text-risky" },
  failed: { icon: X, label: "Reppo evaluation failed", tone: "text-ink-soft" },
  caught: { icon: Zap, label: "Blocked from memory", tone: "text-teal" },
};

function ActivityCard() {
  const q = useThreats();
  const events = q.data?.events.slice(0, 5) ?? [];
  const pending = q.data?.threats.find((t) => t.status === "submitted");
  return (
    <Spotlight className={cn(card, "md:col-span-2 lg:col-span-1")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconBox>
            <Bell className="h-4 w-4" />
          </IconBox>
          <h2 className="font-medium text-ink">Activity</h2>
        </div>
        <Link href="/memory" className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-black/5">
          View all
        </Link>
      </div>

      {pending && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-uncertain/40 bg-uncertain/5 p-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white">
            <Send className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{pending.indicator.replace(/^(spender|address|domain):/, "")}</p>
            <p className="text-xs text-uncertain">Pending at Reppo</p>
          </div>
          <RingsLoader className="scale-75 text-ink" />
        </div>
      )}

      <ul className="mt-4 divide-y divide-line">
        {q.isPending && Array.from({ length: 4 }).map((_, i) => <li key={i} className="py-3"><Skeleton className="h-9" /></li>)}
        {q.isSuccess && events.length === 0 && <li className="py-6 text-sm text-ink-soft">No activity yet. Try the demo to see Watchdog learn.</li>}
        {events.map((e) => {
          const k = KIND[e.kind];
          return (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-white/60">
                <k.icon className={cn("h-4 w-4", k.tone)} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{k.label}</p>
                <p className="text-xs text-ink-soft">{timeAgo(e.at)}</p>
              </div>
              {e.walletId && <MonoLabel className={cn("shrink-0", k.tone)}>{e.walletId === "A" ? "Ada" : "Bayo"}</MonoLabel>}
            </li>
          );
        })}
      </ul>
    </Spotlight>
  );
}
