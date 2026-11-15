import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCode,
  decodeDecimals,
  decodeTokenString,
  decodeAggregate3,
  decodeUint,
  encodeAggregate3,
  encodeAllowance,
  encodeApprove,
  formatAllowance,
  isAddress,
  isUnlimited,
  MAX_UINT256,
  normaliseInput,
} from "../src/lib/scan-abi";

const OWNER = "0x43412801d29861ecc4c4d86e5becfd16af86a67b";
const SPENDER = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

// ---- ABI encoding ----

test("allowance calldata is the selector plus two left-padded addresses", () => {
  const data = encodeAllowance(OWNER, SPENDER);
  assert.equal(data.slice(0, 10), "0xdd62ed3e");
  assert.equal(data.length, 2 + 8 + 64 * 2);
  assert.ok(data.includes(OWNER.slice(2).toLowerCase()));
  assert.ok(data.includes(SPENDER.slice(2).toLowerCase()));
});

test("revoke calldata is approve(spender, 0)", () => {
  const data = encodeApprove(SPENDER, BigInt(0));
  assert.equal(data.slice(0, 10), "0x095ea7b3");
  assert.equal(data.slice(-64), "0".repeat(64));
});

test("aggregate3 round-trips through the decoder", () => {
  // Build the ABI return value for two results and decode it back.
  const pad = (h: string) => h.replace(/^0x/, "").padStart(64, "0");
  const resultTuple = (success: boolean, data: string) =>
    pad(success ? "1" : "0") + pad("40") + pad((data.length / 2).toString(16)) + data.padEnd(64, "0");
  const t1 = resultTuple(true, pad("7b")); // 123
  const t2 = resultTuple(false, "");
  const offsets = [pad("40"), pad((64 + t1.length / 2).toString(16))];
  const encoded = "0x" + pad("20") + pad("2") + offsets.join("") + t1 + t2;

  const out = decodeAggregate3(encoded);
  assert.equal(out.length, 2);
  assert.equal(out[0].success, true);
  assert.equal(decodeUint(out[0].data), BigInt(123));
  assert.equal(out[1].success, false);
});

test("aggregate3 encoding declares the right call count and targets", () => {
  const calls = [
    { target: USDT, allowFailure: true, callData: encodeAllowance(OWNER, SPENDER) },
    { target: USDT, allowFailure: true, callData: encodeAllowance(OWNER, OWNER) },
  ];
  const encoded = encodeAggregate3(calls);
  assert.equal(encoded.slice(0, 10), "0x82ad56cb");
  // Array length word sits after the selector and the head offset.
  assert.equal(BigInt("0x" + encoded.slice(10 + 64, 10 + 128)), BigInt(2));
  assert.equal((encoded.match(new RegExp(USDT.slice(2).toLowerCase(), "g")) ?? []).length, 2);
});

test("decodeUint rejects empty and malformed data", () => {
  assert.equal(decodeUint(""), null);
  assert.equal(decodeUint("0x"), null);
  assert.equal(decodeUint("zz"), null);
  assert.equal(decodeUint("0x" + "f".repeat(64)), MAX_UINT256);
});

// ---- Account classification ----

test("empty code is an EOA and real code is a contract", () => {
  assert.equal(classifyCode("0x").kind, "eoa");
  assert.equal(classifyCode("").kind, "eoa");
  assert.equal(classifyCode("0x60806040" + "00".repeat(100)).kind, "contract");
});

test("an EIP-7702 delegation indicator is a delegated EOA, not a contract", () => {
  // 0xef0100 || 20-byte address, exactly 23 bytes: Vitalik's live account shape.
  const code = "0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d";
  const out = classifyCode(code);
  assert.equal(out.kind, "delegated-eoa");
  assert.equal(out.size, 23);
  assert.equal(out.delegatesTo, "0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d");
});

// ---- Allowance presentation ----

test("unlimited covers max uint and partially spent max approvals", () => {
  assert.equal(isUnlimited(MAX_UINT256), true);
  // A max approval that has been partly spent is still effectively unlimited.
  assert.equal(isUnlimited(MAX_UINT256 - BigInt(71448205)), true);
  assert.equal(isUnlimited(BigInt(1000)), false);
});

