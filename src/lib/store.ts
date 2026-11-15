// Threat memory store.
// Current implementation: in-process memory (resets on server restart).
// To be replaced by Supabase behind this same interface. Keep the function
// signatures stable so the API routes don't change.

import type { AttackType, Threat, ThreatEvent, ThreatEventKind, ThreatStatus } from "./types";

interface Db {
  threats: Map<string, Threat>;
  events: ThreatEvent[];
}

const g = globalThis as unknown as { __sentinelDb?: Db };
const db: Db = (g.__sentinelDb ??= { threats: new Map(), events: [] });

const id = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

export async function listThreats(): Promise<{ threats: Threat[]; events: ThreatEvent[] }> {
  return {
    threats: [...db.threats.values()].sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt)),
    events: [...db.events].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export async function getThreat(threatId: string): Promise<Threat | null> {
  return db.threats.get(threatId) ?? null;
}

export async function findThreatByFingerprint(fingerprint: string): Promise<Threat | null> {
  for (const t of db.threats.values()) if (t.fingerprint === fingerprint) return t;
  return null;
}

export async function findThreatByEvalId(evalId: string): Promise<Threat | null> {
  for (const t of db.threats.values()) if (t.reppoEvalId === evalId) return t;
  return null;
}

/** A Reppo-verified threat matching any of these indicators. */
export async function findVerifiedThreat(indicators: string[]): Promise<Threat | null> {
  for (const t of db.threats.values()) {
    if (t.status === "verified" && (indicators.includes(t.fingerprint) || indicators.includes(t.indicator))) return t;
  }
  return null;
}

export async function createThreat(input: {
  fingerprint: string;
  attackType: AttackType;
  summary: string;
  indicator: string;
  walletId?: "A" | "B";
  reppoPacket?: string;
  servRecommendsSubmit?: boolean;
}): Promise<Threat> {
  const existing = await findThreatByFingerprint(input.fingerprint);
  if (existing) {
    // Refresh the packet while it has not been submitted yet.
    if (existing.status === "discovered" && input.reppoPacket) {
      return (await updateThreat(existing.id, {
        reppoPacket: input.reppoPacket,
        servRecommendsSubmit: input.servRecommendsSubmit,
      }))!;
    }
    return existing;
  }
  const t: Threat = {
    id: id("thr"),
    fingerprint: input.fingerprint,
    attackType: input.attackType,
    summary: input.summary,
    indicator: input.indicator,
    status: "discovered",
    discoveredAt: now(),
    caughtCount: 0,
    reppoPacket: input.reppoPacket,
    servRecommendsSubmit: input.servRecommendsSubmit,
  };
  db.threats.set(t.id, t);
  await addEvent({ threatId: t.id, kind: "discovered", walletId: input.walletId, detail: input.summary });
  return t;
}

export async function updateThreat(threatId: string, patch: Partial<Threat>): Promise<Threat | null> {
  const t = db.threats.get(threatId);
  if (!t) return null;
  const next = { ...t, ...patch };
  db.threats.set(threatId, next);
  return next;
}

export async function setStatus(
  threatId: string,
  status: ThreatStatus,
  detail: string,
  patch: Partial<Threat> = {},
): Promise<Threat | null> {
  const stamp: Partial<Threat> =
    status === "submitted" ? { submittedAt: now() } : status === "verified" ? { verifiedAt: now() } : {};
  const t = await updateThreat(threatId, { ...patch, ...stamp, status });
  if (t) await addEvent({ threatId, kind: status as ThreatEventKind, detail });
  return t;
}

export async function recordCatch(threatId: string, walletId: "A" | "B", detail: string): Promise<void> {
  const t = db.threats.get(threatId);
  if (!t) return;
  db.threats.set(threatId, { ...t, caughtCount: t.caughtCount + 1, lastCaughtAt: now() });
  await addEvent({ threatId, kind: "caught", walletId, detail });
}

export async function countSubmissions(): Promise<number> {
  return [...db.threats.values()].filter((t) => t.reppoEvalId).length;
}

export async function addEvent(e: Omit<ThreatEvent, "id" | "at">): Promise<ThreatEvent> {
  const event: ThreatEvent = { id: id("evt"), at: now(), ...e };
  db.events.push(event);
  return event;
}
