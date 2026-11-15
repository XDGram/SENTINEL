"use client";

import { ExternalLink } from "lucide-react";
import type { Evidence, IntelReport } from "@/lib/types";
import { cn } from "@/lib/cn";

export interface EvidenceItem {
  id: string;
  source: string;
  claim: string;
  detail?: string;
  link?: string;
  tone: "bad" | "warn" | "neutral" | "good";
}

const TONE: Record<EvidenceItem["tone"], string> = {
  bad: "bg-risky",
  warn: "bg-uncertain",
  neutral: "bg-ink-soft/50",
  good: "bg-safe",
};

function sourceLabel(e: Evidence): string {
  if (e.source === "rules") return "Rules";
  if (e.source === "chain") return "Chain";
  if (e.source === "threat-memory") return "Threat memory";
  if (e.source === "reppo") return "Reppo";
  if (e.source === "serv") return "SERV";
  const hay = `${e.link ?? ""} ${e.detail}`.toLowerCase();
  if (hay.includes("goplus")) return "GoPlus";
  if (hay.includes("scamsniffer")) return "ScamSniffer";
  if (hay.includes("metamask")) return "MetaMask";
  if (hay.includes("reddit")) return "Reddit";
  if (hay.includes("youtube")) return "YouTube";
  return "Source";
}

export function fromEvidence(list: Evidence[]): EvidenceItem[] {
  return list.map((e) => ({
    id: e.id,
    source: sourceLabel(e),
    claim: e.claim,
    detail: e.detail,
    link: e.link,
    tone: e.source === "threat-memory" ? "bad" : e.source === "intel" || e.source === "chain" ? "bad" : "warn",
  }));
}

export function fromReports(list: IntelReport[]): EvidenceItem[] {
  return list
    .filter((r) => r.verdict !== "error")
    .map((r, i) => ({
      id: `${r.source}-${i}`,
      source: r.sourceName,
      claim: r.summary,
      detail: r.title ? `“${r.title}”` : r.indicator,
      link: r.url,
      tone: r.verdict === "malicious" ? "bad" : r.verdict === "suspicious" ? "warn" : r.verdict === "clean" ? "good" : "neutral",
    }));
}

export function EvidenceList({ items, dark, title = "Evidence" }: { items: EvidenceItem[]; dark?: boolean; title?: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h4 className={cn("label-mono mb-3", dark ? "text-white/45" : "text-ink-soft")}>
        {title} · {items.length}
      </h4>
      <ul className="space-y-2">
        {items.map((e) => (
          <li
            key={e.id}
            className={cn(
              "rounded-xl border p-3 text-sm",
              dark ? "border-line-dark bg-white/[0.03]" : "border-line bg-white/60",
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE[e.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "label-mono rounded px-1.5 py-0.5",
                      dark ? "bg-white/10 text-white/70" : "bg-ink/5 text-ink-soft",
                    )}
                  >
                    {e.source}
                  </span>
                  <span className={cn("font-medium", dark ? "text-white" : "text-ink")}>{e.claim}</span>
                </div>
                {e.detail && (
                  <p className={cn("addr mt-1 text-xs leading-5", dark ? "text-white/50" : "text-ink-soft")}>{e.detail}</p>
                )}
              </div>
              {e.link && (
                <a
                  href={e.link}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("shrink-0 rounded-md p-1", dark ? "text-white/50 hover:text-white" : "text-ink-soft hover:text-ink")}
                  aria-label={`Open source: ${e.source}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
