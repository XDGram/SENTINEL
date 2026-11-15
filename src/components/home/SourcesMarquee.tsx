const ITEMS = [
  "GoPlus Security",
  "ScamSniffer database",
  "MetaMask phishing list",
  "SERV Reasoning",
  "Reppo evaluators",
  "On-chain approvals",
  "Shared threat memory",
];

/** Slow, seamless marquee of what every check runs against. */
export function SourcesMarquee() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-line-dark py-4 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-10 motion-reduce:animate-none">
        {row.map((t, i) => (
          <span key={i} className="label-mono flex items-center gap-10 text-white/55">
            {t}
            <span className="h-1 w-1 rounded-full bg-white/30" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}
