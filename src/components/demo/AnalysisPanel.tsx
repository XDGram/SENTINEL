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
        <p className="font-display mt-4 text-3xl text-ink">Sentinel is watching.</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
          Pick something for Ada or Bayo to do, then press Send or Sign. Sentinel checks it before anything goes through, and
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
          Sentinel · {panel.owner}&apos;s {panel.action.kind === "send" ? "payment" : panel.action.kind === "approve" ? "approval" : "signature"}
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
