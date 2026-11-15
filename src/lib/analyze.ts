// The analysis pipeline:
// 1. Rule engine: deterministic, on-chain-style evidence (no AI)
// 2. Threat memory: a Reppo-verified match is caught instantly, no SERV call
// 3. Intel gathering: GoPlus, ScamSniffer, MetaMask list, web community reports
// 4. SERV Reasoning: verdict, plain-language explanation, cited reasoning trace,
//    and the decision whether a new attack is worth sending to Reppo
// 5. Rules + intel fallback, clearly labelled, if SERV is unavailable

import "server-only";
import type { Analysis, AnalyzeRequest, AttackType, Evidence, IntelBundle, IntelReport, RuleFinding } from "./types";
import { fingerprintOf, indicatorsOf, runRules, shortAddr } from "./rules";
import { initialWallets } from "./sim-data";
import { servAnalyze, servAvailable, SERV_MODEL } from "./serv";
import { createThreat, findVerifiedThreat, recordCatch } from "./store";
import { gatherIntel } from "./intel";
import { takeServBudget } from "./guard";
import { TtlCache } from "./intel/shared";
import type { ServAnalysis } from "./serv";

// Same action + same evidence → reuse SERV's answer (saves credits on repeat demos).
const servCache = new TtlCache<ServAnalysis>(60 * 60_000, 200);

const ATTACK_LABEL: Record<AttackType, string> = {
  "address-poisoning": "address poisoning",
  "unlimited-approval": "unlimited approval drain",
  "malicious-permit": "malicious permit signature",
  "fake-dapp": "fake website",
};

export async function analyzeAction(req: AnalyzeRequest): Promise<Analysis> {
  const started = Date.now();
  const wallet = initialWallets()[req.walletId];
  const findings = runRules(req.action, wallet);
  const fingerprint = fingerprintOf(findings);
  const ruleEvidence = findings.flatMap((f) => f.evidence);
  const top = topFinding(findings);

  // 2. Threat memory
  const indicators = indicatorsOf(findings);
  const known = indicators.length ? await findVerifiedThreat(indicators) : null;
  if (known) {
    await recordCatch(known.id, req.walletId, `Blocked for ${wallet.owner} before signing: ${known.summary}`);
    const memoryEvidence: Evidence = {
      id: "mem",
      source: "threat-memory",
      claim: "This exact attacker is already in Sentinel's verified threat memory.",
      detail: `First seen ${new Date(known.discoveredAt).toUTCString()}. Verified by Reppo evaluation ${known.reppoEvalId ?? "n/a"}${
        known.reppoScore != null ? ` (score ${known.reppoScore}/100, ${known.reppoDecision})` : ""
      }.${known.externalSources?.length ? ` Also flagged by: ${known.externalSources.join(", ")}.` : ""}`,
      link: known.reppoEvalId ? "https://eval.reppo.xyz/evals" : undefined,
    };
    return {
      verdict: "risky",
      attackType: known.attackType,
      confidence: 0.99,
      headline: `Stopped: this is a known ${ATTACK_LABEL[known.attackType]} attack.`,
      explanation: `Another Sentinel user met this same attacker earlier. The attack was checked against public scam sources and verified by Reppo, so Sentinel blocked it for you straight away. ${known.summary}`,
      steps: [
        `Rules extracted indicators: ${indicators.join(", ")}.`,
        `Threat memory lookup matched verified threat ${known.id}.`,
        "Verified threats are blocked instantly, without a new SERV call or source lookups.",
      ],
      evidence: [memoryEvidence, ...ruleEvidence],
      fix: top?.fix ?? { kind: "cancel", label: "Cancel", detail: "Do not continue." },
      fingerprint,
      matchedThreatId: known.id,
      servUsed: false,
      language: req.language,
      shouldSubmitToReppo: false,
      latencyMs: Date.now() - started,
    };
  }

  // 3. External intel
  const intel = await gatherIntel(req.action, wallet, findings);
  const intelEvidence = intelToEvidence(intel);

  // 4. SERV Reasoning
  const cacheKey = JSON.stringify([req.walletId, req.action, intel.flaggedBy, findings.map((f) => f.indicator + f.severity)]);
  let serv = servCache.get(cacheKey) ?? null;
  let servNote: string | null = null;
  if (!serv && servAvailable()) {
    if (takeServBudget()) {
      serv = await servAnalyze({ action: req.action, wallet, findings, intel, language: req.language });
      if (serv) servCache.set(cacheKey, serv);
    } else {
      servNote = "Daily SERV budget reached, so this is a rules + sources result without AI reasoning.";
    }
  }

  const base = serv ?? fallback(findings, intel);
  const analysis: Analysis = {
    ...base,
    evidence: [...ruleEvidence, ...intelEvidence],
    fix: base.verdict === "safe" ? null : (top?.fix ?? null),
    fingerprint,
    servUsed: Boolean(serv),
    servModel: serv ? SERV_MODEL : undefined,
    language: serv ? req.language : "en",
    intel,
    latencyMs: Date.now() - started,
  };

  if (!serv) {
    analysis.steps = [servNote ?? "SERV Reasoning is not connected. This is a rules + sources result without AI reasoning.", ...analysis.steps];
  }

  // New suspicious pattern: remember it as "discovered" (not trusted until Reppo verifies).
  if (fingerprint && analysis.verdict !== "safe" && top && top.severity !== "low") {
    await createThreat({
      fingerprint,
      attackType: analysis.attackType ?? top.attackType,
      summary: summaryFor(top, req.action.dapp?.url),
      indicator: top.indicator,
      walletId: req.walletId,
      reppoPacket: buildReppoPacket(req, analysis, findings, intel),
      servRecommendsSubmit: analysis.servUsed && analysis.shouldSubmitToReppo,
      externalSources: intel.flaggedBy,
    });
  }

  return analysis;
}

