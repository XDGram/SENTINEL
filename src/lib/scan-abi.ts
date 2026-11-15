// Pure helpers for the wallet scanner and the universal checker: ABI encoding
// and decoding, account-code classification, allowance formatting and
// normalisation of pasted input.
//
// Deliberately free of network calls, environment access and the "server-only"
// marker, so these primitives can be unit tested directly.

// ---- Hex / ABI primitives ----

// Written with BigInt() rather than bigint literals, because the project
// targets ES2017 and literals such as 0n are only allowed from ES2020.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

export const MAX_UINT256 = TWO ** BigInt(256) - ONE;

/** Any allowance at or above this is effectively unlimited at real token supplies. */
export const UNLIMITED_THRESHOLD = TWO ** BigInt(255);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(s: string): boolean {
  return ADDRESS_RE.test(s.trim());
}

function word(hex: string): string {
  return hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

export function padAddress(addr: string): string {
  return word(addr);
}

export function padUint(value: bigint): string {
  return word(value.toString(16));
}

// Function selectors (first 4 bytes of the keccak hash of the signature).
export const SELECTOR = {
  /** allowance(address,address) */
  allowance: "dd62ed3e",
  /** approve(address,uint256) */
  approve: "095ea7b3",
  /** aggregate3((address,bool,bytes)[]) */
  aggregate3: "82ad56cb",
  /** symbol() */
  symbol: "95d89b41",
  /** decimals() */
  decimals: "313ce567",
} as const;

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

export function encodeAllowance(owner: string, spender: string): string {
  return `0x${SELECTOR.allowance}${padAddress(owner)}${padAddress(spender)}`;
}

/**
 * Calldata for approve(spender, 0) — the revoke transaction. Sentinel only
 * ever builds this for the user to sign; it never sends it.
 */
export function encodeApprove(spender: string, amount: bigint): string {
  return `0x${SELECTOR.approve}${padAddress(spender)}${padUint(amount)}`;
}

export interface Call3 {
  target: string;
  allowFailure: boolean;
  callData: string;
}

/** Encode Multicall3.aggregate3(Call3[]). */
export function encodeAggregate3(calls: Call3[]): string {
  const head = SELECTOR.aggregate3 + padUint(BigInt(32)) + padUint(BigInt(calls.length));
  const tuples = calls.map((c) => {
    const data = c.callData.replace(/^0x/, "");
    const byteLen = data.length / 2;
    const padded = data.padEnd(Math.ceil(byteLen / 32) * 64, "0");
    // target, allowFailure, offset-to-bytes (always 0x60 inside the tuple), length, data
    return padAddress(c.target) + padUint(c.allowFailure ? ONE : ZERO) + padUint(BigInt(96)) + padUint(BigInt(byteLen)) + padded;
  });
  // Offsets are relative to the start of the array's data section.
  let cursor = BigInt(calls.length) * BigInt(32);
  const offsets = tuples.map((t) => {
    const o = padUint(cursor);
    cursor += BigInt(t.length / 2);
    return o;
  });
  return `0x${head}${offsets.join("")}${tuples.join("")}`;
}

export interface Call3Result {
  success: boolean;
  data: string;
}

/** Decode Multicall3.aggregate3's Result[] return value. */
export function decodeAggregate3(ret: string): Call3Result[] {
  const h = ret.replace(/^0x/, "").toLowerCase();
  const at = (i: number): string => h.slice(i * 64, (i + 1) * 64);
  const num = (i: number): number => {
    const w = at(i);
    if (w.length < 64) throw new Error("truncated return data");
    return Number(BigInt(`0x${w}`));
  };
  const arrayStart = num(0) / 32;
  const n = num(arrayStart);
  const base = arrayStart + 1;
  const out: Call3Result[] = [];
  for (let i = 0; i < n; i++) {
    const tuple = base + num(base + i) / 32;
    const success = num(tuple) === 1;
    const bytesAt = tuple + num(tuple + 1) / 32;
    const len = num(bytesAt);
    out.push({ success, data: h.slice((bytesAt + 1) * 64, (bytesAt + 1) * 64 + len * 2) });
  }
  return out;
}

/** Read a uint256 out of returned call data. Null when there is nothing usable. */
export function decodeUint(data: string): bigint | null {
  const h = data.replace(/^0x/, "").trim();
  if (!h || h.length < 64 || !/^[0-9a-fA-F]+$/.test(h)) return null;
  try {
    return BigInt(`0x${h.slice(0, 64)}`);
  } catch {
    return null;
  }
}

/** Calldata for a no-argument view function such as symbol() or decimals(). */
export function encodeNoArgs(selector: string): string {
  return `0x${selector}`;
}

/**
 * Decode a token symbol. Modern tokens return a dynamic string; several older
 * ones (MKR among them) declare bytes32 instead, so both are handled. Returns
 * null rather than guessing when the data is neither.
 */
export function decodeTokenString(data: string): string | null {
  const h = (data || "").replace(/^0x/, "");
  if (!h || h.length < 64) return null;
  const clean = (s: string) => {
    // Keep printable ASCII only: a mis-decoded word otherwise yields control
    // characters that would be rendered to the user.
    const out = s.replace(/\u0000+$/g, "").trim();
    return /^[\x20-\x7E]+$/.test(out) ? out : null;
  };
  const hexToUtf8 = (hex: string) => {
    let s = "";
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const c = parseInt(hex.slice(i, i + 2), 16);
      if (c) s += String.fromCharCode(c);
    }
    return s;
  };
  // Dynamic string: offset word, length word, then the bytes.
  try {
    const offset = Number(BigInt(`0x${h.slice(0, 64)}`));
    if (offset === 32 && h.length >= 128) {
      const len = Number(BigInt(`0x${h.slice(64, 128)}`));
      if (len > 0 && len <= 64 && h.length >= 128 + len * 2) {
        const got = clean(hexToUtf8(h.slice(128, 128 + len * 2)));
        if (got) return got;
      }
    }
  } catch {
    // Fall through to bytes32.
  }
  // bytes32: right-padded raw characters.
  return clean(hexToUtf8(h.slice(0, 64)));
}

