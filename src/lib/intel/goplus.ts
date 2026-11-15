// GoPlus Security public API (no key needed for basic use).
// https://docs.gopluslabs.io

import "server-only";
import type { IntelReport } from "../types";
import { errorMessage, fetchWithTimeout, nowIso, TtlCache } from "./shared";

const BASE = "https://api.gopluslabs.io/api/v1";
const cache = new TtlCache<IntelReport>(30 * 60_000);

const MALICIOUS_FLAGS: Record<string, string> = {
  phishing_activities: "phishing",
  stealing_attack: "stealing attacks",
  cybercrime: "cybercrime",
  financial_crime: "financial crime",
  money_laundering: "money laundering",
  blackmail_activities: "blackmail",
  sanctioned: "sanctions",
  darkweb_transactions: "darkweb transactions",
  fake_token: "fake tokens",
  honeypot_related_address: "honeypot scams",
  fake_kyc: "fake KYC",
  malicious_mining_activities: "malicious mining",
};

export async function goplusAddress(address: string, chainId = 1): Promise<IntelReport> {
  const key = `addr:${chainId}:${address.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const indicator = `address:${address.toLowerCase()}`;
  const url = `${BASE}/address_security/${address}?chain_id=${chainId}`;
  try {
    const res = await fetchWithTimeout(url);
    const json = (await res.json()) as { code: number; message: string; result?: Record<string, string> };
    if (json.code !== 1 || !json.result) throw new Error(json.message || `HTTP ${res.status}`);
    const r = json.result;
    const hits = Object.entries(MALICIOUS_FLAGS).filter(([k]) => r[k] === "1").map(([, label]) => label);
    const doubt = r.blacklist_doubt === "1";
    const upstream = r.data_source ? r.data_source.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const report: IntelReport = {
      source: "goplus",
      sourceName: "GoPlus Security",
      indicator,
      verdict: hits.length ? "malicious" : doubt ? "suspicious" : "clean",
      summary: hits.length
        ? `GoPlus links this address to ${hits.join(", ")}${upstream ? ` (data from ${upstream.join(", ")})` : ""}.`
        : doubt
          ? "GoPlus lists this address as a suspected blacklist entry."
          : "GoPlus has no malicious reports for this address.",
      url: `https://gopluslabs.io/malicious-address-detection?address=${address}`,
      upstream,
      fetchedAt: nowIso(),
    };
    cache.set(key, report);
    return report;
  } catch (err) {
    return {
      source: "goplus",
      sourceName: "GoPlus Security",
      indicator,
      verdict: "error",
      summary: `GoPlus lookup failed: ${errorMessage(err)}.`,
      fetchedAt: nowIso(),
    };
  }
}

