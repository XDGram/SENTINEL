"use client";

import { BadgeCheck, Database, ShieldAlert, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn, shortAddr } from "@/lib/cn";
import { DRAINER_POOL } from "@/lib/sim-data";

/**
 * Animated relay of the learning loop:
 * 0 Ada paused → 1 evidence to Reppo → 2 evaluators vote, score → 3 into memory
 * → 4 memory to Bayo → 5 Bayo blocked instantly. Loops.
 */
const PHASES = 6;
const STEP_MS = 1300;

const NODES = {
  ada: { x: 24, y: 20 },
  reppo: { x: 76, y: 20 },
  memory: { x: 76, y: 80 },
  bayo: { x: 24, y: 80 },
} as const;

const LEGS: Record<number, [keyof typeof NODES, keyof typeof NODES]> = { 1: ["ada", "reppo"], 3: ["reppo", "memory"], 4: ["memory", "bayo"] };

const MEMORY = ["0x4341…a67b", "0x7fb2…4f41", "0x101c…0fc0"];

export function LearningLoop() {
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => {
        if (p === PHASES - 1) setCycle((c) => c + 1);
        return (p + 1) % PHASES;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  const leg = LEGS[phase];
  const fresh = shortAddr(DRAINER_POOL[(cycle % (DRAINER_POOL.length - 1)) + 1].spender, 4);
  const memory = phase >= 3 && phase <= 5 ? [fresh, ...MEMORY.slice(0, 2)] : MEMORY;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px]">
      {/* track */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <rect x="24" y="20" width="52" height="60" rx="6" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="0.35" strokeDasharray="1.2 1.6">
          <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="6s" repeatCount="indefinite" />
        </rect>
      </svg>

      {/* travelling evidence packet */}
      <AnimatePresence>
        {leg && (
          <motion.span
            key={`${cycle}-${phase}`}
            className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_6px_rgb(255_255_255/.12),0_0_24px_4px_rgb(255_255_255/.35)]"
            initial={{ left: `${NODES[leg[0]].x}%`, top: `${NODES[leg[0]].y}%`, opacity: 0 }}
            animate={{ left: `${NODES[leg[1]].x}%`, top: `${NODES[leg[1]].y}%`, opacity: 1 }}
            exit={{ opacity: 0, scale: 2 }}
            transition={{ duration: STEP_MS / 1000 - 0.15, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>

      {/* centre caption */}
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-2xl leading-tight text-white">Learns once.</p>
          <p className="font-display text-2xl leading-tight text-white/50 italic">Protects everyone.</p>
        </div>
      </div>

      {/* Ada */}
      <Node pos={NODES.ada} lit={phase === 0 || phase === 1}>
        <Person initial="A" name="Ada" sub="meets a new drainer" />
        <Chip show={phase <= 1} tone="bad" icon={<ShieldAlert className="h-3 w-3" />}>
          Paused
        </Chip>
      </Node>

      {/* Reppo */}
      <Node pos={NODES.reppo} lit={phase === 2}>
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-white/80" />
          <span className="text-sm font-medium text-white">Reppo</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full"
              animate={{ backgroundColor: phase >= 2 ? "#ffffff" : "rgba(255,255,255,0.18)", scale: phase === 2 ? [1, 1.5, 1] : 1 }}
              transition={{ delay: phase === 2 ? i * 0.25 : 0, duration: 0.4 }}
            />
          ))}
          <span className="ml-1 text-[11px] text-white/45">evaluators</span>
        </div>
        <p className="mt-1.5 font-mono text-xs text-white/70">{phase >= 2 ? "accept · 96/100" : "waiting…"}</p>
      </Node>

      {/* Memory */}
      <Node pos={NODES.memory} lit={phase === 3}>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-white/80" />
          <span className="text-sm font-medium text-white">Shared memory</span>
        </div>
        <ul className="mt-2 space-y-1">
          <AnimatePresence initial={false}>
            {memory.map((m, i) => (
              <motion.li
                key={m}
                layout
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={cn("rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", i === 0 && phase >= 3 ? "bg-white text-ink" : "bg-white/[0.06] text-white/60")}
              >
                {m}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Node>

      {/* Bayo */}
      <Node pos={NODES.bayo} lit={phase === 5}>
        <Person initial="B" name="Bayo" sub="same drainer, new site" />
        <Chip show={phase === 5} tone="good" icon={<ShieldCheck className="h-3 w-3" />}>
          Blocked · 0 AI calls
        </Chip>
      </Node>
    </div>
  );
}

function Node({ pos, lit, children }: { pos: { x: number; y: number }; lit: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute z-20 w-[44%] max-w-[190px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-deep-2 p-3"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      animate={{
        borderColor: lit ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.1)",
        boxShadow: lit ? "0 0 0 6px rgba(255,255,255,0.06), 0 20px 40px -20px rgba(0,0,0,.6)" : "0 0 0 0 rgba(255,255,255,0)",
        scale: lit ? 1.04 : 1,
      }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

function Person({ initial, name, sub }: { initial: string; name: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-ink">{initial}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium text-white">{name}</span>
        <span className="block truncate text-[11px] text-white/45">{sub}</span>
      </span>
    </div>
  );
}

function Chip({ show, tone, icon, children }: { show: boolean; tone: "good" | "bad"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-2 h-6">
      <AnimatePresence>
        {show && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              tone === "bad" ? "bg-risky/20 text-[#ff8a8a]" : "bg-white text-ink",
            )}
          >
            {icon}
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
