// Wallet approval scanner: finds live ERC-20 approvals a real address has
// granted, and prepares the revoke transaction for the user to sign.
//
// Watchdog is strictly read-only. It reads allowances with eth_call and builds
// unsigned approve(spender, 0) calldata. It never holds a key, never sends a
// transaction and never moves funds.
//
// Two modes, because a complete answer needs an indexer:
//   A (keyless, default) Multicall3 reads allowance(owner, spender) for a fixed
//     token set against every known scam spender plus the verified protocol
//     spenders. Finds dangerous approvals; cannot find approvals to spenders
//     nobody has reported yet.
//   B (ETHERSCAN_API_KEY) Approval event logs give the real (token, spender)
//     pairs this wallet actually approved, whoever they are; current allowances
//     still come from Multicall, so a revoked approval is not reported.
// The response always states which mode ran and what it could not see.

import "server-only";
import type { IntelReport, IntelSourceId } from "./types";
export type { ApprovalRisk } from "./scan-abi";
import {
  classifyCode,
  decodeAggregate3,
  decodeDecimals,
  decodeTokenString,
  decodeUint,
  encodeAggregate3,
  encodeAllowance,
  encodeApprove,
  encodeNoArgs,
  formatAllowance,
  isAddress,
  isUnlimited,
  MULTICALL3,
  SELECTOR,
  assessRisk,
  type AccountCode,
  type ApprovalRisk,
  type Call3,
} from "./scan-abi";
import { getLists } from "./intel/blocklists";
import { goplusApprovalSecurity, type ApprovalSecurity } from "./intel/goplus";
import { KNOWN_SPENDERS } from "./sim-data";
import { errorMessage, fetchWithTimeout, nowIso } from "./intel/shared";

export const DEFAULT_RPC = process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com";

/** The tokens Mode A sweeps. Decimals are fixed, well-known values. */
export interface ScanToken {
  symbol: string;
  address: string;
  decimals: number;
}

export const SCAN_TOKENS: ScanToken[] = [
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  { symbol: "PEPE", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 },
  { symbol: "SHIB", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18 },
];

/**
 * Widely used spender contracts, each verified on-chain and against GoPlus's
 * contract_name before being listed here. An approval to one of these is
 * ordinary behaviour, not an attack, so it must not be reported as high risk
 * merely for being unlimited.
 *
 * This list is additive to KNOWN_SPENDERS in sim-data.ts, which the demo
 * scenarios use.
 */
export const KNOWN_PROTOCOLS: Record<string, string> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
  "0x66a9893cc07d91d95644aedd05d03f95e1dba8af": "Uniswap Universal Router v2",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap SwapRouter02",
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 SwapRouter",
  "0x0000000000001ff3684f28c67538d4d072c22734": "0x AllowanceHolder",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch Aggregation Router V5",
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch Aggregation Router V6",
  "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110": "CoW Protocol Vault Relayer",
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW Protocol Settlement",
  "0x00000000000000adc04c56bf30ac9d3c0aaf14dc": "OpenSea Seaport 1.5",
  "0x0000000000000068f116a894984e2db1123eb395": "OpenSea Seaport 1.6",
  "0x1e0049783f008a0085193e00003d00cd54003c71": "OpenSea Conduit",
  "0x000000000000ad05ccc4f10045630fb830b95127": "Blur Exchange",
  "0x39da41747a83aee658334415666f3ef92dd0d541": "Blur Swap",
  "0x00000000000111abe46ff893f3b2fdf1f759a8a8": "Blur Execution Delegate",
  "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": "Aave V3 Pool",
  "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9": "Aave V2 Lending Pool",
};

/** Protocol name for a spender, from either list. */
export function knownProtocolName(spender: string): string | undefined {
  const a = spender.toLowerCase();
  return KNOWN_PROTOCOLS[a] ?? KNOWN_SPENDERS[a];
}

export type ScanMode = "A" | "B";

