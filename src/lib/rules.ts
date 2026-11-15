// Deterministic rule engine: the independent, non-AI second source.
// SERV Reasoning receives these findings as input, and nothing enters the
// threat memory unless these rules and SERV agree and Reppo verifies it.

import type { RuleFinding, Wallet, WalletAction, Evidence } from "./types";
import { KNOWN_DAPPS, KNOWN_SPENDERS } from "./sim-data";

const lc = (s: string) => s.toLowerCase();
const hex = (addr: string) => lc(addr).replace(/^0x/, "");

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Two different addresses that share the first and last 4 hex characters. */
export function isLookalike(a: string, b: string): boolean {
  const x = hex(a);
  const y = hex(b);
  if (x === y) return false;
  return x.slice(0, 4) === y.slice(0, 4) && x.slice(-4) === y.slice(-4);
}

/** How many hex characters match at the start and at the end. */
export function matchingEdges(a: string, b: string): { start: number; end: number } {
  const x = hex(a);
  const y = hex(b);
  let start = 0;
  while (start < x.length && x[start] === y[start]) start++;
  let end = 0;
  while (end < x.length && x[x.length - 1 - end] === y[y.length - 1 - end]) end++;
  return { start, end };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function isKnownDapp(host: string): boolean {
  return KNOWN_DAPPS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Host that borrows a known brand name without being that brand's domain. */
export function lookalikeBrand(host: string): string | null {
  if (isKnownDapp(host)) return null;
  for (const d of KNOWN_DAPPS) {
    const brand = d.split(".").slice(-2, -1)[0];
    if (brand.length >= 4 && host.includes(brand)) return d;
  }
  return null;
}

const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function isUnlimited(action: WalletAction): boolean {
  const v = (action.typedData?.message as Record<string, unknown> | undefined)?.value;
  return action.amount === "unlimited" || v === MAX_UINT;
}

let evSeq = 0;
const ev = (e: Omit<Evidence, "id">): Evidence => ({ id: `r${++evSeq}`, ...e });

export function runRules(action: WalletAction, wallet: Wallet): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const to = lc(action.to);

  if (action.kind === "send") {
    const isContact = wallet.contacts.some((c) => lc(c.address) === to);
    const realCounterparties = [
      ...wallet.contacts.map((c) => ({ name: c.name, address: c.address })),
      ...wallet.history
        .filter((h) => !h.dust && h.amount !== "0")
        .map((h) => ({
          name: wallet.contacts.find((c) => lc(c.address) === lc(h.counterparty))?.name ?? shortAddr(h.counterparty),
          address: h.counterparty,
        })),
    ];
    const twin = realCounterparties.find((c) => isLookalike(c.address, action.to));
    if (!isContact && twin) {
      const edges = matchingEdges(twin.address, action.to);
      const dustTx = wallet.history.find((h) => lc(h.counterparty) === to && (h.dust || h.amount === "0"));
      const evidence: Evidence[] = [
        ev({
          source: "rules",
          claim: `This address only looks like ${twin.name}'s address.`,
          detail: `First ${edges.start} and last ${edges.end} characters match, but the middle is different. ${twin.name}: ${twin.address}. You are sending to: ${action.to}.`,
        }),
      ];
      if (dustTx) {
        evidence.push(
          ev({
            source: "chain",
            claim: "This address sent you a 0-value transfer so it would appear in your history.",
            detail: `Incoming ${dustTx.amount} ${dustTx.token} from ${action.to} (tx ${dustTx.hash}). That is the classic address-poisoning bait. (Simulated history.)`,
          }),
        );
      }
      if (action.addressSource === "copied-from-history") {
        evidence.push(
          ev({
            source: "rules",
            claim: "You copied this address from your transaction history.",
            detail: "Address poisoning works by planting a lookalike address in your history, hoping you copy it.",
          }),
        );
      }
      findings.push({
        attackType: "address-poisoning",
        severity: "high",
        title: "Lookalike address (address poisoning)",
        detail: `The recipient imitates ${twin.name}'s address.`,
        indicator: `address:${to}`,
        fix: {
          kind: "use-correct-address",
          label: `Send to the real ${twin.name} instead`,
          detail: `Use the saved address ${shortAddr(twin.address)} from your contacts.`,
          correctAddress: twin.address,
          correctName: twin.name,
        },
        evidence,
      });
    } else if (!isContact && !wallet.history.some((h) => lc(h.counterparty) === to)) {
      findings.push({
        attackType: "address-poisoning",
        severity: "low",
        title: "First time sending to this address",
        detail: "Not in your contacts or history. Double-check it with the person.",
        indicator: `address:${to}`,
        evidence: [
          ev({ source: "rules", claim: "You have never sent to this address before.", detail: action.to }),
        ],
      });
    }
  }

  if (action.kind === "approve" || action.kind === "permit") {
    const spenderName = KNOWN_SPENDERS[to];
    const host = action.dapp ? hostOf(action.dapp.url) : null;
    const brand = host ? lookalikeBrand(host) : null;
    const unlimited = isUnlimited(action);

    if (brand && host) {
      findings.push({
        attackType: "fake-dapp",
        severity: "high",
        title: "Fake website",
        detail: `${host} pretends to be ${brand}.`,
        indicator: `domain:${host}`,
        fix: { kind: "cancel", label: "Cancel and close the site", detail: `The real site is ${brand}. Type it yourself or use a bookmark.` },
        evidence: [
          ev({
            source: "rules",
            claim: `The site uses the name of ${brand} but is a different domain.`,
            detail: `Real domain: ${brand}. This request comes from: ${host}.`,
          }),
        ],
      });
    }

    if (!spenderName && unlimited && action.kind === "approve") {
      findings.push({
        attackType: "unlimited-approval",
        severity: "high",
        title: "Unlimited approval to an unknown contract",
        detail: `It could move all of your ${action.token.symbol}, now or any time later.`,
        indicator: `spender:${to}`,
        fix: { kind: "cancel", label: "Cancel this approval", detail: "Never give unlimited access to a contract you can't verify." },
        evidence: [
          ev({
            source: "rules",
            claim: `You would let ${shortAddr(action.to)} spend ALL your ${action.token.symbol}, forever.`,
            detail: "Approval amount is the maximum possible value (2^256-1).",
          }),
          ev({
            source: "rules",
            claim: "This spender is not a known, verified protocol contract.",
            detail: `${action.to} is not in the verified spender list (Uniswap, 1inch, etc.).`,
          }),
        ],
      });
    }

    if (action.kind === "permit" && !spenderName) {
      const msg = (action.typedData?.message ?? {}) as Record<string, unknown>;
      const deadline = Number(msg.deadline ?? 0);
      const years = deadline ? Math.round((deadline * 1000 - Date.now()) / (365 * 24 * 3600 * 1000)) : 0;
      const evidence: Evidence[] = [
        ev({
          source: "rules",
          claim: "This is not a login. It is a gasless permission (EIP-2612 permit) to spend your tokens.",
          detail: `primaryType: ${String(action.typedData?.primaryType ?? "Permit")}, token: ${action.token.symbol}.`,
        }),
        ev({
          source: "rules",
          claim: "The spender is an unknown address, not a verified protocol.",
          detail: `spender: ${action.to}`,
        }),
      ];
      if (unlimited) {
        evidence.push(ev({ source: "rules", claim: "The amount is unlimited.", detail: "value = 2^256-1" }));
      }
      if (years > 5) {
        evidence.push(ev({ source: "rules", claim: `The permission lasts about ${years} years.`, detail: `deadline: ${deadline}` }));
      }
      if (host && !isKnownDapp(host)) {
        evidence.push(ev({ source: "rules", claim: `The site ${host} is not a known app.`, detail: "Not in the known dApp list." }));
      }
      // Medium on purpose: rules see red flags but can't prove intent.
      // This is the "uncertain" case SERV reasons about and may send to Reppo.
      findings.push({
        attackType: "malicious-permit",
        severity: "medium",
        title: "Signature that grants spending rights",
        detail: "A website wants a signature that would let an unknown address move your tokens.",
        indicator: `spender:${to}`,
        fix: { kind: "cancel", label: "Don't sign", detail: "Close the site. Real rewards never need a spending permission." },
        evidence,
      });
    }
  }

  return findings;
}

/** Threat-memory key: the attacker's spender, address, or domain. */
export function fingerprintOf(findings: RuleFinding[]): string | null {
  const order = { high: 0, medium: 1, low: 2 } as const;
  const top = [...findings].sort((a, b) => order[a.severity] - order[b.severity]).find((f) => f.severity !== "low");
  if (!top) return null;
  // Prefer the spender/address over a domain: attackers rotate domains faster.
  const spender = findings.find((f) => f.indicator.startsWith("spender:"));
  return spender?.indicator ?? top.indicator;
}

/** All indicators in these findings (spender, address and domain). */
export function indicatorsOf(findings: RuleFinding[]): string[] {
  return [...new Set(findings.filter((f) => f.severity !== "low").map((f) => f.indicator))];
}
