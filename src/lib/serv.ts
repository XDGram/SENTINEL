// SERV Reasoning client: the reasoning core of Watchdog.
// Server-only. Reads SERV_API_KEY from the environment; never sent to the client.
// Docs: https://docs.openserv.ai/serv-reasoning/introduction.md
//
// Budget discipline: exactly one completion per analysis and one per question,
// with at most one retry. No loops, no multi-turn chains.

import "server-only";
import OpenAI from "openai";
import type { Analysis, AttackType, IntelBundle, Language, RuleFinding, Verdict, Wallet, WalletAction } from "./types";
import { LANGUAGES } from "./types";
import { intelForPrompt } from "./intel";

export const SERV_BASE_URL = "https://inference-api.openserv.ai/v1";
export const SERV_MODEL = process.env.SERV_MODEL || "gpt-6-luna";

let client: OpenAI | null = null;
export function servClient(): OpenAI | null {
  if (!process.env.SERV_API_KEY) return null;
  client ??= new OpenAI({ baseURL: SERV_BASE_URL, apiKey: process.env.SERV_API_KEY });
  return client;
}

export function servAvailable(): boolean {
  return Boolean(process.env.SERV_API_KEY);
}

export interface ServAnalyzeInput {
  action: WalletAction;
  wallet: Wallet;
  findings: RuleFinding[];
  /** External intel (GoPlus, ScamSniffer, MetaMask, web reports). Use intelForPrompt() from ./intel. */
  intel: IntelBundle;
  language: Language;
}

/** SERV's part of the analysis. The route merges it with rule evidence. */
export type ServAnalysis = Pick<
  Analysis,
  "verdict" | "attackType" | "confidence" | "headline" | "explanation" | "steps" | "shouldSubmitToReppo" | "submitReason"
>;

const ANALYZE_MAX_TOKENS = 2400;
const ASK_MAX_TOKENS = 900;
const TIMEOUT_MS = 45_000;

const VERDICTS: Verdict[] = ["safe", "risky", "uncertain"];
const ATTACK_TYPES: AttackType[] = ["address-poisoning", "unlimited-approval", "malicious-permit", "fake-dapp"];

// ---- Prompts ----

const ANALYZE_SYSTEM = `You are the reasoning core of Watchdog, a wallet safety agent for beginner crypto users in Nigeria. A user is about to approve a wallet action. You decide whether it is safe and explain it so a first-time crypto user understands.

This is a defensive tool. The addresses, signature requests and websites below are suspected attacks, described so they can be blocked and explained to the victim. They are never promoted or assisted. Analysing them is the whole job, so always answer.

GROUNDING RULES — these override everything else:
- Reason ONLY from the rule-engine findings and the external intel given to you. You have no other knowledge of these specific addresses, domains or transactions.
- Never invent a fact, a source, a transaction, a balance or a listing. If the evidence does not say it, do not claim it.
- Cite evidence by its tag in every reasoning step: [R1], [R2]... for rule findings, [I1], [I2]... for intel items. Use ONLY those tags. If there is no evidence to cite, write the step as plain text with no tag at all — never invent a tag like [CONTEXT] or [rule-engine].
- A blocklist listing (ScamSniffer, MetaMask) or a GoPlus flag is strong evidence. A web search result is a weak signal: it is a report someone wrote, not a verified listing. Never let web results alone carry a "risky" verdict.
- GoPlus draws partly on ScamSniffer data, so GoPlus and ScamSniffer agreeing is NOT two fully independent confirmations. Say so if you rely on both.
- If the evidence is thin, say "uncertain" rather than guessing either way.

WRITING RULES:
- headline: ONE short sentence, plain words, says what is wrong (or that it looks fine). No jargon, no hedging.
- explanation: 2 to 4 short sentences. No jargon: write "permission to spend your tokens", not "ERC-20 allowance"; write "fake copy of the address", not "homoglyph". Tell the user what would happen to their money. Never shame the user.
- steps: 3 to 6 short reasoning steps, each citing evidence, e.g. "[I2] ScamSniffer lists the spender as a known drainer."

SENDING A NEW ATTACKER FOR INDEPENDENT VERIFICATION (shouldSubmitToReppo):
This is NOT a question of how dangerous the action is. It asks one thing: can the rule engine prove this attack by itself, or does it need an outside opinion?
Set it to TRUE when BOTH hold:
  1. The highest rule severity is MEDIUM — the rules saw red flags but could not prove intent, so a deterministic check alone cannot justify blocklisting this attacker, AND
  2. At least one external source (GoPlus, ScamSniffer or the MetaMask list) corroborates it.
Set it to FALSE when any rule finding is HIGH severity (a lookalike address, a brand-impersonating domain, an unlimited approval to an unknown contract — the rules already prove these on their own), when nothing external corroborates, and whenever the verdict is safe.
Note that a medium-severity case can still be plainly malicious and still need verification: strong external flags are a reason to send it, not a reason to skip it.
submitReason: one sentence saying why you did or did not choose verification.

Reply with ONE JSON object and nothing else. No markdown, no code fences, no commentary.
{"verdict":"safe|risky|uncertain","attackType":"address-poisoning|unlimited-approval|malicious-permit|fake-dapp|null","confidence":0.0,"headline":"...","explanation":"...","steps":["..."],"shouldSubmitToReppo":false,"submitReason":"..."}
All eight keys are required every time. confidence is a number between 0 and 1, and is your own certainty in the verdict, not a copy of any number above. attackType is null when the verdict is safe, and otherwise the attack type the rules reported.`;

