"use client";

import { ArrowRight, ShieldCheck, X } from "lucide-react";
import type { Analysis, Threat, WalletAction } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button, MonoLabel } from "@/components/ui";
import {
  AskSentinel,
  EvidenceList,
  fromEvidence,
  MemoryCatchBanner,
  ReasoningTrace,
  ReppoStatusCard,
  ResultSkeleton,
  VerdictHeader,
} from "@/components/sentinel";
import { ExplainButton } from "@/components/voice";
import { composeBreakdownSpeech } from "@/lib/speech-text";
import type { IntelSourceId } from "@/lib/types";

/** Human names for the sources, so the voice does not say "goplus". */
const SOURCE_NAMES: Record<IntelSourceId, string> = {
  goplus: "GoPlus Security",
  scamsniffer: "ScamSniffer",
  metamask: "the MetaMask phishing list",
  web: "community reports",
};
const sourceName = (s: IntelSourceId) => SOURCE_NAMES[s] ?? s;

/** One plain sentence describing the pending request. */
function describeAction(a: WalletAction): string {
  const site = a.dapp ? ` on ${(() => { try { return new URL(a.dapp.url).hostname; } catch { return a.dapp.name; } })()}` : "";
  if (a.kind === "send") return `send ${a.amount} ${a.token.symbol} to an address you copied`;
  if (a.kind === "approve") return `approve ${a.amount === "unlimited" ? "unlimited" : a.amount} ${a.token.symbol} for a contract${site}`;
  if (a.kind === "permit") return `sign a permission letting an unknown address spend your ${a.token.symbol}${site}`;
  return `connect your wallet${site}`;
}

export interface PanelState {
  walletId: "A" | "B";
  owner: string;
  action: WalletAction;
  analysis: Analysis | null;
  error?: string;
}

export function AnalysisPanel({
  panel,
  onFix,
  onCancel,
  onProceed,
  onClose,
  onReppoSettled,
  fixing,
}: {
  panel: PanelState | null;
  onFix: () => void;
  onCancel: () => void;
  onProceed: () => void;
  onClose?: () => void;
  onReppoSettled?: (t: Threat) => void;
  fixing: boolean;
}) {
  if (!panel) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[var(--radius-box)] border border-dashed border-line p-8 text-center">
        <ShieldCheck className="h-8 w-8 text-teal" aria-hidden />
        <p className="font-display mt-4 text-3xl text-ink">Watchdog is watching.</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
          Pick something for Ada or Bayo to do, then press Send or Sign. Watchdog checks it before anything goes through, and
          explains what it found here.
        </p>
      </div>
    );
  }

  const a = panel.analysis;
  return (
    <div className="relative rounded-[var(--radius-box)] border border-line bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <MonoLabel className="text-ink-soft">
          Watchdog · {panel.owner}&apos;s {panel.action.kind === "send" ? "payment" : panel.action.kind === "approve" ? "approval" : "signature"}
        </MonoLabel>
        {onClose && (
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 lg:hidden" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!a && !panel.error && <ResultSkeleton label="Rules → live scam sources → SERV Reasoning…" />}
      {panel.error && <p className="rounded-xl bg-risky/10 p-4 text-sm text-ink" role="alert">{panel.error}</p>}

      {a && (
        <div className="space-y-6">
          <VerdictHeader
            verdict={a.verdict}
            headline={a.headline}
            explanation={a.explanation}
            confidence={a.confidence}
            meta={
              <MonoLabel className="text-ink-soft/70">
                {a.servUsed ? `SERV · ${a.servModel}` : a.matchedThreatId ? "Threat memory" : "Rules + sources"} · {a.latencyMs} ms
              </MonoLabel>
            }
          />

          <MemoryCatchBanner analysis={a} />

          {/* The verdict already reads its headline aloud. This talks the whole
              finding through for someone who wants it broken down. */}
          {a.verdict !== "safe" && (
            <ExplainButton
              id={`explain:${panel.action.id}:${a.fingerprint ?? a.headline}`}
              text={composeBreakdownSpeech({
                action: `You were about to ${describeAction(panel.action)}.`,
                headline: a.headline,
                explanation: a.explanation,
                flaggedBy: (a.intel?.flaggedBy ?? []).map(sourceName),
                fix: a.fix ? `${a.fix.label}. ${a.fix.detail}` : undefined,
              })}
            />
          )}

          {a.verdict !== "safe" ? (
            <div className="flex flex-wrap gap-2">
              {a.fix?.kind === "use-correct-address" ? (
                <Button variant="safe" onClick={onFix} disabled={fixing}>
                  {a.fix.label} <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="dark" onClick={onCancel}>
                  {a.fix?.label ?? "Cancel"}
                </Button>
              )}
              {a.fix?.kind === "use-correct-address" && (
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <button onClick={onProceed} className="px-2 text-xs text-ink-soft underline underline-offset-4 hover:text-risky">
                Continue anyway
              </button>
            </div>
          ) : null}
          {a.fix?.detail && a.verdict !== "safe" && <p className="-mt-3 text-sm text-ink-soft">{a.fix.detail}</p>}

          {a.shouldSubmitToReppo && a.fingerprint && !a.matchedThreatId && (
            <ReppoStatusCard
              key={a.fingerprint}
              fingerprint={a.fingerprint}
              walletId={panel.walletId}
              reason={a.submitReason}
              onSettled={onReppoSettled}
            />
          )}

          <EvidenceList items={fromEvidence(a.evidence)} />
          <ReasoningTrace steps={a.steps} model={a.servUsed ? a.servModel : undefined} defaultOpen />
          {a.intel?.unavailable?.length ? (
            <p className={cn("text-xs text-ink-soft")}>
              Not consulted this time: {a.intel.unavailable.map((u) => u.source).join(", ")}.
            </p>
          ) : null}
          {a.verdict !== "safe" && <AskSentinel action={panel.action} analysis={a} />}
        </div>
      )}
    </div>
  );
}
