import { NextResponse } from "next/server";
import { goplusAddress, goplusSite } from "@/lib/intel/goplus";
import { checkAddressLists, checkDomainLists } from "@/lib/intel/blocklists";

export const dynamic = "force-dynamic";

/** Look up one address or domain against the public sources (no web search, no AI). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length > 200) return NextResponse.json({ error: "q is required" }, { status: 400 });

  if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
    const reports = [await goplusAddress(q), ...(await checkAddressLists(q))];
    return NextResponse.json({ indicator: `address:${q.toLowerCase()}`, reports });
  }
  let host: string;
  try {
    host = new URL(q.includes("://") ? q : `https://${q}`).hostname.toLowerCase();
  } catch {
    return NextResponse.json({ error: "Not an address or domain" }, { status: 400 });
  }
  const reports = [await goplusSite(host), ...(await checkDomainLists(host))];
  return NextResponse.json({ indicator: `domain:${host}`, reports });
}