test("allowance formatting respects decimals and never invents precision", () => {
  assert.equal(formatAllowance(BigInt(0), 6, "USDT"), "0 USDT");
  assert.equal(formatAllowance(BigInt(1500000), 6, "USDT"), "1.5 USDT");
  assert.equal(formatAllowance(BigInt(1000000), 6, "USDT"), "1 USDT");
  assert.equal(formatAllowance(MAX_UINT256, 6, "USDT"), "unlimited USDT");
});

// ---- Input normalisation ----

test("addresses are recognised and lower-cased", () => {
  assert.deepEqual(
    { kind: normaliseInput(OWNER.toUpperCase().replace("0X", "0x")).kind, value: normaliseInput(OWNER).value },
    { kind: "address", value: OWNER },
  );
  assert.equal(isAddress(OWNER), true);
});

test("an address is pulled out of forwarded chat text", () => {
  const out = normaliseInput(`Guys send to this one: ${OWNER} fast!!`);
  assert.equal(out.kind, "address");
  assert.equal(out.value, OWNER);
  assert.ok(out.note);
});

test("invisible characters from copy-paste are stripped", () => {
  const out = normaliseInput(`​${OWNER}﻿`);
  assert.equal(out.kind, "address");
  assert.equal(out.value, OWNER);
});

test("a transaction hash is not mistaken for an address", () => {
  assert.equal(normaliseInput(`0x${"a".repeat(64)}`).kind, "unknown");
});

test("bare hostnames, paths and schemes all resolve to the host", () => {
  assert.equal(normaliseInput("uniswap.lc").value, "uniswap.lc");
  assert.equal(normaliseInput("https://uniswap.lc/swap").value, "uniswap.lc");
  assert.equal(normaliseInput("https://uniswap.lc/swap").url, "https://uniswap.lc/swap");
  assert.equal(normaliseInput("HTTPS://UniSwap.LC/").value, "uniswap.lc");
});

test("defanged and markdown links are restored", () => {
  assert.equal(normaliseInput("hxxps://usdt-rewards[.]xyz/claim").value, "usdt-rewards.xyz");
  assert.equal(normaliseInput("[claim here](https://usdt-rewards.xyz/claim)").value, "usdt-rewards.xyz");
});

test("chatter and labels around a link are discarded", () => {
  assert.equal(normaliseInput("Claim now at usdt-rewards.xyz !!").value, "usdt-rewards.xyz");
  assert.equal(normaliseInput("url: usdt-rewards.xyz").value, "usdt-rewards.xyz");
  assert.equal(normaliseInput("“usdt-rewards.xyz”").value, "usdt-rewards.xyz");
});

test("plain words are not treated as domains", () => {
  assert.equal(normaliseInput("is this safe?").kind, "unknown");
  assert.equal(normaliseInput("").kind, "unknown");
  assert.equal(normaliseInput("hello world").kind, "unknown");
});

// ---- Token metadata decoding ----

test("a dynamic string symbol decodes", () => {
  const pad = (h: string) => h.replace(/^0x/, "").padStart(64, "0");
  const padR = (h: string) => h.replace(/^0x/, "").padEnd(64, "0");
  // offset 32, length 4, "USDC"
  const data = pad("20") + pad("4") + padR(Buffer.from("USDC", "utf8").toString("hex"));
  assert.equal(decodeTokenString(data), "USDC");
});

test("a bytes32 symbol decodes, as older tokens such as MKR return", () => {
  const data = Buffer.from("MKR", "utf8").toString("hex").padEnd(64, "0");
  assert.equal(decodeTokenString(data), "MKR");
});

test("undecodable symbol data yields null rather than control characters", () => {
  assert.equal(decodeTokenString(""), null);
  assert.equal(decodeTokenString("0x"), null);
  // A word of high bytes is not printable ASCII.
  assert.equal(decodeTokenString("ff".repeat(32)), null);
});

test("decimals are accepted only in a plausible range", () => {
  const pad = (n: number) => n.toString(16).padStart(64, "0");
  assert.equal(decodeDecimals(pad(18)), 18);
  assert.equal(decodeDecimals(pad(6)), 6);
  assert.equal(decodeDecimals(pad(0)), 0);
  assert.equal(decodeDecimals(pad(99)), null);
  assert.equal(decodeDecimals(""), null);
});
