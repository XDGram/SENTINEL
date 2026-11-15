import { NextResponse } from "next/server";
import { analyzeAction } from "@/lib/analyze";
import type { AnalyzeRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.action || (body.walletId !== "A" && body.walletId !== "B")) {
    return NextResponse.json({ error: "action and walletId are required" }, { status: 400 });
  }
  try {
    // English only for now; other languages come later.
    const analysis = await analyzeAction({ ...body, language: "en" });
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("analyze failed", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
