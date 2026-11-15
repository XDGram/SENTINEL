// ai33pro text-to-speech, used to read a verdict out loud.
// Server-only. Reads AI33_API_KEY from the environment; it never reaches the
// client, and the browser only ever receives the finished audio URL.
//
// Shape confirmed against the live API:
//   POST /v3/text-to-speech   multipart: text, voice_id, speed   header xi-api-key
//     -> 200 { success: true, task_id }
//   GET  /v1/task/{task_id}
//     -> { status: "doing" | "done" | ..., credit_cost, metadata: { audio_url } }
// Measured: ~10 s and 132 credits for 118 characters.

import "server-only";
import { MAX_BREAKDOWN_CHARS, MAX_SPEECH_CHARS, clampSpeech, sanitiseSpeech } from "./speech-text";

export const AI33_BASE = "https://api.ai33.pro";

/** Bella: professional, bright, warm. en-US female. */
export const DEFAULT_VOICE_ID = "elevenlabs_hpp4J3VqNfWAUOO0d1Us";

export function voiceId(): string {
  return process.env.AI33_VOICE_ID || DEFAULT_VOICE_ID;
}

export function voiceAvailable(): boolean {
  return Boolean(process.env.AI33_API_KEY);
}

const SUBMIT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 1200;
/** Generation measured at ~10 s; allow headroom without hanging a request. */
const TOTAL_BUDGET_MS = Number(process.env.VOICE_TIMEOUT_MS ?? 26_000);

// ---- Daily budget ----
//
// Kept here rather than in guard.ts so the voice feature owns its own limit.
// Per server instance, which is best effort on serverless but enough to stop a
// loop from spending the credit balance.

const g = globalThis as unknown as {
  __watchdogVoiceBudget?: { day: string; used: number };
  __watchdogVoiceCache?: Map<string, CachedClip>;
};

const MAX_CALLS_PER_DAY = Number(process.env.VOICE_MAX_CALLS_PER_DAY ?? 500);

export function takeVoiceBudget(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const b = g.__watchdogVoiceBudget;
  if (!b || b.day !== day) g.__watchdogVoiceBudget = { day, used: 0 };
  if (g.__watchdogVoiceBudget!.used >= MAX_CALLS_PER_DAY) return false;
  g.__watchdogVoiceBudget!.used++;
  return true;
}

export function voiceBudgetUsed(): { day: string; used: number; cap: number } {
  const day = new Date().toISOString().slice(0, 10);
  const b = g.__watchdogVoiceBudget;
  return { day, used: b && b.day === day ? b.used : 0, cap: MAX_CALLS_PER_DAY };
}

// ---- Cache ----
//
// In memory, per instance. The same verdict wording is often replayed within a
// session, and a hit saves ~10 s and ~300 credits. It is deliberately not
// persisted: ai33pro's CDN URLs have no documented lifetime, so a stored URL
// could outlive its file and leave a dead player.

export interface CachedClip {
  audioUrl: string;
  creditCost?: number;
  at: number;
}

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 200;

function cache(): Map<string, CachedClip> {
  return (g.__watchdogVoiceCache ??= new Map());
}

export function cacheKey(text: string, speed: number): string {
  return `${voiceId()}|${speed}|${text}`;
}

function cacheGet(key: string): CachedClip | undefined {
  const hit = cache().get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache().delete(key);
    return undefined;
  }
  return hit;
}

function cacheSet(key: string, clip: CachedClip) {
  const c = cache();
  if (c.size >= CACHE_MAX) c.delete(c.keys().next().value as string);
  c.set(key, clip);
}

// ---- Synthesis ----

export interface SpeakResult {
  audioUrl: string;
  cached: boolean;
  ms: number;
  creditCost?: number;
  /** The exact text that was spoken, after sanitising and clamping. */
  text: string;
}

export type SpeakFailure =
  | { reason: "not-configured" }
  | { reason: "empty-text" }
  | { reason: "budget" }
  | { reason: "upstream"; message: string; httpStatus?: number }
  | { reason: "timeout" };

