"use client";

// Threat memory timeline. Real data only: everything shown comes from
// /api/threats, and pending Reppo evaluations are advanced through
// /api/reppo/status. Nothing here is simulated.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttackType, Threat, ThreatEvent, ThreatsResponse } from "@/lib/types";

const POLL_MS = 30_000;

const ATTACK_LABEL: Record<AttackType, string> = {
  "address-poisoning": "Address poisoning",
  "unlimited-approval": "Unlimited approval",
  "malicious-permit": "Malicious permit",
  "fake-dapp": "Fake dApp",
};

const SOURCE_LABEL: Record<string, string> = {
  goplus: "GoPlus",
  scamsniffer: "ScamSniffer",
  metamask: "MetaMask list",
  web: "Web reports",
};

const STATUS_STYLE: Record<Threat["status"], { label: string; cls: string }> = {
  discovered: { label: "Discovered", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  submitted: { label: "Pending at Reppo", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  verified: { label: "Verified", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  rejected: { label: "Rejected by Reppo", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  failed: { label: "Reppo eval failed", cls: "bg-slate-500/20 text-slate-300 ring-slate-500/30" },
};

type StepState = "done" | "active" | "bad" | "todo";

interface Step {
  key: string;
  title: string;
  state: StepState;
  at?: string;
  detail?: string;
  extra?: React.ReactNode;
}

function fmt(at?: string) {
  if (!at) return "";
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function minutesSince(at?: string) {
  if (!at) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 60_000));
}

function shortIndicator(s: string) {
  return s.length > 46 ? `${s.slice(0, 24)}…${s.slice(-14)}` : s;
}

function buildSteps(t: Threat, events: ThreatEvent[]): Step[] {
  const ev = (kind: ThreatEvent["kind"]) => events.filter((e) => e.kind === kind);
  const latest = (kind: ThreatEvent["kind"]) => ev(kind)[0]; // events are newest first
  const discovered = ev("discovered").at(-1);
  const submitted = latest("submitted");
  const catches = ev("caught");

  const steps: Step[] = [
    {
      key: "discovered",
      title: "Discovered",
      state: "done",
      at: discovered?.at ?? t.discoveredAt,
      detail: [
        discovered?.walletId ? `Seen by wallet ${discovered.walletId}.` : "",
        discovered && discovered.detail !== t.summary ? discovered.detail : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
      extra: t.externalSources?.length ? (
        <p className="mt-1 text-xs text-slate-400">
          Corroborated by: {t.externalSources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">No independent external source yet.</p>
      ),
    },
  ];

  // Submitted to Reppo
  if (t.status === "discovered") {
    steps.push({
      key: "submitted",
      title: "Submitted to Reppo",
      state: "todo",
      detail: t.servRecommendsSubmit
        ? t.externalSources?.length
          ? "Ready to send to Reppo for independent verification."
          : "Waiting for an independent external source before it can go to Reppo."
        : "SERV did not recommend sending this to Reppo.",
    });
  } else {
    steps.push({
      key: "submitted",
      title: "Submitted to Reppo",
      state: "done",
      at: t.submittedAt ?? submitted?.at,
      detail: submitted?.detail ?? "Sent to Reppo for independent evaluation.",
      extra: t.reppoEvalId ? (
        <p className="mt-1 text-xs text-slate-400">
          Eval ID <span className="addr text-slate-300">{t.reppoEvalId}</span>
        </p>
      ) : null,
    });
  }

  // Reppo verdict
  if (t.status === "submitted") {
    const mins = minutesSince(t.submittedAt ?? submitted?.at);
    steps.push({
      key: "verdict",
      title: "Reppo verdict",
      state: "active",
      detail: `Pending: Reppo takes ~10–30 min to settle.${mins != null ? ` Waiting ${mins} min so far.` : ""}`,
    });
  } else if (t.status === "verified") {
    steps.push({
      key: "verdict",
      title: "Verified by Reppo",
      state: "done",
      at: t.verifiedAt ?? latest("verified")?.at,
      detail: latest("verified")?.detail ?? "Reppo accepted. Added to threat memory.",
      extra: <ReppoScore t={t} />,
    });
  } else if (t.status === "rejected" || t.status === "failed") {
    const e = latest(t.status);
    steps.push({
      key: "verdict",
      title: t.status === "rejected" ? "Not accepted by Reppo" : "Reppo evaluation failed",
      state: "bad",
      at: e?.at,
      detail: e?.detail,
      extra: t.status === "rejected" ? <ReppoScore t={t} /> : null,
    });
  } else {
    steps.push({ key: "verdict", title: "Verified by Reppo", state: "todo", detail: "Not submitted yet." });
  }

  // Caught for another user
  if (catches.length) {
    steps.push({
      key: "caught",
      title: `Caught for another user${catches.length > 1 ? ` (${catches.length}×)` : ""}`,
      state: "done",
      at: catches[0].at,
      detail: catches[0].detail,
      extra:
        catches.length > 1 ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {catches.slice(1, 6).map((c) => (
              <li key={c.id}>
                {fmt(c.at)}
                {c.walletId ? ` · wallet ${c.walletId}` : ""}
              </li>
            ))}
            {catches.length > 6 && <li>…and {catches.length - 6} more</li>}
          </ul>
        ) : null,
    });
  } else {
    steps.push({
      key: "caught",
      title: "Caught for another user",
      state: "todo",
      detail:
        t.status === "verified"
          ? "In threat memory. The next user who meets this attacker is blocked instantly."
          : "Only Reppo-verified threats block other users.",
    });
  }
  return steps;
}

function ReppoScore({ t }: { t: Threat }) {
  if (t.reppoScore == null && !t.reppoDecision) return null;
  return (
    <p className="mt-1 text-xs text-slate-400">
      {t.reppoDecision && <>Decision <span className="text-slate-200">{t.reppoDecision}</span></>}
      {t.reppoScore != null && <> · score <span className="text-slate-200">{t.reppoScore}/100</span></>}
      {t.reppoEvalId && <> · eval <span className="addr text-slate-300">{t.reppoEvalId}</span></>}
    </p>
  );
}

const DOT: Record<StepState, string> = {
  done: "bg-emerald-400 ring-emerald-400/30",
  active: "bg-amber-400 ring-amber-400/30 pulse-soft",
  bad: "bg-rose-400 ring-rose-400/30",
  todo: "bg-slate-700 ring-slate-700/40",
};

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative mt-4">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute left-[7px] top-5 bottom-0 w-px bg-slate-700" />
          )}
          <span aria-hidden className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full ring-4 ${DOT[s.state]}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className={`text-sm font-medium ${s.state === "todo" ? "text-slate-500" : "text-slate-100"}`}>
                {s.title}
              </h3>
              {s.at && <time className="text-xs text-slate-500">{fmt(s.at)}</time>}
            </div>
            {s.detail && (
              <p className={`mt-0.5 text-sm break-words ${s.state === "todo" ? "text-slate-500" : "text-slate-300"}`}>
                {s.detail}
              </p>
            )}
            {s.extra}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ThreatCard({ t, events }: { t: Threat; events: ThreatEvent[] }) {
  const steps = useMemo(() => buildSteps(t, events), [t, events]);
  const st = STATUS_STYLE[t.status];
  return (
    <article className="slide-up rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">{ATTACK_LABEL[t.attackType] ?? t.attackType}</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-100 break-words">{t.summary}</h2>
          <p className="addr mt-1 text-xs text-slate-400" title={t.indicator}>
            {shortIndicator(t.indicator)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${st.cls}`}>{st.label}</span>
      </header>
      <Timeline steps={steps} />
    </article>
  );
}

export default function MemoryPage() {
  const [data, setData] = useState<ThreatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/threats", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let next = (await res.json()) as ThreatsResponse;

      // Ask Reppo about anything still pending; the status route advances the timeline.
      const pending = next.threats.filter((t) => t.status === "submitted");
      if (pending.length) {
        await Promise.all(
          pending.map((t) =>
            fetch(`/api/reppo/status?threatId=${encodeURIComponent(t.id)}`, { cache: "no-store" }).catch(() => null),
          ),
        );
        const again = await fetch("/api/threats", { cache: "no-store" });
        if (again.ok) next = (await again.json()) as ThreatsResponse;
      }
      setData(next);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load threat memory");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const byThreat = useMemo(() => {
    const m = new Map<string, ThreatEvent[]>();
    for (const e of data?.events ?? []) {
      const list = m.get(e.threatId) ?? [];
      list.push(e);
      m.set(e.threatId, list);
    }
    return m;
  }, [data]);

  const counts = useMemo(() => {
    const th = data?.threats ?? [];
    return {
      total: th.length,
      verified: th.filter((t) => t.status === "verified").length,
      pending: th.filter((t) => t.status === "submitted").length,
      caught: th.reduce((n, t) => n + t.caughtCount, 0),
    };
  }, [data]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-slate-400 hover:text-slate-200">
          ← Back to Sentinel
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-50">Threat memory</h1>
      <p className="mt-2 text-sm text-slate-400">
        Each attacker Sentinel finds goes through four steps: discovered, sent to Reppo, verified, and then used
        to protect the next person. Only Reppo-verified threats block other users.
      </p>

      {data && (
        <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Threats", counts.total],
            ["Verified", counts.verified],
            ["Pending", counts.pending],
            ["Blocks", counts.caught],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="text-lg font-semibold text-slate-100 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · refreshes every 30 s` : "Loading…"}</span>
        <button
          onClick={load}
          className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-6 rounded-xl border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">
          Could not load threat memory: {error}
        </p>
      )}

      {data && data.threats.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          No threats recorded yet. Run a wallet action through Sentinel and any attacker it finds will appear here.
        </p>
      )}

      <section className="mt-6 space-y-4">
        {data?.threats.map((t) => <ThreatCard key={t.id} t={t} events={byThreat.get(t.id) ?? []} />)}
      </section>
    </main>
  );
}
