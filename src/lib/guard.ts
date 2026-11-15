// Abuse protection for the public API: request validation, per-client rate
// limits and a daily cap on SERV calls (each one costs credits).
// Limits are per server instance (best effort on serverless), which is enough
// to stop a simple loop from draining the budget.

import "server-only";
import type { ActionKind, WalletAction } from "./types";

// ---- Rate limiting ----

const g = globalThis as unknown as {
  __sentinelRate?: Map<string, number[]>;
  __sentinelServBudget?: { day: string; used: number };
};
const hits: Map<string, number[]> = (g.__sentinelRate ??= new Map());

/** Sliding-window limiter. Returns seconds to wait, or 0 if allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.ceil((windowMs - (now - recent[0])) / 1000);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return 0;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

// ---- Daily SERV budget ----

const MAX_SERV_CALLS_PER_DAY = Number(process.env.SERV_MAX_CALLS_PER_DAY ?? 300);

/** Reserve one SERV call from today's budget. False when the cap is reached. */
export function takeServBudget(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const b = g.__sentinelServBudget;
  if (!b || b.day !== day) g.__sentinelServBudget = { day, used: 0 };
  if (g.__sentinelServBudget!.used >= MAX_SERV_CALLS_PER_DAY) return false;
  g.__sentinelServBudget!.used++;
  return true;
}

export function servBudgetUsed(): { day: string; used: number; cap: number } {
  const day = new Date().toISOString().slice(0, 10);
  const b = g.__sentinelServBudget;
  return { day, used: b && b.day === day ? b.used : 0, cap: MAX_SERV_CALLS_PER_DAY };
}

// ---- Validation ----

const KINDS: ActionKind[] = ["send", "approve", "permit", "connect"];
const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** Returns an error message, or null when the action is acceptable. */
export function validateAction(a: unknown): string | null {
  if (!a || typeof a !== "object") return "action must be an object";
  const x = a as Partial<WalletAction>;
  if (!x.kind || !KINDS.includes(x.kind)) return "action.kind must be send, approve, permit or connect";
  if (typeof x.to !== "string" || !ADDR.test(x.to)) return "action.to must be a 0x address (40 hex characters)";
  if (typeof x.from !== "string" || !ADDR.test(x.from)) return "action.from must be a 0x address";
  if (typeof x.chain !== "string" || x.chain.length > 60) return "action.chain is required";
  if (typeof x.amount !== "string" || x.amount.length > 80) return "action.amount must be a short string";
  const t = x.token;
  if (!t || typeof t.symbol !== "string" || t.symbol.length > 20 || typeof t.address !== "string" || !ADDR.test(t.address)) {
    return "action.token must have a symbol and a 0x address";
  }
  if (x.dapp) {
    if (typeof x.dapp.url !== "string" || x.dapp.url.length > 300) return "action.dapp.url is invalid";
    try {
      const u = new URL(x.dapp.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return "action.dapp.url must be http(s)";
    } catch {
      return "action.dapp.url is not a URL";
    }
  }
  if (x.typedData !== undefined && JSON.stringify(x.typedData).length > 8000) return "action.typedData is too large";
  return null;
}
