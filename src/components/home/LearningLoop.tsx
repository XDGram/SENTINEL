"use client";

import { BadgeCheck, Database, ShieldAlert, ShieldCheck } from "lucide-react";

const NODES = [
  { icon: ShieldAlert, label: "Ada meets a new attacker", x: 50, y: 6 },
  { icon: BadgeCheck, label: "Reppo verifies the evidence", x: 94, y: 50 },
  { icon: Database, label: "Shared threat memory", x: 50, y: 94 },
  { icon: ShieldCheck, label: "Bayo is protected instantly", x: 6, y: 50 },
];

/** Circular diagram of the learning loop with a pulse travelling around it. */
export function LearningLoop() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[440px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="loop" x1="0" x2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="url(#loop)" strokeWidth="0.6" strokeDasharray="1.2 2.4">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="40s" repeatCount="indefinite" />
        </circle>
        <circle r="1.6" fill="#ffffff">
          <animateMotion dur="8s" repeatCount="indefinite" path="M50,6 A44,44 0 1,1 49.99,6" />
        </circle>
        <circle r="3.5" fill="#ffffff" opacity="0.15">
          <animateMotion dur="8s" repeatCount="indefinite" path="M50,6 A44,44 0 1,1 49.99,6" />
        </circle>
      </svg>

      <div className="absolute inset-[22%] grid place-items-center rounded-full border border-line-dark bg-white/[0.03] text-center">
        <div>
          <p className="font-display text-3xl leading-tight text-white">Learns once.</p>
          <p className="font-display text-3xl leading-tight text-white/55 italic">Protects everyone.</p>
        </div>
      </div>

      {NODES.map((n) => (
        <div
          key={n.label}
          className="absolute flex w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-[0_0_0_6px_rgb(38_51_47)]">
            <n.icon className="h-5 w-5" />
          </span>
          <span className="rounded-md bg-deep px-1.5 py-0.5 text-xs leading-4 text-white/75">{n.label}</span>
        </div>
      ))}
    </div>
  );
}
