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
      claim: "This exact attacker is already in Watchdog's verified threat memory.",
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
      explanation: `Another Watchdog user met this same attacker earlier. The attack was checked against public scam sources and verified by Reppo, so Watchdog blocked it for you straight away. ${known.summary}`,
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

  // Nothing to reason about: a saved contact, no rule findings, no source flags.
  // Answer deterministically and save the SERV call.
  const isContact = wallet.contacts.find((c) => c.address.toLowerCase() === req.action.to.toLowerCase());
  if (isContact && findings.length === 0 && intel.flaggedBy.length === 0 && !req.action.dapp) {
    return {
      verdict: "safe",
      attackType: null,
      confidence: 0.9,
      headline: `Safe: this is ${isContact.name}'s saved address.`,
      explanation: `You are sending to ${isContact.name}, exactly as saved in your contacts. No warning signs were found and no scam database lists this address.`,
      steps: [
        `Recipient matches saved contact "${isContact.name}" character for character.`,
        "Rule engine: no lookalike address, approval or signature risk.",
        "No external source flags this address.",
        "No AI reasoning needed for a clean payment to a saved contact.",
      ],
      evidence: [{ id: "c1", source: "rules", claim: `Matches your saved contact ${isContact.name}.`, detail: req.action.to }],
      fix: null,
      fingerprint: null,
      servUsed: false,
      language: req.language,
      shouldSubmitToReppo: false,
      intel,
      latencyMs: Date.now() - started,
    };
  }

  // 4. SERV Reasoning
  // The language is part of the key: without it, asking in French returns the
  // cached English answer.
  const cacheKey = JSON.stringify([req.language, req.walletId, req.action, intel.flaggedBy, findings.map((f) => f.indicator + f.severity)]);
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
  // Calibrate: don't claim near-certainty unless the rules are conclusive or
  // two genuinely independent sources agree.
  const independent = independentSources(intel);
  const cap = (top?.severity === "high" || independent.length >= 2) ? 0.95 : 0.85;
  base.confidence = Math.min(base.confidence, cap);
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

/** Flagging sources after merging ones that share upstream data (GoPlus draws on ScamSniffer). */
function independentSources(intel: IntelBundle): string[] {
  const flagged = intel.reports.filter((r) => r.verdict === "malicious" || r.verdict === "suspicious");
  // If GoPlus says any of its data comes from ScamSniffer, treat all GoPlus flags
  // in this bundle as the same line of evidence as ScamSniffer.
  const goplusUsesSS = intel.reports.some((r) => r.source === "goplus" && r.upstream?.some((u) => /scamsniffer/i.test(u)));
  const groups = new Set<string>();
  for (const r of flagged) {
    if (r.source === "web") continue;
    groups.add(r.source === "goplus" && goplusUsesSS ? "scamsniffer" : r.source);
  }
  return [...groups];
}

/** Honest caveats Reppo's evaluators should see next to the conclusion. */
function caveatsFor(intel: IntelBundle): string[] {
  const out: string[] = [];
  const gp = intel.reports.find((r) => r.source === "goplus" && r.upstream?.some((u) => /scamsniffer/i.test(u)));
  if (gp && intel.flaggedBy.includes("scamsniffer")) {
    out.push(`GoPlus lists ${gp.upstream!.join(", ")} as its data sources, so the GoPlus and ScamSniffer flags are not fully independent; they count as one line of evidence.`);
  }
  for (const r of intel.reports) {
    if (r.source !== "web" && (r.verdict === "unknown" || r.verdict === "clean")) {
      out.push(`${r.sourceName} has no malicious entry for ${r.indicator} (${r.verdict}). Absence from one list is not evidence of safety, but it is not corroboration either.`);
    }
  }
  for (const u of intel.unavailable) out.push(`Source not consulted: ${u.source} (${u.reason})`);
  return out;
}

/** The evidence packet Reppo evaluates: SERV's trace, rule evidence and external sources. */
function buildReppoPacket(req: AnalyzeRequest, analysis: Analysis, findings: RuleFinding[], intel: IntelBundle): string {
  const a = req.action;
  return JSON.stringify(
    {
      simulationDisclosure:
        "The victim wallet, its balance, history and the request itself are simulated by Watchdog's demo. The attacker indicators (spender address and website) are real entries in public scam databases, and every source lookup and the SERV analysis were live calls.",
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
        safeFix: analysis.fix ? `${analysis.fix.label}: ${analysis.fix.detail}` : "Cancel the request; do not sign or send.",
        model: analysis.servModel ?? "rules-only",
      },
      sourceIndependence: {
        independentFlaggingSources: independentSources(intel),
        caveats: caveatsFor(intel),
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
