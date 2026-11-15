// Threat memory store.
// Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, otherwise an
// in-process memory store (resets on restart) so local dev works without keys.
// Server-only: the service role key must never reach the browser.
// Keep the exported function signatures stable; the API routes depend on them.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AttackType, IntelSourceId, IntelSweep, Threat, ThreatEvent, ThreatEventKind, ThreatStatus } from "./types";

const id = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();
const MAX_SWEEPS_IN_MEMORY = 50;

/** Blocklist contents saved with a sweep so the next sweep can diff against it. */
export interface SweepBaselineInput {
  scamsnifferAddresses: string[];
}
export interface SweepBaseline extends SweepBaselineInput {
  sweepId: string;
  at: string;
}

/** Storage primitives. Business rules live in the exported functions below. */
interface Backend {
  kind: "supabase" | "memory";
  allThreats(): Promise<Threat[]>;
  allEvents(): Promise<ThreatEvent[]>;
  getThreat(id: string): Promise<Threat | null>;
  findThreat(column: "fingerprint" | "reppoEvalId", value: string): Promise<Threat | null>;
  findVerified(indicators: string[]): Promise<Threat | null>;
  /** Insert; returns null if the fingerprint already exists. */
  insertThreat(t: Threat): Promise<Threat | null>;
  updateThreat(id: string, patch: Partial<Threat>): Promise<Threat | null>;
  incrementCatch(id: string, at: string): Promise<boolean>;
  countSubmissions(): Promise<number>;
  insertEvent(e: ThreatEvent): Promise<void>;
  /** Insert a sweep; with a baseline, it replaces any earlier stored baseline. */
  insertSweep(s: IntelSweep, baseline?: SweepBaselineInput): Promise<void>;
  listSweeps(limit: number): Promise<IntelSweep[]>;
  latestBaseline(): Promise<SweepBaseline | null>;
}

// ---------------------------------------------------------------- memory

function memoryBackend(): Backend {
  type MemDb = { threats: Map<string, Threat>; events: ThreatEvent[]; sweeps: IntelSweep[]; baseline?: SweepBaseline };
  const g = globalThis as unknown as { __sentinelDb?: MemDb };
  const db: MemDb = (g.__sentinelDb ??= { threats: new Map(), events: [], sweeps: [] });
  const find = (pred: (t: Threat) => boolean) => [...db.threats.values()].find(pred) ?? null;

  return {
    kind: "memory",
    allThreats: async () => [...db.threats.values()],
    allEvents: async () => [...db.events],
    getThreat: async (tid) => db.threats.get(tid) ?? null,
    findThreat: async (col, v) => find((t) => t[col] === v),
    findVerified: async (ind) =>
      find((t) => t.status === "verified" && (ind.includes(t.fingerprint) || ind.includes(t.indicator))),
    insertThreat: async (t) => {
      if (find((x) => x.fingerprint === t.fingerprint)) return null;
      db.threats.set(t.id, t);
      return t;
    },
    updateThreat: async (tid, patch) => {
      const t = db.threats.get(tid);
      if (!t) return null;
      const next = { ...t, ...patch };
      db.threats.set(tid, next);
      return next;
    },
    incrementCatch: async (tid, at) => {
      const t = db.threats.get(tid);
      if (!t) return false;
      db.threats.set(tid, { ...t, caughtCount: t.caughtCount + 1, lastCaughtAt: at });
      return true;
    },
    countSubmissions: async () => [...db.threats.values()].filter((t) => t.reppoEvalId).length,
    insertEvent: async (e) => {
      db.events.push(e);
    },
    insertSweep: async (s, baseline) => {
      db.sweeps.push(s);
      if (db.sweeps.length > MAX_SWEEPS_IN_MEMORY) db.sweeps.shift();
      if (baseline) db.baseline = { sweepId: s.id, at: s.at, ...baseline };
    },
    listSweeps: async (limit) => [...db.sweeps].reverse().slice(0, limit),
    latestBaseline: async () => db.baseline ?? null,
  };
}