function intelToEvidence(intel: IntelBundle): Evidence[] {
  // Show what sources found; skip "unknown"/"error" noise, but keep clean results
  // from blocklists out of the evidence list (they aren't evidence of an attack).
  const relevant = (r: IntelReport) =>
    r.verdict === "malicious" || r.verdict === "suspicious" || (r.source === "web" && r.verdict === "unknown" && !!r.title);
  return intel.reports.filter(relevant).map((r, i) => ({
    id: `i${i + 1}`,
    source: "intel" as const,
    claim:
      r.source === "web"
        ? `${r.sourceName}: ${r.title ?? r.summary}`
        : r.summary,
    detail:
      r.source === "web"
        ? `${r.summary}${r.snippet ? ` "${r.snippet.slice(0, 200)}…"` : ""}`
        : `${r.sourceName} · checked ${r.indicator}${r.upstream?.length ? ` · upstream data: ${r.upstream.join(", ")}` : ""}`,
    link: r.url,
  }));
}

/** The evidence packet Reppo evaluates: SERV's trace, rule evidence and external sources. */
function buildReppoPacket(req: AnalyzeRequest, analysis: Analysis, findings: RuleFinding[], intel: IntelBundle): string {
  const a = req.action;
  return JSON.stringify(
    {
      note: "Wallet scenario from the Sentinel demo simulator. The attacker indicators are checked against real public sources.",
      action: {
        kind: a.kind,
        chain: a.chain,
        token: a.token.symbol,
        amount: a.amount,
        counterparty: a.to,
        site: a.dapp?.url,
        typedData: a.typedData,
        addressSource: a.addressSource,
      },
      sentinelAnalysis: {
        verdict: analysis.verdict,
        attackType: analysis.attackType,
        confidence: analysis.confidence,
        headline: analysis.headline,
        explanation: analysis.explanation,
        reasoningSteps: analysis.steps,
        model: analysis.servModel ?? "rules-only",
      },
      ruleEvidence: findings.map((f) => ({
        severity: f.severity,
        title: f.title,
        evidence: f.evidence.map((e) => `${e.claim} ${e.detail}`),
      })),
      externalSources: intel.reports
        .filter((r) => r.verdict !== "error")
        .map((r) => ({ source: r.sourceName, verdict: r.verdict, indicator: r.indicator, summary: r.summary, url: r.url, title: r.title })),
    },
    null,
    2,
  );
}

function topFinding(findings: RuleFinding[]): RuleFinding | undefined {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity])[0];
}

function summaryFor(f: RuleFinding, url?: string): string {
  const who = f.indicator.split(":")[1];
  const short = who?.startsWith("0x") ? shortAddr(who) : who;
  return `${f.title}: ${f.detail} Attacker ${short}${url ? ` via ${new URL(url).hostname}` : ""}.`;
}

/** Fallback when SERV is unavailable. Honest: no AI, English only. */
function fallback(findings: RuleFinding[], intel: IntelBundle) {
  const top = topFinding(findings);
  const flagged = intel.flaggedBy.filter((s) => s !== "web");
  const sourceSteps = flagged.length ? [`External sources flagged this: ${flagged.join(", ")}.`] : [];
  if (!top || top.severity === "low") {
    if (flagged.length) {
      return {
        verdict: "risky" as const,
        attackType: top?.attackType ?? null,
        confidence: 0.8,
        headline: "Public scam databases have flagged this address or site.",
        explanation: `Independent sources (${flagged.join(", ")}) report this as malicious.`,
        steps: [...findings.map((f) => `Rule: ${f.title}.`), ...sourceSteps],
        shouldSubmitToReppo: false,
      };
    }
    return {
      verdict: "safe" as const,
      attackType: null,
      confidence: top ? 0.6 : 0.8,
      headline: top ? "Looks OK, but double-check the address." : "No problems found.",
      explanation: top ? top.detail : "The recipient is in your saved contacts and nothing unusual was found.",
      steps: findings.map((f) => `Rule: ${f.title}.`),
      shouldSubmitToReppo: false,
    };
  }
  const risky = top.severity === "high" || flagged.length > 0;
  return {
    verdict: risky ? ("risky" as const) : ("uncertain" as const),
    attackType: top.attackType,
    confidence: top.severity === "high" ? 0.85 : flagged.length ? 0.75 : 0.55,
    headline: top.title,
    explanation: top.detail,
    steps: [...findings.map((f) => `Rule (${f.severity}): ${f.title}. ${f.detail}`), ...sourceSteps],
    shouldSubmitToReppo: false,
  };
}