export async function goplusSite(siteUrl: string): Promise<IntelReport> {
  const host = (() => {
    try {
      return new URL(siteUrl).hostname.toLowerCase();
    } catch {
      return siteUrl.toLowerCase();
    }
  })();
  const key = `site:${host}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const indicator = `domain:${host}`;
  try {
    const res = await fetchWithTimeout(`${BASE}/phishing_site?url=${encodeURIComponent(`https://${host}`)}`);
    const json = (await res.json()) as { code: number; message: string; result?: { phishing_site: number } };
    if (json.code !== 1 || !json.result) throw new Error(json.message || `HTTP ${res.status}`);
    const phishing = json.result.phishing_site === 1;
    const report: IntelReport = {
      source: "goplus",
      sourceName: "GoPlus Security",
      indicator,
      verdict: phishing ? "malicious" : "unknown",
      summary: phishing ? `GoPlus lists ${host} as a phishing site.` : `GoPlus has no phishing report for ${host}.`,
      url: "https://gopluslabs.io/phishing-site-detection",
      fetchedAt: nowIso(),
    };
    cache.set(key, report);
    return report;
  } catch (err) {
    return {
      source: "goplus",
      sourceName: "GoPlus Security",
      indicator,
      verdict: "error",
      summary: `GoPlus site check failed: ${errorMessage(err)}.`,
      fetchedAt: nowIso(),
    };
  }
}

// ---- Approval security: what kind of spender is this? ----

/** The parts of GoPlus's approval_security result Sentinel actually uses. */
export interface ApprovalSecurity {
  contractName?: string;
  tag?: string;
  isContract?: boolean;
  isOpenSource?: boolean;
  isProxy?: boolean;
  trustList: boolean;
  doubtList: boolean;
  maliciousBehavior: string[];
  /** GoPlus's own sentence about why this spender is risky, when it has one. */
  riskyApproval?: string;
  riskyApprovalFlagged: boolean;
}

export interface ApprovalSecurityResult {
  report: IntelReport;
  detail: ApprovalSecurity | null;
}

const approvalCache = new TtlCache<ApprovalSecurityResult>(30 * 60_000);

interface RawApproval {
  contract_name?: string | null;
  tag?: string | null;
  is_contract?: number | null;
  is_open_source?: number | null;
  is_proxy?: number | null;
  trust_list?: number | null;
  doubt_list?: number | null;
  malicious_behavior?: string[] | null;
  risky_approval?: { risk?: string | null; value?: number | null } | null;
}

const BEHAVIOUR_LABEL: Record<string, string> = {
  phishing_activities: "phishing",
  blacklist_doubt: "suspected blacklist entry",
  stealing_attack: "stealing attacks",
  honeypot_related_address: "honeypot scams",
  fake_token: "fake tokens",
  cybercrime: "cybercrime",
  financial_crime: "financial crime",
  money_laundering: "money laundering",
  darkweb_transactions: "darkweb transactions",
};

const behaviourLabel = (k: string) => BEHAVIOUR_LABEL[k] ?? k.replace(/_/g, " ");

/**
 * Reputation of an approval spender (keyless endpoint).
 * Works for both contracts and plain addresses; a spender that is not a
 * contract at all is itself a warning sign for an approval.
 */
export async function goplusApprovalSecurity(address: string, chainId = 1): Promise<ApprovalSecurityResult> {
  const key = `appr:${chainId}:${address.toLowerCase()}`;
  const hit = approvalCache.get(key);
  if (hit) return hit;
  const indicator = `spender:${address.toLowerCase()}`;
  try {
    const res = await fetchWithTimeout(`${BASE}/approval_security/${chainId}?contract_addresses=${address}`);
    const json = (await res.json()) as { code: number; message: string; result?: RawApproval };
    if (json.code !== 1 || !json.result) throw new Error(json.message || `HTTP ${res.status}`);
    const r = json.result;
    const behaviours = (r.malicious_behavior ?? []).filter(Boolean);
    const serious = behaviours.filter((b) => b !== "blacklist_doubt");
    const detail: ApprovalSecurity = {
      contractName: r.contract_name ?? undefined,
      tag: r.tag ?? undefined,
      isContract: r.is_contract == null ? undefined : r.is_contract === 1,
      isOpenSource: r.is_open_source == null ? undefined : r.is_open_source === 1,
      isProxy: r.is_proxy == null ? undefined : r.is_proxy === 1,
      trustList: r.trust_list === 1,
      doubtList: r.doubt_list === 1,
      maliciousBehavior: behaviours,
      riskyApproval: r.risky_approval?.risk ?? undefined,
      riskyApprovalFlagged: r.risky_approval?.value === 1,
    };

    const verdict: IntelReport["verdict"] = serious.length
      ? "malicious"
      : detail.doubtList || detail.riskyApprovalFlagged
        ? "suspicious"
        : detail.trustList
          ? "clean"
          : "unknown";

    const named = detail.contractName ? `"${detail.contractName}"` : detail.isContract === false ? "a plain address, not a contract" : "an unnamed contract";
    const summary = serious.length
      ? `GoPlus links this spender to ${serious.map(behaviourLabel).join(", ")}.`
      : detail.doubtList || detail.riskyApprovalFlagged
        ? `GoPlus flags this spender as risky: ${detail.riskyApproval ?? "suspected blacklist entry"}`
        : detail.trustList
          ? `GoPlus lists this spender on its trusted-contract list (${named}).`
          : `GoPlus has no risk report for this spender (${named}).`;

    const out: ApprovalSecurityResult = {
      report: {
        source: "goplus",
        sourceName: "GoPlus Security",
        indicator,
        verdict,
        summary,
        url: `https://gopluslabs.io/approval-security?address=${address}`,
        fetchedAt: nowIso(),
      },
      detail,
    };
    approvalCache.set(key, out);
    return out;
  } catch (err) {
    return {
      report: {
        source: "goplus",
        sourceName: "GoPlus Security",
        indicator,
        verdict: "error",
        summary: `GoPlus approval check failed: ${errorMessage(err)}.`,
        fetchedAt: nowIso(),
      },
      detail: null,
    };
  }
}

// ---- Token security ----

/** The small subset of token_security Sentinel reports on. */
export interface TokenSecurity {
  tokenName?: string;
  tokenSymbol?: string;
  isOpenSource?: boolean;
  isProxy?: boolean;
  isHoneypot?: boolean;
  cannotSell?: boolean;
  canMint?: boolean;
  takeBackOwnership?: boolean;
  hiddenOwner?: boolean;
  selfDestruct?: boolean;
  isInDex?: boolean;
  buyTax?: string;
  sellTax?: string;
  holderCount?: string;
  trustList?: boolean;
  /** Risk flags that were actually set, in plain words. */
  risks: string[];
}

export interface TokenSecurityResult {
  report: IntelReport;
  detail: TokenSecurity | null;
}

