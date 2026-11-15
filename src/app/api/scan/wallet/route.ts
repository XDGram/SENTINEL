import { NextResponse } from "next/server";
import { clientKey, rateLimit, takeServBudget } from "@/lib/guard";
import { isAddress } from "@/lib/scan-abi";
import type { Language } from "@/lib/types";

/** Languages SERV has been exercised in. */
const SUPPORTED_LANGUAGES: Language[] = ["en", "fr", "es"];
import { scanForPrompt, scanWallet, type WalletScanResult } from "@/lib/wallet-scan";
import { servAvailable, servExplainScan, SERV_MODEL, type ScanRiskLevel, type ServScan } from "@/lib/serv";
import { TtlCache } from "@/lib/intel/shared";

export const dynamic = "force-dynamic";

// A scan is many RPC calls, so it is rate limited harder than a lookup.
const RATE_LIMIT = Number(process.env.SCAN_RATE_LIMIT ?? 5);
const RATE_WINDOW_MS = 60_000;

// Same wallet scanned twice in a row reuses the SERV summary, not the chain reads.
const summaryCache = new TtlCache<ServScan>(10 * 60_000, 100);

const ACCOUNT_NOTE: Record<WalletScanResult["account"]["kind"], string> = {
  eoa: "an ordinary wallet address (EOA), controlled by a private key",
  contract: "a smart contract, not an ordinary wallet",
  "delegated-eoa": "an EIP-7702 delegated wallet: still key-controlled, but it delegates execution to another contract",
};

/** Worst risk among the approvals actually found. */
function riskLevelOf(scan: WalletScanResult): ScanRiskLevel {
  if (!scan.approvals.length) return "none";
  if (scan.riskCounts.critical > 0) return "critical";
  if (scan.riskCounts.high > 0) return "high";
  if (scan.riskCounts.medium > 0) return "medium";
  return "low";
}

/** Scan a real address for live token approvals and prepare revoke transactions. */
export async function POST(req: Request) {
  const wait = rateLimit(`scan:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (wait > 0) {
    return NextResponse.json({ error: `Too many scans. Try again in ${wait}s.` }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { address?: unknown; chainId?: unknown; forceModeA?: unknown; language?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "address must be a 0x address (40 hex characters)" }, { status: 400 });
  }
  const language: Language = SUPPORTED_LANGUAGES.includes(body?.language as Language) ? (body!.language as Language) : "en";
  const chainId = Number(body?.chainId ?? 1);
  if (!Number.isInteger(chainId) || chainId !== 1) {
    // Only Ethereum mainnet is wired up; say so rather than returning wrong data.
    return NextResponse.json({ error: "Only chainId 1 (Ethereum mainnet) is supported so far." }, { status: 400 });
  }

  let scan: WalletScanResult;
  try {
    scan = await scanWallet(address, { chainId, forceModeA: body?.forceModeA === true });
  } catch (err) {
    console.error("wallet scan failed", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 502 });
  }

  const accountNote = ACCOUNT_NOTE[scan.account.kind];

  // ONE SERV call per scan, never per approval.
  const cacheKey = JSON.stringify([
    scan.address,
    scan.coverage.mode,
    scan.approvals.map((a) => [a.token.symbol, a.spender, a.allowanceRaw, a.risk]),
  ]);
  let summary = summaryCache.get(cacheKey) ?? null;
  let servNote: string | null = null;
  if (!summary && servAvailable()) {
    if (takeServBudget()) {
      summary = await servExplainScan({
        address: scan.address,
        accountNote,
        scanBlock: scanForPrompt(scan),
        coverage: scan.coverage.limitations,
        language,
      });
      // The risk level follows from the findings, so the server sets it rather
      // than trusting the model: a wallet with no approvals at all is "none".
      if (summary) summary = { ...summary, riskLevel: riskLevelOf(scan) };
      if (summary) summaryCache.set(cacheKey, summary);
      else servNote = "SERV Reasoning did not return a usable summary, so this is a sources-only result.";
    } else {
      servNote = "Daily SERV budget reached, so this is a sources-only result without AI reasoning.";
    }
  } else if (!servAvailable()) {
    servNote = "SERV Reasoning is not connected, so this is a sources-only result.";
  }

  return NextResponse.json({
    address: scan.address,
    chainId: scan.chainId,
    account: { ...scan.account, description: accountNote },
    readOnly: "Watchdog never moves funds. Each approval includes unsigned revoke calldata that you sign from your own wallet.",
    summary,
    servUsed: Boolean(summary),
    servModel: summary ? SERV_MODEL : undefined,
    servNote,
    approvalCount: scan.approvals.length,
    riskCounts: scan.riskCounts,
    /** The ten worth acting on, for a UI that cannot render hundreds. */
    top: scan.top,
    approvals: scan.approvals,
    coverage: scan.coverage,
    evidence: scan.reports,
    errors: scan.errors,
    tookMs: scan.tookMs,
  });
}
