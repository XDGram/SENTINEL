"use client";

import { BadgeCheck, CircleSlash, Clock, Send } from "lucide-react";
import { BarLoader, CtaButton } from "@/components/ui/elements";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Threat } from "@/lib/types";
import { useReppoStatus, useSubmitToReppo } from "@/lib/client/hooks";
import { ApiError } from "@/lib/client/api";
import { cn } from "@/lib/cn";

/** "Verify with Reppo" → pending (real polling) → verified / rejected with the real score. */
export function ReppoStatusCard({
  fingerprint,
  walletId,
  reason,
  dark,
  onSettled,
}: {
  fingerprint: string;
  walletId: "A" | "B";
  reason?: string;
  dark?: boolean;
  onSettled?: (t: Threat) => void;
}) {
  const submit = useSubmitToReppo();
  const [threatId, setThreatId] = useState<string | null>(null);
  const status = useReppoStatus(threatId);
  const threat = status.data?.threat ?? submit.data?.threat;
  const blocked = submit.data?.status === "BLOCKED";

  useEffect(() => {
    if (threat && (threat.status === "verified" || threat.status === "rejected")) onSettled?.(threat);
  }, [threat, onSettled]);

  const wrap = cn("rounded-2xl border p-4", dark ? "border-line-dark bg-white/[0.03]" : "border-line bg-white/70");
  const sub = cn("text-sm leading-6", dark ? "text-white/65" : "text-ink-soft");
  const title = cn("font-medium", dark ? "text-white" : "text-ink");

  // Not yet submitted
  if (!threatId && !blocked) {
    return (
      <div className={wrap}>
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pending/15 text-pending">
            <Send className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className={title}>New attacker. Help protect the next person.</p>
            <p className={sub}>
              {reason ?? "SERV recommends sending this to Reppo's independent evaluators."} If Reppo accepts it, Watchdog blocks
              this attacker instantly for every user.
            </p>
            {submit.isError && (
              <p className="mt-2 text-sm text-risky">{submit.error instanceof ApiError ? submit.error.message : "Submission failed."}</p>
            )}
            <CtaButton
              className="mt-3"
              tone={dark ? "light" : "dark"}
              disabled={submit.isPending}
              onClick={() =>
                submit.mutate(
                  { fingerprint, walletId },
                  { onSuccess: (r) => r.threat && r.status !== "BLOCKED" && setThreatId(r.threat.id) },
                )
              }
            >
              {submit.isPending ? "Sending to Reppo…" : "Verify with Reppo"}
            </CtaButton>
          </div>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className={wrap}>
        <p className={title}>Not sent to Reppo</p>
        <p className={sub}>{submit.data?.message}</p>
      </div>
    );
  }

  const s = threat?.status ?? "submitted";
  if (s === "submitted") {
    return (
      <div className={wrap}>
        <div className="flex items-start gap-3">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pending/15 text-pending">
            <Clock className="h-4 w-4" aria-hidden />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-pending" />
          </div>
          <div className="min-w-0">
            <p className={title}>Pending at Reppo</p>
            <p className={sub}>
              Independent evaluators are reviewing Watchdog&apos;s evidence. This usually takes a few minutes; this page checks
              every 15 seconds.
            </p>
            <BarLoader className={cn("mt-3 w-full max-w-xs", dark ? "text-white" : "text-ink")} />
            {threat?.reppoEvalId && (
              <p className={cn("addr mt-2 text-xs", dark ? "text-white/45" : "text-ink-soft")}>eval {threat.reppoEvalId}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const verified = s === "verified";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={wrap}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
            verified ? "bg-safe/15 text-safe" : "bg-risky/15 text-risky",
          )}
        >
          {verified ? <BadgeCheck className="h-4 w-4" /> : <CircleSlash className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className={title}>
            {verified ? "Verified by Reppo · added to threat memory" : `Reppo ${threat?.reppoDecision ?? "rejected"} · kept out of memory`}
          </p>
          <p className={sub}>
            {threat?.reppoScore != null ? `Score ${threat.reppoScore}/100. ` : ""}
            {verified
              ? "The next person who meets this attacker is blocked instantly."
              : "Watchdog only trusts what Reppo accepts, so this attacker is not shared yet."}
          </p>
          {threat?.reppoEvalId && (
            <p className={cn("addr mt-2 text-xs", dark ? "text-white/45" : "text-ink-soft")}>eval {threat.reppoEvalId}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
