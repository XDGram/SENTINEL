// Reppo Evaluation API client: independent verification of Sentinel's analyses.
// Server-only. Reads REPPO_API_KEY from the environment.
// Docs: https://docs.reppo.ai/api/eval/overview.md and https://eval.reppo.xyz/agents.md
//
// Submissions are public, so only simulated/public demo data is ever sent.
//
// API shape note: the eval-requests endpoints (`type`/`payload`/`criteria`/
// `settlementMinutes`, with an accept/revise/reject verdict after a settlement
// window) were removed upstream and now return 404. The live API takes a single
// free-text `input` and scores it with a panel of evaluators, usually in
// 30-90 seconds. This module keeps Sentinel's internal contract
// (PENDING/SETTLED/FAILED and an accept/revise/reject decision) and maps the
// live API onto it, so the routes and threat timeline are unchanged.

import "server-only";
import type { AttackType, Threat } from "./types";

export const REPPO_BASE_URL = "https://eval.reppo.xyz/api/v1";

export type ReppoStatus = "PENDING" | "SETTLED" | "FAILED" | "DENIED";

export interface ReppoVerdict {
  score: number;
  decision: "accept" | "revise" | "reject";
  confidence: "high" | "medium" | "low";
  route?: string;
}

export interface ReppoEval {
  evalId: string;
  status: ReppoStatus;
  minSettleAt?: string;
  settledAt?: string | null;
  verdict?: ReppoVerdict;
  failureReason?: string;
}

/** Upstream `input` cap is 50 KB. Stay under it with room for the framing text. */
const MAX_INPUT_BYTES = 48_000;
const TIMEOUT_MS = 20_000;

export function reppoAvailable(): boolean {
  return Boolean(process.env.REPPO_API_KEY);
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.REPPO_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// ---- Evaluation criteria ----

/**
 * What Reppo's evaluators are asked to judge. Kept explicit and falsifiable so
 * a verdict is about the evidence, not about tone. Max 10, mirroring the cap
 * the removed `criteria` field had.
 */
const SHARED_CRITERIA = [
  "Does the cited evidence support classifying this as a malicious request, rather than something merely unusual?",
  "Is the plain-language explanation accurate and not misleading for a beginner crypto user?",
  "Is the recommended safe action correct and sufficient?",
  "Is the stated confidence justified by the evidence, neither overclaiming nor underclaiming?",
  "Does the analysis avoid asserting facts it has not evidenced, and does it disclose which parts of the scenario are simulated?",
  "Are the external sources weighted honestly, given that GoPlus partly draws on ScamSniffer data and that web reports are weaker signals than blocklists?",
];

const CRITERIA_BY_TYPE: Record<AttackType, string[]> = {
  "address-poisoning": [
    "Do matching leading and trailing hex characters with a differing middle, set against a genuine saved contact address, actually indicate a generated impostor address rather than a coincidence?",
    "Is any incoming zero-value transfer correctly interpreted as deliberately planted bait rather than harmless spam?",
  ],
  "unlimited-approval": [
    "Is it correct that this approval would let the spender move the user's entire token balance at any time in the future, not just once?",
    "Is the conclusion that the spender is not a known, verified protocol contract properly supported?",
  ],
  "malicious-permit": [
    "Is it correct that this EIP-2612 permit signature grants token spending rights rather than being a harmless login or proof of ownership?",
    "Given that the rule engine rates this medium severity because it cannot prove intent, is the evidence enough to justify treating the spender as a drainer and adding it to a shared blocklist?",
  ],
  "fake-dapp": [
    "Does the evidence show the requesting domain is impersonating the named brand, rather than being a legitimate subdomain or regional site of it?",
    "Is the approval or signature being requested consistent with a drainer rather than with the real protocol's normal flow?",
  ],
};

function criteriaFor(attackType: AttackType): string[] {
  return [...(CRITERIA_BY_TYPE[attackType] ?? []), ...SHARED_CRITERIA].slice(0, 10);
}

// ---- Submission ----

/** Trim a UTF-8 string to a byte budget without splitting a character. */
function clampBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s) <= maxBytes) return s;
  const buf = Buffer.from(s, "utf8").subarray(0, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(buf).replace(/�$/, "");
}

