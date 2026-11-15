// Simulated wallets and scenarios for the two-wallet demo.
// Wallet balances, history and the victims' addresses are simulated.
// The ATTACKER indicators (drainer addresses, phishing domains) are real
// entries from public scam databases (ScamSniffer / GoPlus), so the intel
// layer's lookups against live sources are genuine.

import type { Wallet, WalletAction } from "./types";

export const USDT = {
  symbol: "USDT",
  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  decimals: 6,
};

export const CHAIN = "Ethereum (simulated)";

// Real counterparties
export const CHIDI = "0x7a3F9c2E41b8D06f5A1c93e7B2d4F8a6C0e5d91B";
export const MAMA_NGOZI = "0x4E91b07C2d5aF83e6B1c0D9f7A2e5B3c8d6F12a0";
export const BAYO_ADDR = "0x2B6c8E1f4A9d03C7e5b2F8a1D6c9E0f3B7a4C58e";
export const ADA_ADDR = "0x9C1e5A7b3D8f2E06a4C9b1F7d3E8a2C6b0D4f7E3";

// Attacker: lookalike of Chidi (same first 4 and last 4 hex characters).
// Simulated: poisoning addresses are generated per victim, so this one is made up.
export const POISONER = "0x7a3F1b8c09E2a4D7f3B6e015C8a9D2b47E0fd91B";

// Attacker spender behind the fake "USDT rewards" sites (new to Watchdog's memory).
// Real address listed in ScamSniffer's blacklist (GoPlus: phishing activities).
export const DRAINER_SPENDER = "0x43412801d29861ecc4c4d86e5becfd16af86a67b";

// Second, unseen drainer behind a fake airdrop claim (fresh "new attacker" demo
// once the USDT-rewards drainer is verified). Real address on ScamSniffer's
// blacklist; GoPlus also links it to phishing. Checked via /api/intel/check.
export const AIRDROP_SPENDER = "0x7fb2224cc00a8d9106ac9280abde1e2f480f4f41";

// Attacker contract behind the fake Uniswap clone.
// Real contract listed in ScamSniffer's blacklist (GoPlus: phishing activities).
export const FAKE_ROUTER = "0x101ce0cedd142f199c9ef61739ae59b6611a0fc0";

// Real phishing domains from public lists (GoPlus / ScamSniffer).
export const PHISH_REWARDS_SITE = "https://usdt-rewards.xyz/claim";
export const PHISH_UNISWAP_SITE = "https://uniswap.lc/swap";
export const PHISH_BONUS_SITE = "https://usdt-erc20.network/bonus";
// Listed by GoPlus, ScamSniffer and MetaMask.
export const PHISH_AIRDROP_SITE = "https://chainsairdrop.com/claim";
// Second real listed phishing site (GoPlus, ScamSniffer and MetaMask all flag it), same drainer.
export const PHISH_AIRDROP_SITE_2 = "https://reward-aero.xyz/claim";

export const KNOWN_SPENDERS: Record<string, string> = {
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch Router",
};

