// Open-source community blocklists, refreshed periodically:
// - ScamSniffer scam database: https://github.com/scamsniffer/scam-database
// - MetaMask eth-phishing-detect: https://github.com/MetaMask/eth-phishing-detect

import "server-only";
import type { IntelReport } from "../types";
import { errorMessage, fetchWithTimeout, hostAndParents, nowIso } from "./shared";

const SOURCES = {
  ssDomains: "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json",
  ssAddresses: "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json",
  metamask: "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json",
};

const TTL_MS = 6 * 60 * 60_000;

interface Lists {
  loadedAt: number;
  ssDomains: Set<string>;
  ssAddresses: Set<string>;
  mmBlacklist: Set<string>;
  mmWhitelist: Set<string>;
  errors: string[];
}

const g = globalThis as unknown as { __watchdogLists?: Lists; __watchdogListsLoading?: Promise<Lists> };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url, {}, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function load(): Promise<Lists> {
  const [d, a, m] = await Promise.allSettled([
    fetchJson<string[]>(SOURCES.ssDomains),
    fetchJson<string[]>(SOURCES.ssAddresses),
    fetchJson<{ blacklist?: string[]; whitelist?: string[] }>(SOURCES.metamask),
  ]);
  const prev = g.__watchdogLists;
  const errors: string[] = [];
  const pick = <T,>(r: PromiseSettledResult<T>, name: string): T | undefined => {
    if (r.status === "fulfilled") return r.value;
    errors.push(`${name}: ${errorMessage(r.reason)}`);
    return undefined;
  };
  const dv = pick(d, "ScamSniffer domains");
  const av = pick(a, "ScamSniffer addresses");
  const mv = pick(m, "MetaMask list");
  return {
    loadedAt: Date.now(),
    // Keep the previous copy of any list that failed to refresh.
    ssDomains: dv ? new Set(dv.map((x) => x.toLowerCase())) : (prev?.ssDomains ?? new Set()),
    ssAddresses: av ? new Set(av.map((x) => x.toLowerCase())) : (prev?.ssAddresses ?? new Set()),
    mmBlacklist: mv?.blacklist ? new Set(mv.blacklist.map((x) => x.toLowerCase())) : (prev?.mmBlacklist ?? new Set()),
    mmWhitelist: mv?.whitelist ? new Set(mv.whitelist.map((x) => x.toLowerCase())) : (prev?.mmWhitelist ?? new Set()),
    errors,
  };
}

/** Loaded lists; refreshes in the background after the TTL. */
export async function getLists(force = false): Promise<Lists> {
  const cur = g.__watchdogLists;
  const stale = !cur || force || Date.now() - cur.loadedAt > TTL_MS;
  if (!stale) return cur;
  g.__watchdogListsLoading ??= load().finally(() => {
    g.__watchdogListsLoading = undefined;
  });
  const next = await g.__watchdogListsLoading;
  g.__watchdogLists = next;
  return next;
}

export async function listStats() {
  const l = await getLists();
  return {
    loadedAt: new Date(l.loadedAt).toISOString(),
    scamsnifferDomains: l.ssDomains.size,
    scamsnifferAddresses: l.ssAddresses.size,
    metamaskBlacklist: l.mmBlacklist.size,
    errors: l.errors,
  };
}

export async function checkAddressLists(address: string): Promise<IntelReport[]> {
  const a = address.toLowerCase();
  const l = await getLists();
  const indicator = `address:${a}`;
  const listed = l.ssAddresses.has(a);
  return [
    {
      source: "scamsniffer",
      sourceName: "ScamSniffer database",
      indicator,
      verdict: l.ssAddresses.size === 0 ? "error" : listed ? "malicious" : "unknown",
      summary:
        l.ssAddresses.size === 0
          ? "ScamSniffer list could not be loaded."
          : listed
            ? "This address is on ScamSniffer's public scam address blacklist."
            : "Not on ScamSniffer's scam address blacklist.",
      url: "https://github.com/scamsniffer/scam-database",
      fetchedAt: nowIso(),
    },
  ];
}

export async function checkDomainLists(host: string): Promise<IntelReport[]> {
  const l = await getLists();
  const candidates = hostAndParents(host);
  const indicator = `domain:${host.toLowerCase()}`;
  const ssHit = candidates.find((c) => l.ssDomains.has(c));
  const mmHit = candidates.find((c) => l.mmBlacklist.has(c));
  const mmSafe = candidates.find((c) => l.mmWhitelist.has(c));
  return [
    {
      source: "scamsniffer",
      sourceName: "ScamSniffer database",
      indicator,
      verdict: l.ssDomains.size === 0 ? "error" : ssHit ? "malicious" : "unknown",
      summary: ssHit ? `${ssHit} is on ScamSniffer's phishing domain blacklist.` : "Not on ScamSniffer's phishing domain blacklist.",
      url: "https://github.com/scamsniffer/scam-database",
      fetchedAt: nowIso(),
    },
    {
      source: "metamask",
      sourceName: "MetaMask phishing list",
      indicator,
      verdict: l.mmBlacklist.size === 0 ? "error" : mmHit ? "malicious" : mmSafe ? "clean" : "unknown",
      summary: mmHit
        ? `${mmHit} is on MetaMask's phishing blocklist.`
        : mmSafe
          ? `${mmSafe} is on MetaMask's allowlist.`
          : "Not on MetaMask's phishing blocklist.",
      url: "https://github.com/MetaMask/eth-phishing-detect",
      fetchedAt: nowIso(),
    },
  ];
}
