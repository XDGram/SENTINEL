// Shared contracts. Every part of the app (UI, SERV, Reppo, threat memory)
// builds against these types, so change them with care.

export type ActionKind = "send" | "approve" | "permit" | "connect";

export type AttackType =
  | "address-poisoning"
  | "unlimited-approval"
  | "malicious-permit"
  | "fake-dapp";

export type Verdict = "safe" | "risky" | "uncertain";

export type Language = "en" | "pcm" | "ha" | "yo";

export const LANGUAGES: Record<Language, string> = {
  en: "English",
  pcm: "Pidgin",
  ha: "Hausa",
  yo: "Yorùbá",
};

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
}

/** Something the user is about to do in the wallet simulator. */
export interface WalletAction {
  id: string;
  kind: ActionKind;
  chain: string;
  from: string;
  /** Recipient for a send, spender for approve/permit. */
  to: string;
  token: Token;
  /** Human-readable amount, or "unlimited" for max approvals. */
  amount: string;
  /** Where the request came from, if a dApp asked for it. */
  dapp?: { name: string; url: string };
  /** EIP-712 typed data for permit signatures. */
  typedData?: Record<string, unknown>;
  /** How the user got the recipient address (e.g. copied from history). */
  addressSource?: "typed" | "address-book" | "copied-from-history" | "dapp";
}

export interface HistoryEntry {
  hash: string;
  direction: "in" | "out";
  counterparty: string;
  amount: string;
  token: string;
  at: string;
  /** Simulated flag: zero-value / dust transfer. */
  dust?: boolean;
}

export interface Contact {
  name: string;
  address: string;
}

export interface Wallet {
  id: "A" | "B";
  owner: string;
  city: string;
  address: string;
  balances: { symbol: string; amount: number; usd: number }[];
  contacts: Contact[];
  history: HistoryEntry[];
  approvals: { token: string; spender: string; spenderName: string; amount: string }[];
}

export type EvidenceSource = "rules" | "serv" | "threat-memory" | "chain" | "reppo" | "intel";

// ---- External threat intelligence ----

export type IntelSourceId = "goplus" | "scamsniffer" | "metamask" | "web";

/** What one external source says about one indicator. */
export interface IntelReport {
  source: IntelSourceId;
  /** Human name, e.g. "GoPlus Security", "ScamSniffer database", "Reddit". */
  sourceName: string;
  /** The indicator checked, e.g. "address:0x…", "domain:example.xyz". */
  indicator: string;
  verdict: "malicious" | "suspicious" | "clean" | "unknown" | "error";
  /** One-line summary of what the source says. */
  summary: string;
  url?: string;
  /** Upstream data providers, when the source says (for honesty about independence). */
  upstream?: string[];
  /** For web results: title and snippet of the page. */
  title?: string;
  snippet?: string;
  publishedAt?: string;
  fetchedAt: string;
}

export interface IntelBundle {
  reports: IntelReport[];
  /** Independent sources that flagged the indicator as malicious or suspicious. */
  flaggedBy: IntelSourceId[];
  /** Sources that were not configured or failed, so the UI can be honest. */
  unavailable: { source: IntelSourceId; reason: string }[];
  tookMs: number;
}

/** One claim with the evidence behind it. */
export interface Evidence {
  id: string;
  claim: string;
  source: EvidenceSource;
  detail: string;
  link?: string;
}

export type FixKind = "use-correct-address" | "cancel" | "revoke" | "reduce-allowance";

export interface SafeFix {
  kind: FixKind;
  label: string;
  detail: string;
  correctAddress?: string;
  correctName?: string;
}

/** Output of the deterministic rule engine (the independent, non-AI source). */
export interface RuleFinding {
  attackType: AttackType;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** Data that identifies this attack, used as the threat-memory key. */
  indicator: string;
  fix?: SafeFix;
  evidence: Evidence[];
}

export interface Analysis {
  verdict: Verdict;
  attackType: AttackType | null;
  /** 0..1 */
  confidence: number;
  /** One short sentence a beginner understands. */
  headline: string;
  /** Plain-language explanation, in the requested language. */
  explanation: string;
  /** Auditable step-by-step reasoning trace. */
  steps: string[];
  evidence: Evidence[];
  fix: SafeFix | null;
  /** Threat-memory key for this action, if suspicious. */
  fingerprint: string | null;
  /** Set when a Reppo-verified threat in memory caught this instantly. */
  matchedThreatId?: string;
  /** True when SERV Reasoning produced this analysis. */
  servUsed: boolean;
  servModel?: string;
  language: Language;
  /** SERV's decision: is this new attack worth sending to Reppo? */
  shouldSubmitToReppo: boolean;
  submitReason?: string;
  /** External intel gathered for this action (GoPlus, ScamSniffer, MetaMask, web reports). */
  intel?: IntelBundle;
  latencyMs?: number;
}

export type ThreatStatus = "discovered" | "submitted" | "verified" | "rejected" | "failed";

export interface Threat {
  id: string;
  fingerprint: string;
  attackType: AttackType;
  summary: string;
  indicator: string;
  status: ThreatStatus;
  reppoEvalId?: string;
  reppoScore?: number;
  reppoDecision?: "accept" | "revise" | "reject";
  reppoRoute?: string;
  discoveredAt: string;
  submittedAt?: string;
  verifiedAt?: string;
  caughtCount: number;
  lastCaughtAt?: string;
  /** Server-built evidence packet (JSON) sent to Reppo. Never taken from the client. */
  reppoPacket?: string;
  /** SERV's decision on whether this is worth verifying. */
  servRecommendsSubmit?: boolean;
  /** Independent external sources that flagged this attacker (GoPlus, ScamSniffer, ...). */
  externalSources?: IntelSourceId[];
}

export type ThreatEventKind = "discovered" | "submitted" | "verified" | "rejected" | "failed" | "caught";

export interface ThreatEvent {
  id: string;
  threatId: string;
  kind: ThreatEventKind;
  at: string;
  /** Which simulated user triggered it, if any. */
  walletId?: "A" | "B";
  detail: string;
}

/** Result of one background intel sweep (Sentinel actively gathering new threats). */
export interface IntelSweep {
  id: string;
  at: string;
  /** Blocklist sizes after refresh. */
  totals: { scamsnifferDomains: number; scamsnifferAddresses: number; metamaskBlacklist: number };
  /** Entries newly added since the previous sweep (sample; null on the first, baseline sweep). */
  newDomains: string[] | null;
  newAddresses: string[] | null;
  newDomainCount: number | null;
  newAddressCount: number | null;
  /** Fresh community reports of wallet attacks (Reddit, YouTube, X, blogs). */
  communityReports: IntelReport[];
  errors: string[];
}

// ---- API request / response shapes ----

export interface AnalyzeRequest {
  action: WalletAction;
  walletId: "A" | "B";
  language: Language;
}
export type AnalyzeResponse = Analysis;

export interface AskRequest {
  action: WalletAction;
  analysis: Analysis;
  question: string;
  language: Language;
}
export interface AskResponse {
  answer: string;
  servUsed: boolean;
}

export interface SubmitRequest {
  fingerprint: string;
  walletId: "A" | "B";
}
export interface SubmitResponse {
  threat: Threat;
  evalId?: string;
  status: "PENDING" | "SETTLED" | "FAILED" | "BLOCKED";
  message?: string;
}

export interface ThreatsResponse {
  threats: Threat[];
  events: ThreatEvent[];
}
