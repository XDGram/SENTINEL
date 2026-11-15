import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintOf, isLookalike, matchingEdges, runRules } from "../src/lib/rules";
import { AIRDROP_SPENDER, CHIDI, DRAINER_SPENDER, FAKE_ROUTER, initialWallets, POISONER, SCENARIOS } from "../src/lib/sim-data";

const wallets = initialWallets();
const scenario = (id: string) => {
  const s = SCENARIOS.find((x) => x.id === id);
  assert.ok(s, `scenario ${id} exists`);
  return s;
};
const run = (id: string) => {
  const s = scenario(id);
  return runRules(s.action, wallets[s.walletId]);
};

test("lookalike detection compares first and last 4 hex characters", () => {
  assert.equal(isLookalike(CHIDI, POISONER), true);
  assert.equal(isLookalike(CHIDI, CHIDI), false);
  assert.equal(isLookalike(CHIDI, FAKE_ROUTER), false);
  const e = matchingEdges(CHIDI, POISONER);
  assert.ok(e.start >= 4 && e.end >= 4);
});

test("address poisoning: high severity, bait evidence, and a fix to the real contact", () => {
  const f = run("a-pay-chidi");
  const p = f.find((x) => x.attackType === "address-poisoning");
  assert.ok(p);
  assert.equal(p.severity, "high");
  assert.equal(p.fix?.correctAddress, CHIDI);
  assert.ok(p.evidence.some((e) => e.source === "chain"), "zero-value bait transfer is cited");
  assert.equal(fingerprintOf(f), `address:${POISONER.toLowerCase()}`);
});

test("new permit attack is medium (uncertain) so SERV and Reppo decide", () => {
  const f = run("a-rewards");
  const p = f.find((x) => x.attackType === "malicious-permit");
  assert.ok(p);
  assert.equal(p.severity, "medium");
  assert.equal(fingerprintOf(f), `spender:${DRAINER_SPENDER.toLowerCase()}`);
});

test("same drainer on a different site gives the same fingerprint (learning loop key)", () => {
  assert.equal(fingerprintOf(run("a-rewards")), fingerprintOf(run("b-bonus")));
});

test("second new attacker (airdrop permit) is medium with its own fingerprint", () => {
  const f = run("a-airdrop");
  const p = f.find((x) => x.attackType === "malicious-permit");
  assert.ok(p);
  assert.equal(p.severity, "medium");
  assert.ok(!f.some((x) => x.severity === "high"), "no high-severity finding, so SERV and Reppo decide");
  assert.equal(fingerprintOf(f), `spender:${AIRDROP_SPENDER.toLowerCase()}`);
  assert.notEqual(fingerprintOf(f), fingerprintOf(run("a-rewards")), "not the already-verified drainer");
});

test("fake Uniswap site: fake-dapp and unlimited approval, keyed on the spender", () => {
  const f = run("a-swap");
  assert.ok(f.some((x) => x.attackType === "fake-dapp" && x.severity === "high"));
  assert.ok(f.some((x) => x.attackType === "unlimited-approval" && x.severity === "high"));
  assert.equal(fingerprintOf(f), `spender:${FAKE_ROUTER.toLowerCase()}`);
});

test("sends to saved contacts produce no findings", () => {
  assert.deepEqual(run("a-mama"), []);
  assert.deepEqual(run("b-ada"), []);
});

test("first-time recipient is only a low-severity note, never a threat", () => {
  const s = scenario("a-mama");
  const f = runRules({ ...s.action, to: "0x1234567890abcdef1234567890abcdef12345678" }, wallets.A);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, "low");
  assert.equal(fingerprintOf(f), null);
});

test("real Uniswap domain and known spender are not flagged", () => {
  const s = scenario("a-swap");
  const f = runRules(
    { ...s.action, to: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", amount: "200", dapp: { name: "Uniswap", url: "https://app.uniswap.org/swap" } },
    wallets.A,
  );
  assert.deepEqual(f, []);
});
