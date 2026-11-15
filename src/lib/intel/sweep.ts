// Background intel sweep: Sentinel actively gathers new threats on a schedule.
// - Refreshes the ScamSniffer and MetaMask blocklists and records what's new
// - Searches for fresh community reports of wallet attacks
// Runs from a Vercel cron (see vercel.json) or manually via /api/intel/sweep.

import "server-only";
import type { IntelReport, IntelSweep } from "../types";
import { getLists, listStats } from "./blocklists";
import { webReportsForPattern, webSearchProvider } from "./web";
import { errorMessage } from "./shared";
import { getSweepBaseline, saveSweep } from "../store";

const FRESH_REPORT_QUERIES = [
  "wallet drained phishing site this week crypto",
  "address poisoning attack USDT victim",
];

/**
 * "New since last sweep" for ScamSniffer addresses is diffed against the list
 * saved with the previous sweep in threat memory (Supabase), so it survives
 * cold starts. Domains (~360k entries) are not stored, only counted in
 * `totals`, so newDomains / newDomainCount stay null: there is no exact,
 * cheap diff for them.
 */
export async function runSweep(): Promise<IntelSweep> {
  const errors: string[] = [];

  let addresses: string[] | null = null;
  try {
    const lists = await getLists(true);
    const addressFetchFailed = lists.errors.some((e) => e.startsWith("ScamSniffer addresses"));
    errors.push(...lists.errors);
    // Only trust a list that was actually fetched this sweep; a failed fetch
    // falls back to an old or empty copy, which would corrupt the diff.
    if (!addressFetchFailed && lists.ssAddresses.size > 0) addresses = [...lists.ssAddresses].sort();
  } catch (err) {
    errors.push(`blocklists: ${errorMessage(err)}`);
  }

  let newAddresses: string[] | null = null;
  if (addresses) {
    try {
      const base = await getSweepBaseline();
      if (base) {
        const before = new Set(base.scamsnifferAddresses);
        newAddresses = addresses.filter((a) => !before.has(a));
      }
    } catch (err) {
      errors.push(`baseline: ${errorMessage(err)}`);
    }
  }

  const communityReports: IntelReport[] = [];
  if (webSearchProvider()) {
    const results = await Promise.allSettled(FRESH_REPORT_QUERIES.map((q) => webReportsForPattern(`feed:${q}`, q)));
    for (const r of results) {
      if (r.status === "fulfilled") communityReports.push(...r.value);
      else errors.push(`web: ${errorMessage(r.reason)}`);
    }
  } else {
    errors.push("web: no search key configured");
  }

  const stats = await listStats();

  return saveSweep({
    at: new Date().toISOString(),
    totals: {
      scamsnifferDomains: stats.scamsnifferDomains,
      scamsnifferAddresses: stats.scamsnifferAddresses,
      metamaskBlacklist: stats.metamaskBlacklist,
    },
    newDomains: null,
    newAddresses: newAddresses?.slice(0, 25) ?? null,
    newDomainCount: null,
    newAddressCount: newAddresses?.length ?? null,
    communityReports,
    errors,
  }, addresses ? { scamsnifferAddresses: addresses } : undefined);
}