// ---------------------------------------------------------------- supabase

type Row = Record<string, unknown>;

const THREAT_COLUMNS: Record<keyof Threat, string> = {
  id: "id",
  fingerprint: "fingerprint",
  attackType: "attack_type",
  summary: "summary",
  indicator: "indicator",
  status: "status",
  reppoEvalId: "reppo_eval_id",
  reppoScore: "reppo_score",
  reppoDecision: "reppo_decision",
  reppoRoute: "reppo_route",
  discoveredAt: "discovered_at",
  submittedAt: "submitted_at",
  verifiedAt: "verified_at",
  caughtCount: "caught_count",
  lastCaughtAt: "last_caught_at",
  reppoPacket: "reppo_packet",
  servRecommendsSubmit: "serv_recommends_submit",
  externalSources: "external_sources",
};

const iso = (v: unknown) => (v == null ? undefined : new Date(v as string).toISOString());
const opt = <T>(v: unknown) => (v == null ? undefined : (v as T));

function threatToRow(patch: Partial<Threat>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = THREAT_COLUMNS[k as keyof Threat];
    if (col && v !== undefined) row[col] = v;
  }
  return row;
}

function rowToThreat(r: Row): Threat {
  return {
    id: r.id as string,
    fingerprint: r.fingerprint as string,
    attackType: r.attack_type as AttackType,
    summary: r.summary as string,
    indicator: r.indicator as string,
    status: r.status as ThreatStatus,
    reppoEvalId: opt(r.reppo_eval_id),
    reppoScore: r.reppo_score == null ? undefined : Number(r.reppo_score),
    reppoDecision: opt(r.reppo_decision),
    reppoRoute: opt(r.reppo_route),
    discoveredAt: iso(r.discovered_at)!,
    submittedAt: iso(r.submitted_at),
    verifiedAt: iso(r.verified_at),
    caughtCount: Number(r.caught_count ?? 0),
    lastCaughtAt: iso(r.last_caught_at),
    reppoPacket: opt(r.reppo_packet),
    servRecommendsSubmit: opt(r.serv_recommends_submit),
    externalSources: opt(r.external_sources),
  };
}

function rowToEvent(r: Row): ThreatEvent {
  return {
    id: r.id as string,
    threatId: r.threat_id as string,
    kind: r.kind as ThreatEventKind,
    at: iso(r.at)!,
    walletId: opt(r.wallet_id),
    detail: r.detail as string,
  };
}

/** Sweep columns for listing; leaves out the large stored baseline. */
const SWEEP_COLUMNS =
  "id, at, totals, new_domains, new_addresses, new_domain_count, new_address_count, community_reports, errors";

function rowToSweep(r: Row): IntelSweep {
  return {
    id: r.id as string,
    at: iso(r.at)!,
    totals: r.totals as IntelSweep["totals"],
    newDomains: (r.new_domains as string[] | null) ?? null,
    newAddresses: (r.new_addresses as string[] | null) ?? null,
    newDomainCount: (r.new_domain_count as number | null) ?? null,
    newAddressCount: (r.new_address_count as number | null) ?? null,
    communityReports: (r.community_reports as IntelSweep["communityReports"]) ?? [],
    errors: (r.errors as string[]) ?? [],
  };
}

function fail(op: string, error: { message: string; code?: string }): never {
  throw new Error(`Threat memory (${op}) failed: ${error.message}${error.code ? ` [${error.code}]` : ""}`);
}

function supabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });

  const one = async (op: string, q: PromiseLike<{ data: Row | null; error: { message: string; code?: string } | null }>) => {
    const { data, error } = await q;
    if (error) fail(op, error);
    return data ? rowToThreat(data) : null;
  };

  return {
    kind: "supabase",
    async allThreats() {
      const { data, error } = await sb.from("threats").select("*").order("discovered_at", { ascending: false }).limit(500);
      if (error) fail("list threats", error);
      return (data ?? []).map(rowToThreat);
    },
    async allEvents() {
      const { data, error } = await sb.from("threat_events").select("*").order("at", { ascending: false }).limit(1000);
      if (error) fail("list events", error);
      return (data ?? []).map(rowToEvent);
    },
    getThreat: (tid) => one("get threat", sb.from("threats").select("*").eq("id", tid).maybeSingle()),
    findThreat: (col, v) =>
      one("find threat", sb.from("threats").select("*").eq(THREAT_COLUMNS[col], v).limit(1).maybeSingle()),
    async findVerified(indicators) {
      if (!indicators.length) return null;
      const { data, error } = await sb
        .from("threats")
        .select("*")
        .eq("status", "verified")
        .or(`fingerprint.in.(${indicators.map(pgQuote).join(",")}),indicator.in.(${indicators.map(pgQuote).join(",")})`)
        .order("verified_at", { ascending: false })
        .limit(1);
      if (error) fail("find verified", error);
      return data?.[0] ? rowToThreat(data[0]) : null;
    },
    async insertThreat(t) {
      const { data, error } = await sb.from("threats").insert(threatToRow(t)).select("*").single();
      if (error?.code === "23505") return null; // fingerprint already stored
      if (error) fail("insert threat", error);
      return rowToThreat(data);
    },
    updateThreat: (tid, patch) => {
      const row = threatToRow(patch);
      delete row.id;
      return one("update threat", sb.from("threats").update(row).eq("id", tid).select("*").maybeSingle());
    },
    async incrementCatch(tid, at) {
      const { error } = await sb.rpc("record_catch", { p_threat_id: tid, p_at: at });
      if (error) fail("record catch", error);
      return true;
    },
    async countSubmissions() {
      const { count, error } = await sb
        .from("threats")
        .select("id", { count: "exact", head: true })
        .not("reppo_eval_id", "is", null);
      if (error) fail("count submissions", error);
      return count ?? 0;
    },
    async insertEvent(e) {
      const { error } = await sb.from("threat_events").insert({
        id: e.id,
        threat_id: e.threatId,
        kind: e.kind,
        at: e.at,
        wallet_id: e.walletId ?? null,
        detail: e.detail,
      });
      if (error) fail("insert event", error);
    },
    async insertSweep(s, baseline) {
      const { error } = await sb.from("intel_sweeps").insert({
        id: s.id,
        at: s.at,
        totals: s.totals,
        new_domains: s.newDomains,
        new_addresses: s.newAddresses,
        new_domain_count: s.newDomainCount,
        new_address_count: s.newAddressCount,
        community_reports: s.communityReports,
        errors: s.errors,
        scamsniffer_addresses: baseline?.scamsnifferAddresses ?? null,
      });
      if (error) fail("save sweep", error);
      if (baseline) {
        // Keep only the newest baseline (~100 KB) so the table stays small.
        const { error: pruneError } = await sb
          .from("intel_sweeps")
          .update({ scamsniffer_addresses: null })
          .neq("id", s.id)
          .not("scamsniffer_addresses", "is", null);
        if (pruneError) fail("prune sweep baselines", pruneError);
      }
    },
    async listSweeps(limit) {
      const { data, error } = await sb
        .from("intel_sweeps")
        .select(SWEEP_COLUMNS)
        .order("at", { ascending: false })
        .limit(limit);
      if (error) fail("list sweeps", error);
      return ((data ?? []) as unknown as Row[]).map(rowToSweep);
    },
    async latestBaseline() {
      const { data, error } = await sb
        .from("intel_sweeps")
        .select("id, at, scamsniffer_addresses")
        .not("scamsniffer_addresses", "is", null)
        .order("at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("load sweep baseline", error);
      if (!data) return null;
      return {
        sweepId: data.id as string,
        at: iso(data.at)!,
        scamsnifferAddresses: (data.scamsniffer_addresses as string[]) ?? [],
      };
    },
  };
}

