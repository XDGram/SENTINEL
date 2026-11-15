// Typed client for Watchdog's API. Browser-safe: only type imports from server modules.

import type {
  Analysis,
  AnalyzeRequest,
  AskRequest,
  AskResponse,
  IntelReport,
  IntelSourceId,
  Language,
  SubmitResponse,
  Threat,
  ThreatsResponse,
  Verdict,
  WalletAction,
} from "@/lib/types";
import type { ApprovalFinding, ScanCoverage } from "@/lib/wallet-scan";
import type { ServCheck, ServScan } from "@/lib/serv";
import type { FeedResponse } from "@/app/api/feed/route";
import { getLanguage } from "./language";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Can't reach Watchdog. Check your connection and try again.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok && !(res.status === 201)) {
    const retry = Number(res.headers.get("retry-after") ?? "") || undefined;
    const msg =
      res.status === 429
        ? `Too many requests. Try again in ${retry ?? 30}s.`
        : (body?.error ?? body?.message ?? `Request failed (${res.status}).`);
    // Some routes return a useful typed body with a non-2xx status (e.g. submit BLOCKED).
    if (body && (res.status === 409 || res.status === 502) && "status" in (body as object)) return body as T;
    throw new ApiError(msg, res.status, retry);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data) });

// ---- Response types ----

export interface Health {
  serv: boolean;
  servModel: string;
  reppo: boolean;
  store: "supabase" | "memory";
  webSearch: string;
  servBudget: { day: string; used: number; cap: number };
}

export interface CheckResponse {
  input: string;
  normalised: { kind: "address" | "domain"; value: string; url?: string; cleanup?: string };
  account?: { kind?: string; description?: string } & Record<string, unknown>;
  brandImpersonated?: string;
  token?: { name?: string; symbol?: string; risks: string[] };
  result: ServCheck | null;
  servUsed: boolean;
  servModel?: string;
  flaggedBy: IntelSourceId[];
  evidence: IntelReport[];
  honesty: string;
  cached?: boolean;
}

export type ScanRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ScanResponse {
  address: string;
  chainId: number;
  account: { kind?: string; description?: string } & Record<string, unknown>;
  readOnly: string;
  summary: ServScan | null;
  servUsed: boolean;
  servModel?: string;
  servNote: string | null;
  approvalCount: number;
  riskCounts: Record<"critical" | "high" | "medium" | "low", number>;
  top: ApprovalFinding[];
  approvals: ApprovalFinding[];
  coverage: ScanCoverage;
  evidence: IntelReport[];
  errors: string[];
  tookMs: number;
}

export interface EvaluationRecord {
  threatId: string;
  evalId: string | null;
  submittedAt: string;
  outcome: string;
  settledAt: string | null;
  decision: string | null;
  score: number | null;
}

export interface StatsResponse {
  generatedAt: string;
  store: string;
  threats: { total: number; byStatus: Record<string, number> };
  discovered: number;
  reppo: {
    submissions: number;
    threatsSubmitted: number;
    resubmissions: number;
    verified: number;
    rejected: number;
    failed: number;
    latestEvaluations: EvaluationRecord[];
  };
  memory: { repeatAttacksBlocked: number; repeatInvestigationsAvoided: number; note: string };
}

export interface StatusResponse {
  threat: Threat;
  reppo?: unknown;
}

export type { FeedResponse, ApprovalFinding, ServCheck, ServScan, Verdict, Language };

// ---- Calls ----

export const api = {
  health: () => request<Health>("/api/health"),
  analyze: (action: WalletAction, walletId: "A" | "B", language: Language = getLanguage()) =>
    post<Analysis>("/api/analyze", { action, walletId, language } satisfies AnalyzeRequest),
  ask: (action: WalletAction, analysis: Analysis, question: string, language: Language = getLanguage()) =>
    post<AskResponse>("/api/ask", { action, analysis, question, language } satisfies AskRequest),
  check: (input: string, language: Language = getLanguage()) => post<CheckResponse>("/api/check", { input, language }),
  scanWallet: (address: string, language: Language = getLanguage()) => post<ScanResponse>("/api/scan/wallet", { address, language }),
  submitToReppo: (fingerprint: string, walletId: "A" | "B") =>
    post<SubmitResponse>("/api/reppo/submit", { fingerprint, walletId }),
  reppoStatus: (threatId: string) => request<StatusResponse>(`/api/reppo/status?threatId=${encodeURIComponent(threatId)}`),
  threats: () => request<ThreatsResponse>("/api/threats"),
  feed: () => request<FeedResponse>("/api/feed"),
  stats: () => request<StatsResponse>("/api/stats"),
};
