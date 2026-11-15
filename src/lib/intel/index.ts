// Threat intelligence gathering: checks every indicator in a wallet action
// against independent public sources, in parallel, with timeouts.
// Sources: GoPlus Security API, ScamSniffer database, MetaMask phishing list,
// and web search for community reports (Reddit, YouTube, X, security blogs).

import "server-only";
import type { AttackType, IntelBundle, IntelReport, IntelSourceId, RuleFinding, Wallet, WalletAction } from "../types";
import { goplusAddress, goplusSite } from "./goplus";
import { checkAddressLists, checkDomainLists } from "./blocklists";
import { webReportsForIndicator, webReportsForPattern, webSearchProvider } from "./web";
import { errorMessage } from "./shared";

const PATTERN_QUERIES: Record<AttackType, string> = {
  "address-poisoning": "address poisoning lookalike address zero value transfer USDT lost",
  "unlimited-approval": "unlimited token approval drainer wallet drained revoke",
  "malicious-permit": "fake airdrop permit signature wallet drained USDT",
  "fake-dapp": "fake Uniswap phishing site approval drained wallet",
};

function chainIdOf(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes("bsc") || c.includes("bnb")) return 56;
  if (c.includes("polygon")) return 137;
  if (c.includes("arbitrum")) return 42161;
  if (c.includes("base")) return 8453;
  return 1;
}

export async function gatherIntel(action: WalletAction, wallet: Wallet, findings: RuleFinding[]): Promise<IntelBundle> {
  const started = Date.now();
  const jobs: Promise<IntelReport[]>[] = [];
  const unavailable: IntelBundle["unavailable"] = [];

  const addr = action.to.toLowerCase();
  const isContact = wallet.contacts.some((c) => c.address.toLowerCase() === addr);
  const host = action.dapp ? safeHost(action.dapp.url) : null;

  // Counterparty address (skip saved contacts: nothing to look up, saves calls)
  if (!isContact) {
    jobs.push(goplusAddress(addr, chainIdOf(action.chain)).then((r) => [r]));
    jobs.push(checkAddressLists(addr));
  }

  // Requesting website
  if (host) {
    jobs.push(goplusSite(host).then((r) => [r]));
    jobs.push(checkDomainLists(host));
  }

  // Community reports on the web
  const suspicious = findings.filter((f) => f.severity !== "low");
  if (suspicious.length) {
    if (webSearchProvider()) {
      const primary = host ? `domain:${host}` : `address:${addr}`;
      jobs.push(webReportsForIndicator(primary).catch((e) => [webError(primary, e)]));
      jobs.push(webReportsForPattern(primary, PATTERN_QUERIES[suspicious[0].attackType]).catch((e) => [webError(primary, e)]));
    } else {
      unavailable.push({ source: "web", reason: "No web search key configured (TAVILY_API_KEY or BRAVE_API_KEY)." });
    }
  }

  const settled = await Promise.allSettled(jobs);
  const reports: IntelReport[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") reports.push(...s.value);
  }
  for (const r of reports) {
    if (r.verdict === "error" && !unavailable.some((u) => u.source === r.source)) {
      unavailable.push({ source: r.source, reason: r.summary });
    }
  }

  const flaggedBy = [
    ...new Set(reports.filter((r) => r.verdict === "malicious" || r.verdict === "suspicious").map((r) => r.source)),
  ] as IntelSourceId[];

  return { reports, flaggedBy, unavailable, tookMs: Date.now() - started };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function webError(indicator: string, err: unknown): IntelReport {
  return {
    source: "web",
    sourceName: "Web search",
    indicator,
    verdict: "error",
    summary: `Web search failed: ${errorMessage(err)}.`,
    fetchedAt: new Date().toISOString(),
  };
}

/** Short text block of the intel, for SERV's prompt. Keeps tokens low. */
export function intelForPrompt(bundle: IntelBundle): string {
  const lines = bundle.reports
    .filter((r) => r.verdict !== "error")
    .map((r, i) => {
      const extra = r.title ? ` | "${r.title}"${r.snippet ? `: ${r.snippet.slice(0, 220)}` : ""}` : "";
      return `[I${i + 1}] ${r.sourceName} (${r.verdict}) ${r.indicator}: ${r.summary}${extra}${r.url ? ` <${r.url}>` : ""}`;
    });
  if (bundle.unavailable.length) lines.push(`Unavailable sources: ${bundle.unavailable.map((u) => u.source).join(", ")}.`);
  return lines.join("\n") || "No external intel available.";
}
