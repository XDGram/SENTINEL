// Turning Watchdog's written output into something worth listening to.
//
// Pure and dependency-free on purpose, so the rules below are unit tested
// rather than discovered by ear. Synthesis costs roughly one credit per
// character and takes about a second per two words, so every character that
// reaches the voice has to earn its place.

/** Hard ceiling on what is sent for synthesis: ~10 s of audio, ~360 credits. */
export const MAX_SPEECH_CHARS = 320;

/** A requested breakdown may run longer, since the user asked to hear it out. */
export const MAX_BREAKDOWN_CHARS = 700;

/** Longest input accepted before trimming, to reject obvious abuse early. */
export const MAX_SPEECH_INPUT = 2000;

/**
 * Evidence tags such as [R1], [I2], [S3] or [A1] are the written trace's
 * citations. Read aloud they become "bracket R one", which is noise.
 */
const CITATION_TAG = /\[(?:[RISA]\d{1,2}|\d{1,2})\]/g;

/** A full 0x address: 40 hex characters read aloud is unusable and expensive. */
const FULL_ADDRESS = /0x[0-9a-fA-F]{40}\b/g;

/** Long hex that is not an address (a transaction hash, for example). */
const LONG_HEX = /0x[0-9a-fA-F]{41,}\b/g;

const URL_RE = /\bhttps?:\/\/\S+/gi;

const MARKDOWN = /[*_`#>]+/g;

/**
 * Make a written sentence speakable. Removes what only makes sense on screen
 * and leaves the wording otherwise untouched, so the voice says what the user
 * is reading.
 */
export function sanitiseSpeech(raw: string): string {
  return raw
    .slice(0, MAX_SPEECH_INPUT)
    .replace(CITATION_TAG, "")
    .replace(URL_RE, "that link")
    .replace(FULL_ADDRESS, "this address")
    .replace(LONG_HEX, "this transaction")
    .replace(MARKDOWN, "")
    // Curly quotes read fine but confuse some engines' prosody.
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    // Tidy punctuation left stranded by the removals above.
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?]){2,}/g, "$1")
    .trim();
}

/** Split into sentences, keeping their terminators. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Trim to a character budget at the nearest sentence end, falling back to a
 * word boundary. Never cuts mid-word, which the voice would mispronounce.
 */
export function clampSpeech(text: string, max = MAX_SPEECH_CHARS): string {
  if (text.length <= max) return text;
  const parts = sentences(text);
  let out = "";
  for (const s of parts) {
    if (!out) {
      if (s.length <= max) out = s;
      else break;
    } else if (`${out} ${s}`.length <= max) {
      out = `${out} ${s}`;
    } else {
      break;
    }
  }
  if (out) return out;
  // A single sentence longer than the budget: cut at a word and close it off.
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, "")}…`;
}

export interface SpeechSource {
  headline?: string;
  explanation?: string;
}

/**
 * What Watchdog says out loud about a verdict: the headline, then one short
 * sentence of the explanation. The full explanation would run past twenty
 * seconds, which is too slow for the moment a transaction is paused.
 */
export function composeVerdictSpeech(input: SpeechSource): string {
  const headline = sanitiseSpeech(input.headline ?? "");
  const explanation = sanitiseSpeech(input.explanation ?? "");
  const first = sentences(explanation)[0] ?? "";

  if (!headline && !first) return "";
  if (!headline) return clampSpeech(first);
  if (!first) return clampSpeech(ensureStop(headline));

  return clampSpeech(`${ensureStop(headline)} ${first}`);
}

/** A headline is often written without a full stop; the voice needs the pause. */
function ensureStop(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** Speakable form of a free-text answer, such as a reply from /api/ask. */
export function composeAnswerSpeech(answer: string): string {
  return clampSpeech(sanitiseSpeech(answer));
}

export interface BreakdownSource {
  headline?: string;
  explanation?: string;
  /** What the user was about to do, in plain words. */
  action?: string;
  /** The sources that flagged it, e.g. ["GoPlus", "ScamSniffer"]. */
  flaggedBy?: string[];
  /** The safe action Watchdog offers. */
  fix?: string;
}

/**
 * The longer, spoken breakdown of a finding: what you were about to do, what
 * is wrong with it, who else says so, and what to do instead. Only produced on
 * request, because it takes noticeably longer to synthesise than a headline.
 */
export function composeBreakdownSpeech(input: BreakdownSource): string {
  const parts: string[] = [];
  const headline = sanitiseSpeech(input.headline ?? "");
  const explanation = sanitiseSpeech(input.explanation ?? "");
  const action = sanitiseSpeech(input.action ?? "");
  const fix = sanitiseSpeech(input.fix ?? "");
  const flagged = (input.flaggedBy ?? []).filter(Boolean);

  if (action) parts.push(`Here is what you were about to do. ${ensureStop(action)}`);
  if (headline) parts.push(ensureStop(headline));
  if (explanation) parts.push(ensureStop(explanation));

  if (flagged.length === 1) {
    parts.push(`${flagged[0]} reports this as malicious.`);
  } else if (flagged.length > 1) {
    const last = flagged[flagged.length - 1];
    parts.push(`${flagged.slice(0, -1).join(", ")} and ${last} all report this as malicious.`);
  }

  if (fix) parts.push(`What to do: ${ensureStop(fix)}`);

  return clampSpeech(parts.join(" ").replace(/\s+/g, " ").trim(), MAX_BREAKDOWN_CHARS);
}
