"use client";

import { AlertTriangle, Globe, Wallet } from "lucide-react";
import { useCheck } from "@/lib/client/hooks";
import { ApiError } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { MonoLabel, Skeleton } from "@/components/ui";
import { RingsLoader } from "@/components/ui/elements";
import { plain, VerdictHeader } from "./verdict";
import { ExplainButton } from "@/components/voice";
import { composeBreakdownSpeech } from "@/lib/speech-text";
import type { IntelSourceId } from "@/lib/types";

/** Human names for the sources, so the voice does not say "goplus". */
const SOURCE_NAMES: Record<string, string> = {
  goplus: "GoPlus Security",
  scamsniffer: "ScamSniffer",
  metamask: "the MetaMask phishing list",
  web: "community reports",
};
const sourceName = (s: IntelSourceId | string) => SOURCE_NAMES[s] ?? String(s);
import { EvidenceList, fromReports } from "./EvidenceList";
import { useT } from "@/lib/client/useT";
import { useRef } from "react";

export function CheckResult({ input }: { input: string }) {
  const q = useCheck(input);
  const tr = useT();
  // True once an answer has already been shown for this input, which means a
  // pending state now is a language change rather than the first look.
  const seenOnce = useRef(false);
  if (q.data) seenOnce.current = true;

  // While a language change is re-generating the answer, say so: the wait is a
  // real SERV call, and a silent skeleton reads as nothing happening.
  if (q.isPending) return <ResultSkeleton label={tr(seenOnce.current ? "loading.rereading" : "loading.checking")} />;
  if (q.isError) return <ResultError error={q.error} onRetry={() => q.refetch()} />;

  const d = q.data;
  const r = d.result;
  const flagged = d.flaggedBy.length > 0;
  const verdict = r?.verdict ?? (flagged ? "risky" : "uncertain");
  const Icon = d.normalised.kind === "domain" ? Globe : Wallet;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-ink-soft">
        <Icon className="h-4 w-4" aria-hidden />
        <MonoLabel>{d.normalised.kind === "domain" ? "Website" : (r?.subject ?? "Address")}</MonoLabel>
        <span className="addr text-sm text-ink">{d.normalised.value}</span>
        {d.normalised.cleanup && <span className="text-xs">· {d.normalised.cleanup}</span>}
      </div>

      <VerdictHeader
        verdict={verdict}
        headline={r?.headline ?? (flagged ? "Public scam databases flag this." : "No public source reports this yet.")}
        explanation={r?.explanation ?? d.honesty}
        confidence={r?.confidence}
      />

      {/* A real check on a real indicator: offer the full spoken breakdown. */}
      {verdict !== "safe" && (
        <ExplainButton
          id={`explain:${d.normalised.kind}:${d.normalised.value}`}
          text={composeBreakdownSpeech({
            action: `You asked Watchdog to check ${d.normalised.kind === "domain" ? `the website ${d.normalised.value}` : "this address"}.`,
            headline: r?.headline,
            explanation: r?.explanation ?? d.honesty,
            flaggedBy: (d.flaggedBy ?? []).map(sourceName),
            fix: r?.whatToDo,
          })}
        />
      )}

      {r?.whatToDo && (
        <div className={cn("rounded-xl p-4 text-sm leading-6", verdict === "safe" ? "bg-safe/10" : verdict === "risky" ? "bg-risky/10" : "bg-uncertain/10")}>
          <MonoLabel className="text-ink-soft">What to do</MonoLabel>
          <p className="mt-1 text-ink">{plain(r.whatToDo)}</p>
          {r.steps.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
              {r.steps.map((s, i) => (
                <li key={i}>{plain(s)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {d.brandImpersonated && (
        <p className="flex items-start gap-2 rounded-xl border border-risky/30 bg-risky/5 p-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risky" aria-hidden />
          This site uses the name of <strong className="mx-1">{d.brandImpersonated}</strong> but is not that domain.
        </p>
      )}

      {d.token && d.token.risks.length > 0 && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <MonoLabel className="text-ink-soft">Token controls · {d.token.symbol ?? d.token.name}</MonoLabel>
          <p className="mt-1 text-ink-soft">{d.token.risks.join(" · ")}</p>
        </div>
      )}

      <EvidenceList items={fromReports(d.evidence)} title="Live sources checked" />

      <p className="rounded-xl bg-ink/5 p-3 text-xs leading-5 text-ink-soft">{d.honesty}</p>

      {!d.servUsed && (
        <p className="text-xs text-ink-soft">SERV Reasoning was unavailable, so this is a sources-only result.</p>
      )}
      {d.servUsed && r?.worthVerifying && (
        <p className="text-xs text-ink-soft">
          Watchdog recorded this as a new threat. Once evaluated by Reppo, it can protect every other user.
        </p>
      )}
      {d.servModel && <MonoLabel className="block text-ink-soft/70">Reasoned by SERV · {d.servModel}</MonoLabel>}
    </div>
  );
}

export function ResultSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="flex gap-4">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <RingsLoader className="label-mono text-ink-soft" label={label} />
    </div>
  );
}

export function ResultError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-risky/30 bg-risky/5 p-4 text-sm" role="alert">
      <p className="text-ink">{error instanceof ApiError ? error.message : "Something went wrong."}</p>
      <button onClick={onRetry} className="text-sm font-medium text-ink underline underline-offset-4">
        Try again
      </button>
    </div>
  );
}
