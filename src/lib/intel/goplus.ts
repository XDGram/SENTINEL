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
