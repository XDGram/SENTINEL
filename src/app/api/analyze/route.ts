import { NextResponse } from "next/server";
import { analyzeAction } from "@/lib/analyze";
import type { AnalyzeRequest, Language } from "@/lib/types";

/** Languages the explanation can be returned in. */
const SUPPORTED: Language[] = ["en", "fr", "es"];
import { clientKey, rateLimit, validateAction } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const wait = rateLimit(`analyze:${clientKey(req)}`, 20, 60_000);
  if (wait) return NextResponse.json({ error: `Too many requests. Try again in ${wait}s.` }, { status: 429, headers: { "Retry-After": String(wait) } });
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.action || (body.walletId !== "A" && body.walletId !== "B")) {
    return NextResponse.json({ error: "action and walletId are required" }, { status: 400 });
  }
  const invalid = validateAction(body.action);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  try {
    // Only languages SERV has been exercised in are accepted; anything else
    // falls back to English rather than guessing at a translation.
    const language: Language = SUPPORTED.includes(body.language as Language) ? (body.language as Language) : "en";
    const analysis = await analyzeAction({ ...body, language });
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("analyze failed", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
