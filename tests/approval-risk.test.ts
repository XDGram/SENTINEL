import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk, type RiskInput } from "../src/lib/scan-abi";
import type { ApprovalSecurity } from "../src/lib/intel/goplus";

/** A GoPlus result for an ordinary, open-source, unflagged contract. */
const cleanContract = (over: Partial<ApprovalSecurity> = {}): ApprovalSecurity => ({
  isContract: true,
  isOpenSource: true,
  trustList: false,
  doubtList: false,
  maliciousBehavior: [],
  riskyApprovalFlagged: false,
  ...over,
});

const rate = (over: Partial<RiskInput> = {}) =>
  assessRisk({
    unlimited: false,
    knownProtocol: false,
    onScamList: false,
    approval: cleanContract(),
    reputationChecked: true,
    ...over,
  });

// ---- The calibration that matters: unlimited is not, by itself, alarming ----

test("unlimited to a recognised protocol is low risk, not high", () => {
  const out = rate({ unlimited: true, knownProtocol: true, protocolName: "Uniswap Permit2" });
  assert.equal(out.risk, "low");
  assert.equal(out.disputed, false);
  assert.match(out.note ?? "", /consider limiting/i);
  assert.ok(out.reasons.some((r) => /widely used protocol/i.test(r)));
});

test("unlimited to a GoPlus-trusted contract is low risk", () => {
  assert.equal(rate({ unlimited: true, approval: cleanContract({ trustList: true }) }).risk, "low");
  assert.equal(rate({ unlimited: true, approval: cleanContract({ tag: "UniswapV3" }) }).risk, "low");
});

test("unlimited to an unrecognised but open-source contract is medium, not high", () => {
  const out = rate({ unlimited: true });
  assert.equal(out.risk, "medium");
  assert.match(out.note ?? "", /consider limiting/i);
});

test("a limited allowance to an unrecognised open-source contract is low", () => {
  assert.equal(rate({ unlimited: false }).risk, "low");
});

// ---- High and critical require a real signal ----

test("a scam-list hit is critical, unlimited or not", () => {
  assert.equal(rate({ onScamList: true }).risk, "critical");
  assert.equal(rate({ onScamList: true, unlimited: true }).risk, "critical");
});

test("GoPlus malicious behaviour is critical", () => {
  const out = rate({ approval: cleanContract({ maliciousBehavior: ["phishing_activities"] }) });
  assert.equal(out.risk, "critical");
  assert.ok(out.reasons.some((r) => /phishing activities/i.test(r)));
});

test("blacklist_doubt alone is not critical", () => {
  const out = rate({ approval: cleanContract({ maliciousBehavior: ["blacklist_doubt"], doubtList: true }) });
  assert.equal(out.risk, "medium");
});

test("a spender that is not a contract is high", () => {
  assert.equal(rate({ approval: cleanContract({ isContract: false }) }).risk, "high");
});

test("a closed-source, unrecognised contract is high", () => {
  assert.equal(rate({ approval: cleanContract({ isOpenSource: false }) }).risk, "high");
});

test("closed source is not high when the contract is recognised", () => {
  assert.equal(rate({ approval: cleanContract({ isOpenSource: false, trustList: true }) }).risk, "low");
  assert.equal(
    rate({ approval: cleanContract({ isOpenSource: false }), knownProtocol: true, protocolName: "Aave V3 Pool" }).risk,
    "low",
  );
});

// ---- Disputed: a source flags a widely used protocol ----

test("a flagged known protocol is disputed and medium, never critical", () => {
  // The real case: GoPlus flags 0x AllowanceHolder for phishing_activities and
  // stealing_attack, yet it is the genuine, open-source 0x contract.
  const out = rate({
    unlimited: true,
    knownProtocol: true,
    protocolName: "0x AllowanceHolder",
    approval: cleanContract({
      contractName: "AllowanceHolder",
      doubtList: true,
      maliciousBehavior: ["phishing_activities", "stealing_attack"],
      riskyApproval: "This spender is suspected to have potential risks.",
      riskyApprovalFlagged: true,
    }),
  });
  assert.equal(out.risk, "medium");
  assert.equal(out.disputed, true);
  assert.ok(out.reasons.some((r) => /^Disputed:/.test(r)));
  assert.ok(out.reasons.some((r) => /widely used protocol contract/i.test(r)));
});

test("a scam-listed address that is NOT a known protocol stays critical", () => {
  const out = rate({ onScamList: true, knownProtocol: false });
  assert.equal(out.risk, "critical");
  assert.equal(out.disputed, false);
});

// ---- Honesty about what was not checked ----

test("an unchecked spender says so and is not rated high on no evidence", () => {
  const out = rate({ unlimited: true, approval: null, reputationChecked: false });
  assert.equal(out.risk, "medium");
  assert.ok(out.reasons.some((r) => /reputation was not checked/i.test(r)));
});

test("a flagged approval gets no 'consider limiting' note", () => {
  const out = rate({ unlimited: true, onScamList: true });
  assert.equal(out.note, undefined);
});

// ---- Vitalik's reported distribution: the regression this fixes ----

test("a wallet of ordinary protocol approvals produces no high or critical", () => {
  const protocols = ["Uniswap Permit2", "Uniswap SwapRouter02", "OpenSea Seaport 1.6", "Aave V3 Pool", "1inch Aggregation Router V6"];
  const rated = protocols.map((protocolName) =>
    rate({ unlimited: true, knownProtocol: true, protocolName }),
  );
  assert.equal(rated.filter((r) => r.risk === "high" || r.risk === "critical").length, 0);
  assert.ok(rated.every((r) => r.risk === "low"));
});