interface TaskResponse {
  status?: string;
  credit_cost?: number;
  progress?: number;
  text_truncated?: boolean;
  metadata?: { audio_url?: string };
  error?: string;
  message?: string;
}

/** Normalise the text the same way for the cache key and for synthesis. */
export function prepareSpeech(raw: string, long = false): string {
  return clampSpeech(sanitiseSpeech(raw), long ? MAX_BREAKDOWN_CHARS : MAX_SPEECH_CHARS);
}

/**
 * Speak one short piece of text. Returns the finished audio URL, or a reason
 * the caller can report; the browser falls back to its own speech engine so a
 * failure here is never silence.
 */
export async function speak(raw: string, opts: { speed?: number; long?: boolean } = {}): Promise<{ ok: true; result: SpeakResult } | { ok: false; error: SpeakFailure }> {
  const started = Date.now();
  if (!voiceAvailable()) return { ok: false, error: { reason: "not-configured" } };

  const text = prepareSpeech(raw, opts.long);
  if (!text) return { ok: false, error: { reason: "empty-text" } };

  // ai33pro accepts 0.5–1.5.
  const speed = Math.min(1.5, Math.max(0.5, opts.speed ?? 1));
  const key = cacheKey(text, speed);

  const hit = cacheGet(key);
  if (hit) {
    return { ok: true, result: { audioUrl: hit.audioUrl, cached: true, ms: Date.now() - started, creditCost: hit.creditCost, text } };
  }

  if (!takeVoiceBudget()) return { ok: false, error: { reason: "budget" } };

  // 1. Submit the job.
  let taskId: string;
  try {
    const form = new FormData();
    form.append("text", text);
    form.append("voice_id", voiceId());
    form.append("speed", String(speed));

    const res = await fetch(`${AI33_BASE}/v3/text-to-speech`, {
      method: "POST",
      headers: { "xi-api-key": process.env.AI33_API_KEY as string },
      body: form,
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; task_id?: string; message?: string; error?: string } | null;
    if (!res.ok || !body?.task_id) {
      return {
        ok: false,
        error: {
          reason: "upstream",
          httpStatus: res.status,
          message: body?.message ?? body?.error ?? `ai33pro returned ${res.status}`,
        },
      };
    }
    taskId = body.task_id;
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, error: timedOut ? { reason: "timeout" } : { reason: "upstream", message: err instanceof Error ? err.message : String(err) } };
  }

  // 2. Poll until the audio exists.
  const deadline = started + TOTAL_BUDGET_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let task: TaskResponse | null = null;
    try {
      const res = await fetch(`${AI33_BASE}/v1/task/${encodeURIComponent(taskId)}`, {
        headers: { "xi-api-key": process.env.AI33_API_KEY as string },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      task = (await res.json().catch(() => null)) as TaskResponse | null;
    } catch {
      // A single failed poll is not fatal; keep trying until the deadline.
      continue;
    }
    if (!task) continue;

    const status = (task.status ?? "").toLowerCase();
    if (status === "done") {
      const audioUrl = task.metadata?.audio_url;
      if (!audioUrl) return { ok: false, error: { reason: "upstream", message: "ai33pro finished without an audio URL" } };
      cacheSet(key, { audioUrl, creditCost: task.credit_cost, at: Date.now() });
      return { ok: true, result: { audioUrl, cached: false, ms: Date.now() - started, creditCost: task.credit_cost, text } };
    }
    if (status === "failed" || status === "error") {
      return { ok: false, error: { reason: "upstream", message: task.error ?? task.message ?? "ai33pro reported the job as failed" } };
    }
    // "doing": keep waiting.
  }

  return { ok: false, error: { reason: "timeout" } };
}

/** Human-readable reason, for the response body. */
export function failureMessage(error: SpeakFailure): string {
  switch (error.reason) {
    case "not-configured":
      return "Voice is not connected.";
    case "empty-text":
      return "There was nothing to read out.";
    case "budget":
      return "The daily voice limit has been reached.";
    case "timeout":
      return "Voice generation took too long.";
    default:
      return error.message;
  }
}
