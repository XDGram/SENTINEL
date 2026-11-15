import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/guard";
import { MAX_SPEECH_INPUT } from "@/lib/speech-text";
import { failureMessage, speak, voiceAvailable, voiceBudgetUsed } from "@/lib/voice";

export const dynamic = "force-dynamic";

// Each clip is ~10 s of upstream work and ~300 credits, so this is tighter
// than the read-only endpoints.
const RATE_LIMIT = Number(process.env.VOICE_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = 60_000;

/** Which part of the UI asked, for logging only. */
const SOURCES = ["verdict", "answer", "check", "scan", "manual"] as const;

/**
 * Read a short piece of Watchdog's output aloud.
 *
 * The browser gets only the finished audio URL. On any failure it falls back
 * to the device's own speech engine, so a problem here means a different voice
 * rather than no voice at all.
 */
export async function POST(req: Request) {
  if (!voiceAvailable()) {
    return NextResponse.json({ error: "Voice is not connected.", fallback: "browser" }, { status: 503 });
  }

  const wait = rateLimit(`voice:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many voice requests. Try again in ${wait}s.`, fallback: "browser" },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown; source?: unknown; speed?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required", fallback: "browser" }, { status: 400 });
  }
  if (text.length > MAX_SPEECH_INPUT) {
    return NextResponse.json({ error: "text is too long", fallback: "browser" }, { status: 400 });
  }
  const source = typeof body?.source === "string" && (SOURCES as readonly string[]).includes(body.source) ? body.source : "manual";
  const speed = typeof body?.speed === "number" ? body.speed : undefined;

  const out = await speak(text, { speed });

  if (!out.ok) {
    const status = out.error.reason === "budget" ? 429 : out.error.reason === "timeout" ? 504 : 502;
    return NextResponse.json({ error: failureMessage(out.error), fallback: "browser" }, { status });
  }

  console.log(`[voice] ${source} ${out.result.cached ? "cache" : "generated"} ${out.result.ms}ms credits=${out.result.creditCost ?? "?"} chars=${out.result.text.length}`);

  return NextResponse.json({
    audioUrl: out.result.audioUrl,
    cached: out.result.cached,
    ms: out.result.ms,
    creditCost: out.result.creditCost,
    text: out.result.text,
    budget: voiceBudgetUsed(),
  });
}
