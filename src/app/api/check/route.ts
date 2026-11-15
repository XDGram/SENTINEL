import { NextResponse } from "next/server";
import { clientKey, rateLimit, takeServBudget } from "@/lib/guard";
import { normaliseInput, type NormalisedInput } from "@/lib/scan-abi";
import { accountCode } from "@/lib/wallet-scan";
import { goplusAddress, goplusApprovalSecurity, goplusSite, goplusTokenSecurity } from "@/lib/intel/goplus";
import { checkAddressLists, checkDomainLists } from "@/lib/intel/blocklists";
import { hostOf } from "@/lib/rules";
import { lookalikeBrand } from "@/lib/rules";
import { servAvailable, servExplainCheck, SERV_MODEL, type CheckSubject, type ServCheck } from "@/lib/serv";
import { TtlCache } from "@/lib/intel/shared";
import { createThreat } from "@/lib/store";
import type { AccountCode } from "@/lib/scan-abi";
import type { AttackType, IntelReport, IntelSourceId, Language } from "@/lib/types";

/** Languages SERV has been exercised in. */
const SUPPORTED_LANGUAGES: Language[] = ["en", "fr", "es"];

export const dynamic = "force-dynamic";

const RATE_LIMIT = Number(process.env.CHECK_RATE_LIMIT ?? 20);
const RATE_WINDOW_MS = 60_000;

interface CheckPayload {
  normalised: NormalisedInput;
  account?: AccountCode;
  reports: IntelReport[];
  flaggedBy: IntelSourceId[];
  brandImpersonated?: string;
  tokenInfo?: { name?: string; symbol?: string; risks: string[] };
  check: ServCheck | null;
}

const resultCache = new TtlCache<CheckPayload>(30 * 60_000, 200);


const flaggedSources = (reports: IntelReport[]): IntelSourceId[] => [
  ...new Set(reports.filter((r) => r.verdict === "malicious" || r.verdict === "suspicious").map((r) => r.source)),
];

/** Sources that called it outright malicious, not merely worth a second look. */
const maliciousSources = (reports: IntelReport[]): IntelSourceId[] => [
  ...new Set(reports.filter((r) => r.verdict === "malicious").map((r) => r.source)),
];

/** Tag the sources as [S1], [S2]... for the prompt, so steps can cite them. */
function sourcesForPrompt(reports: IntelReport[], extra: string[]): string {
  const lines = reports
    .filter((r) => r.verdict !== "error")
    .map((r, i) => `[S${i + 1}] ${r.sourceName} (${r.verdict}) ${r.indicator}: ${r.summary}`);
  lines.push(...extra.map((e, i) => `[S${reports.length + i + 1}] ${e}`));
  const errs = reports.filter((r) => r.verdict === "error").map((r) => `Source unavailable: ${r.sourceName} — ${r.summary}`);
  return [...lines, ...errs].join("\n") || "No source returned anything about this.";
}

