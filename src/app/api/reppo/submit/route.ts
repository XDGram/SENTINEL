import { NextResponse } from "next/server";
import { reppoSubmit } from "@/lib/reppo";
import { countSubmissions, findThreatByFingerprint, listThreats, setStatus } from "@/lib/store";
import type { SubmitRequest, SubmitResponse } from "@/lib/types";
import { clientKey, rateLimit } from "@/lib/guard";

export const dynamic = "force-dynamic";

// Each Reppo evaluation costs credits, and the demo is public.
const MAX_SUBMISSIONS = Number(process.env.REPPO_MAX_SUBMISSIONS ?? 6);
const MAX_ATTEMPTS_PER_THREAT = 2;

export async function POST(req: Request) {
  const wait = rateLimit(`submit:${clientKey(req)}`, 5, 60_000);
  if (wait) return NextResponse.json({ error: `Too many requests. Try again in ${wait}s.` }, { status: 429 });
  const body = (await req.json().catch(() => null)) as SubmitRequest | null;
  if (!body?.fingerprint) {
    return NextResponse.json({ error: "fingerprint is required" }, { status: 400 });
  }

  // Only threats the server itself discovered can be submitted, using the
  // evidence packet the server built. The client can't supply the payload.
  const threat = await findThreatByFingerprint(body.fingerprint);
  if (!threat || !threat.reppoPacket) {
    return NextResponse.json({ error: "Unknown threat. Analyse the action first." }, { status: 404 });
  }
  // A rejected threat may be resubmitted once (after re-analysis refreshed its packet).
  const attempts = (await listThreats()).events.filter((e) => e.threatId === threat.id && e.kind === "submitted").length;
  const resubmittable = threat.status === "rejected" && attempts < MAX_ATTEMPTS_PER_THREAT;
  if (threat.status !== "discovered" && threat.status !== "failed" && !resubmittable) {
    const res: SubmitResponse = {
      threat,
      evalId: threat.reppoEvalId,
      status: threat.status === "submitted" ? "PENDING" : "SETTLED",
      message: threat.status === "rejected" ? "Reppo rejected this twice; it stays out of threat memory." : "Already submitted to Reppo.",
    };
    return NextResponse.json(res);
  }
  if (!threat.servRecommendsSubmit) {
    const res: SubmitResponse = {
      threat,
      status: "BLOCKED",
      message: "SERV did not recommend this for verification.",
    };
    return NextResponse.json(res, { status: 409 });
  }
  // Verification policy: rule evidence + at least one independent external source
  // + SERV recommendation, before Reppo is asked to verify.
  if (!threat.externalSources?.length) {
    const res: SubmitResponse = {
      threat,
      status: "BLOCKED",
      message: "No independent external source has corroborated this yet, so it is not sent to Reppo.",
    };
    return NextResponse.json(res, { status: 409 });
  }
  if ((await countSubmissions()) >= MAX_SUBMISSIONS) {
    const res: SubmitResponse = { threat, status: "BLOCKED", message: "Demo submission limit reached." };
    return NextResponse.json(res, { status: 429 });
  }

  const result = await reppoSubmit(threat);
  if (!result.ok) {
    const message =
      result.httpStatus === 409
        ? "Reppo already has an evaluation in flight for this account. Try again shortly."
        : result.error;
    const res: SubmitResponse = { threat, status: "BLOCKED", message };
    return NextResponse.json(res, { status: result.httpStatus === 409 ? 409 : 502 });
  }

  const updated = await setStatus(threat.id, "submitted", `Sent to Reppo for independent evaluation (eval ${result.evalId}).`, {
    reppoEvalId: result.evalId,
  });
  const res: SubmitResponse = { threat: updated ?? threat, evalId: result.evalId, status: "PENDING" };
  return NextResponse.json(res, { status: 201 });
}
