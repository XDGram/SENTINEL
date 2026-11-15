"use client";

import { motion } from "motion/react";
import { MonoLabel } from "@/components/ui";
import { Spotlight } from "@/components/ui/Spotlight";

const REAL = "0x7a3F9c2E41b8D06f5A1c93e7B2d4F8a6C0e5d91B";
const FAKE = "0x7a3F1b8c09E2a4D7f3B6e015C8a9D2b47E0fd91B";

function Addr({ value, compare }: { value: string; compare?: string }) {
  return (
    <span className="font-mono text-[11px] tracking-tight sm:text-[11.5px]">
      {value.split("").map((ch, i) => {
        const edge = i < 6 || i >= value.length - 4;
        const diff = compare && !edge && compare[i]?.toLowerCase() !== ch.toLowerCase();
        return (
          <motion.span
            key={i}
            className={edge ? "text-white" : diff ? "text-white/40" : "text-white/40"}
            animate={diff ? { color: ["rgba(255,255,255,0.4)", "#e8848f", "rgba(255,255,255,0.4)"] } : undefined}
            transition={diff ? { duration: 2.4, repeat: Infinity, delay: 1 + (i % 7) * 0.08 } : undefined}
          >
            {ch}
          </motion.span>
        );
      })}
    </span>
  );
}

function Poisoning() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line-dark bg-white/[0.03] p-3">
        <MonoLabel className="text-white/40">Chidi · saved contact</MonoLabel>
        <div className="mt-1 break-all">
          <Addr value={REAL} />
        </div>
      </div>
      <div className="rounded-xl border border-risky/40 bg-risky/[0.06] p-3">
        <MonoLabel className="text-risky">Copied from history</MonoLabel>
        <div className="mt-1 break-all">
          <Addr value={FAKE} compare={REAL} />
        </div>
      </div>
      <p className="text-xs text-white/45">Same start, same end. The middle gives it away.</p>
    </div>
  );
}

function Approval() {
  return (
    <div className="rounded-xl border border-line-dark bg-white/[0.03] p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Spending cap</span>
        <span className="font-mono text-white">USDT</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-white/60 to-risky"
          initial={{ width: "8%" }}
          whileInView={{ width: "100%" }}
          viewport={{ once: false, amount: 0.6 }}
          transition={{ duration: 2.2, ease: "easeInOut" }}
        />
      </div>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-xs text-white/45">What you meant: 50</span>
        <motion.span
          className="font-display text-4xl leading-none text-white"
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.6, type: "spring", stiffness: 260, damping: 14 }}
        >
          ∞
        </motion.span>
      </div>
      <p className="mt-3 text-xs text-white/45">Unlimited, forever, to a contract nobody can vouch for.</p>
    </div>
  );
}

function Permit() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line-dark bg-white/[0.03] p-4">
      <MonoLabel className="text-white/40">usdt-rewards.xyz</MonoLabel>
      <p className="mt-2 text-sm text-white">Sign to claim your 50 USDT reward</p>
      <div className="mt-3 rounded-lg bg-black/25 p-2.5 font-mono text-[11px] leading-5 text-white/45">
        primaryType: &quot;Permit&quot;
        <br />
        value: 1157920892373…
        <br />
        deadline: 2100-01-01
      </div>
      <motion.div
        className="absolute inset-x-3 bottom-3 rounded-lg bg-risky px-3 py-2 text-xs font-medium text-white"
        initial={{ y: 60, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ amount: 0.7 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 220, damping: 20 }}
      >
        Not a login. It lets a stranger spend all your USDT.
      </motion.div>
      <div className="h-10" />
    </div>
  );
}

const CARDS = [
  { n: "01", title: "Address poisoning", body: "A zero-value transfer plants a lookalike address in your history, hoping you copy it next time.", art: <Poisoning /> },
  { n: "02", title: "Unlimited approvals", body: "One click gives a contract permission to move every token you hold, today or years from now.", art: <Approval /> },
  { n: "03", title: "Fake reward signatures", body: "“Just sign to claim” is often a gasless permit that hands your tokens to a drainer.", art: <Permit /> },
];

export function Threats() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {CARDS.map((c, i) => (
        <motion.div
          key={c.n}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ delay: i * 0.12, duration: 0.5 }}
        >
          <Spotlight className="flex h-full flex-col rounded-[var(--radius-box)] border border-line-dark bg-deep-2 p-5 sm:p-6">
            <MonoLabel className="text-white/35">{`// ${c.n}`}</MonoLabel>
            <h3 className="font-display mt-3 text-[28px] leading-tight text-white">{c.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/60">{c.body}</p>
            <div className="mt-6 flex-1">{c.art}</div>
          </Spotlight>
        </motion.div>
      ))}
    </div>
  );
}