/** One live, non-zero approval. */
export interface ApprovalFinding {
  token: { symbol: string; address: string; decimals: number };
  spender: string;
  /** Raw allowance, as a decimal string (JSON cannot carry a bigint). */
  allowanceRaw: string;
  allowanceLabel: string;
  unlimited: boolean;
  risk: ApprovalRisk;
  /** Why this risk level, in plain words, each item backed by a source. */
  reasons: string[];
  spenderName?: string;
  /** True when the spender is in Watchdog's verified-protocol list. */
  knownProtocol: boolean;
  /** A source flags this spender, but it is a widely used protocol contract. */
  disputed: boolean;
  /** Advice for an approval that is not an attack but is worth tidying. */
  note?: string;
  /** Sources that flagged the spender. */
  flaggedBy: IntelSourceId[];
  /** Unsigned transaction the user signs themselves to revoke. */
  revoke: { to: string; data: string; value: string; note: string };
}

export interface ScanCoverage {
  mode: ScanMode;
  /** Plain sentences about what this scan could not see. */
  limitations: string[];
  tokensChecked: string[];
  spendersChecked: number;
  /** Mode A: how many known scam spenders existed vs. were actually reached. */
  scamSpendersTotal?: number;
  scamSpendersChecked?: number;
  allowanceCallsMade: number;
  timedOut: boolean;
  blockNumber?: string;
}

export interface WalletScanResult {
  address: string;
  chainId: number;
  account: AccountCode;
  /** Every live approval found, worst risk first. */
  approvals: ApprovalFinding[];
  /** The ten that matter most, for a UI that cannot show hundreds. */
  top: ApprovalFinding[];
  /** How many approvals sit at each risk level. */
  riskCounts: Record<ApprovalRisk, number>;
  coverage: ScanCoverage;
  /** Spender reputation lookups, as evidence. */
  reports: IntelReport[];
  errors: string[];
  tookMs: number;
}

// ---- JSON-RPC ----

let rpcId = 0;

async function rpc<T>(method: string, params: unknown[], timeoutMs = 10_000): Promise<T> {
  const res = await fetchWithTimeout(
    DEFAULT_RPC,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || "RPC error");
  if (json.result === undefined) throw new Error("RPC returned no result");
  return json.result;
}

async function ethCall(to: string, data: string, timeoutMs: number): Promise<string> {
  return rpc<string>("eth_call", [{ to, data }, "latest"], timeoutMs);
}

/** eth_getCode, so the report can say EOA, contract or EIP-7702 delegated EOA. */
export async function accountCode(address: string): Promise<AccountCode> {
  try {
    return classifyCode(await rpc<string>("eth_getCode", [address, "latest"], 8000));
  } catch {
    return { kind: "eoa", size: 0 };
  }
}

// ---- Allowance sweeping ----

/** One (token, spender) pair to read. */
interface Pair {
  token: ScanToken;
  spender: string;
}

const BATCH_SIZE = Number(process.env.SCAN_BATCH_SIZE ?? 1000);
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 4);
const TIME_BUDGET_MS = Number(process.env.SCAN_TIME_BUDGET_MS ?? 8000);
/** A busy wallet can approve hundreds of spenders; each lookup is an API call. */
const REPUTATION_LOOKUP_CAP = Number(process.env.SCAN_REPUTATION_CAP ?? 40);

interface SweepOutcome {
  found: { pair: Pair; allowance: bigint }[];
  callsMade: number;
  pairsAttempted: number;
  timedOut: boolean;
  errors: string[];
}

/**
 * Read allowance for every pair via Multicall3, in batches, stopping when the
 * time budget runs out. Returns only non-zero allowances, plus exactly how far
 * it got, so the caller can be honest about coverage.
 */
