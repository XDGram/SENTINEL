"use client";

import { Link2, ScanSearch, Sparkles, Wallet } from "lucide-react";
import { SendButton } from "@/components/ui/elements";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CheckResult, WalletScanReport } from "@/components/sentinel";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type Job = { kind: "check"; input: string } | { kind: "scan"; address: string };

const EXAMPLES: { label: string; job: Job }[] = [
  { label: "uniswap.lc", job: { kind: "check", input: "uniswap.lc" } },
  { label: "a drainer address", job: { kind: "check", input: "0x43412801d29861ecc4c4d86e5becfd16af86a67b" } },
  { label: "Vitalik's wallet", job: { kind: "scan", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" } },
];

export function AskBox() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"auto" | "scan" | "check">("auto");
  const [choose, setChoose] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = (j: Job) => {
    setChoose(null);
    setJob(j);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const submit = () => {
    const v = text.trim();
    if (!v) return inputRef.current?.focus();
    if (ADDRESS.test(v)) {
      if (mode === "scan") return run({ kind: "scan", address: v });
      if (mode === "check") return run({ kind: "check", input: v });
      return setChoose(v);
    }
    run({ kind: "check", input: v });
  };

  const placeholder =
    mode === "scan"
      ? "Paste your wallet address (0x…) to scan its approvals"
      : mode === "check"
        ? "Paste a suspicious link, address or message…"
        : "Paste a wallet address, contract, or a suspicious link…";

  return (
    <div id="check" className="scroll-mt-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="uv-glow mx-auto w-full max-w-[600px] rounded-[var(--radius-box)] p-[1.5px] shadow-[var(--shadow-box)]"
      >
        <div className="rounded-[calc(var(--radius-box)-1.5px)] bg-ink p-4 text-white">
        <label htmlFor="ask" className="sr-only">Ask Watchdog</label>
        <textarea
          id="ask"
          ref={inputRef}
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setChoose(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-[15px] leading-6 text-white outline-none placeholder:text-white/45"
        />
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            <Chip active={mode === "scan"} onClick={() => setMode(mode === "scan" ? "auto" : "scan")} icon={<Wallet className="h-3.5 w-3.5" />}>
              Scan my wallet
            </Chip>
            <Chip active={mode === "check"} onClick={() => setMode(mode === "check" ? "auto" : "check")} icon={<Link2 className="h-3.5 w-3.5" />}>
              Check a link
            </Chip>
            <Link
              href="/demo"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5" /> Try the demo
            </Link>
          </div>
          <SendButton onClick={submit} label="Ask Watchdog" />
        </div>

        <AnimatePresence>
          {choose && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
                <ChoiceButton onClick={() => run({ kind: "scan", address: choose })} icon={<Wallet className="h-4 w-4" />} title="Scan this wallet's approvals" sub="Finds risky permissions you've granted" />
                <ChoiceButton onClick={() => run({ kind: "check", input: choose })} icon={<ScanSearch className="h-4 w-4" />} title="Check this address" sub="Is it a scammer or a drainer?" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span>Try:</span>
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            className="underline decoration-ink-soft/30 underline-offset-4 hover:text-ink hover:decoration-ink"
            onClick={() => {
              setText(e.job.kind === "scan" ? e.job.address : e.job.input);
              run(e.job);
            }}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div ref={resultRef} className="scroll-mt-24">
        <AnimatePresence mode="wait">
          {job && (
            <motion.div
              key={job.kind === "scan" ? `s-${job.address}` : `c-${job.input}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="mx-auto mt-8 w-full max-w-[760px] rounded-[var(--radius-box)] border border-line bg-surface p-5 shadow-sm sm:p-7"
            >
              {job.kind === "scan" ? <WalletScanReport address={job.address} /> : <CheckResult input={job.input} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Chip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
        active ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ChoiceButton({ onClick, icon, title, sub }: { onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-xl bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/[0.12]">
      <span className="mt-0.5 text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-white/55">{sub}</span>
      </span>
    </button>
  );
}
