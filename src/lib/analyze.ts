// The analysis pipeline:
// 1. Rule engine (independent, non-AI evidence)
// 2. Threat memory: a Reppo-verified match is caught instantly, no SERV call
// 3. SERV Reasoning: verdict, plain-language explanation, reasoning trace,
//    and the decision whether a new attack is worth sending to Reppo
// 4. Rules-only fallback, clearly labelled, if SERV is unavailable

import "server-only";
import type { Analysis, AnalyzeRequest, AttackType, Evidence, RuleFinding } from "./types";
import { fingerprintOf, indicatorsOf, runRules, shortAddr } from "./rules";
import { initialWallets } from "./sim-data";
import { servAnalyze, SERV_MODEL } from "./serv";
import { createThreat, findVerifiedThreat, recordCatch } from "./store";

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
      detail: `First seen ${new Date(known.discoveredAt).toLocaleString()}. Verified by Reppo evaluation ${known.reppoEvalId ?? "n/a"}${
        known.reppoScore != null ? ` (score ${known.reppoScore}/100, ${known.reppoDecision})` : ""
      }.`,
      link: known.reppoEvalId ? `https://eval.reppo.xyz/evals` : undefined,
    };
    return {
      verdict: "risky",
      attackType: known.attackType,
      confidence: 0.99,
      headline: `Stopped: this is a known ${ATTACK_LABEL[known.attackType]} attack.`,
      explanation: `Another Sentinel user met this same attacker earlier. The attack was checked and verified by Reppo, so Sentinel blocked it for you straight away. ${known.summary}`,
      steps: [
        `Rules extracted indicators: ${indicators.join(", ")}.`,
        `Threat memory lookup matched verified threat ${known.id}.`,
        "Verified threats are blocked instantly without a new SERV call.",
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

  // 3. SERV Reasoning
  const serv = await servAnalyze({ action: req.action, wallet, findings, language: req.language });

  const base = serv ?? rulesOnly(findings);
  const analysis: Analysis = {
    ...base,
    evidence: [...ruleEvidence],
    fix: base.verdict === "safe" ? null : (top?.fix ?? null),
    fingerprint,
    servUsed: Boolean(serv),
    servModel: serv ? SERV_MODEL : undefined,
    language: serv ? req.language : "en",
    latencyMs: Date.now() - started,
  };

  if (!serv) {
    analysis.steps = ["SERV Reasoning is not connected. This is a rules-only result.", ...analysis.steps];
  }

  // New suspicious pattern: remember it as "discovered" (not trusted until Reppo verifies).
  if (fingerprint && analysis.verdict !== "safe" && top && top.severity !== "low") {
    await createThreat({
      fingerprint,
      attackType: analysis.attackType ?? top.attackType,
      summary: summaryFor(top, req.action.dapp?.url),
      indicator: top.indicator,
      walletId: req.walletId,
      reppoPacket: buildReppoPacket(req, analysis, findings),
      servRecommendsSubmit: analysis.servUsed && analysis.shouldSubmitToReppo,
    });
  }

  return analysis;
}

/** The evidence packet Reppo evaluates: SERV's trace plus the independent rule evidence. */
function buildReppoPacket(req: AnalyzeRequest, analysis: Analysis, findings: RuleFinding[]): string {
  const a = req.action;
  return JSON.stringify(
    {
      note: "Simulated wallet scenario from the Sentinel demo. Addresses are illustrative.",
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
        reasoningSteps: analysis.steps,
        model: analysis.servModel ?? "rules-only",
      },
      independentRuleEvidence: findings.map((f) => ({
        severity: f.severity,
        title: f.title,
        evidence: f.evidence.map((e) => `${e.claim} ${e.detail}`),
      })),
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
function rulesOnly(findings: RuleFinding[]) {
  const top = topFinding(findings);
  if (!top || top.severity === "low") {
    return {
      verdict: "safe" as const,
      attackType: null,
      confidence: top ? 0.6 : 0.8,
      headline: top ? "Looks OK, but double-check the address." : "No problems found.",
      explanation: top
        ? top.detail
        : "The recipient is in your saved contacts and nothing unusual was found.",
      steps: findings.map((f) => `Rule: ${f.title}.`),
      shouldSubmitToReppo: false,
    };
  }
  return {
    verdict: top.severity === "high" ? ("risky" as const) : ("uncertain" as const),
    attackType: top.attackType,
    confidence: top.severity === "high" ? 0.85 : 0.55,
    headline: top.title,
    explanation: top.detail,
    steps: findings.map((f) => `Rule (${f.severity}): ${f.title}. ${f.detail}`),
    shouldSubmitToReppo: false,
  };
}
