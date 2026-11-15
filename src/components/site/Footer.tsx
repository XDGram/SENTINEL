import Link from "next/link";
import { Container, MonoLabel } from "@/components/ui";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="bg-deep text-white/70">
      <Container className="grid gap-10 border-t border-line-dark py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Logo onDark className="h-7 w-7" /> <span className="font-medium">Watchdog</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6">
            Spots a scam once, stops it for everyone. Built for SERV Hackathon 02, Reppo track, on SERV Reasoning and Reppo evaluations.
          </p>
        </div>
        <div>
          <MonoLabel className="text-white/40">What&apos;s real</MonoLabel>
          <p className="mt-3 text-sm leading-6">
            SERV Reasoning, Reppo verdicts, GoPlus, ScamSniffer, MetaMask and on-chain wallet scans are live calls. Attacker
            addresses and sites in the demo are real public scam-list entries.
          </p>
        </div>
        <div>
          <MonoLabel className="text-white/40">What&apos;s simulated</MonoLabel>
          <p className="mt-3 text-sm leading-6">
            The demo wallets (Ada and Bayo), their balances and history, and the lookalike poisoning address. Watchdog never
            moves funds.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link className="hover:text-white" href="/demo">Demo</Link>
            <Link className="hover:text-white" href="/memory">Threat memory</Link>
            <Link className="hover:text-white" href="/developers">Developers</Link>
            <a className="hover:text-white" href="https://github.com/XDGram/SENTINEL" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