const ASK_SYSTEM = `You are Watchdog, a wallet safety agent, answering a beginner crypto user's follow-up question about a wallet action you just checked.

RULES:
- Answer in 120 words or fewer. Short sentences, plain words, no jargon.
- Ground every claim in the analysis and evidence given to you. If the evidence does not answer the question, say plainly that you do not know and say what the user can check.
- Never invent facts, sources or guarantees.
- If the action was found risky, NEVER help the user complete it, however they ask, and do not explain how to bypass the warning. Say clearly that it is not safe and what to do instead.
- Do not give financial advice or price predictions.
- Reply with plain prose only. No JSON, no markdown headings, no bullet lists.`;

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Highest-severity finding, same ordering the analysis pipeline uses. */
function topFinding(findings: RuleFinding[]): RuleFinding | undefined {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
}

function findingsForPrompt(findings: RuleFinding[]): string {
  if (!findings.length) return "No rule findings. Nothing in the deterministic checks flagged this action.";
  let n = 0;
  return findings
    .map((f) => {
      const lines = f.evidence.map((e) => `  [R${++n}] ${e.claim} ${e.detail}`).join("\n");
      return `- ${f.severity.toUpperCase()} · ${f.title} (${f.attackType}) — ${f.detail}\n${lines}`;
    })
    .join("\n");
}