interface PacketShape {
  action?: Record<string, unknown>;
  sentinelAnalysis?: {
    verdict?: string;
    attackType?: string | null;
    confidence?: number;
    headline?: string;
    explanation?: string;
    reasoningSteps?: string[];
  };
}

/**
 * Turn the server-built evidence packet into the single `input` string the live
 * API takes. The packet JSON is included verbatim as the evidence of record;
 * the readable summary above it is what the evaluators assess.
 */
function buildInput(threat: Threat): string {
  let packet: PacketShape = {};
  try {
    packet = JSON.parse(threat.reppoPacket ?? "{}") as PacketShape;
  } catch {
    // Keep going: the raw packet is still attached below.
  }
  const a = packet.sentinelAnalysis ?? {};
  const criteria = criteriaFor(threat.attackType);

  const head = [
    "AGENT UNDER EVALUATION",
    "Sentinel, a wallet safety agent for beginner crypto users. Before a transaction or signature is approved, it runs a deterministic rule engine, checks public threat-intelligence sources (GoPlus Security, the ScamSniffer database, the MetaMask phishing list and web community reports), then produces a verdict, a beginner-readable explanation, an auditable reasoning trace citing that evidence, and a safe fix.",
    "If this analysis is accepted, the attacker indicator below enters a shared threat memory that blocks the same attacker instantly for other users, so a wrong accept would propagate a false positive.",
    "",
    "WHAT SENTINEL CONCLUDED",
    `Attack type: ${threat.attackType}`,
    `Attacker indicator: ${threat.indicator}`,
    `Verdict: ${a.verdict ?? "unknown"}${a.confidence != null ? ` (confidence ${a.confidence})` : ""}`,
    `Headline: ${a.headline ?? threat.summary}`,
    `Explanation: ${a.explanation ?? ""}`,
    "Reasoning trace:",
    ...(a.reasoningSteps?.length ? a.reasoningSteps.map((s) => `  ${s}`) : ["  (none recorded)"]),
    "",
    "EVIDENCE PACKET THE ANALYSIS RESTS ON (built server-side, JSON)",
  ].join("\n");

  const tail = ["", "ASSESS THE RESPONSE AGAINST THESE CRITERIA", ...criteria.map((c, i) => `${i + 1}. ${c}`)].join("\n");

  const budget = MAX_INPUT_BYTES - Buffer.byteLength(head) - Buffer.byteLength(tail) - 64;
  const raw = threat.reppoPacket ?? "{}";
  const body = Buffer.byteLength(raw) <= budget ? raw : `${clampBytes(raw, Math.max(budget, 0))}\n… (packet truncated)`;

  return `${head}\n${body}\n${tail}`;
}

/** Submit a threat's server-built evidence packet (threat.reppoPacket) for evaluation. */
export async function reppoSubmit(threat: Threat): Promise<
  { ok: true; evalId: string; status: ReppoStatus } | { ok: false; error: string; httpStatus?: number }
