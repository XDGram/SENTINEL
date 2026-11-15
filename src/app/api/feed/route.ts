// Verified threat feed: the product wallets, exchanges and dApps would pay for.
// Only Reppo-verified threats are returned. The server-built evidence packet
// (reppoPacket) is never exposed; the attacker's site is derived from it.

import { NextResponse } from "next/server";
import { listVerifiedThreats } from "@/lib/store";
import { clientKey, rateLimit } from "@/lib/guard";
import { hostOf } from "@/lib/rules";
import type { AttackType, IntelSourceId, Threat } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=60";

export interface FeedThreat {
  id: string;
  indicator: string;
  attackType: AttackType;
  summary: string;
  /** Website the attack was served from, when known. */
  domain: string | null;
  firstSeen: string;
  verifiedAt: string | null;
  reppo: { evalId: string | null; score: number | null; decision: string | null };
  externalSources: IntelSourceId[];
  timesCaught: number;
  lastCaughtAt: string | null;
}

export interface FeedResponse {
  generatedAt: string;
  query: { indicator?: string; domain?: string } | null;
  count: number;
  threats: FeedThreat[];
}

function siteOf(t: Threat): string | null {
  if (t.indicator.startsWith("domain:")) return t.indicator.slice(7);
  if (!t.reppoPacket) return null;
  try {
    const site = (JSON.parse(t.reppoPacket) as { action?: { site?: unknown } }).action?.site;
    return typeof site === "string" && site ? hostOf(site) : null;
  } catch {
    return null;
  }
}

function toFeed(t: Threat): FeedThreat {
  return {
    id: t.id,
    indicator: t.indicator,
    attackType: t.attackType,
    summary: t.summary,
    domain: siteOf(t),
    firstSeen: t.discoveredAt,
    verifiedAt: t.verifiedAt ?? null,
    reppo: { evalId: t.reppoEvalId ?? null, score: t.reppoScore ?? null, decision: t.reppoDecision ?? null },
    externalSources: t.externalSources ?? [],
    timesCaught: t.caughtCount,
    lastCaughtAt: t.lastCaughtAt ?? null,
  };
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const PREFIXED = /^(spender|address):0x[0-9a-f]{40}$/;
const HOST = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export async function GET(req: Request) {
  const wait = rateLimit(`feed:${clientKey(req)}`, 60, 60_000);
  if (wait) return NextResponse.json({ error: `Too many requests. Try again in ${wait}s.` }, { status: 429 });

  const params = new URL(req.url).searchParams;
  const indicator = params.get("indicator")?.trim().toLowerCase() || undefined;
  const domainParam = params.get("domain")?.trim().toLowerCase() || undefined;
  if (indicator && !ADDRESS.test(indicator) && !PREFIXED.test(indicator)) {
    return NextResponse.json({ error: "indicator must be a 0x address or spender:/address: followed by one" }, { status: 400 });
  }
  const domain = domainParam ? hostOf(domainParam.includes("://") ? domainParam : `https://${domainParam}`) : undefined;
  if (domainParam && (!domain || !HOST.test(domain))) {
    return NextResponse.json({ error: "domain must be a hostname, e.g. example.com" }, { status: 400 });
  }

  let threats: FeedThreat[];
  try {
    threats = (await listVerifiedThreats()).map(toFeed);
  } catch (err) {
    console.error("[feed]", err);
    return NextResponse.json({ error: "Threat memory is unavailable." }, { status: 503 });
  }

  if (indicator) {
    const addr = indicator.includes(":") ? indicator.split(":")[1] : indicator;
    threats = threats.filter((t) => t.indicator.toLowerCase().endsWith(`:${addr}`));
  }
  if (domain) {
    threats = threats.filter((t) => t.domain === domain || (t.domain?.endsWith(`.${domain}`) ?? false));
  }

  const body: FeedResponse = {
    generatedAt: new Date().toISOString(),
    query: indicator || domain ? { indicator, domain } : null,
    count: threats.length,
    threats,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
