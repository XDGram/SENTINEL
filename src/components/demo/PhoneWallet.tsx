"use client";

import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { RingsLoader } from "@/components/ui/elements";
import { AnimatePresence, motion } from "motion/react";
import type { Analysis, Wallet, WalletAction } from "@/lib/types";
import type { Scenario } from "@/lib/sim-data";
import { cn, shortAddr } from "@/lib/cn";
import { plain, VERDICT_META } from "@/components/sentinel";

export type PhoneState =
  | { view: "home" }
  | { view: "review"; scenario: Scenario; action: WalletAction }
  | { view: "checking"; scenario: Scenario; action: WalletAction }
  | { view: "paused"; scenario: Scenario; action: WalletAction; analysis: Analysis }
  | { view: "done"; scenario: Scenario; action: WalletAction; outcome: "sent" | "cancelled" | "lost"; message: string };

const TAG: Record<Scenario["tag"], string> = {
  safe: "Everyday payment",
  "known-attack": "Known scam",
  "new-attack": "New scam",
  "repeat-attack": "Repeat scam",
};

interface Props {
  wallet: Wallet;
  scenarios: Scenario[];
  state: PhoneState;
  active: boolean;
  onPick: (s: Scenario) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onHome: () => void;
}

export function PhoneWallet({ wallet, scenarios, state, active, onPick, onConfirm, onCancel, onHome }: Props) {
  const total = wallet.balances.reduce((s, b) => s + b.usd, 0);
  const usdt = wallet.balances.find((b) => b.symbol === "USDT");

  return (
    <section
      aria-label={`${wallet.owner}'s wallet (simulated)`}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-[2rem] bg-ink text-white shadow-[var(--shadow-box)] ring-1 transition",
        active ? "ring-white/40" : "ring-black/5",
      )}
    >
      <div className="flex items-center justify-between px-5 pt-4 text-[11px] text-white/45">
        <span className="label-mono">Simulated wallet</span>
        <span className="flex items-center gap-1 text-accent">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Watchdog on
        </span>
      </div>

      <button onClick={onHome} className="px-5 pt-3 pb-5 text-left" aria-label={`${wallet.owner}'s wallet home`}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-accent font-medium text-ink">{wallet.owner[0]}</div>
          <div className="min-w-0">
            <div className="font-medium">
              {wallet.owner} <span className="font-normal text-white/45">· {wallet.city}</span>
            </div>
            <div className="addr text-xs text-white/45">{shortAddr(wallet.address)}</div>
          </div>
        </div>
        <div className="font-display mt-4 text-4xl tabular-nums">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="text-sm text-white/55">{usdt?.amount.toLocaleString()} USDT</div>
      </button>

      <div className="min-h-[460px] flex-1 rounded-t-[1.6rem] bg-[#18221f] p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex h-full flex-col"
          >
            {state.view === "home" && <Home wallet={wallet} scenarios={scenarios} onPick={onPick} />}
            {(state.view === "review" || state.view === "checking") && (
              <Review action={state.action} wallet={wallet} checking={state.view === "checking"} onConfirm={onConfirm} onCancel={onCancel} />
            )}
            {state.view === "paused" && <Paused analysis={state.analysis} onCancel={onCancel} />}
            {state.view === "done" && <Done outcome={state.outcome} message={state.message} onHome={onHome} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function Home({ wallet, scenarios, onPick }: { wallet: Wallet; scenarios: Scenario[]; onPick: (s: Scenario) => void }) {
  const contact = (a: string) => wallet.contacts.find((c) => c.address.toLowerCase() === a.toLowerCase())?.name;
  return (
    <div>
      <p className="label-mono mb-2.5 text-white/40">What does {wallet.owner} want to do?</p>
      <ul className="space-y-2">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onPick(s)}
              className="w-full rounded-2xl bg-white/[0.05] p-3 text-left transition-colors hover:bg-white/[0.1]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{s.title}</span>
                <span className="label-mono shrink-0 text-[10px] text-white/35">{TAG[s.tag]}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-white/55">{s.story}</p>
            </button>
          </li>
        ))}
      </ul>
      <p className="label-mono mt-5 mb-1.5 text-white/40">Recent activity</p>
      <ul className="divide-y divide-white/5 text-sm">
        {wallet.history.map((h) => (
          <li key={h.hash} className="flex items-center gap-3 py-2">
            <span className={cn("grid h-7 w-7 place-items-center rounded-full", h.direction === "in" ? "bg-safe/15 text-safe" : "bg-white/10 text-white/70")}>
              {h.direction === "in" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-white/75">
              {h.direction === "in" ? "From " : "To "}
              {contact(h.counterparty) ?? <span className="addr">{shortAddr(h.counterparty)}</span>}
            </span>
            <span className={cn("shrink-0 tabular-nums", h.direction === "in" ? "text-safe" : "text-white/70")}>
              {h.direction === "in" ? "+" : "−"}
              {h.amount} {h.token}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Review({
  action,
  wallet,
  checking,
  onConfirm,
  onCancel,
}: {
  action: WalletAction;
  wallet: Wallet;
  checking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const host = action.dapp ? new URL(action.dapp.url).hostname : null;
  const contact = wallet.contacts.find((c) => c.address.toLowerCase() === action.to.toLowerCase());
  const title = action.kind === "send" ? "Confirm send" : action.kind === "approve" ? "Approve spending" : "Signature request";
  const cta = action.kind === "send" ? "Send" : action.kind === "approve" ? "Approve" : "Sign";
  return (
    <div className="flex h-full flex-col">
      <p className="label-mono text-white/40">{title}</p>
      {host && (
        <p className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-sm">
          <span className="text-white/45">Request from </span>
          <span className="font-medium">{host}</span>
        </p>
      )}
      {action.kind === "send" ? (
        <div className="mt-4 space-y-3">
          <div className="font-display text-4xl">
            {action.amount} <span className="text-xl text-white/50">{action.token.symbol}</span>
          </div>
          <div className="rounded-xl bg-white/[0.05] p-3">
            <p className="text-xs text-white/45">To{contact ? ` · ${contact.name}` : ""}</p>
            <p className="addr mt-1 text-[13px] leading-5 text-white/85">{action.to}</p>
            {action.addressSource === "copied-from-history" && <p className="mt-2 text-[11px] text-white/40">Pasted from recent activity</p>}
            {action.addressSource === "address-book" && <p className="mt-2 text-[11px] text-white/40">From saved contacts</p>}
          </div>
        </div>
      ) : action.kind === "approve" ? (
        <div className="mt-4 space-y-2 text-sm">
          <Row k="Token" v={action.token.symbol} />
          <Row k="Spending cap" v={action.amount === "unlimited" ? "Unlimited" : action.amount} />
          <Row k="Spender" v={<span className="addr">{shortAddr(action.to, 6)}</span>} />
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-white/70">This site asks you to sign a message:</p>
          <pre className="addr mt-2 max-h-36 overflow-auto rounded-xl bg-black/30 p-3 text-[10.5px] leading-relaxed text-white/50">
            {JSON.stringify(action.typedData, null, 1)}
          </pre>
        </div>
      )}
      <div className="mt-auto pt-5">
        {checking ? (
          <div className="flex justify-center rounded-2xl bg-white/[0.06] py-3.5 text-sm font-medium text-white/80">
            <RingsLoader label="Watchdog is checking…" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={onCancel} className="rounded-2xl bg-white/[0.06] py-3.5 text-sm font-medium text-white/80 hover:bg-white/[0.1]">
              Cancel
            </button>
            <button onClick={onConfirm} className="rounded-2xl bg-white py-3.5 text-sm font-semibold text-ink hover:bg-white/90">
              {cta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.05] px-3 py-2.5">
      <span className="text-white/45">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Paused({ analysis, onCancel }: { analysis: Analysis; onCancel: () => void }) {
  const m = VERDICT_META[analysis.verdict];
  return (
    <div className="flex h-full flex-col">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={cn("rounded-2xl p-4 ring-1", m.bg, m.ring)}
      >
        <p className={cn("flex items-center gap-2 text-sm font-semibold", m.text)}>
          <ShieldAlert className="h-5 w-5" aria-hidden /> Watchdog paused this
        </p>
        <p className="mt-2 text-[15px] leading-snug text-white">{plain(analysis.headline)}</p>
      </motion.div>
      <p className="mt-4 text-sm leading-6 text-white/55">
        Nothing has been sent or signed. See what Watchdog found
        <span className="hidden lg:inline"> on the right</span>
        <span className="lg:hidden"> below</span>.
      </p>
      <div className="mt-auto pt-5">
        <button onClick={onCancel} className="w-full rounded-2xl bg-white/[0.06] py-3.5 text-sm font-medium text-white/80 hover:bg-white/[0.1]">
          Cancel and go back
        </button>
      </div>
    </div>
  );
}

function Done({ outcome, message, onHome }: { outcome: "sent" | "cancelled" | "lost"; message: string; onHome: () => void }) {
  const cfg = {
    sent: { icon: CheckCircle2, title: "Sent", cls: "text-safe bg-safe/12 ring-safe/30" },
    cancelled: { icon: ShieldCheck, title: "Your money is safe", cls: "text-accent bg-accent/12 ring-accent/30" },
    lost: { icon: XCircle, title: "Funds lost (simulation)", cls: "text-risky bg-risky/12 ring-risky/30" },
  }[outcome];
  return (
    <div className="flex h-full flex-col">
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("rounded-2xl p-5 ring-1", cfg.cls)}>
        <cfg.icon className="h-7 w-7" aria-hidden />
        <p className="mt-3 text-lg font-semibold">{cfg.title}</p>
        <p className="mt-1 text-sm leading-6 text-white/70">{message}</p>
      </motion.div>
      <div className="mt-auto pt-5">
        <button onClick={onHome} className="w-full rounded-2xl bg-white py-3.5 text-sm font-semibold text-ink hover:bg-white/90">
          Done
        </button>
      </div>
    </div>
  );
}
