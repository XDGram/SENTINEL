import { NextResponse } from "next/server";
import { reppoGet } from "@/lib/reppo";
import { getThreat, setStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Poll a submitted threat's Reppo evaluation and move it along the timeline. */
export async function GET(req: Request) {
  const threatId = new URL(req.url).searchParams.get("threatId");
  if (!threatId) return NextResponse.json({ error: "threatId is required" }, { status: 400 });

  const threat = await getThreat(threatId);
  if (!threat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (threat.status !== "submitted" || !threat.reppoEvalId) {
    return NextResponse.json({ threat });
  }

  const ev = await reppoGet(threat.reppoEvalId);
  if (!ev || ev.status === "PENDING") {
    return NextResponse.json({ threat, reppo: ev });
  }

  if (ev.status === "SETTLED" && ev.verdict) {
    const v = ev.verdict;
    const patch = { reppoScore: v.score, reppoDecision: v.decision, reppoRoute: v.route };
    const updated =
      v.decision === "accept"
        ? await setStatus(threat.id, "verified", `Reppo verdict: accept, score ${v.score}/100 (${v.confidence} confidence). Added to threat memory.`, patch)
        : await setStatus(threat.id, "rejected", `Reppo verdict: ${v.decision}, score ${v.score}/100. Not added to threat memory.`, patch);
    return NextResponse.json({ threat: updated, reppo: ev });
  }

  const updated = await setStatus(threat.id, "failed", `Reppo evaluation failed: ${ev.failureReason ?? "unknown reason"}. No credits charged.`);
  return NextResponse.json({ threat: updated, reppo: ev });
}