/** Quote a value for a PostgREST `in.(...)` filter. */
function pgQuote(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------- selection

const g = globalThis as unknown as { __sentinelBackend?: Backend };

function store(): Backend {
  if (g.__sentinelBackend) return g.__sentinelBackend;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  g.__sentinelBackend = url && key ? supabaseBackend(url, key) : memoryBackend();
  return g.__sentinelBackend;
}

/** Which backend is in use ("supabase" or "memory"). */
export function storeKind(): "supabase" | "memory" {
  return store().kind;
}

// ---------------------------------------------------------------- public API

export async function listThreats(): Promise<{ threats: Threat[]; events: ThreatEvent[] }> {
  const [threats, events] = await Promise.all([store().allThreats(), store().allEvents()]);
  return {
    threats: threats.sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt)),
    events: events.sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export async function getThreat(threatId: string): Promise<Threat | null> {
  return store().getThreat(threatId);
}

export async function findThreatByFingerprint(fingerprint: string): Promise<Threat | null> {
  return store().findThreat("fingerprint", fingerprint);
}

export async function findThreatByEvalId(evalId: string): Promise<Threat | null> {
  return store().findThreat("reppoEvalId", evalId);
}

/** A Reppo-verified threat matching any of these indicators. */
export async function findVerifiedThreat(indicators: string[]): Promise<Threat | null> {
  return store().findVerified(indicators.filter(Boolean));
}

export async function createThreat(input: {
  fingerprint: string;
  attackType: AttackType;
  summary: string;
  indicator: string;
  walletId?: "A" | "B";
  reppoPacket?: string;
  servRecommendsSubmit?: boolean;
  externalSources?: IntelSourceId[];
}): Promise<Threat> {
  const refresh = async (existing: Threat) => {
    // Refresh the packet while it has not been submitted yet.
    if (existing.status === "discovered" && input.reppoPacket) {
      return (
        (await updateThreat(existing.id, {
          reppoPacket: input.reppoPacket,
          servRecommendsSubmit: input.servRecommendsSubmit,
          externalSources: input.externalSources,
        })) ?? existing
      );
    }
    return existing;
  };

  const existing = await findThreatByFingerprint(input.fingerprint);
  if (existing) return refresh(existing);

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
    externalSources: input.externalSources,
  };
  const inserted = await store().insertThreat(t);
  if (!inserted) {
    // Another request stored the same fingerprint first.
    const raced = await findThreatByFingerprint(input.fingerprint);
    if (raced) return refresh(raced);
    throw new Error("Threat memory: fingerprint conflict but no row found");
  }
  await addEvent({ threatId: inserted.id, kind: "discovered", walletId: input.walletId, detail: input.summary });
  return inserted;
}

export async function updateThreat(threatId: string, patch: Partial<Threat>): Promise<Threat | null> {
  return store().updateThreat(threatId, patch);
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
  const t = await store().getThreat(threatId);
  if (!t) return;
  await store().incrementCatch(threatId, now());
  await addEvent({ threatId, kind: "caught", walletId, detail });
}

export async function countSubmissions(): Promise<number> {
  return store().countSubmissions();
}

export async function addEvent(e: Omit<ThreatEvent, "id" | "at">): Promise<ThreatEvent> {
  const event: ThreatEvent = { id: id("evt"), at: now(), ...e };
  await store().insertEvent(event);
  return event;
}

/**
 * Save a sweep. Pass `baseline` (the full ScamSniffer address list) to make it
 * the reference the next sweep diffs against.
 */
export async function saveSweep(sweep: Omit<IntelSweep, "id">, baseline?: SweepBaselineInput): Promise<IntelSweep> {
  const saved: IntelSweep = { id: id("swp"), ...sweep };
  await store().insertSweep(saved, baseline);
  return saved;
}

/** The blocklist contents saved with the most recent sweep that stored them. */
export async function getSweepBaseline(): Promise<SweepBaseline | null> {
  return store().latestBaseline();
}

export async function listSweeps(limit = 10): Promise<IntelSweep[]> {
  return store().listSweeps(limit);
}
