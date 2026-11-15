import { NextResponse } from "next/server";
import { servAsk } from "@/lib/serv";
import type { AskRequest, AskResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AskRequest | null;
  const question = body?.question?.trim();
  if (!body?.analysis || !question) {
    return NextResponse.json({ error: "analysis and question are required" }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Question is too long" }, { status: 400 });
  }
  const answer = await servAsk({ ...body, question });
  const res: AskResponse = answer
    ? { answer, servUsed: true }
    : { answer: "Follow-up questions need SERV Reasoning, which is not connected right now.", servUsed: false };
  return NextResponse.json(res);
}