/** Decode a uint8 return value such as decimals(). Null when out of range. */
export function decodeDecimals(data: string): number | null {
  const v = decodeUint(data);
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 36 ? n : null;
}

// ---- Account code ----

export type AccountKind = "eoa" | "contract" | "delegated-eoa";

export interface AccountCode {
  kind: AccountKind;
  /** Bytes of deployed code. */
  size: number;
  /** For an EIP-7702 delegated EOA, the address the account delegates to. */
  delegatesTo?: string;
}

/**
 * Classify an account from eth_getCode.
 *
 * An EIP-7702 delegation indicator is exactly 23 bytes, 0xef0100 followed by
 * an address. Such an account is still an EOA controlled by a private key, so
 * reporting it as a smart contract would be wrong — and it is increasingly
 * common for ordinary wallets.
 */
export function classifyCode(code: string): AccountCode {
  const h = (code || "0x").replace(/^0x/, "").toLowerCase();
  if (h.length === 0) return { kind: "eoa", size: 0 };
  if (h.length === 46 && h.startsWith("ef0100")) {
    return { kind: "delegated-eoa", size: 23, delegatesTo: `0x${h.slice(6)}` };
  }
  return { kind: "contract", size: h.length / 2 };
}

// ---- Allowance presentation ----

export function isUnlimited(value: bigint): boolean {
  return value >= UNLIMITED_THRESHOLD;
}

/**
 * Human-readable allowance. Never rounds a real number into something
 * misleading: an effectively infinite allowance is named as such rather than
 * printed as a meaningless quantity of tokens.
 */
