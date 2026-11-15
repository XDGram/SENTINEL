// Learning analytics. Every number is counted from stored threats and
// threat_events; nothing is estimated. There is no catch rate: Sentinel has no
// benchmark set to measure one against.

import { NextResponse } from "next/server";
import { countEventsByKind, countThreatsByStatus, listEventsOfKind, storeKind } from "@/lib/store";
import { clientKey, rateLimit } from "@/lib/guard";
import type { ThreatEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=30, s-maxage=30, stale-while-revalidate=30";

export interface EvaluationRecord {
  threatId: string;
  evalId: string | null;
  submittedAt: string;
  outcome: "verified" | "rejected" | "failed" | "pending";
  settledAt: string | null;
  decision: string | null;
  score: number | null;
}

/**
 * Pair each "submitted" event with the settlement event that follows it for the
 * same threat. Eval IDs and scores are read from the event details the Reppo
 * routes write ("(eval <id>)", "verdict: <decision>, score <n>/100").
 */
function evaluations(events: ThreatEvent[]): EvaluationRecord[] {
  const byThreat = new Map<string, ThreatEvent[]>();
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const list = byThreat.get(e.threatId) ?? [];
    list.push(e);
    byThreat.set(e.threatId, list);
  }
  const out: EvaluationRecord[] = [];
  for (const [threatId, list] of byThreat) {
    list.forEach((e, i) => {
      if (e.kind !== "submitted") return;
      const next = list.slice(i + 1).find((x) => x.kind !== "submitted");
      const settled = next && (next.kind === "verified" || next.kind === "rejected" || next.kind === "failed") ? next : null;
      const score = settled?.detail.match(/score (\d+(?:\.\d+)?)\/100/)?.[1];
      out.push({
        threatId,
        evalId: e.detail.match(/\(eval ([^)\s]+)\)/)?.[1] ?? null,
        submittedAt: e.at,
        outcome: settled ? (settled.kind as EvaluationRecord["outcome"]) : "pending",
        settledAt: settled?.at ?? null,
        decision: settled?.detail.match(/verdict: (\w+)/)?.[1] ?? null,
        score: score != null ? Number(score) : null,
      });
    });
  }
  return out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function GET(req: Request) {
  const wait = rateLimit(`stats:${clientKey(req)}`, 60, 60_000);
  if (wait) return NextResponse.json({ error: `Too many requests. Try again in ${wait}s.` }, { status: 429 });

  try {
    const [threatsByStatus, eventsByKind, reppoEvents] = await Promise.all([
      countThreatsByStatus(),
      countEventsByKind(),
      listEventsOfKind(["submitted", "verified", "rejected", "failed"], 500),
    ]);
    const evals = evaluations(reppoEvents);
    const submittedThreats = new Set(reppoEvents.filter((e) => e.kind === "submitted").map((e) => e.threatId)).size;
    const totalThreats = Object.values(threatsByStatus).reduce((a, b) => a + b, 0);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        store: storeKind(),
        threats: { total: totalThreats, byStatus: threatsByStatus },
        // Each threat logs exactly one "discovered" event, so this is all threats ever found.
        discovered: eventsByKind.discovered,
        reppo: {
          submissions: eventsByKind.submitted,
          threatsSubmitted: submittedThreats,
          resubmissions: Math.max(0, eventsByKind.submitted - submittedThreats),
          verified: eventsByKind.verified,
          rejected: eventsByKind.rejected,
          failed: eventsByKind.failed,
          latestEvaluations: evals.slice(0, 10),
        },
        memory: {
          // A "caught" event is written when a Reppo-verified threat blocks a
          // later user. That path returns before SERV and before source lookups.
          repeatAttacksBlocked: eventsByKind.caught,
          repeatInvestigationsAvoided: eventsByKind.caught,
          note: "Each repeat attack was answered from threat memory without a SERV call or external source lookups.",
        },
        eventsByKind,
      },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (err) {
    console.error("[stats]", err);
    return NextResponse.json({ error: "Threat memory is unavailable." }, { status: 503 });
  }
}
