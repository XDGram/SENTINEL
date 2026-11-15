import type { Metadata } from "next";
import { Container, MonoLabel } from "@/components/ui";
import { LiveCounts, LiveFeed } from "@/components/developers/LiveFeed";
import { DevHeading } from "@/components/developers/DevHeading";

export const metadata: Metadata = {
  title: "Developers · Watchdog threat intelligence API",
  description: "Query Watchdog's Reppo-verified threat feed and plain-English risk checks from your wallet, exchange or dApp.",
};

const BASE = "https://sentinel-three-cyan.vercel.app";

const ENDPOINTS: { n: string; method: "GET" | "POST"; path: string; title: string; body: string; curl: string }[] = [
  {
    n: "001",
    method: "GET",
    path: "/api/feed",
    title: "Verified threat feed",
    body: "Every attacker Watchdog has discovered and Reppo has verified, with proof: the Reppo evaluation ID, score and decision, the independent sources that flagged it, and how often it has been caught since. Filter with ?indicator=0x… or ?domain=….",
    curl: `curl ${BASE}/api/feed\ncurl "${BASE}/api/feed?indicator=0x43412801d29861ecc4c4d86e5becfd16af86a67b"`,
  },
  {
    n: "002",
    method: "POST",
    path: "/api/check",
    title: "Check anything",
    body: "An address, contract, token or link, even a messy message pasted from WhatsApp. Live sources plus a SERV Reasoning verdict and plain-English explanation.",
    curl: `curl -X POST ${BASE}/api/check \\\n  -H 'content-type: application/json' \\\n  -d '{"input":"hxxps://uniswap[.]lc claim now"}'`,
  },
  {
    n: "003",
    method: "POST",
    path: "/api/scan/wallet",
    title: "Wallet approval scan",
    body: "Reads a wallet's real approval history on-chain, rates every live approval, and returns an unsigned revoke transaction for each. Read-only: Watchdog never moves funds.",
    curl: `curl -X POST ${BASE}/api/scan/wallet \\\n  -H 'content-type: application/json' \\\n  -d '{"address":"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}'`,
  },
  {
    n: "004",
    method: "POST",
    path: "/api/analyze",
    title: "Pre-signing transaction check",
    body: "Send a pending send, approve or permit before your user signs it. Rules, threat memory, live sources and SERV Reasoning return a verdict, evidence, a reasoning trace and a safe fix.",
    curl: `curl -X POST ${BASE}/api/analyze \\\n  -H 'content-type: application/json' \\\n  -d '{"walletId":"A","action":{ … }}'`,
  },
  {
    n: "005",
    method: "GET",
    path: "/api/stats",
    title: "Learning analytics",
    body: "Measured, not modelled: threats discovered, Reppo submissions and verdicts, repeat attacks blocked from memory.",
    curl: `curl ${BASE}/api/stats`,
  },
];

export default function DevelopersPage() {
  return (
    <main className="bg-deep text-white">
      <Container className="pt-14 pb-24 sm:pt-20">
        <MonoLabel className="text-white/45">[N.01] &gt; Threat intelligence API</MonoLabel>
        <div className="mt-4 grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <h1 className="font-display text-[40px] leading-[1.05] sm:text-[56px]">
            <DevHeading />
          </h1>
          <div>
            <p className="text-sm leading-6 text-white/65">
              Watchdog is free for people. Wallets, exchanges and dApps pay to query the Reppo-verified threat feed and the
              plain-English explainer API, so their users get the same protection at the moment of signing.
            </p>
            <p className="label-mono mt-4 text-accent">Free tier now · API keys for wallets, exchanges and dApps</p>
          </div>
        </div>

        <div className="mt-10">
          <LiveCounts />
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line-dark bg-line-dark">
          {ENDPOINTS.map((e) => (
            <section key={e.path} className="grid gap-6 bg-deep p-5 sm:p-7 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <div className="flex items-center gap-3">
                  <MonoLabel className="text-white/35">{`// ${e.n}`}</MonoLabel>
                  <span
                    className={`label-mono rounded px-1.5 py-0.5 ${e.method === "GET" ? "bg-safe/20 text-safe" : "bg-accent/20 text-accent"}`}
                  >
                    {e.method}
                  </span>
                  <code className="font-mono text-sm text-white">{e.path}</code>
                </div>
                <h2 className="mt-4 text-lg font-medium">{e.title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/60">{e.body}</p>
              </div>
              <pre className="addr self-start overflow-x-auto rounded-xl bg-black/30 p-4 text-[12px] leading-5 text-white/80">{e.curl}</pre>
            </section>
          ))}
        </div>

        <div className="mt-14">
          <MonoLabel className="text-white/45">[N.02] &gt; Live response · GET /api/feed</MonoLabel>
          <div className="mt-4">
            <LiveFeed />
          </div>
          <p className="mt-3 text-xs text-white/40">
            Real data from Watchdog&apos;s threat memory. Only threats with a Reppo &quot;accept&quot; appear here.
          </p>
        </div>
      </Container>
    </main>
  );
}