export async function POST(req: Request) {
  const wait = rateLimit(`check:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (wait > 0) return NextResponse.json({ error: `Too many checks. Try again in ${wait}s.` }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { input?: unknown; language?: unknown } | null;
  const raw = typeof body?.input === "string" ? body.input : "";
  if (!raw.trim()) return NextResponse.json({ error: "input is required" }, { status: 400 });
  if (raw.length > 2000) return NextResponse.json({ error: "input is too long" }, { status: 400 });

  // Explanations can come back in a language the reader actually uses.
  const language: Language = SUPPORTED_LANGUAGES.includes(body?.language as Language) ? (body!.language as Language) : "en";

  const normalised = normaliseInput(raw);
  if (normalised.kind === "unknown") {
    return NextResponse.json(
      {
        error: "That does not look like a wallet address, a contract or a website link.",
        hint: "Paste a 0x address (42 characters) or a link such as example.com.",
        normalised,
      },
      { status: 400 },
    );
  }

  // The language is part of the key: without it, asking in French returns the
  // cached English answer, which is exactly what it looks like when the
  // language picker appears to do nothing.
  const cacheKey = `${language}:${normalised.kind}:${normalised.value}`;
  const cached = resultCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ ...respond(cached), cached: true });
  }

  const payload =
    normalised.kind === "address" ? await checkAddress(normalised) : await checkDomain(normalised);

  // ONE SERV call per check.
  let servNote: string | null = null;
  if (servAvailable()) {
    if (takeServBudget()) {
      const servCheck = await servExplainCheck({
        subjectLabel: subjectLabel(payload),
        sourcesBlock: sourcesForPrompt(payload.reports, extraEvidence(payload)),
        anyFlagged: payload.flaggedBy.length > 0,
        anyMalicious: maliciousSources(payload.reports).length > 0,
        language,
      });
      // The server knows what the subject actually is from eth_getCode and the
      // token lookup, so it does not depend on the model to classify it.
      payload.check = servCheck ? { ...servCheck, subject: subjectOf(payload) } : null;
      if (!payload.check) servNote = "SERV Reasoning did not return a usable answer, so this is a sources-only result.";
    } else {
      servNote = "Daily SERV budget reached, so this is a sources-only result without AI reasoning.";
    }
  } else {
    servNote = "SERV Reasoning is not connected, so this is a sources-only result.";
  }

  resultCache.set(cacheKey, payload);

  // Same learning loop as /api/analyze: a flagged indicator that SERV thinks is
  // worth verifying becomes a discovered threat. It enters threat memory only
  // after Reppo accepts it, which is a separate, server-gated step.
  let threatId: string | undefined;
  const malicious = maliciousSources(payload.reports);
  if (malicious.length > 0 && payload.check?.worthVerifying) {
    try {
      const threat = await createThreat({
        fingerprint: `${normalised.kind}:${normalised.value}`,
        attackType: attackTypeFor(payload),
        summary: `${payload.check.headline} Reported as malicious by: ${malicious.join(", ")}. Checked via /api/check.`,
        indicator: `${normalised.kind}:${normalised.value}`,
        reppoPacket: buildPacket(payload),
        servRecommendsSubmit: true,
        externalSources: payload.flaggedBy,
      });
      threatId = threat.id;
    } catch (err) {
      console.error("createThreat from /api/check failed", err);
    }
  }

  return NextResponse.json({ ...respond(payload), servNote, threatId });
}

// ---- Address and contract ----

async function checkAddress(n: NormalisedInput): Promise<CheckPayload> {
  const address = n.value;
  const [account, gpAddress, lists] = await Promise.all([
    accountCode(address),
    goplusAddress(address),
    checkAddressLists(address),
  ]);

  const reports: IntelReport[] = [gpAddress, ...lists];
  let tokenInfo: CheckPayload["tokenInfo"];

  // A contract can be an approval target and may be a token, so check both.
  if (account.kind === "contract") {
    const [approval, token] = await Promise.all([goplusApprovalSecurity(address), goplusTokenSecurity(address)]);
    reports.push(approval.report);
    if (token.detail) {
      reports.push(token.report);
      tokenInfo = { name: token.detail.tokenName, symbol: token.detail.tokenSymbol, risks: token.detail.risks };
    }
  }

  return { normalised: n, account, reports, flaggedBy: flaggedSources(reports), tokenInfo, check: null };
}

// ---- Website ----

async function checkDomain(n: NormalisedInput): Promise<CheckPayload> {
  const host = hostOf(n.value);
  const [site, lists] = await Promise.all([goplusSite(host), checkDomainLists(host)]);
  const reports: IntelReport[] = [site, ...lists];
  const brand = lookalikeBrand(host) ?? undefined;
  return { normalised: n, reports, flaggedBy: flaggedSources(reports), brandImpersonated: brand, check: null };
}

// ---- Prompt and response shaping ----

function subjectLabel(p: CheckPayload): string {
  const n = p.normalised;
  if (n.kind === "address") {
    const kind =
      p.account?.kind === "contract"
        ? `a smart contract (${p.account.size} bytes of code)`
        : p.account?.kind === "delegated-eoa"
          ? `an EIP-7702 delegated wallet, still key-controlled, delegating to ${p.account.delegatesTo}`
          : "an ordinary wallet address (EOA), with no contract code";
    return [
      `An Ethereum address: ${n.value}`,
      `On-chain, this address is ${kind}.`,
      p.tokenInfo ? `GoPlus recognises it as a token: ${p.tokenInfo.name ?? "?"} (${p.tokenInfo.symbol ?? "?"}).` : null,
      n.note ? `The pasted text had to be cleaned up: ${n.note}.` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `A website: ${n.value}`,
    n.url ? `Full link pasted: ${n.url}` : null,
    p.brandImpersonated
      ? `Watchdog's rule engine notes that this hostname contains the brand name of ${p.brandImpersonated} but is NOT that domain.`
      : null,
    n.note ? `The pasted text had to be cleaned up: ${n.note}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Rule-engine and on-chain observations that are not source reports. */
function extraEvidence(p: CheckPayload): string[] {
  const out: string[] = [];
  if (p.brandImpersonated) {
    out.push(
      `Watchdog rule engine: the hostname ${p.normalised.value} borrows the brand name of ${p.brandImpersonated} without being that domain. This is the classic fake-dApp pattern.`,
    );
  }
  if (p.account?.kind === "delegated-eoa") {
    out.push(`On-chain: the address is an EIP-7702 delegated EOA, delegating execution to ${p.account.delegatesTo}. It is key-controlled, not a contract.`);
  }
  if (p.account?.kind === "eoa") {
    out.push("On-chain: the address has no contract code, so it is an ordinary wallet, not a token or dApp contract.");
  }
  if (p.tokenInfo?.risks.length) out.push(`GoPlus token risk flags: ${p.tokenInfo.risks.join("; ")}.`);
  return out;
}

/** What the subject is, decided on-chain rather than by the model. */
function subjectOf(p: CheckPayload): CheckSubject {
  if (p.normalised.kind === "domain") return "website";
  if (p.tokenInfo) return "token";
  if (p.account?.kind === "contract") return "contract";
  return "address";
}

function attackTypeFor(p: CheckPayload): AttackType {
  if (p.normalised.kind === "domain") return "fake-dapp";
  return "unlimited-approval";
}

function buildPacket(p: CheckPayload): string {
  return JSON.stringify(
    {
      disclosure:
        "Checked through Watchdog's /api/check endpoint on a real indicator pasted by a user. Every source lookup and the SERV analysis were live calls. No part of this is simulated.",
      subject: { kind: p.normalised.kind, value: p.normalised.value, pastedAs: p.normalised.raw, cleanup: p.normalised.note },
      onChain: p.account ?? null,
      ruleEngine: p.brandImpersonated ? { brandImpersonation: p.brandImpersonated } : null,
      tokenSecurity: p.tokenInfo ?? null,
      watchdogAnalysis: p.check
        ? {
            verdict: p.check.verdict,
            confidence: p.check.confidence,
            headline: p.check.headline,
            explanation: p.check.explanation,
            reasoningSteps: p.check.steps,
            whatToDo: p.check.whatToDo,
            model: SERV_MODEL,
          }
        : null,
      flaggingSources: p.flaggedBy,
      caveats: [
        "Absence from a blocklist is not evidence of safety; most scams are too new to be listed.",
        "GoPlus draws partly on ScamSniffer data, so a GoPlus flag and a ScamSniffer flag are not two fully independent confirmations.",
      ],
      externalSources: p.reports
        .filter((r) => r.verdict !== "error")
        .map((r) => ({ source: r.sourceName, verdict: r.verdict, indicator: r.indicator, summary: r.summary, url: r.url })),
    },
    null,
    2,
  );
}

function respond(p: CheckPayload) {
  return {
    input: p.normalised.raw,
    normalised: { kind: p.normalised.kind, value: p.normalised.value, url: p.normalised.url, cleanup: p.normalised.note },
    account: p.account,
    brandImpersonated: p.brandImpersonated,
    token: p.tokenInfo,
    result: p.check,
    servUsed: Boolean(p.check),
    servModel: p.check ? SERV_MODEL : undefined,
    flaggedBy: p.flaggedBy,
    evidence: p.reports,
    honesty:
      p.flaggedBy.length > 0
        ? "At least one public source reports this indicator. That is strong evidence, but Watchdog still shows you every source so you can judge."
        : "No public source reports this indicator. That is NOT proof it is safe: most scams are too new to be listed anywhere.",
  };
}