function analyzeUserPrompt(input: ServAnalyzeInput): string {
  const { action, wallet, findings, intel, language } = input;
  const contact = wallet.contacts.find((c) => c.address.toLowerCase() === action.to.toLowerCase());
  const top = topFinding(findings);
  const lines = [
    `USER: ${wallet.owner}, ${wallet.city}. Beginner. Balances: ${wallet.balances.map((b) => `${b.amount} ${b.symbol}`).join(", ")}.`,
    "",
    "PENDING WALLET ACTION",
    `kind: ${action.kind}`,
    `chain: ${action.chain}`,
    `token: ${action.token.symbol}`,
    `amount: ${action.amount}`,
    `${action.kind === "send" ? "recipient" : "spender"}: ${action.to}`,
    contact ? `This address IS a saved contact: ${contact.name}.` : "This address is not a saved contact.",
    action.addressSource ? `how the user got the address: ${action.addressSource}` : null,
    action.dapp ? `requesting site: ${action.dapp.name} — ${action.dapp.url}` : "no website involved",
    action.typedData ? `signature request (EIP-712): ${JSON.stringify(action.typedData)}` : null,
    "",
    "RULE-ENGINE FINDINGS (deterministic, no AI)",
    findingsForPrompt(findings),
    `Highest rule severity: ${top ? top.severity.toUpperCase() : "none"}${
      top ? ` · attack type from the rules: ${top.attackType}` : ""
    }.`,
    "",
    "EXTERNAL INTEL",
    intelForPrompt(intel),
    "",
    `Write headline, explanation and steps in ${LANGUAGES[language] ?? "English"}.`,
    "Reply with the JSON object only.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

// ---- JSON parsing ----

/** Pull a JSON object out of a model reply that may be fenced or padded with prose. */
function extractJson(text: string): unknown {
  let s = text.trim();
  // Strip ``` or ```json fences.
  const fence = s.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // Fall back to the outermost braces.
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Read a field under any of its plausible names. There is no JSON mode on SERV,
 * and the model does drift between camelCase and snake_case between calls
 * (`attack_type`, `reasoning_steps`), so accept the variants rather than
 * throwing away an otherwise good analysis.
 */
function pick(o: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (o[n] !== undefined && o[n] !== null) return o[n];
  }
  return undefined;
}

function asString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/**
 * A reasoning step should be a string, but the model sometimes returns an
 * object such as {tag, step} or {tag, reason}. Flatten those into the one
 * readable line the UI expects instead of dropping the whole analysis.
 */
function stepToString(v: unknown): string | null {
  if (typeof v === "string") return asString(v, 400);
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const parts = ["tag", "step", "reason", "text", "detail", "description", "evidence"]
    .map((k) => (typeof o[k] === "string" ? (o[k] as string).trim() : ""))
    .filter(Boolean);
  // Unknown key names: fall back to every string value on the object.
  const joined = (parts.length ? parts : Object.values(o).filter((x): x is string => typeof x === "string")).join(" ");
  return asString(joined, 400);
}

/**
 * Validate the model's JSON into a ServAnalysis, or null if it is unusable.
 * Anything the model gets wrong structurally means we fall back to rules,
 * rather than showing a half-parsed analysis.
 */
function validate(raw: unknown, input: ServAnalyzeInput): ServAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const rawVerdict = pick(o, "verdict");
  const verdict = VERDICTS.includes(rawVerdict as Verdict) ? (rawVerdict as Verdict) : null;
  const headline = asString(pick(o, "headline"), 200);
  const explanation = asString(pick(o, "explanation", "summary"), 1200);
  if (!verdict || !headline || !explanation) return null;

  const rawSteps = pick(o, "steps", "reasoning_steps", "reasoningSteps", "reasoning");
  const steps = Array.isArray(rawSteps)
    ? rawSteps.map(stepToString).filter((s): s is string => Boolean(s)).slice(0, 6)
    : [];
  if (steps.length < 1) return null;

  const at = pick(o, "attackType", "attack_type");
  const modelAttackType = typeof at === "string" && ATTACK_TYPES.includes(at as AttackType) ? (at as AttackType) : null;

  const { findings, intel } = input;
  const hasEvidence = findings.length > 0 || intel.flaggedBy.length > 0;
  const hasHighSeverity = findings.some((f) => f.severity === "high");
  const hasMediumSeverity = findings.some((f) => f.severity === "medium");
  const top = topFinding(findings);

  // The model sometimes drops attackType. Inherit the rule engine's label
  // rather than leaving a risky verdict unclassified: it comes from the
  // deterministic findings, so nothing is invented.
  const attackType = modelAttackType ?? top?.attackType ?? null;

  // The model often omits confidence entirely. Rather than a flat placeholder,
  // derive it from how strong the evidence actually is.
  const independentFlags = intel.flaggedBy.filter((s) => s !== "web").length;
  const rawConf = Number(pick(o, "confidence", "confidence_score"));
  const confidence = Number.isFinite(rawConf)
    ? Math.max(0, Math.min(1, rawConf > 1 ? rawConf / 100 : rawConf))
    : hasHighSeverity && independentFlags > 0
      ? 0.95
      : hasHighSeverity || independentFlags > 1
        ? 0.85
        : hasEvidence
          ? 0.75
          : 0.8;

  // A risky or uncertain verdict with no rule finding and no flagged source
  // would be the model asserting something nothing in the evidence supports.
  const grounded: Verdict = verdict !== "safe" && !hasEvidence ? "safe" : verdict;

  // The submit decision is the model's, but the server enforces the policy
  // around it: never for a case the rules already prove, never without
  // external corroboration, never for a safe verdict.
  const modelWantsSubmit = pick(o, "shouldSubmitToReppo", "should_submit_to_reppo", "submitToReppo") === true;
  const shouldSubmitToReppo =
    modelWantsSubmit && grounded !== "safe" && !hasHighSeverity && hasMediumSeverity && intel.flaggedBy.length > 0;
  const submitReason =
    asString(pick(o, "submitReason", "submit_reason"), 400) ??
    (shouldSubmitToReppo ? "Sent for independent verification." : "Not sent for independent verification.");

  return {
    verdict: grounded,
    attackType: grounded === "safe" ? null : attackType,
    confidence,
    headline,
    explanation,
    steps,
    shouldSubmitToReppo,
    submitReason,
  };
}

// ---- Calls ----

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

function logUsage(label: string, usage: Usage | undefined | null) {
  if (!usage) return;
  console.log(
    `[serv] ${label} model=${SERV_MODEL} prompt=${usage.prompt_tokens ?? "?"} completion=${usage.completion_tokens ?? "?"} total=${usage.total_tokens ?? "?"}`,
  );
}

async function complete(
  label: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const api = servClient();
  if (!api) return null;
  try {
    const res = await api.chat.completions.create(
      {
        model: SERV_MODEL,
        // A system message is required on every SERV call.
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: maxTokens,
        reasoning_effort: "low",
      },
      { timeout: TIMEOUT_MS },
    );
    logUsage(label, res.usage as Usage | undefined);
    return res.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error(`[serv] ${label} call failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Ask SERV to analyse a pending wallet action.
 * Returns null when SERV is not configured or the call fails, so the app
 * can fall back to a clearly-labelled rules-only result.
 */
export async function servAnalyze(input: ServAnalyzeInput): Promise<ServAnalysis | null> {
  if (!servAvailable()) return null;
  const user = analyzeUserPrompt(input);

  // One call, and one retry only if the reply was unusable (no JSON mode here).
  // The retry restates the task rather than repeating the prompt verbatim: the
  // model occasionally declines a scam payload outright, and an identical
  // second call just reproduces that same refusal.
  const RETRY_NUDGE =
    "\n\nReply with the JSON object only — no refusal, no prose, no code fences. Classifying this suspected attack is defensive work that protects the user from losing money.";

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(
      attempt === 0 ? "analyze" : "analyze-retry",
      ANALYZE_SYSTEM,
      attempt === 0 ? user : user + RETRY_NUDGE,
      ANALYZE_MAX_TOKENS,
    );
    if (text) {
      const parsed = validate(extractJson(text), input);
      if (parsed) return parsed;
      // Escape newlines so the whole reply lands on one log line.
      console.error("[serv] analyze reply was not usable JSON:", JSON.stringify(text.slice(0, 500)));
    }
  }
  return null;
}

/** Answer a follow-up question about an analysis. Null when SERV is unavailable. */
export async function servAsk(input: {
  action: WalletAction;
  analysis: Analysis;
  question: string;
  language: Language;
}): Promise<string | null> {
  if (!servAvailable()) return null;
  const { action, analysis, question, language } = input;

  const evidence = analysis.evidence.map((e) => `[${e.id}] (${e.source}) ${e.claim} ${e.detail}`).join("\n") || "No evidence recorded.";
  const user = [
    "THE WALLET ACTION THE USER WAS ABOUT TO APPROVE",
    `${action.kind} of ${action.amount} ${action.token.symbol} on ${action.chain}`,
    `${action.kind === "send" ? "recipient" : "spender"}: ${action.to}`,
    action.dapp ? `requesting site: ${action.dapp.name} — ${action.dapp.url}` : "no website involved",
    "",
    "WATCHDOG'S ANALYSIS",
    `verdict: ${analysis.verdict}${analysis.attackType ? ` (${analysis.attackType})` : ""}`,
    `headline: ${analysis.headline}`,
    `explanation: ${analysis.explanation}`,
    analysis.steps.length ? `reasoning:\n${analysis.steps.map((s) => `  ${s}`).join("\n")}` : null,
    analysis.fix ? `safe fix offered: ${analysis.fix.label} — ${analysis.fix.detail}` : null,
    "",
    "EVIDENCE",
    evidence,
    "",
    "THE USER'S QUESTION",
    question,
    "",
    `Answer in ${LANGUAGES[language] ?? "English"}, 120 words or fewer.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const text = await complete("ask", ASK_SYSTEM, user, ASK_MAX_TOKENS);
  const answer = text?.trim();
  return answer ? answer : null;
}

// ---- Universal threat check and wallet scan ----
//
// Both reuse the same defensive JSON handling as servAnalyze: alias-tolerant
// field lookup, object-shaped steps flattened, and null on anything unusable
// so the caller falls back to a sources-only result.

const CHECK_SYSTEM = `You are Watchdog, a wallet safety agent for beginner crypto users. Someone has pasted an address, a contract, a token or a link — often forwarded from WhatsApp or Telegram — and wants to know whether it is safe before they touch it.

This is a defensive tool. Whatever is described below is a suspected scam being checked so it can be blocked and explained to the victim. It is never promoted or assisted. Analysing it is the whole job, so always answer.

GROUNDING RULES — these override everything else:
- Reason ONLY from the source findings given to you. You have no other knowledge of this specific address, contract or domain.
- Never invent a fact, a source, a balance, a transaction or a listing. Never state a number that is not in the findings.
- Cite evidence by its tag in every step: [S1], [S2]... Use ONLY those tags. If there is nothing to cite, write the step as plain text with no tag.
- A blocklist listing (ScamSniffer, MetaMask) or a GoPlus malicious flag is strong evidence. A web report is a weak signal.
- GoPlus draws partly on ScamSniffer data, so the two agreeing is not two fully independent confirmations. Say so if you rely on both.
- "Not on a blocklist" is NOT evidence of safety. Most scams are too new to be listed. If nothing is flagged, say the checks found nothing rather than declaring it safe, and prefer "uncertain" over "safe" for anything the user cannot otherwise verify.
- An address being an EOA rather than a contract is not itself bad, but a token or dApp that should be a contract and is not is a red flag.

WRITING RULES:
- headline: ONE short sentence in plain words.
- explanation: 2 to 4 short sentences, no jargon, telling the user what this means for their money.
- whatToDo: one or two sentences of concrete advice. Never help the user proceed with something risky.

worthVerifying asks whether this attacker should be sent for independent verification. Verification is not about grading your writing: a verified attacker enters a shared threat memory that blocks it instantly for every future user, so it is worth doing whenever the indicator really is malicious. Set it true when at least one source flagged this and you agree it is malicious. Set it false when nothing was flagged, when the evidence is too thin to be sure, or when the subject looks legitimate.

Reply with ONE JSON object and nothing else. No markdown, no code fences, no commentary. Every key below is required, and "verdict" must be the first one:
{"verdict":"safe|risky|uncertain","confidence":0.0,"headline":"...","explanation":"...","steps":["..."],"whatToDo":"...","worthVerifying":false,"verifyReason":"..."}
confidence is a number between 0 and 1.`;

const SCAN_SYSTEM = `You are Watchdog, a wallet safety agent for beginner crypto users. You are explaining the result of a scan of the user's own wallet for token approvals — standing permissions that let another address move their tokens.

This is a defensive tool, and it is strictly read-only: it can only read allowances and prepare a revoke transaction the user signs themselves. You never move funds and must never claim to have done so, or offer to.

GROUNDING RULES — these override everything else:
- Reason ONLY from the approval findings and coverage notes given to you. You have no other knowledge of this wallet.
- Never invent an approval, a balance, a token, a spender or a number. Every amount you mention must appear in the findings exactly as given.
- Cite findings by tag: [A1], [A2]... Use ONLY those tags.
- Respect the coverage limits you are given. The scan is incomplete by design, so never imply the wallet is fully clean. If no approvals were found, say plainly that none were found WITHIN the scan's limits, and state the main limit.
- An approval to a recognised protocol is normal and not an attack, even when the amount is unlimited. Almost every real use of a swap or lending app leaves one behind. Say which approvals are actually dangerous and which are merely untidy, and do not alarm the user about ordinary ones.
- An unlimited amount on its own is NOT evidence of an attack. Only a scam-list hit, a GoPlus malicious-behaviour flag, a spender that is not a contract, or an unrecognised closed-source contract makes an approval dangerous.
- A finding marked "(disputed)" means a source flags a contract that is nonetheless a widely used protocol. Report it as worth reviewing and say the sources disagree. Never tell the user a widely used protocol has stolen from them.
- You may be shown only the most important findings out of a larger total. Never imply the list is complete when the total says otherwise.

WRITING RULES:
- headline: ONE short sentence in plain words.
- explanation: 2 to 4 short sentences a first-time crypto user understands. Explain that an approval is a standing permission, not a payment.
- revokeFirst: the tokens/spenders to revoke first, most urgent first, as short strings like "USDT approval to 0x4341…a67b". Empty array if there is nothing to revoke.
- whatToDo: one or two sentences. Say that the user signs the revoke themselves from their own wallet.

Reply with ONE JSON object and nothing else. No markdown, no code fences, no commentary.
{"riskLevel":"none|low|medium|high|critical","headline":"...","explanation":"...","steps":["..."],"revokeFirst":["..."],"whatToDo":"...","coverageNote":"..."}
All seven keys are required. coverageNote states, in one sentence a beginner understands, what this scan could not see.`;

const CHECK_MAX_TOKENS = 1800;
const SCAN_MAX_TOKENS = 1800;

export type CheckSubject = "address" | "contract" | "token" | "website";

export interface ServCheck {
  verdict: Verdict;
  subject: CheckSubject | null;
  confidence: number;
  headline: string;
  explanation: string;
  steps: string[];
  whatToDo: string;
  worthVerifying: boolean;
  verifyReason?: string;
}

const SUBJECTS: CheckSubject[] = ["address", "contract", "token", "website"];

function validateCheck(raw: unknown, anyFlagged: boolean, anyMalicious: boolean): ServCheck | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const headline = asString(pick(o, "headline"), 200);
  const explanation = asString(pick(o, "explanation", "summary"), 1200);
  if (!headline || !explanation) return null;

  // The model sometimes omits verdict. Derive it from the sources rather than
  // throwing the analysis away: flagged means risky, and an unflagged
  // indicator is "uncertain", never "safe" — absence from a blocklist is not
  // evidence of safety.
  const v = pick(o, "verdict");
  const verdict: Verdict = VERDICTS.includes(v as Verdict) ? (v as Verdict) : anyMalicious ? "risky" : "uncertain";

  const rawSteps = pick(o, "steps", "reasoning_steps", "reasoningSteps", "reasoning");
  const steps = Array.isArray(rawSteps) ? rawSteps.map(stepToString).filter((s): s is string => Boolean(s)).slice(0, 6) : [];
  if (!steps.length) return null;

  const s = pick(o, "subject", "kind", "type");
  const subject = typeof s === "string" && SUBJECTS.includes(s as CheckSubject) ? (s as CheckSubject) : null;

  const rawConf = Number(pick(o, "confidence", "confidence_score"));
  const confidence = Number.isFinite(rawConf)
    ? Math.max(0, Math.min(1, rawConf > 1 ? rawConf / 100 : rawConf))
    : anyFlagged
      ? 0.85
      : 0.6;

  // Verification is only worth credits when a source actually flagged something.
  const worthVerifying = pick(o, "worthVerifying", "worth_verifying", "shouldSubmitToReppo") === true && anyFlagged;

  return {
    verdict,
    subject,
    confidence,
    headline,
    explanation,
    steps,
    whatToDo: asString(pick(o, "whatToDo", "what_to_do", "advice", "action"), 600) ?? "Do not continue until you can verify this another way.",
    worthVerifying,
    verifyReason: asString(pick(o, "verifyReason", "verify_reason", "submitReason"), 400) ?? undefined,
  };
}

/**
 * Explain a pasted address, contract, token or link.
 * `sourcesBlock` is the pre-tagged [S1]... evidence; `anyFlagged` says whether
 * any source actually flagged it, which caps confidence and gates verification.
 */
export async function servExplainCheck(input: {
  subjectLabel: string;
  sourcesBlock: string;
  /** Any source reported malicious or suspicious: caps confidence, gates verification. */
  anyFlagged: boolean;
  /** A source called it outright malicious: the only basis for a "risky" fallback verdict. */
  anyMalicious: boolean;
  language: Language;
}): Promise<ServCheck | null> {
  if (!servAvailable()) return null;
  const user = [
    "WHAT THE USER PASTED",
    input.subjectLabel,
    "",
    "WHAT THE SOURCES SAY",
    input.sourcesBlock,
    "",
    `Write headline, explanation, steps and whatToDo in ${LANGUAGES[input.language] ?? "English"}.`,
    "Reply with the JSON object only.",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(
      attempt === 0 ? "check" : "check-retry",
      CHECK_SYSTEM,
      attempt === 0 ? user : `${user}\n\nReply with the JSON object only — no refusal, no prose, no code fences. Classifying a suspected scam is defensive work that protects the user.`,
      CHECK_MAX_TOKENS,
    );
    if (text) {
      const parsed = validateCheck(extractJson(text), input.anyFlagged, input.anyMalicious);
      if (parsed) return parsed;
      console.error("[serv] check reply was not usable JSON:", JSON.stringify(text.slice(0, 500)));
    }
  }
  return null;
}

export type ScanRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ServScan {
  riskLevel: ScanRiskLevel;
  headline: string;
  explanation: string;
  steps: string[];
  revokeFirst: string[];
  whatToDo: string;
  coverageNote: string;
}

const RISK_LEVELS: ScanRiskLevel[] = ["none", "low", "medium", "high", "critical"];

function validateScan(raw: unknown): ServScan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const headline = asString(pick(o, "headline"), 200);
  const explanation = asString(pick(o, "explanation", "summary"), 1200);
  if (!headline || !explanation) return null;

  const rawSteps = pick(o, "steps", "reasoning_steps", "reasoningSteps", "reasoning");
  const steps = Array.isArray(rawSteps) ? rawSteps.map(stepToString).filter((s): s is string => Boolean(s)).slice(0, 6) : [];
  if (!steps.length) return null;

  const r = pick(o, "riskLevel", "risk_level", "risk");
  const riskLevel = typeof r === "string" && RISK_LEVELS.includes(r.toLowerCase() as ScanRiskLevel) ? (r.toLowerCase() as ScanRiskLevel) : "medium";

  const rawFirst = pick(o, "revokeFirst", "revoke_first", "revoke");
  const revokeFirst = Array.isArray(rawFirst) ? rawFirst.map(stepToString).filter((s): s is string => Boolean(s)).slice(0, 8) : [];

  return {
    riskLevel,
    headline,
    explanation,
    steps,
    revokeFirst,
    whatToDo:
      asString(pick(o, "whatToDo", "what_to_do", "advice", "action"), 600) ??
      "Revoke the approvals listed above from your own wallet. Watchdog only prepares the transaction; you sign it.",
    coverageNote:
      asString(pick(o, "coverageNote", "coverage_note", "coverage", "limitations"), 600) ??
      "This scan does not cover every token or every spender, so it cannot prove the wallet is clean.",
  };
}

/**
 * Explain a wallet approval scan in plain English: what is risky, what to
 * revoke first, and what the scan could not see.
 * `scanBlock` is the pre-tagged [A1]... findings from scanForPrompt().
 */
export async function servExplainScan(input: {
  address: string;
  accountNote: string;
  scanBlock: string;
  coverage: string[];
  language: Language;
}): Promise<ServScan | null> {
  if (!servAvailable()) return null;
  const user = [
    `WALLET SCANNED: ${input.address}`,
    `ACCOUNT TYPE: ${input.accountNote}`,
    "",
    "LIVE APPROVALS FOUND",
    input.scanBlock,
    "",
    "WHAT THIS SCAN COULD NOT SEE (you must respect these limits)",
    ...input.coverage.map((c, i) => `${i + 1}. ${c}`),
    "",
    `Write headline, explanation, steps, revokeFirst, whatToDo and coverageNote in ${LANGUAGES[input.language] ?? "English"}.`,
    "Reply with the JSON object only.",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(
      attempt === 0 ? "scan" : "scan-retry",
      SCAN_SYSTEM,
      attempt === 0 ? user : `${user}\n\nReply with the JSON object only — no refusal, no prose, no code fences.`,
      SCAN_MAX_TOKENS,
    );
    if (text) {
      const parsed = validateScan(extractJson(text));
      if (parsed) return parsed;
      console.error("[serv] scan reply was not usable JSON:", JSON.stringify(text.slice(0, 500)));
    }
  }
  return null;
}
