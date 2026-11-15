"use client";

// Phantom-style mobile wallet for the simulator: charcoal UI, lavender accent,
// account header, centred balance, round actions, token rows, request sheets
// and a bottom tab bar. Layout and feel only; no third-party name or logo.

import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Clock,

  LayoutGrid,
  PenLine,
  QrCode,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Home as HomeIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Analysis, Wallet, WalletAction } from "@/lib/types";
import type { Scenario } from "@/lib/sim-data";
import { cn, shortAddr } from "@/lib/cn";
import { plain } from "@/components/watchdog";
import { RingsLoader } from "@/components/ui/elements";

export type PhoneState =
  | { view: "home" }
  | { view: "review"; scenario: Scenario; action: WalletAction }
  | { view: "checking"; scenario: Scenario; action: WalletAction }
  | { view: "paused"; scenario: Scenario; action: WalletAction; analysis: Analysis }
  | { view: "done"; scenario: Scenario; action: WalletAction; outcome: "sent" | "cancelled" | "lost"; message: string };

const LAV = "#ab9ff2";

const TAG: Record<Scenario["tag"], string> = {
  safe: "Payment",
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
  return (
    <section
      aria-label={`${wallet.owner}'s wallet (simulated)`}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-[2.4rem] border-[6px] bg-[#222222] text-white shadow-[0_30px_60px_-30px_rgb(0_0_0/.6)] transition",
        active ? "border-[#3a3a3a]" : "border-[#111111]",
      )}
    >
      {/* status bar */}
      <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-white/80">
        <span>9:41</span>
        <span className="h-5 w-20 rounded-full bg-black" aria-hidden />
        <span className="label-mono text-[9px] text-white/40">SIM</span>
      </div>

      {/* header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button onClick={onHome} className="flex items-center gap-2.5 rounded-full py-1 pr-2 hover:bg-white/5" aria-label={`${wallet.owner}'s wallet home`}>
          <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-[#222222]" style={{ background: LAV }}>
            {wallet.owner[0]}
          </span>
          <span className="text-left leading-tight">
            <span className="flex items-center gap-1 text-[15px] font-semibold">
              {wallet.owner} <ChevronDown className="h-3.5 w-3.5 text-white/50" />
            </span>
            <span className="text-[11px] text-white/45">@{wallet.city.toLowerCase()}</span>
          </span>
        </button>
        <span className="flex items-center gap-1 rounded-full bg-[#2a2a2a] px-2.5 py-1 text-[11px] font-medium" style={{ color: LAV }}>
          <ShieldCheck className="h-3.5 w-3.5" /> Watchdog
        </span>
      </div>

      <div className="relative min-h-[560px] flex-1 px-4 pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
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

      {/* tab bar */}
      <nav className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-white/5 bg-[#1c1c1c] px-4 pt-3 pb-4" aria-hidden>
        {[HomeIcon, LayoutGrid, ArrowLeftRight, Clock, Search].map((I, i) => (
          <I key={i} className="h-5 w-5" style={{ color: i === 0 ? LAV : "rgb(255 255 255 / .35)" }} />
        ))}
      </nav>
    </section>
  );
}

/* ---------------------------------------------------------------- home */

type Filter = "all" | "send" | "approve" | "permit";