const tokenCache = new TtlCache<TokenSecurityResult>(30 * 60_000);

const RISK_FIELDS: { key: string; label: string }[] = [
  { key: "is_honeypot", label: "honeypot: buyers may be unable to sell" },
  { key: "cannot_sell_all", label: "holders cannot sell all of their balance" },
  { key: "is_mintable", label: "the supply can be minted" },
  { key: "can_take_back_ownership", label: "ownership can be taken back" },
  { key: "hidden_owner", label: "hidden owner" },
  { key: "selfdestruct", label: "the contract can self-destruct" },
  { key: "transfer_pausable", label: "transfers can be paused" },
  { key: "is_blacklisted", label: "the owner can blacklist addresses" },
  { key: "slippage_modifiable", label: "the tax can be changed" },
  { key: "personal_slippage_modifiable", label: "per-address tax can be set" },
  { key: "trading_cooldown", label: "trading cooldown" },
  { key: "is_anti_whale", label: "anti-whale limits" },
];

export async function goplusTokenSecurity(address: string, chainId = 1): Promise<TokenSecurityResult> {
  const key = `tok:${chainId}:${address.toLowerCase()}`;
  const hit = tokenCache.get(key);
  if (hit) return hit;
  const indicator = `token:${address.toLowerCase()}`;
  try {
    const res = await fetchWithTimeout(`${BASE}/token_security/${chainId}?contract_addresses=${address}`);
    const json = (await res.json()) as { code: number; message: string; result?: Record<string, Record<string, unknown>> };
    if (json.code !== 1 || !json.result) throw new Error(json.message || `HTTP ${res.status}`);
    const r = json.result[address.toLowerCase()];
    if (!r || Object.keys(r).length === 0) {
      const out: TokenSecurityResult = {
        report: {
          source: "goplus",
          sourceName: "GoPlus Security",
          indicator,
          verdict: "unknown",
          summary: "GoPlus has no token-security record for this contract, so it may not be a token at all.",
          fetchedAt: nowIso(),
        },
        detail: null,
      };
      tokenCache.set(key, out);
      return out;
    }
    const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : undefined);
    const flag = (k: string) => str(k) === "1";
    const risks = RISK_FIELDS.filter((f) => str(f.key) === "1").map((f) => f.label);
    const detail: TokenSecurity = {
      tokenName: str("token_name"),
      tokenSymbol: str("token_symbol"),
      isOpenSource: str("is_open_source") === undefined ? undefined : flag("is_open_source"),
      isProxy: flag("is_proxy"),
      isHoneypot: flag("is_honeypot"),
      cannotSell: flag("cannot_sell_all"),
      canMint: flag("is_mintable"),
      takeBackOwnership: flag("can_take_back_ownership"),
      hiddenOwner: flag("hidden_owner"),
      selfDestruct: flag("selfdestruct"),
      isInDex: str("is_in_dex") === "1",
      buyTax: str("buy_tax"),
      sellTax: str("sell_tax"),
      holderCount: str("holder_count"),
      trustList: str("trust_list") === "1",
      risks,
    };
    const severe = detail.isHoneypot || detail.cannotSell;
    const name = detail.tokenSymbol ? `${detail.tokenName ?? ""} (${detail.tokenSymbol})`.trim() : "this token";
    const out: TokenSecurityResult = {
      report: {
        source: "goplus",
        sourceName: "GoPlus Security",
        indicator,
        // The trust list is checked before the softer flags on purpose. A
        // centrally issued stablecoin is mintable, pausable and can blacklist
        // addresses by design; reporting that as "suspicious" would brand USDT
        // and USDC as threats. Only honeypot-class findings are malicious.
        verdict: severe ? "malicious" : detail.trustList ? "clean" : risks.length ? "suspicious" : "unknown",
        summary: severe
          ? `GoPlus reports ${name} as a honeypot or unsellable token.`
          : detail.trustList
            ? `GoPlus lists ${name} on its trusted-token list.${risks.length ? ` It does note issuer controls, normal for this kind of token: ${risks.slice(0, 3).join("; ")}.` : ""}`
            : risks.length
              ? `GoPlus notes ${risks.length} risk flag(s) on ${name}: ${risks.slice(0, 3).join("; ")}.`
              : `GoPlus found no risk flags on ${name}.`,
        url: `https://gopluslabs.io/token-security/${chainId}/${address}`,
        fetchedAt: nowIso(),
      },
      detail,
    };
    tokenCache.set(key, out);
    return out;
  } catch (err) {
    return {
      report: {
        source: "goplus",
        sourceName: "GoPlus Security",
        indicator,
        verdict: "error",
        summary: `GoPlus token check failed: ${errorMessage(err)}.`,
        fetchedAt: nowIso(),
      },
      detail: null,
    };
  }
}
