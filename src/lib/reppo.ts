// Reppo Evaluation API client: independent verification of Sentinel's analyses.
// Server-only. Reads REPPO_API_KEY from the environment.
// Docs: https://docs.reppo.ai/api/eval/overview.md
// Notes: one PENDING evaluation per account at a time (409 otherwise);
// submissions are public, so only simulated/public data is ever sent.

import "server-only";
import type { Threat } from "./types";

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

export function reppoAvailable(): boolean {
  return Boolean(process.env.REPPO_API_KEY);
}

/** Submit a threat's server-built evidence packet (threat.reppoPacket) for evaluation. */
export async function reppoSubmit(threat: Threat): Promise<
  { ok: true; evalId: string; status: ReppoStatus } | { ok: false; error: string; httpStatus?: number }
> {
  void threat;
  return { ok: false, error: "Reppo is not connected yet." };
}

/** Read an evaluation's status and verdict. */
export async function reppoGet(evalId: string): Promise<ReppoEval | null> {
  void evalId;
  return null;
}