export function formatAllowance(value: bigint, decimals: number, symbol: string): string {
  if (value === ZERO) return `0 ${symbol}`;
  if (isUnlimited(value)) return `unlimited ${symbol}`;
  const base = TEN ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === ZERO) return `${whole.toString()} ${symbol}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return `${whole.toString()}${fracStr ? `.${fracStr}` : ""} ${symbol}`;
}

// ---- Input normalisation ----

export type InputKind = "address" | "domain" | "unknown";

export interface NormalisedInput {
  kind: InputKind;
  /** Lower-cased address, or the bare hostname for a domain. */
  value: string;
  /** What the user actually pasted, trimmed for display. */
  raw: string;
  /** Full URL when the input carried a path, so the path can be reported. */
  url?: string;
  /** Set when the input had to be cleaned up, so the response can say so. */
  note?: string;
}

// Zero-width and bidi characters, which get carried along by copy-paste and
// can also be used to disguise a hostname.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;

// Includes the curly quotes and guillemets that chat apps and phone keyboards
// insert, which otherwise end up inside the hostname and get punycoded.
const QUOTES = "'\"\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A";
const TRAILING_PUNCT = new RegExp(`[.,;:!?)\\]}>\u2026${QUOTES}]+$`);
const LEADING_PUNCT = new RegExp(`^[(\\[{<${QUOTES}]+`);

/**
 * Make sense of something pasted out of WhatsApp or Telegram: surrounding
 * chatter, invisible characters, defanged links, missing scheme, markdown.
 */
export function normaliseInput(raw: string): NormalisedInput {
  const original = raw.slice(0, 2000);
  const notes: string[] = [];

  let s = original.replace(INVISIBLE, "");
  if (s !== original) notes.push("removed invisible characters");
  s = s.trim();

  // Markdown link: [text](url) → url
  const md = s.match(/\]\(\s*([^)\s]+)\s*\)/);
  if (md) {
    s = md[1];
    notes.push("extracted the link target from markdown");
  }

  // Defanged links, as security posts and some chat apps write them.
  const defanged = s.replace(/h(?:xx|tt)p(s?):\/\//i, "http$1://").replace(/\[\.\]|\(\.\)|\{\.\}/g, ".");
  if (defanged !== s) {
    s = defanged;
    notes.push("restored a defanged link");
  }

  s = s.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "").trim();

  // An address anywhere in the text wins: it is unambiguous.
  const addr = s.match(/0x[0-9a-fA-F]{40}/);
  if (addr) {
    // Reject a longer hex run, which is a tx hash or calldata rather than an address.
    const longer = s.match(/0x[0-9a-fA-F]{41,}/);
    if (!longer) {
      if (addr[0] !== s) notes.push("picked the address out of the surrounding text");
      return { kind: "address", value: addr[0].toLowerCase(), raw: original.trim(), note: notes.join("; ") || undefined };
    }
    notes.push("the hex string is too long to be an address");
    return { kind: "unknown", value: "", raw: original.trim(), note: notes.join("; ") || undefined };
  }

  // Strip common label prefixes, then take the first whitespace-free token
  // that looks like a host or URL.
  s = s.replace(/^(?:address|site|url|link|domain|contract|token)\s*[:=-]\s*/i, "");
  // Strip decoration from the token itself, not just the ends of the whole
  // string: a link quoted mid-sentence keeps its quotes otherwise, and they
  // end up punycoded into the hostname.
  const candidate = (s.split(/\s+/).find((t) => /\./.test(t)) ?? "")
    .replace(LEADING_PUNCT, "")
    .replace(TRAILING_PUNCT, "");
  if (candidate) {
    const withScheme = /:\/\//.test(candidate) ? candidate : `https://${candidate}`;
    try {
      const u = new URL(withScheme);
      const host = u.hostname.toLowerCase().replace(/\.$/, "");
      // A hostname needs a dot and a plausible TLD.
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || host.includes("xn--")) {
        if (!/:\/\//.test(candidate)) notes.push("assumed https://");
        // A hostname that only becomes ASCII via punycode used non-Latin
        // characters, which is how homograph lookalikes are built.
        if (host.includes("xn--")) {
          notes.push("the hostname uses non-Latin characters, which is how lookalike domains are built");
        }
        if (candidate !== s.trim()) notes.push("picked the link out of the surrounding text");
        const hasPath = u.pathname !== "/" || u.search !== "";
        return {
          kind: "domain",
          value: host,
          raw: original.trim(),
          url: hasPath ? u.toString() : undefined,
          note: notes.join("; ") || undefined,
        };
      }
    } catch {
      // Falls through to unknown.
    }
  }

  return { kind: "unknown", value: "", raw: original.trim(), note: notes.join("; ") || undefined };
}

// ---- Approval risk model ----
//
// Pure and testable on purpose: this is the calibration that decides what a
// beginner is warned about, so it is covered by unit tests rather than only by
// live scans. `import type` is erased at build time, so depending on the
// GoPlus detail shape here does not pull in a server-only module.

import type { ApprovalSecurity } from "./intel/goplus";

export type ApprovalRisk = "critical" | "high" | "medium" | "low";

export interface RiskInput {
  unlimited: boolean;
  knownProtocol: boolean;
  protocolName?: string;
  onScamList: boolean;
  approval: ApprovalSecurity | null;
  reputationChecked: boolean;
}

export interface RiskOutcome {
  risk: ApprovalRisk;
  reasons: string[];
  disputed: boolean;
  note?: string;
}

/**
 * Rate one approval.
 *
 * An unlimited allowance is NOT by itself a high risk. Almost every real use
 * of Uniswap, 1inch, CoW, Seaport or Aave leaves an unlimited approval behind,
 * so treating that alone as high buries the few approvals that can actually
 * drain a wallet. High and critical need a real signal: a scam-list hit,
 * GoPlus malicious behaviour, a spender that is not a contract at all, or a
 * closed-source contract nobody recognises.
 */
export function assessRisk(input: RiskInput): RiskOutcome {
  const { unlimited, knownProtocol, protocolName, onScamList, approval, reputationChecked } = input;
  const reasons: string[] = [];

  const serious = (approval?.maliciousBehavior ?? []).filter((b) => b !== "blacklist_doubt");
  const flaggedMalicious = onScamList || serious.length > 0;
  const trustedByGoPlus = Boolean(approval?.trustList || approval?.tag);
  const named = Boolean(approval?.contractName);
  const recognised = knownProtocol || trustedByGoPlus;
  const spenderIsEOA = approval?.isContract === false;
  const notOpenSource = approval?.isOpenSource === false;
  const unrecognised = !recognised && !named;

  // A flagged contract that is also a widely used protocol is a disagreement
  // between sources, not a settled verdict. Saying "critical" there would tell
  // a beginner to panic about Uniswap or 0x.
  const disputed = flaggedMalicious && knownProtocol;

  // Positive signals first, so the reasons read as an assessment.
  if (protocolName) reasons.push(`The spender is ${protocolName}, a widely used protocol contract.`);
  else if (approval?.trustList) reasons.push("GoPlus lists this spender on its trusted-contract list.");
  else if (approval?.tag) reasons.push(`GoPlus tags this spender as ${approval.tag}.`);
  else if (approval?.contractName) reasons.push(`GoPlus identifies the spender contract as "${approval.contractName}".`);

  if (onScamList) reasons.push("The spender is on ScamSniffer's public scam address blacklist.");
  if (serious.length) reasons.push(`GoPlus links the spender to ${serious.join(", ").replace(/_/g, " ")}.`);
  if (disputed) {
    reasons.push(
      "Disputed: GoPlus flags this contract, but it is a widely used protocol contract, so the flag is more likely a false positive than proof of theft. Treat it as worth reviewing, not as a confirmed drainer.",
    );
  }
  if (spenderIsEOA && !knownProtocol) {
    reasons.push("The spender is a plain address, not a contract. Real protocols are contracts, so an approval to one is a strong warning sign.");
  }
  if (notOpenSource && unrecognised) {
    reasons.push("The spender contract is not open source and no source recognises it, so its behaviour cannot be reviewed.");
  }
  if (approval?.doubtList && !serious.length) reasons.push("GoPlus lists the spender as a suspected blacklist entry.");
  if (approval?.riskyApproval && !disputed) reasons.push(`GoPlus: ${approval.riskyApproval}`);
  if (!reputationChecked) {
    reasons.push("Spender reputation was not checked for this approval: this scan caps how many lookups it makes.");
  }

  let risk: ApprovalRisk;
  if (flaggedMalicious && !knownProtocol) risk = "critical";
  else if (disputed) risk = "medium";
  else if (spenderIsEOA) risk = "high";
  else if (notOpenSource && unrecognised) risk = "high";
  else if (approval?.doubtList || approval?.riskyApprovalFlagged) risk = "medium";
  else if (unlimited && !recognised) risk = "medium";
  else risk = "low";

  let note: string | undefined;
  if (unlimited) {
    reasons.push("The allowance is unlimited, so the spender can move the whole balance at any time.");
    if (!flaggedMalicious) {
      note = recognised
        ? "This is a normal approval to a recognised protocol. Nothing here suggests an attack, but you can still consider limiting the amount or revoking it when you are done using the protocol."
        : "Consider limiting this allowance to the amount you actually need, or revoking it when you are done.";
    }
  }

  if (!reasons.length) reasons.push("No source reports this spender, and the allowance is limited.");
  return { risk, reasons, disputed, note };
}