> {
  if (!reppoAvailable()) return { ok: false, error: "Reppo is not connected (REPPO_API_KEY is not set)." };
  if (!threat.reppoPacket) return { ok: false, error: "This threat has no server-built evidence packet." };

  let res: Response;
  try {
    res = await fetch(`${REPPO_BASE_URL}/agents/evals`, {
      method: "POST",
      headers: authHeaders(),
      // `taskType: "response"` is the closest live equivalent of the removed
      // "trace" type: an AI response judged for accuracy, with the prompt included.
      body: JSON.stringify({ taskType: "response", input: buildInput(threat) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, error: `Could not reach Reppo: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    return { ok: false, error: await errorFor(res), httpStatus: res.status };
  }

  const json = (await res.json().catch(() => null)) as { id?: string; status?: string } | null;
  const evalId = typeof json?.id === "string" ? json.id : null;
  if (!evalId) {
    return { ok: false, error: "Reppo accepted the submission but returned no evaluation id.", httpStatus: res.status };
  }
  return { ok: true, evalId, status: mapStatus(json?.status) };
}

/** Human-readable reason for a non-2xx response, without leaking the key. */
async function errorFor(res: Response): Promise<string> {
  const detail = await res
    .text()
    .then((t) => {
      // The console serves an HTML 404 page for removed endpoints.
      if (t.trimStart().startsWith("<")) return "";
      try {
        const j = JSON.parse(t) as { error?: unknown; message?: unknown };
        const m = j.error ?? j.message;
        return typeof m === "string" ? m : "";
      } catch {
        return t.slice(0, 200);
      }
    })
    .catch(() => "");

  switch (res.status) {
    case 401:
      return "Reppo rejected the API key.";
    case 402:
      return "Not enough Reppo credits for an evaluation. A human has to top up at eval.reppo.xyz/billing.";
    case 409:
      return "Reppo already has an evaluation in flight for this account.";
    case 429:
      return "Reppo is rate-limiting submissions. Try again shortly.";
    default:
      return `Reppo returned ${res.status}${detail ? `: ${detail}` : "."}`;
  }
}

// ---- Reading a result ----

interface LiveEval {
  id?: string;
  status?: string;
  score?: number | null;
  route?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  error?: string | null;
  result?: {
    score?: number;
    decision?: string;
    confidence?: string;
    route?: string;
    reason?: string;
  } | null;
}

function mapStatus(status: unknown): ReppoStatus {
  switch (status) {
    case "QUEUED":
    case "PROCESSING":
    case "PENDING":
      return "PENDING";
    case "COMPLETED":
    case "SETTLED":
      return "SETTLED";
    case "FAILED":
      return "FAILED";
    case "DENIED":
      return "DENIED";
    default:
      return "PENDING";
  }
}

/**
 * The live API decides `accept` / `reject` at its policy threshold and routes
 * `ship` / `review` / `block`. Sentinel's threat memory trusts an accept, which
 * is what `decision` carries: `route` is `review` whenever evaluator confidence
 * is below high, so routing on it alone would reject sound, high-scoring
 * verdicts. A `block` route still overrides, since that means do not use the
 * output at all. The raw route is kept on the verdict so the UI can show that a
 * human look was recommended.
 */
function mapDecision(route: unknown, decision: unknown): "accept" | "revise" | "reject" {
  if (route === "block") return "reject";
  if (decision === "accept") return "accept";
  if (decision === "reject") return "reject";
  // No decision from the panel: not trusted, but not a rejection either.
  return route === "ship" ? "accept" : "revise";
}

function mapConfidence(c: unknown): "high" | "medium" | "low" {
  return c === "high" || c === "medium" || c === "low" ? c : "medium";
}

/** Read an evaluation's status and verdict. Null when Reppo is unavailable or unreachable. */
export async function reppoGet(evalId: string): Promise<ReppoEval | null> {
  if (!reppoAvailable() || !evalId) return null;

  let res: Response;
  try {
    res = await fetch(`${REPPO_BASE_URL}/agents/evals/${encodeURIComponent(evalId)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as LiveEval | null;
  if (!json) return null;

  const status = mapStatus(json.status);
  const ev: ReppoEval = {
    evalId: typeof json.id === "string" ? json.id : evalId,
    status,
    settledAt: json.completedAt ?? null,
  };

  if (status === "FAILED") {
    ev.failureReason = json.error ?? json.result?.reason ?? "Reppo reported the evaluation as failed. No credits were charged.";
    return ev;
  }

  if (status === "SETTLED") {
    const r = json.result ?? {};
    const score = typeof r.score === "number" ? r.score : typeof json.score === "number" ? json.score : null;
    const route = r.route ?? json.route ?? undefined;
    if (score == null) {
      // Settled without a usable verdict: treat as still pending rather than
      // inventing a score the evaluators did not give.
      return { ...ev, status: "PENDING" };
    }
    ev.verdict = {
      score: Math.max(0, Math.min(100, Math.round(score))),
      decision: mapDecision(route, r.decision),
      confidence: mapConfidence(r.confidence),
      route: route ?? undefined,
    };
  }

  return ev;
}
