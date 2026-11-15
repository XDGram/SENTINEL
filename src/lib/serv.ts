// SERV Reasoning client: the reasoning core of Sentinel.
// Server-only. Reads SERV_API_KEY from the environment; never sent to the client.
// Docs: https://docs.openserv.ai/serv-reasoning/introduction.md

import "server-only";
import OpenAI from "openai";
import type { Analysis, IntelBundle, Language, RuleFinding, Wallet, WalletAction } from "./types";

export const SERV_BASE_URL = "https://inference-api.openserv.ai/v1";
export const SERV_MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";

let client: OpenAI | null = null;
export function servClient(): OpenAI | null {
  if (!process.env.SERV_API_KEY) return null;
  client ??= new OpenAI({ baseURL: SERV_BASE_URL, apiKey: process.env.SERV_API_KEY });
  return client;
}

export function servAvailable(): boolean {
  return Boolean(process.env.SERV_API_KEY);
}

export interface ServAnalyzeInput {
  action: WalletAction;
  wallet: Wallet;
  findings: RuleFinding[];
  /** External intel (GoPlus, ScamSniffer, MetaMask, web reports). Use intelForPrompt() from ./intel. */
  intel: IntelBundle;
  language: Language;
}

/** SERV's part of the analysis. The route merges it with rule evidence. */
export type ServAnalysis = Pick<
  Analysis,
  "verdict" | "attackType" | "confidence" | "headline" | "explanation" | "steps" | "shouldSubmitToReppo" | "submitReason"
>;

/**
 * Ask SERV to analyse a pending wallet action.
 * Returns null when SERV is not configured or the call fails, so the app
 * can fall back to a clearly-labelled rules-only result.
 */
export async function servAnalyze(input: ServAnalyzeInput): Promise<ServAnalysis | null> {
  void input;
  // Implemented in the SERV integration work. See TEAM_NOTES in the repo docs.
  return null;
}

/** Answer a follow-up question about an analysis. Null when SERV is unavailable. */
export async function servAsk(input: {
  action: WalletAction;
  analysis: Analysis;
  question: string;
  language: Language;
}): Promise<string | null> {
  void input;
  return null;
}
