// Web search for community reports (Reddit, YouTube, X, security blogs, news).
// Provider is pluggable: Tavily or Brave Search, chosen by which key is set.
// Results are evidence for SERV to reason over, never a verdict on their own.

import "server-only";
import type { IntelReport } from "../types";
import { errorMessage, fetchWithTimeout, nowIso, TtlCache } from "./shared";

export const COMMUNITY_DOMAINS = [
  "reddit.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "medium.com",
  "chainabuse.com",
  "scamsniffer.io",
  "slowmist.medium.com",
  "cointelegraph.com",
  "theblock.co",
  "decrypt.co",
  "coindesk.com",
  "bleepingcomputer.com",
  "etherscan.io",
];

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

const cache = new TtlCache<WebResult[]>(24 * 60 * 60_000);

export function webSearchProvider(): "tavily" | "brave" | null {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_API_KEY) return "brave";
  return null;
}

export async function webSearch(query: string, max = 5): Promise<WebResult[]> {
  const provider = webSearchProvider();
  if (!provider) throw new Error("No web search provider configured");
  const key = `${provider}:${query}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let results: WebResult[];
  if (provider === "tavily") {
    const res = await fetchWithTimeout(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
        body: JSON.stringify({ query, max_results: max, search_depth: "basic", include_domains: COMMUNITY_DOMAINS }),
      },
      8000,
    );
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const json = (await res.json()) as { results?: { title: string; url: string; content: string; published_date?: string }[] };
    results = (json.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content?.slice(0, 500) ?? "", publishedAt: r.published_date }));
  } else {
    const sites = COMMUNITY_DOMAINS.slice(0, 6).map((d) => `site:${d}`).join(" OR ");
    const u = `https://api.search.brave.com/res/v1/web/search?count=${max}&q=${encodeURIComponent(`${query} (${sites})`)}`;
    const res = await fetchWithTimeout(u, { headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY! } }, 8000);
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const json = (await res.json()) as { web?: { results?: { title: string; url: string; description: string; age?: string }[] } };
    results = (json.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.description ?? "", publishedAt: r.age }));
  }
  cache.set(key, results);
  return results;
}

function siteName(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.endsWith("reddit.com")) return "Reddit";
    if (h.endsWith("youtube.com")) return "YouTube";
    if (h === "x.com" || h === "twitter.com") return "X";
    return h;
  } catch {
    return "web";
  }
}

/**
 * Look for public reports that mention this exact indicator.
 * A page only counts as "suspicious" if it names the indicator and talks about scams.
 */
export async function webReportsForIndicator(indicator: string): Promise<IntelReport[]> {
  const value = indicator.split(":")[1] ?? indicator;
  const query = value.startsWith("0x") ? `"${value}" scam OR drainer OR phishing` : `"${value}" scam OR phishing OR drainer OR fake`;
  return toReports(indicator, await webSearch(query, 5), value);
}

/** Look for public reports of this attack pattern (e.g. fake USDT reward permit). */
export async function webReportsForPattern(indicator: string, description: string): Promise<IntelReport[]> {
  return toReports(indicator, await webSearch(description, 4), null);
}

const SCAM_WORDS = /scam|phish|drain|stole|stolen|fake|poison|hack|exploit|warning|lost/i;

function toReports(indicator: string, results: WebResult[], mustMention: string | null): IntelReport[] {
  return results.map((r) => {
    const text = `${r.title} ${r.snippet}`;
    const mentions = mustMention ? text.toLowerCase().includes(mustMention.toLowerCase()) : false;
    return {
      source: "web",
      sourceName: siteName(r.url),
      indicator,
      verdict: mentions && SCAM_WORDS.test(text) ? "suspicious" : "unknown",
      summary: mustMention
        ? mentions
          ? `Public page mentions this ${indicator.startsWith("domain:") ? "site" : "address"} in a scam context.`
          : "Related public report."
        : "Public report of the same kind of attack.",
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      publishedAt: r.publishedAt,
      fetchedAt: nowIso(),
    } satisfies IntelReport;
  });
}

export { errorMessage };