async function sweepAllowances(owner: string, pairs: Pair[], deadline: number): Promise<SweepOutcome> {
  const batches: Pair[][] = [];
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) batches.push(pairs.slice(i, i + BATCH_SIZE));

  const found: { pair: Pair; allowance: bigint }[] = [];
  const errors: string[] = [];
  let callsMade = 0;
  let pairsAttempted = 0;
  let timedOut = false;
  let next = 0;

  async function worker() {
    for (;;) {
      if (Date.now() >= deadline) {
        timedOut = true;
        return;
      }
      const index = next++;
      if (index >= batches.length) return;
      const batch = batches[index];
      const calls: Call3[] = batch.map((p) => ({
        target: p.token.address,
        allowFailure: true,
        callData: encodeAllowance(owner, p.spender),
      }));
      try {
        const remaining = Math.max(1000, deadline - Date.now());
        const ret = await ethCall(MULTICALL3, encodeAggregate3(calls), remaining);
        const results = decodeAggregate3(ret);
        callsMade++;
        pairsAttempted += batch.length;
        results.forEach((r, i) => {
          if (!r.success) return;
          const v = decodeUint(r.data);
          if (v !== null && v > BigInt(0)) found.push({ pair: batch[i], allowance: v });
        });
      } catch (err) {
        // One failed batch must not fail the scan; record it and carry on.
        if (errors.length < 3) errors.push(`allowance batch failed: ${errorMessage(err)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return { found, callsMade, pairsAttempted, timedOut, errors };
}

// ---- Mode B: Approval logs via Etherscan v2 ----

/** keccak256("Approval(address,address,uint256)") */
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

export function etherscanAvailable(): boolean {
  return Boolean(process.env.ETHERSCAN_API_KEY);
}

interface EtherscanLog {
  address?: string;
  topics?: string[];
  blockNumber?: string;
}

const topicToAddress = (t: string): string | null => {
  const h = (t || "").replace(/^0x/, "").toLowerCase();
  return h.length === 64 ? `0x${h.slice(24)}` : null;
};

/**
 * Unique (token, spender) pairs this wallet has ever approved, from Approval
 * event logs. An approval later set to zero still appears here; the current
 * allowance is read afterwards, so only live ones are reported.
 */
async function approvalPairsFromLogs(owner: string, chainId: number): Promise<{ pairs: Pair[]; errors: string[]; truncated: boolean }> {
  const key = process.env.ETHERSCAN_API_KEY;
  const errors: string[] = [];
  if (!key) return { pairs: [], errors: ["ETHERSCAN_API_KEY is not set"], truncated: false };

  const byAddress = new Map<string, ScanToken>();
  for (const t of SCAN_TOKENS) byAddress.set(t.address.toLowerCase(), t);

  const url =
    `https://api.etherscan.io/v2/api?chainid=${chainId}&module=logs&action=getLogs` +
    `&topic0=${APPROVAL_TOPIC}&topic0_1_opr=and&topic1=0x${owner.replace(/^0x/, "").toLowerCase().padStart(64, "0")}` +
    `&fromBlock=0&toBlock=latest&page=1&offset=1000&sort=desc&apikey=${key}`;

  try {
    const res = await fetchWithTimeout(url, {}, 12_000);
    const json = (await res.json()) as { status?: string; message?: string; result?: EtherscanLog[] | string };
    if (typeof json.result === "string") {
      // Etherscan reports "No records found" and errors alike in `result`.
      if (/no records/i.test(json.result)) return { pairs: [], errors: [], truncated: false };
      throw new Error(json.result);
    }
    const logs = json.result ?? [];
    const seen = new Set<string>();
    const pairs: Pair[] = [];
    for (const log of logs) {
      const token = (log.address ?? "").toLowerCase();
      const spender = topicToAddress(log.topics?.[2] ?? "");
      if (!token || !spender || !isAddress(token) || !isAddress(spender)) continue;
      const k = `${token}:${spender}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // Known decimals where we have them; otherwise report the raw amount.
      pairs.push({ token: byAddress.get(token) ?? { symbol: "token", address: token, decimals: 0 }, spender });
    }
    return { pairs, errors, truncated: logs.length >= 1000 };
  } catch (err) {
    return { pairs: [], errors: [`Etherscan logs lookup failed: ${errorMessage(err)}`], truncated: false };
  }
}

// ---- Token metadata ----

export interface TokenMeta {
  symbol?: string;
  decimals?: number;
}

/**
 * Read symbol() and decimals() for tokens whose details are not known in
 * advance, in one Multicall batch. Anything that fails to decode is simply
 * left unresolved, and the finding says the decimals are unknown rather than
 * printing a number that could be wrong by orders of magnitude.
 */
export async function resolveTokenMetadata(tokens: string[]): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  if (!tokens.length) return out;
  const calls: Call3[] = [];
  for (const t of tokens) {
    calls.push({ target: t, allowFailure: true, callData: encodeNoArgs(SELECTOR.symbol) });
    calls.push({ target: t, allowFailure: true, callData: encodeNoArgs(SELECTOR.decimals) });
  }
  try {
    const results = decodeAggregate3(await ethCall(MULTICALL3, encodeAggregate3(calls), 8000));
    tokens.forEach((t, i) => {
      const sym = results[i * 2];
      const dec = results[i * 2 + 1];
      const meta: TokenMeta = {};
      if (sym?.success) {
        const parsed = decodeTokenString(sym.data);
        if (parsed) meta.symbol = parsed.slice(0, 20);
      }
      if (dec?.success) {
        const parsed = decodeDecimals(dec.data);
        if (parsed !== null) meta.decimals = parsed;
      }
      out.set(t.toLowerCase(), meta);
    });
  } catch {
    // Metadata is presentation only: a failure must not fail the scan.
  }
  return out;
}

// ---- Risk assessment ----

const RISK_ORDER: Record<ApprovalRisk, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** How many approvals the UI summary and the SERV prompt carry. */
export const TOP_N = 10;

// ---- The scan ----

export interface ScanOptions {
  chainId?: number;
  /** Force Mode A even when an Etherscan key is present. */
  forceModeA?: boolean;
}

export async function scanWallet(addressInput: string, opts: ScanOptions = {}): Promise<WalletScanResult> {
  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const chainId = opts.chainId ?? 1;
  const address = addressInput.toLowerCase();
  const errors: string[] = [];

  const knownSpenders = Object.keys(KNOWN_SPENDERS).map((s) => s.toLowerCase());
  const [account, lists] = await Promise.all([accountCode(address), getLists().catch(() => null)]);

  const scamAddresses = lists ? [...lists.ssAddresses].filter(isAddress).map((a) => a.toLowerCase()) : [];
  if (!lists) errors.push("ScamSniffer blacklist could not be loaded, so known scam spenders were not swept.");

  const useModeB = etherscanAvailable() && !opts.forceModeA;
  let mode: ScanMode = useModeB ? "B" : "A";
  let pairs: Pair[] = [];
  let scamSpendersChecked: number | undefined;
  let logsTruncated = false;

  if (useModeB) {
    const logs = await approvalPairsFromLogs(address, chainId);
    errors.push(...logs.errors);
    logsTruncated = logs.truncated;
    if (logs.errors.length) {
      // Fall back rather than return nothing.
      mode = "A";
    } else {
      pairs = logs.pairs;
    }
  }

  if (mode === "A") {
    // Verified protocols first (cheap and usually the real hits), then every
    // known scam spender. Order matters: the time box may cut the tail off.
    const spenders = [...new Set([...knownSpenders, ...scamAddresses])];
    pairs = [];
    for (const spender of spenders) for (const token of SCAN_TOKENS) pairs.push({ token, spender });
  }

  const sweep = await sweepAllowances(address, pairs, deadline);
  errors.push(...sweep.errors);

  if (mode === "A") {
    const spendersReached = Math.floor(sweep.pairsAttempted / SCAN_TOKENS.length);
    scamSpendersChecked = Math.max(0, spendersReached - knownSpenders.length);
  }

  // Resolve symbol and decimals for tokens the fixed list does not cover, so a
  // Mode B finding never reports a bare "token" or a raw amount.
  const unresolved = [...new Set(sweep.found.filter((f) => !f.pair.token.decimals && f.pair.token.symbol === "token").map((f) => f.pair.token.address))];
  const metadata = await resolveTokenMetadata(unresolved);

  // Reputation: one lookup per distinct spender that actually holds an
  // allowance, capped because a busy wallet can have hundreds and each one is
  // an API request. Spenders no list recognises are looked up first, since
  // those are the ones whose rating depends on it.
  const scamSet = new Set(scamAddresses);
  const distinct = [...new Set(sweep.found.map((f) => f.pair.spender))];
  const priority = [...distinct].sort((a, b) => Number(Boolean(knownProtocolName(a))) - Number(Boolean(knownProtocolName(b))));
  const toLookUp = priority.slice(0, REPUTATION_LOOKUP_CAP);
  const skippedLookups = priority.length - toLookUp.length;

  const reputation = new Map<string, { approval: ApprovalSecurity | null; report: IntelReport }>();
  const settled = await Promise.allSettled(toLookUp.map((sp) => goplusApprovalSecurity(sp, chainId)));
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") reputation.set(toLookUp[i], { approval: r.value.detail, report: r.value.report });
  });

  const reports: IntelReport[] = [];
  const seenReport = new Set<string>();
  const approvals: ApprovalFinding[] = sweep.found.map(({ pair, allowance }) => {
    const spender = pair.spender;
    const onScamList = scamSet.has(spender);
    const protocolName = knownProtocolName(spender);
    const knownProtocol = Boolean(protocolName);
    const rep = reputation.get(spender);
    const reputationChecked = reputation.has(spender);

    // One evidence entry per spender, not per approval.
    if (rep && !seenReport.has(`gp:${spender}`)) {
      seenReport.add(`gp:${spender}`);
      reports.push(rep.report);
    }
    if (onScamList && !seenReport.has(`ss:${spender}`)) {
      seenReport.add(`ss:${spender}`);
      reports.push({
        source: "scamsniffer",
        sourceName: "ScamSniffer database",
        indicator: `spender:${spender}`,
        verdict: "malicious",
        summary: "This spender is on ScamSniffer's public scam address blacklist.",
        url: "https://github.com/scamsniffer/scam-database",
        fetchedAt: nowIso(),
      });
    }

    const meta = metadata.get(pair.token.address.toLowerCase());
    const symbol = pair.token.symbol !== "token" ? pair.token.symbol : (meta?.symbol ?? "unknown token");
    const decimals = pair.token.decimals || meta?.decimals || 0;

    const unlimited = isUnlimited(allowance);
    const { risk, reasons, disputed, note } = assessRisk({
      unlimited,
      knownProtocol,
      protocolName,
      onScamList,
      approval: rep?.approval ?? null,
      reputationChecked,
    });
    const flaggedBy: IntelSourceId[] = [];
    if (onScamList) flaggedBy.push("scamsniffer");
    if (rep?.report.verdict === "malicious" || rep?.report.verdict === "suspicious") flaggedBy.push("goplus");

    return {
      token: { symbol, address: pair.token.address, decimals },
      spender,
      allowanceRaw: allowance.toString(),
      allowanceLabel: decimals
        ? formatAllowance(allowance, decimals, symbol)
        : isUnlimited(allowance)
          ? `unlimited ${symbol}`
          : `${allowance.toString()} ${symbol} (raw units; decimals unknown)`,
      unlimited,
      risk,
      reasons,
      disputed,
      note,
      spenderName: protocolName ?? rep?.approval?.contractName ?? undefined,
      knownProtocol,
      flaggedBy: [...new Set(flaggedBy)],
      revoke: {
        to: pair.token.address,
        data: encodeApprove(spender, BigInt(0)),
        value: "0x0",
        note: "Unsigned approve(spender, 0) calldata. Watchdog never signs or sends it; you do, from your own wallet.",
      },
    };
  });

  if (skippedLookups > 0) {
    errors.push(`Spender reputation was checked for ${toLookUp.length} of ${priority.length} spenders; the rest are rated on the lists alone.`);
  }

  // Worst first, then unlimited before limited, then larger allowance first,
  // so the top of the list is what a beginner should act on.
  approvals.sort(
    (a, b) =>
      RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
      Number(b.unlimited) - Number(a.unlimited) ||
      (BigInt(b.allowanceRaw) > BigInt(a.allowanceRaw) ? 1 : BigInt(b.allowanceRaw) < BigInt(a.allowanceRaw) ? -1 : 0),
  );

  const riskCounts: Record<ApprovalRisk, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of approvals) riskCounts[a.risk]++;

  // ---- Honest coverage ----
  const limitations: string[] = [];
  if (mode === "A") {
    limitations.push(
      `Mode A has no indexer, so it only checks ${SCAN_TOKENS.length} major tokens (${SCAN_TOKENS.map((t) => t.symbol).join(", ")}) against spenders that are already known: ${knownSpenders.length} verified protocols and ${scamSpendersChecked ?? 0} reported scam addresses.`,
      "An approval to a spender nobody has reported yet, or on any other token, will not appear. A clean result here does not mean the wallet has no risky approvals.",
    );
    if (scamSpendersChecked !== undefined && scamAddresses.length > scamSpendersChecked) {
      limitations.push(
        `The time budget stopped the sweep after ${scamSpendersChecked} of ${scamAddresses.length} known scam spenders, so ${scamAddresses.length - scamSpendersChecked} were not checked.`,
      );
    }
    limitations.push("Set ETHERSCAN_API_KEY to switch on Mode B, which reads this wallet's real approval history instead of guessing which spenders to try.");
  } else {
    limitations.push(
      "Mode B reads this wallet's Approval event history, so it finds approvals to any spender, including ones no source has reported.",
      "Only the most recent 1000 Approval events are read, and current allowances are re-read on-chain, so approvals already set to zero are correctly left out.",
    );
    if (logsTruncated) limitations.push("This wallet has more than 1000 Approval events, so the oldest ones were not read.");
    limitations.push("Decimals are known only for the major tokens; other tokens report raw units.");
  }
  if (account.kind === "delegated-eoa") {
    limitations.push(
      `This account is an EIP-7702 delegated EOA (it delegates to ${account.delegatesTo}). It is still key-controlled, but code runs on its behalf, which approval checks alone do not cover.`,
    );
  }
  if (sweep.timedOut) limitations.push("The scan hit its time limit, so coverage is partial as described above.");

  let blockNumber: string | undefined;
  try {
    blockNumber = await rpc<string>("eth_blockNumber", [], 3000);
  } catch {
    // Not essential.
  }

  return {
    address,
    chainId,
    account,
    approvals,
    top: approvals.slice(0, TOP_N),
    riskCounts,
    coverage: {
      mode,
      limitations,
      tokensChecked: mode === "A" ? SCAN_TOKENS.map((t) => t.symbol) : [...new Set(pairs.map((p) => p.token.symbol))],
      spendersChecked: mode === "A" ? Math.floor(sweep.pairsAttempted / SCAN_TOKENS.length) : new Set(pairs.map((p) => p.spender)).size,
      scamSpendersTotal: mode === "A" ? scamAddresses.length : undefined,
      scamSpendersChecked,
      allowanceCallsMade: sweep.callsMade,
      timedOut: sweep.timedOut,
      blockNumber,
    },
    reports,
    errors,
    tookMs: Date.now() - started,
  };
}

/**
 * Compact scan summary for the SERV prompt: the top findings only, with a
 * count of the rest. A wallet can hold hundreds of approvals, and sending them
 * all would cost far more tokens than it adds.
 */
export function scanForPrompt(scan: WalletScanResult): string {
  if (!scan.approvals.length) return "No live non-zero approvals were found within this scan's coverage.";
  const lines = scan.top.map((a, i) => {
    const who = a.spenderName ? `${a.spenderName} (${a.spender})` : a.spender;
    return [
      `[A${i + 1}] ${a.allowanceLabel} of ${a.token.symbol} approved to ${who}`,
      `  risk: ${a.risk}${a.disputed ? " (disputed)" : ""}${a.flaggedBy.length ? ` · flagged by: ${a.flaggedBy.join(", ")}` : " · not flagged by any source"}`,
      ...a.reasons.map((r) => `  - ${r}`),
      a.note ? `  note: ${a.note}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  });
  const counts = Object.entries(scan.riskCounts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  const hidden = scan.approvals.length - scan.top.length;
  return [
    `${scan.approvals.length} live approval(s) in total: ${counts}.`,
    hidden > 0 ? `The ${scan.top.length} most important are listed; ${hidden} lower-risk one(s) are not shown.` : null,
    "",
    ...lines,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
