// Background intel sweep: Sentinel actively gathers new threats on a schedule.
// - Refreshes the ScamSniffer and MetaMask blocklists and records what's new
// - Searches for fresh community reports of wallet attacks
// Runs from a Vercel cron (see vercel.json) or manually via /api/intel/sweep.

import "server-only";
import type { IntelReport, IntelSweep } from "../types";
import { listStats, snapshot } from "./blocklists";
import { webReportsForPattern, webSearchProvider } from "./web";
import { errorMessage } from "./shared";
import { saveSweep } from "../store";

const FRESH_REPORT_QUERIES = [
  "wallet drained phishing site this week crypto",
  "address poisoning attack USDT victim",
];

const g = globalThis as unknown as { __sentinelSweepBase?: { domains: Set<string>; addresses: Set<string> } };

export async function runSweep(): Promise<IntelSweep> {
  const errors: string[] = [];
  const before = g.__sentinelSweepBase;

  let snap: { domains: Set<string>; addresses: Set<string> } | null = null;
  try {
    snap = await snapshot();
  } catch (err) {
    errors.push(`blocklists: ${errorMessage(err)}`);
  }

  let newDomains: string[] | null = null;
  let newAddresses: string[] | null = null;
  if (snap && before) {
    newDomains = [...snap.domains].filter((d) => !before.domains.has(d));
    newAddresses = [...snap.addresses].filter((a) => !before.addresses.has(a));
  }
  if (snap) g.__sentinelSweepBase = snap;

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
  errors.push(...stats.errors);

  return saveSweep({
    at: new Date().toISOString(),
    totals: {
      scamsnifferDomains: stats.scamsnifferDomains,
      scamsnifferAddresses: stats.scamsnifferAddresses,
      metamaskBlacklist: stats.metamaskBlacklist,
    },
    newDomains: newDomains?.slice(0, 25) ?? null,
    newAddresses: newAddresses?.slice(0, 25) ?? null,
    newDomainCount: newDomains?.length ?? null,
    newAddressCount: newAddresses?.length ?? null,
    communityReports,
    errors,
  });
}
