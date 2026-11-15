// Simulated wallets and scenarios for the two-wallet demo.
// Everything here is simulated data, not live chain state. All addresses
// below except well-known public token/protocol contracts are made up.

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

// Attacker: lookalike of Chidi (same first 4 and last 4 hex characters)
export const POISONER = "0x7a3F1b8c09E2a4D7f3B6e015C8a9D2b47E0fd91B";

// Attacker spender behind the fake "USDT rewards" sites (new, unseen attack)
export const DRAINER_SPENDER = "0xD4a1C0e7f9B2d6A83E5c1F0b7a9D2E4c6B8f3a71";

// Attacker behind the fake Uniswap clone
export const FAKE_ROUTER = "0x5e1F8a2B9c4D7e03A6b1C8f5D2e9A4b7C0d3E6f1";

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
    tag: "new-attack",
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
      dapp: { name: "USDT Rewards", url: "https://usdt-rewards.xyz/claim" },
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
      dapp: { name: "Uniswap", url: "https://app-uniswap.org.swap-v4.io" },
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
    story: "A WhatsApp broadcast sends Bayo to usdt-bonus.app. The site asks him to sign a message.",
    action: {
      id: "b-bonus",
      kind: "permit",
      chain: CHAIN,
      from: BAYO_ADDR,
      to: DRAINER_SPENDER,
      token: USDT,
      amount: MAX,
      dapp: { name: "USDT Bonus", url: "https://usdt-bonus.app/" },
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
