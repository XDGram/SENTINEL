"use client";

import { BadgeCheck, RotateCcw, ShieldAlert, Zap } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { Threat, Wallet, WalletAction } from "@/lib/types";
import { DRAINER_POOL, initialWallets, SCENARIOS, withDrainer, type Scenario } from "@/lib/sim-data";
import { api, ApiError } from "@/lib/client/api";
import { useHealth, useThreats } from "@/lib/client/hooks";
import { shortAddr } from "@/lib/cn";
import { cn } from "@/lib/cn";
import { MonoLabel } from "@/components/ui";
import { PhoneWallet, type PhoneState } from "./PhoneWallet";
import { AnalysisPanel, type PanelState } from "./AnalysisPanel";

type Id = "A" | "B";

const STEPS = [
  { n: "01", title: "Ada meets a new scam", body: "“Claim a token airdrop”. Watchdog stops it and recommends verifying the attacker with Reppo." },
  { n: "02", title: "Reppo verifies", body: "Independent evaluators review Watchdog's evidence. Accepted attackers enter the shared memory." },
  { n: "03", title: "Bayo is protected", body: "“Claim a rewards drop”: same drainer, different site. Blocked instantly from memory, 0 AI calls." },
];

export function DemoClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const health = useHealth();
  const threats = useThreats();
  // Pick the first pool drainer Watchdog has never seen (any status), and lock
  // it once Ada meets it, so Bayo's repeat scenario uses the same drainer.
  const [locked, setLocked] = useState<number | null>(null);
  // "Seen" means it has been sent to Reppo (or verified/rejected). Merely viewing
  // a drainer in a rehearsal doesn't use it up.
  const pickFresh = (list: { fingerprint: string; indicator: string; status: string }[]) => {
    const seen = new Set(list.filter((t) => t.status !== "discovered").flatMap((t) => [t.fingerprint, t.indicator]));
    return DRAINER_POOL.findIndex((d) => !seen.has(`spender:${d.spender.toLowerCase()}`));
  };
  const freshIdx = threats.data ? pickFresh(threats.data.threats) : 0;
  const poolIdx = locked ?? (freshIdx === -1 ? DRAINER_POOL.length - 1 : freshIdx);
  const drainer = DRAINER_POOL[poolIdx];
  const scenarios = withDrainer(SCENARIOS, drainer);
  const [wallets, setWallets] = useState<Record<Id, Wallet>>(() => initialWallets());
  const [phones, setPhones] = useState<Record<Id, PhoneState>>({ A: { view: "home" }, B: { view: "home" } });
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [fixing, setFixing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const setPhone = (id: Id, s: PhoneState) => setPhones((p) => ({ ...p, [id]: s }));

  const showPanel = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const debit = (id: Id, action: WalletAction) => {
    if (action.kind !== "send") return;
    const amt = Number(action.amount) || 0;
    setWallets((w) => ({
      ...w,
      [id]: {
        ...w[id],
        balances: w[id].balances.map((b) => (b.symbol === action.token.symbol ? { ...b, amount: b.amount - amt, usd: b.usd - amt } : b)),
      },
    }));
  };

  const analyze = async (id: Id, scenario: Scenario, action: WalletAction) => {
    setPhone(id, { view: "checking", scenario, action });
    setPanel({ walletId: id, owner: wallets[id].owner, action, analysis: null });
    showPanel();
    try {
      const a = await api.analyze(action, id);
      setPanel({ walletId: id, owner: wallets[id].owner, action, analysis: a });
      if (a.matchedThreatId) {
        toast({
          title: "Blocked from memory",
          description: `${wallets[id].owner} was protected instantly, 0 AI calls.`,
          tag: `${a.latencyMs} ms`,
          tone: "good",
          icon: <Zap className="h-5 w-5" />,
          action: { label: "View", href: "/memory" },
        });
      } else if (a.verdict !== "safe") {
        toast({
          title: "Watchdog paused this",
          description: `${wallets[id].owner}'s ${action.kind === "send" ? "payment" : "signature"} was stopped before it went through.`,
          tone: "bad",
          icon: <ShieldAlert className="h-5 w-5" />,
        });
      }
      if (a.verdict === "safe") {
        debit(id, action);
        setPhone(id, {
          view: "done",
          scenario,
          action,
          outcome: "sent",
          message:
            action.kind === "send"
              ? `${action.amount} ${action.token.symbol} sent. Watchdog found nothing wrong.`
              : "Done. Watchdog found nothing wrong.",
        });
      } else {
        setPhone(id, { view: "paused", scenario, action, analysis: a });
      }
      qc.invalidateQueries({ queryKey: ["stats"] });
      return a;
    } catch (e) {
      setPanel({ walletId: id, owner: wallets[id].owner, action, analysis: null, error: e instanceof ApiError ? e.message : "Analysis failed." });
      setPhone(id, { view: "review", scenario, action });
      return null;
    }
  };

  const confirm = (id: Id) => {
    const s = phones[id];
    if (s.view === "review") void analyze(id, s.scenario, s.action);
  };

  const cancel = (id: Id) => {
    const s = phones[id];
    if (s.view === "review") return setPhone(id, { view: "home" });
    if (s.view === "paused")
      setPhone(id, { view: "done", scenario: s.scenario, action: s.action, outcome: "cancelled", message: "Nothing was sent or signed." });
  };

  const fix = async () => {
    if (!panel?.analysis?.fix?.correctAddress) return;
    const id = panel.walletId;
    const s = phones[id];
    if (s.view !== "paused") return;
    setFixing(true);
    const action: WalletAction = { ...s.action, to: panel.analysis.fix.correctAddress, addressSource: "address-book" };
    await analyze(id, s.scenario, action);
    setFixing(false);
  };

  const proceed = () => {
    if (!panel) return;
    const id = panel.walletId;
    const s = phones[id];
    if (s.view !== "paused") return;
    debit(id, s.action);
    setPhone(id, {
      view: "done",
      scenario: s.scenario,
      action: s.action,
      outcome: "lost",
      message:
        s.action.kind === "send"
          ? `In real life, ${s.action.amount} ${s.action.token.symbol} would now belong to the attacker. Transfers can't be reversed.`
          : `In real life, the attacker could now take all of ${wallets[id].owner}'s ${s.action.token.symbol} at any time.`,
    });
  };

  const reset = () => {
    setWallets(initialWallets());
    setPhones({ A: { view: "home" }, B: { view: "home" } });
    setPanel(null);
    setLocked(null);
    void threats.refetch();
  };

  const onSettled = useCallback((t: Threat) => {
    toast(
      t.status === "verified"
        ? {
            title: "Verified by Reppo",
            description: "Added to threat memory. The next person is protected.",
            tag: t.reppoScore != null ? `score ${t.reppoScore}/100` : undefined,
            tone: "good",
            icon: <BadgeCheck className="h-5 w-5" />,
            action: { label: "Memory", href: "/memory" },
          }
        : {
            title: "Reppo did not accept it",
            description: "Kept out of shared memory. Watchdog only trusts accepted verdicts.",
            tag: t.reppoScore != null ? `score ${t.reppoScore}/100` : undefined,
            tone: "bad",
            icon: <ShieldAlert className="h-5 w-5" />,
          },
    );
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
    qc.invalidateQueries({ queryKey: ["threats"] });
  }, [qc, toast]);

  const h = health.data;

  return (
    <div>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <MonoLabel className="text-ink-soft">Live demo · simulated wallets, real data</MonoLabel>
          <h1 className="font-display mt-3 text-[40px] leading-[1.05] sm:text-[56px]">
            Two wallets. <span className="italic text-ink/75">One shared memory.</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Live ok={h?.serv} label={h ? `SERV · ${h.servModel}` : "SERV"} />
          <Live ok={h?.reppo} label="Reppo" />
          <Live ok={h ? h.store === "supabase" : undefined} label="Threat memory" />
          <button onClick={reset} className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-ink-soft hover:bg-black/5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset demo
          </button>
        </div>
      </div>

      <ol className="mt-8 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-surface p-4">
            <MonoLabel className="text-teal">{`// ${s.n}`}</MonoLabel>
            <p className="mt-2 text-sm font-medium text-ink">{s.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">{s.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="uv-live text-safe" aria-hidden />
        {!threats.data && locked === null ? (
          <>Checking Watchdog&apos;s memory for a drainer it hasn&apos;t met yet…</>
        ) : freshIdx === -1 && locked === null ? (
          <>Every demo drainer is already in Watchdog&apos;s memory, so Ada will be protected instantly too.</>
        ) : (
          <>
            This run&apos;s new attacker: <code className="font-mono text-ink">{shortAddr(drainer.spender, 5)}</code> · a real ScamSniffer-listed
            drainer Watchdog has never seen ({poolIdx + 1} of {DRAINER_POOL.length})
          </>
        )}
      </p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,340px)_minmax(0,1fr)]">
        {(["A", "B"] as const).map((id) => (
          <PhoneWallet
            key={id}
            wallet={wallets[id]}
            scenarios={scenarios.filter((s) => s.walletId === id)}
            state={phones[id]}
            active={panel?.walletId === id}
            onPick={async (s) => {
              if (s.id === "a-airdrop" && locked === null) {
                // Always decide from fresh data, never from a list still loading.
                const latest = (await threats.refetch()).data?.threats ?? [];
                const idx = pickFresh(latest);
                const chosen = idx === -1 ? DRAINER_POOL.length - 1 : idx;
                setLocked(chosen);
                const fresh = withDrainer(SCENARIOS, DRAINER_POOL[chosen]).find((x) => x.id === s.id)!;
                setPhone(id, { view: "review", scenario: fresh, action: fresh.action });
                return;
              }
              setPhone(id, { view: "review", scenario: s, action: s.action });
            }}
            onConfirm={() => confirm(id)}
            onCancel={() => cancel(id)}
            onHome={() => setPhone(id, { view: "home" })}
          />
        ))}
        <div ref={panelRef} className="scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
          <AnalysisPanel
            panel={panel}
            fixing={fixing}
            onFix={fix}
            onCancel={() => panel && cancel(panel.walletId)}
            onProceed={proceed}
            onReppoSettled={onSettled}
          />
        </div>
      </div>
    </div>
  );
}

function Live({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs text-ink ring-1 ring-line">
      <span className={cn("h-1.5 w-1.5 rounded-full", ok === undefined ? "bg-ink-soft/40" : ok ? "bg-safe" : "bg-risky")} aria-hidden />
      {label}
      <span className="sr-only">{ok ? "connected" : "not connected"}</span>
    </span>
  );
}