function Home({ wallet, scenarios, onPick }: { wallet: Wallet; scenarios: Scenario[]; onPick: (s: Scenario) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const total = wallet.balances.reduce((s, b) => s + b.usd, 0);
  const list = scenarios.filter((s) => filter === "all" || s.action.kind === filter);

  const actions: { label: string; icon: typeof Send; onClick: () => void; active?: boolean }[] = [
    {
      label: copied ? "Copied" : "Receive",
      icon: copied ? Check : QrCode,
      onClick: () =>
        navigator.clipboard?.writeText(wallet.address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }),
    },
    { label: "Send", icon: Send, onClick: () => setFilter(filter === "send" ? "all" : "send"), active: filter === "send" },
    { label: "Swap", icon: ArrowLeftRight, onClick: () => setFilter(filter === "approve" ? "all" : "approve"), active: filter === "approve" },
    { label: "Sign", icon: PenLine, onClick: () => setFilter(filter === "permit" ? "all" : "permit"), active: filter === "permit" },
  ];

  return (
    <div>
      <div className="pt-4 pb-5 text-center">
        <p className="text-[40px] leading-none font-bold tracking-tight tabular-nums">
          ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="mt-2 text-sm text-white/45">
          <span className="addr">{shortAddr(wallet.address)}</span> · simulated
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {actions.map((a) => (
          <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-1.5">
            <span
              className={cn("grid h-14 w-full place-items-center rounded-2xl transition-colors", a.active ? "bg-[#3a3a3a]" : "bg-[#2a2a2a] hover:bg-[#333333]")}
            >
              <a.icon className="h-5 w-5" style={{ color: LAV }} />
            </span>
            <span className="text-[11px] text-white/60">{a.label}</span>
          </button>
        ))}
      </div>

      <ul className="mt-5 space-y-2">
        {wallet.balances.map((b) => (
          <li key={b.symbol} className="flex items-center gap-3 rounded-2xl bg-[#2a2a2a] p-3">
            <TokenIcon symbol={b.symbol} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{b.symbol === "USDT" ? "Tether USD" : "Ethereum"}</p>
              <p className="text-xs text-white/45">
                {b.amount.toLocaleString()} {b.symbol}
              </p>
            </div>
            <p className="text-sm font-semibold tabular-nums">${b.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </li>
        ))}
      </ul>

      <p className="mt-5 mb-2 flex items-center justify-between text-[13px] font-semibold text-white/80">
        Try a request
        {filter !== "all" && (
          <button onClick={() => setFilter("all")} className="text-xs font-normal" style={{ color: LAV }}>
            Show all
          </button>
        )}
      </p>
      <ul className="space-y-2">
        {list.map((s) => {
          const host = s.action.dapp ? new URL(s.action.dapp.url).hostname : null;
          const contact = wallet.contacts.find((c) => c.address.toLowerCase() === s.action.to.toLowerCase());
          return (
            <li key={s.id}>
              <button onClick={() => onPick(s)} className="flex w-full items-center gap-3 rounded-2xl bg-[#2a2a2a] p-3 text-left transition-colors hover:bg-[#333333]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#3a3a3a] text-sm font-bold text-white/85">
                  {(host ?? contact?.name ?? "?")[0].toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block truncate text-xs text-white/45">{host ?? (contact ? `To ${contact.name}` : shortAddr(s.action.to))}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    s.tag === "safe" ? "bg-white/10 text-white/60" : "bg-[#ff6b6b]/15 text-[#ff8a8a]",
                  )}
                >
                  {TAG[s.tag]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TokenIcon({ symbol }: { symbol: string }) {
  if (symbol === "USDT")
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#26a17b] text-lg font-bold" aria-hidden>
        ₮
      </span>
    );
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#3a3a3a]" aria-hidden>
      <svg viewBox="0 0 10 16" className="h-5 w-3.5" fill="none">
        <path d="M5 0 0 8.2 5 11l5-2.8L5 0Z" fill="#c9c9c9" />
        <path d="M5 12 0 9.2 5 16l5-6.8L5 12Z" fill="#8f8f8f" />
      </svg>
    </span>
  );
}

/* ---------------------------------------------------------------- request sheet */

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
  const title = action.kind === "send" ? `Send ${action.token.symbol}` : action.kind === "approve" ? "Approve token spending" : "Sign message";
  const cta = action.kind === "send" ? "Send" : action.kind === "approve" ? "Approve" : "Sign";

  return (
    <div className="flex h-full min-h-[480px] flex-col pt-2">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#2a2a2a] text-xl font-bold">
          {host ? host[0].toUpperCase() : <Send className="h-6 w-6" style={{ color: LAV }} />}
        </span>
        <p className="mt-3 text-lg font-semibold">{title}</p>
        {host && <p className="mt-1 rounded-full bg-[#2a2a2a] px-3 py-1 text-xs text-white/60">{host}</p>}
      </div>

      {action.kind === "send" ? (
        <div className="mt-5 space-y-2">
          <div className="rounded-2xl bg-[#2a2a2a] p-4 text-center">
            <p className="text-3xl font-bold tabular-nums">
              {action.amount} <span className="text-lg text-white/50">{action.token.symbol}</span>
            </p>
          </div>
          <div className="rounded-2xl bg-[#2a2a2a] p-3">
            <p className="text-xs text-white/45">To{contact ? ` · ${contact.name}` : ""}</p>
            <p className="addr mt-1 text-[12.5px] leading-5 text-white/85">{action.to}</p>
            {action.addressSource === "copied-from-history" && <p className="mt-2 text-[11px] text-white/40">Pasted from recent activity</p>}
            {action.addressSource === "address-book" && <p className="mt-2 text-[11px] text-white/40">From saved contacts</p>}
          </div>
          <Row k="Network" v="Ethereum" />
        </div>
      ) : action.kind === "approve" ? (
        <div className="mt-5 space-y-2 text-sm">
          <Row k="Token" v={action.token.symbol} />
          <Row k="Spending cap" v={action.amount === "unlimited" ? "Unlimited" : action.amount} />
          <Row k="Spender" v={<span className="addr">{shortAddr(action.to, 6)}</span>} />
          <Row k="Network" v="Ethereum" />
        </div>
      ) : (
        <div className="mt-5">
          <p className="mb-2 text-xs text-white/45">Message</p>
          <pre className="addr max-h-40 overflow-auto rounded-2xl bg-[#2a2a2a] p-3 text-[10.5px] leading-relaxed text-white/55">
            {JSON.stringify(action.typedData, null, 1)}
          </pre>
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2.5 pt-5">
        <button onClick={onCancel} disabled={checking} className="rounded-2xl bg-[#333333] py-3.5 text-sm font-semibold text-white/85 hover:bg-[#3a3a3a] disabled:opacity-50">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={checking}
          className="grid place-items-center rounded-2xl py-3.5 text-sm font-semibold text-[#222222] transition-opacity hover:opacity-90"
          style={{ background: LAV }}
        >
          {checking ? <RingsLoader className="scale-[0.55] text-[#222222]" /> : cta}
        </button>
      </div>
      {checking && <p className="mt-2 text-center text-xs" style={{ color: LAV }}>Watchdog is checking this request…</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#2a2a2a] px-3.5 py-3 text-sm">
      <span className="text-white/45">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Paused({ analysis, onCancel }: { analysis: Analysis; onCancel: () => void }) {
  return (
    <div className="flex h-full min-h-[480px] flex-col pt-2">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="rounded-2xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/10 p-4"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-[#ff8a8a]">
          <ShieldAlert className="h-5 w-5" /> Watchdog paused this request
        </p>
        <p className="mt-2 text-[15px] leading-snug text-white">{plain(analysis.headline)}</p>
      </motion.div>
      <p className="mt-4 text-sm leading-6 text-white/55">
        Nothing has been sent or signed. See what Watchdog found
        <span className="hidden lg:inline"> on the right</span>
        <span className="lg:hidden"> below</span>.
      </p>
      <div className="mt-auto pt-5">
        <button onClick={onCancel} className="w-full rounded-2xl bg-[#333333] py-3.5 text-sm font-semibold text-white/85 hover:bg-[#3a3a3a]">
          Cancel and go back
        </button>
      </div>
    </div>
  );
}

function Done({ outcome, message, onHome }: { outcome: "sent" | "cancelled" | "lost"; message: string; onHome: () => void }) {
  const cfg = {
    sent: { icon: Check, title: "Sent", ring: "bg-[#2ec08b]/15 text-[#2ec08b]" },
    cancelled: { icon: ShieldCheck, title: "Your money is safe", ring: "bg-[#ab9ff2]/15 text-[#ab9ff2]" },
    lost: { icon: XCircle, title: "Funds lost (simulation)", ring: "bg-[#ff6b6b]/15 text-[#ff8a8a]" },
  }[outcome];
  return (
    <div className="flex h-full min-h-[480px] flex-col items-center pt-10 text-center">
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className={cn("grid h-20 w-20 place-items-center rounded-full", cfg.ring)}
      >
        <cfg.icon className="h-9 w-9" />
      </motion.span>
      <p className="mt-5 text-xl font-semibold">{cfg.title}</p>
      <p className="mt-2 max-w-[260px] text-sm leading-6 text-white/55">{message}</p>
      <button onClick={onHome} className="mt-auto w-full rounded-2xl py-3.5 text-sm font-semibold text-[#222222]" style={{ background: LAV }}>
        Done
      </button>
    </div>
  );
}