export const KNOWN_DAPPS = [
  "uniswap.org",
  "app.uniswap.org",
  "aave.com",
  "app.aave.com",
  "1inch.io",
  "opensea.io",
  "binance.com",
  "tether.to",
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function initialWallets(): Record<"A" | "B", Wallet> {
  return {
    A: {
      id: "A",
      owner: "Ada",
      city: "Lagos",
      address: ADA_ADDR,
      balances: [
        { symbol: "USDT", amount: 1250, usd: 1250 },
        { symbol: "ETH", amount: 0.042, usd: 134.4 },
      ],
      contacts: [
        { name: "Chidi", address: CHIDI },
        { name: "Mama Ngozi", address: MAMA_NGOZI },
        { name: "Bayo", address: BAYO_ADDR },
      ],
      history: [
        {
          hash: "0x8f2c…a91e",
          direction: "in",
          counterparty: POISONER,
          amount: "0",
          token: "USDT",
          at: minutesAgo(12),
          dust: true,
        },
        {
          hash: "0x3b7d…04c2",
          direction: "out",
          counterparty: CHIDI,
          amount: "300",
          token: "USDT",
          at: minutesAgo(18),
        },
        {
          hash: "0xc41a…7f3d",
          direction: "in",
          counterparty: MAMA_NGOZI,
          amount: "150",
          token: "USDT",
          at: minutesAgo(60 * 26),
        },
      ],
      approvals: [
        {
          token: "USDT",
          spender: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
          spenderName: "Uniswap Universal Router",
          amount: "200",
        },
      ],
    },
    B: {
      id: "B",
      owner: "Bayo",
      city: "Kano",
      address: BAYO_ADDR,
      balances: [
        { symbol: "USDT", amount: 640, usd: 640 },
        { symbol: "ETH", amount: 0.018, usd: 57.6 },
      ],
      contacts: [
        { name: "Ada", address: ADA_ADDR },
        { name: "Mama Ngozi", address: MAMA_NGOZI },
      ],
      history: [
        {
          hash: "0x5e9b…d270",
          direction: "in",
          counterparty: ADA_ADDR,
          amount: "80",
          token: "USDT",
          at: minutesAgo(60 * 5),
        },
      ],
      approvals: [],
    },
  };
}

export interface Scenario {
  id: string;
  walletId: "A" | "B";
  title: string;
  story: string;
  /** What the demo is meant to show. Not used by detection. */
  tag: "safe" | "known-attack" | "new-attack" | "repeat-attack";
  action: WalletAction;
}

const MAX = "unlimited";

export const SCENARIOS: Scenario[] = [
  {
    id: "a-pay-chidi",
    walletId: "A",
    tag: "known-attack",
    title: "Pay Chidi back",
    story: "Ada copies Chidi's address from her recent history to send him 500 USDT.",
    action: {
      id: "a-pay-chidi",
      kind: "send",
      chain: CHAIN,
      from: ADA_ADDR,
      to: POISONER,
      token: USDT,
      amount: "500",
      addressSource: "copied-from-history",
    },
  },
  {
    id: "a-rewards",
    walletId: "A",
    tag: "known-attack",
    title: "Claim USDT rewards",
    story: "A Telegram group says Ada can claim 50 USDT on usdt-rewards.xyz. The site asks her to sign a message.",
    action: {
      id: "a-rewards",
      kind: "permit",
      chain: CHAIN,
      from: ADA_ADDR,
      to: DRAINER_SPENDER,
      token: USDT,
      amount: MAX,
      dapp: { name: "USDT Rewards", url: PHISH_REWARDS_SITE },
      typedData: {
        primaryType: "Permit",
        domain: { name: "Tether USD", chainId: 1, verifyingContract: USDT.address },
        message: {
          owner: ADA_ADDR,
          spender: DRAINER_SPENDER,
          value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
          nonce: 0,
          deadline: "4102444800",
        },
      },
    },
  },
  {
    id: "a-airdrop",
    walletId: "A",
    tag: "new-attack",
    title: "Claim a token airdrop",
    story: "An X reply tells Ada she qualifies for an airdrop on chainsairdrop.com. The site asks her to sign a message to claim.",
    action: {
      id: "a-airdrop",
      kind: "permit",
      chain: CHAIN,
      from: ADA_ADDR,
      to: AIRDROP_SPENDER,
      token: USDT,
      amount: MAX,
      dapp: { name: "Chains Airdrop", url: PHISH_AIRDROP_SITE },
      typedData: {
        primaryType: "Permit",
        domain: { name: "Tether USD", chainId: 1, verifyingContract: USDT.address },
        message: {
          owner: ADA_ADDR,
          spender: AIRDROP_SPENDER,
          value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
          nonce: 0,
          deadline: "4102444800",
        },
      },
    },
  },
  {
    id: "a-swap",
    walletId: "A",
    tag: "known-attack",
    title: "Swap on a Uniswap link",
    story: "Ada clicks a sponsored search result for Uniswap. The site asks to approve her USDT.",
    action: {
      id: "a-swap",
      kind: "approve",
      chain: CHAIN,
      from: ADA_ADDR,
      to: FAKE_ROUTER,
      token: USDT,
      amount: MAX,
      dapp: { name: "Uniswap", url: PHISH_UNISWAP_SITE },
    },
  },
  {
    id: "a-mama",
    walletId: "A",
    tag: "safe",
    title: "Send to Mama Ngozi",
    story: "Ada picks Mama Ngozi from her saved contacts and sends 100 USDT.",
    action: {
      id: "a-mama",
      kind: "send",
      chain: CHAIN,
      from: ADA_ADDR,
      to: MAMA_NGOZI,
      token: USDT,
      amount: "100",
      addressSource: "address-book",
    },
  },
  {
    id: "b-bonus",
    walletId: "B",
    tag: "repeat-attack",
    title: "Claim USDT bonus",
    story: "A WhatsApp broadcast sends Bayo to a USDT bonus site. It asks him to sign a message.",
    action: {
      id: "b-bonus",
      kind: "permit",
      chain: CHAIN,
      from: BAYO_ADDR,
      to: DRAINER_SPENDER,
      token: USDT,
      amount: MAX,
      dapp: { name: "USDT Bonus", url: PHISH_BONUS_SITE },
      typedData: {
        primaryType: "Permit",
        domain: { name: "Tether USD", chainId: 1, verifyingContract: USDT.address },
        message: {
          owner: BAYO_ADDR,
          spender: DRAINER_SPENDER,
          value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
          nonce: 0,
          deadline: "4102444800",
        },
      },
    },
  },
  {
    id: "b-airdrop",
    walletId: "B",
    tag: "repeat-attack",
    title: "Claim a rewards drop",
    story: "A Telegram group sends Bayo to a rewards site. It asks him to sign a message to claim.",
    action: {
      id: "b-airdrop",
      kind: "permit",
      chain: CHAIN,
      from: BAYO_ADDR,
      to: AIRDROP_SPENDER,
      token: USDT,
      amount: MAX,
      dapp: { name: "Rewards", url: PHISH_AIRDROP_SITE_2 },
      typedData: {
        primaryType: "Permit",
        domain: { name: "Tether USD", chainId: 1, verifyingContract: USDT.address },
        message: {
          owner: BAYO_ADDR,
          spender: AIRDROP_SPENDER,
          value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
          nonce: 0,
          deadline: "4102444800",
        },
      },
    },
  },
  {
    id: "b-ada",
    walletId: "B",
    tag: "safe",
    title: "Send to Ada",
    story: "Bayo sends Ada 40 USDT from his saved contacts.",
    action: {
      id: "b-ada",
      kind: "send",
      chain: CHAIN,
      from: BAYO_ADDR,
      to: ADA_ADDR,
      token: USDT,
      amount: "40",
      addressSource: "address-book",
    },
  },
];

// ---- Fresh-attacker pool for the learning-loop demo ----
// Real drainer addresses from ScamSniffer's public blacklist that GoPlus also
// flags for phishing, each paired with real phishing sites GoPlus flags.
// (Which drainer sits behind which site is a demo pairing.) The demo picks the
// first drainer Watchdog has never seen, so the "new attack" is always new.
export interface DrainerEntry {
  spender: string;
  adaSite: string;
  bayoSite: string;
}

export const DRAINER_POOL: DrainerEntry[] = [
  { spender: AIRDROP_SPENDER, adaSite: "chainsairdrop.com", bayoSite: "reward-aero.xyz" },
  { spender: "0x40f576a94e3d1cdabe66426835e33191f859ae82", adaSite: "claim-mindofpepe.live", bayoSite: "quarm-drop.com" },
  { spender: "0x30dadfcbcf672a3be8fb67aacf001d56929ff7ea", adaSite: "phala-rewards.com", bayoSite: "myslerfdrops.space" },
  { spender: "0x7c74dc20f2d9511c0157f2931bdd51c7fdfce7da", adaSite: "debank-claim.com", bayoSite: "lostdrops.com" },
  { spender: "0x8928a0785591d0b738cdf8276cade981cf0cd7c0", adaSite: "bonus-desyn.xyz", bayoSite: "megadrop-lista.com" },
  { spender: "0xe4244f235d88b690648cdaa2c45e94addffe12cb", adaSite: "yugaclaim.com", bayoSite: "blast-drop.website" },
  { spender: "0x545534d53ce276ecce0395e184a65091d84ab112", adaSite: "bonus-mantas.network", bayoSite: "grassrewards.online" },
  { spender: "0x64726c9f0148331e5433122fa85943b8ecdbcd92", adaSite: "kaito-claim.xyz", bayoSite: "airdropnot.top" },
  { spender: "0xb0831f26ce6ebd0b778ad2e27ebcd29b387842c7", adaSite: "cobra-airdrop.com", bayoSite: "claim-moonbag.site" },
  { spender: "0xaffe4546f6bd8732aebc357ef84e516d35b9ea02", adaSite: "droptwts.xyz", bayoSite: "weclaiming.live" },
];

/** The airdrop scenarios rebuilt around one pool entry. */
export function withDrainer(scenarios: Scenario[], d: DrainerEntry): Scenario[] {
  const patch = (s: Scenario, site: string, owner: string): Scenario => ({
    ...s,
    story:
      s.walletId === "A"
        ? `An X reply tells Ada she qualifies for an airdrop on ${site}. The site asks her to sign a message to claim.`
        : `A Telegram group sends Bayo to ${site}. It asks him to sign a message to claim.`,
    action: {
      ...s.action,
      to: d.spender,
      dapp: { name: s.action.dapp?.name ?? "Claim", url: `https://${site}/claim` },
      typedData: {
        ...(s.action.typedData ?? {}),
        message: {
          ...((s.action.typedData?.message as Record<string, unknown>) ?? {}),
          owner,
          spender: d.spender,
        },
      },
    },
  });
  return scenarios.map((s) =>
    s.id === "a-airdrop" ? patch(s, d.adaSite, ADA_ADDR) : s.id === "b-airdrop" ? patch(s, d.bayoSite, BAYO_ADDR) : s,
  );
}
