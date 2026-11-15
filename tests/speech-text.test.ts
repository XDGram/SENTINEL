import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SPEECH_CHARS,
  clampSpeech,
  composeAnswerSpeech,
  composeVerdictSpeech,
  sanitiseSpeech,
} from "../src/lib/speech-text";

// ---- Sanitising: what makes sense on screen but not out loud ----

test("evidence citation tags are removed", () => {
  const out = sanitiseSpeech("GoPlus flags this [S1] and ScamSniffer lists it [S2].");
  assert.equal(out, "GoPlus flags this and ScamSniffer lists it.");
  assert.equal(sanitiseSpeech("[R1] The spender is unknown. [A12] Unlimited."), "The spender is unknown. Unlimited.");
});

test("a full address becomes words instead of forty hex characters", () => {
  const out = sanitiseSpeech("Do not approve 0x43412801d29861ecc4c4d86e5becfd16af86a67b today.");
  assert.equal(out, "Do not approve this address today.");
});

test("a long hex string is spoken as a transaction, not read out", () => {
  assert.equal(sanitiseSpeech(`Check 0x${"a".repeat(64)} first.`), "Check this transaction first.");
});

test("links are not read character by character", () => {
  assert.equal(sanitiseSpeech("Seen on https://usdt-rewards.xyz/claim now."), "Seen on that link now.");
});

test("markdown and curly quotes are normalised", () => {
  assert.equal(sanitiseSpeech("**Do not** sign `this`."), "Do not sign this.");
  assert.equal(sanitiseSpeech("It’s a “permit”."), 'It\'s a "permit".');
});

test("punctuation stranded by a removal is tidied", () => {
  assert.equal(sanitiseSpeech("Flagged by GoPlus [S1] , and ScamSniffer [S2] ."), "Flagged by GoPlus, and ScamSniffer.");
});

// ---- Clamping: never mid-word, prefer sentence ends ----

test("short text is left alone", () => {
  assert.equal(clampSpeech("Short enough."), "Short enough.");
});

test("clamping keeps whole sentences", () => {
  const text = `${"A".repeat(150)}. ${"B".repeat(150)}. ${"C".repeat(150)}.`;
  const out = clampSpeech(text, 320);
  assert.ok(out.length <= 320);
  assert.ok(out.endsWith("."));
  assert.ok(!out.includes("C"));
});

test("a single over-long sentence is cut at a word, not mid-word", () => {
  const text = `${"word ".repeat(200)}end.`;
  const out = clampSpeech(text, 100);
  assert.ok(out.length <= 101, `length was ${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(!/wor…$/.test(out));
});

// ---- Composing a verdict ----

test("a verdict is the headline plus one sentence of the explanation", () => {
  const out = composeVerdictSpeech({
    headline: "This link is flagged as a phishing site",
    explanation: "GoPlus and ScamSniffer both list usdt-rewards.xyz as a phishing domain [S1][S2]. The fact that MetaMask does not list it does not establish that it is safe [S3]. Connecting a wallet could put your funds at risk.",
  });
  assert.equal(
    out,
    "This link is flagged as a phishing site. GoPlus and ScamSniffer both list usdt-rewards.xyz as a phishing domain.",
  );
  assert.ok(out.length <= MAX_SPEECH_CHARS);
  assert.ok(!out.includes("[S"));
});

test("a headline without a full stop gains one, so the voice pauses", () => {
  const out = composeVerdictSpeech({ headline: "Watchdog paused this", explanation: "Two sources agree." });
  assert.equal(out, "Watchdog paused this. Two sources agree.");
});

test("a headline that already ends in punctuation is not double-stopped", () => {
  const out = composeVerdictSpeech({ headline: "Is this safe?", explanation: "Probably not." });
  assert.equal(out, "Is this safe? Probably not.");
});

test("either half alone still produces speech", () => {
  assert.equal(composeVerdictSpeech({ headline: "Only a headline" }), "Only a headline.");
  assert.equal(composeVerdictSpeech({ explanation: "Only an explanation." }), "Only an explanation.");
});

test("nothing to say produces an empty string, not a stray full stop", () => {
  assert.equal(composeVerdictSpeech({}), "");
  assert.equal(composeVerdictSpeech({ headline: "   ", explanation: "" }), "");
  assert.equal(composeVerdictSpeech({ headline: "[S1]" }), "");
});

test("a verdict never exceeds the synthesis budget", () => {
  const out = composeVerdictSpeech({
    headline: "A".repeat(300),
    explanation: `${"B".repeat(400)}.`,
  });
  assert.ok(out.length <= MAX_SPEECH_CHARS + 1, `length was ${out.length}`);
});

// ---- Composing an answer ----

test("an answer is sanitised and clamped", () => {
  const out = composeAnswerSpeech("Revoke it at 0x43412801d29861ecc4c4d86e5becfd16af86a67b [S1].");
  assert.equal(out, "Revoke it at this address.");
});
