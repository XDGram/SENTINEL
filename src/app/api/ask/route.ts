import { NextResponse } from "next/server";
import { servAsk, servAvailable } from "@/lib/serv";
import type { AskRequest, AskResponse } from "@/lib/types";
import { clientKey, rateLimit, takeServBudget, validateAction } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const wait = rateLimit(`ask:${clientKey(req)}`, 10, 60_000);
  if (wait) return NextResponse.json({ error: `Too many questions. Try again in ${wait}s.` }, { status: 429, headers: { "Retry-After": String(wait) } });
  const raw = await req.text();
  if (raw.length > 40_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const body = (() => {
    try {
      return JSON.parse(raw) as AskRequest;
    } catch {
      return null;
    }
  })();
  const question = body?.question?.trim();
  if (!body?.analysis || !question) {
    return NextResponse.json({ error: "analysis and question are required" }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long" }, { status: 400 });
  }
  const invalid = validateAction(body.action);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (!Array.isArray(body.analysis.evidence) || !Array.isArray(body.analysis.steps)) {
    return NextResponse.json({ error: "analysis is malformed" }, { status: 400 });
  }
  if (servAvailable() && !takeServBudget()) {
    return NextResponse.json({ answer: "Sentinel has used today's AI budget. Please try again tomorrow.", servUsed: false } satisfies AskResponse);
  }
  const answer = await servAsk({ ...body, question, language: "en" });
  const res: AskResponse = answer
    ? { answer, servUsed: true }
    : { answer: "Follow-up questions need SERV Reasoning, which is not connected right now.", servUsed: false };
  return NextResponse.json(res);
}
