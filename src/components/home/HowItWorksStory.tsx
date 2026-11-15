"use client";

import { BadgeCheck, MousePointer2, ShieldAlert, Zap } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { MonoLabel } from "@/components/ui";
import { RingsLoader } from "@/components/ui/elements";

const STEPS = [
  { title: "You're about to sign", body: "A site asks Ada to sign a message to “claim 50 USDT”. It looks harmless." },
  { title: "Watchdog steps in", body: "Before anything goes through, built-in rules spot the red flags in milliseconds." },
  { title: "It checks live sources", body: "GoPlus, ScamSniffer and MetaMask's phishing list are checked live, every time." },
  { title: "SERV explains it plainly", body: "SERV Reasoning weighs the evidence and explains it in plain English, step by step." },
  { title: "Reppo verifies. Everyone's safer.", body: "Reppo's evaluators verify the attacker. The next person who meets it is blocked instantly." },
];

const DURATION = 5200;

export function HowItWorksStory() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      setStep((s) => (s + 1) % STEPS.length);
      setTick((k) => k + 1);
    }, DURATION);
    return () => clearTimeout(t);
  }, [step, paused, tick]);

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <ol className="space-y-1">
        {STEPS.map((s, i) => {
          const active = i === step;
          return (
            <li key={s.title}>
              <button
                onClick={() => {
                  setStep(i);
                  setTick((k) => k + 1);
                }}
                aria-current={active ? "step" : undefined}
                className={cn("w-full rounded-2xl p-4 text-left transition-colors", active ? "bg-surface" : "hover:bg-surface/60")}
              >
                <div className="flex items-baseline gap-3">
                  <MonoLabel className={active ? "text-ink" : "text-ink-soft/60"}>{String(i + 1).padStart(2, "0")}</MonoLabel>
                  <span className={cn("font-display text-2xl leading-tight transition-colors", active ? "text-ink" : "text-ink-soft/70")}>{s.title}</span>
                </div>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="mt-2 pl-8 text-sm leading-6 text-ink-soft">{s.body}</p>
                      <div className="mt-3 ml-8 h-0.5 overflow-hidden rounded-full bg-line">
                        <motion.div
                          key={`${tick}-${paused}`}
                          className="h-full bg-ink"
                          initial={{ width: "0%" }}
                          animate={{ width: paused ? undefined : "100%" }}
                          transition={{ duration: DURATION / 1000, ease: "linear" }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[28px] bg-ink p-6 text-white shadow-[var(--shadow-box)] sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgb(255_255_255/.07),transparent_55%)]" />
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="relative grid h-full place-items-center"
          >
            {step === 0 && <SceneSign />}
            {step === 1 && <ScenePause />}
            {step === 2 && <SceneSources />}
            {step === 3 && <SceneExplain />}
            {step === 4 && <SceneVerify />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- scenes */

function RequestCard({ children, dim }: { children?: React.ReactNode; dim?: boolean }) {
  return (
    <div className={cn("relative w-full max-w-[340px] rounded-3xl bg-[#18221f] p-5 ring-1 ring-white/10 transition-opacity", dim && "opacity-60")}>
      <MonoLabel className="text-white/40">Signature request</MonoLabel>
      <p className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-sm">
        <span className="text-white/45">from </span>usdt-rewards.xyz
      </p>
      <p className="font-display mt-4 text-2xl">Sign to claim 50 USDT</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <span className="rounded-2xl bg-white/[0.06] py-3 text-center text-sm text-white/70">Cancel</span>
        <span className="rounded-2xl bg-white py-3 text-center text-sm font-semibold text-ink">Sign</span>
      </div>
      {children}
    </div>
  );
}

function SceneSign() {
  return (
    <div className="relative w-full max-w-[340px]">
      <RequestCard />
      <motion.div
        className="absolute"
        initial={{ left: "20%", top: "40%" }}
        animate={{ left: "72%", top: "86%" }}
        transition={{ duration: 1.4, ease: "easeInOut", delay: 0.4 }}
      >
        <MousePointer2 className="h-6 w-6 fill-white text-ink" />
        <motion.span
          className="absolute -top-2 -left-2 h-10 w-10 rounded-full border-2 border-white/60"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4], opacity: [0.8, 0] }}
          transition={{ delay: 1.9, duration: 0.8, repeat: Infinity, repeatDelay: 0.6 }}
        />
      </motion.div>
    </div>
  );
}

const FLAGS = ["Not a login: it's a spending permit", "Spender is an unknown address", "Unlimited amount", "Lasts about 73 years", "Site isn't a known app"];

function ScenePause() {
  return (
    <div className="relative w-full max-w-[340px]">
      <RequestCard dim />
      <motion.div
        className="absolute inset-x-3 top-3 rounded-2xl bg-white p-3 text-ink shadow-xl"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.2 }}
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-risky">
          <ShieldAlert className="h-4 w-4" /> Watchdog paused this
        </p>
        <ul className="mt-2 space-y-1.5">
          {FLAGS.map((f, i) => (
            <motion.li
              key={f}
              className="flex items-center gap-2 text-xs"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.35 }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-risky" /> {f}
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

const SOURCES = [
  { name: "GoPlus Security", what: "Address linked to phishing" },
  { name: "ScamSniffer", what: "On the scam blacklist" },
  { name: "MetaMask list", what: "Phishing domain" },
];

function SceneSources() {
  const [done, setDone] = useState(0);
  useEffect(() => {
    const ts = SOURCES.map((_, i) => setTimeout(() => setDone(i + 1), 900 + i * 900));
    return () => ts.forEach(clearTimeout);
  }, []);
  return (
    <div className="w-full max-w-[380px] space-y-3">
      <MonoLabel className="text-white/40">Checking live sources · real calls</MonoLabel>
      {SOURCES.map((s, i) => (
        <div key={s.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
          <div>
            <p className="text-sm font-medium">{s.name}</p>
            <p className="text-xs text-white/45">{done > i ? s.what : "checking…"}</p>
          </div>
          {done > i ? (
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-risky px-2.5 py-1 text-xs font-medium text-white">
              Malicious
            </motion.span>
          ) : (
            <RingsLoader className="scale-[0.6] text-white/70" />
          )}
        </div>
      ))}
    </div>
  );
}

const SENTENCE = "Don't sign. This is a spending permission, not a login. It would let an unknown address take all your USDT, and scam databases already list it.";
const TRACE = ["[R1] permit grants spending rights", "[R2] spender not a verified protocol", "[I2] ScamSniffer lists the spender", "[I3] GoPlus flags the site"];

function SceneExplain() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x >= SENTENCE.length ? x : x + 2)), 22);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="w-full max-w-[420px]">
      <MonoLabel className="text-white/40">SERV Reasoning · plain English</MonoLabel>
      <p className="font-display mt-3 min-h-[120px] text-[22px] leading-snug">
        {SENTENCE.slice(0, n)}
        <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-white/70" />
      </p>
      <ol className="mt-4 space-y-1.5 border-t border-white/10 pt-4">
        {TRACE.map((t, i) => (
          <motion.li
            key={t}
            className="flex gap-3 font-mono text-[12px] text-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 + i * 0.3 }}
          >
            <span className="text-white/35">{String(i + 1).padStart(2, "0")}</span>
            {t}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function Counter({ to }: { to: number }) {
  const mv = useMotionValue(0);
  const v = useTransform(mv, (x) => Math.round(x).toString());
  useEffect(() => {
    const c = animate(mv, to, { duration: 1.2, delay: 0.3, ease: "easeOut" });
    return () => c.stop();
  }, [mv, to]);
  return <motion.span>{v}</motion.span>;
}

function SceneVerify() {
  return (
    <div className="grid w-full max-w-[440px] gap-3">
      <div className="flex items-center justify-between rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
        <div>
          <MonoLabel className="text-white/40">Reppo evaluators</MonoLabel>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <BadgeCheck className="h-4 w-4" /> Verified · accept
          </p>
        </div>
        <p className="font-display text-5xl leading-none tabular-nums">
          <Counter to={96} />
          <span className="text-xl text-white/45">/100</span>
        </p>
      </div>
      <motion.div
        className="mx-auto h-8 w-px bg-gradient-to-b from-white/50 to-white/0"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 1.5 }}
        style={{ originY: 0 }}
      />
      <motion.div
        className="flex items-center gap-3 rounded-2xl bg-white p-4 text-ink"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, type: "spring", stiffness: 240, damping: 20 }}
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">
          <Zap className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Bayo is blocked instantly</p>
          <p className="text-xs text-ink-soft">Same drainer, different site · from shared memory</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm">0</p>
          <p className="label-mono text-ink-soft">AI calls</p>
        </div>
      </motion.div>
    </div>
  );
}
