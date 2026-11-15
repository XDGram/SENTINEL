import { CtaLink } from "@/components/ui/elements";
import { Container, MonoLabel } from "@/components/ui";
import { AskBox } from "@/components/home/AskBox";
import { ThreatField } from "@/components/home/ThreatField";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ProofStrip } from "@/components/home/ProofStrip";

export default function Home() {
  return (
    <main>
      <section className="pt-16 pb-14 sm:pt-24">
        <Container className="text-center">
          <MonoLabel className="text-ink-soft">Wallet safety agent · SERV Reasoning × Reppo</MonoLabel>
          <h1 className="font-display mx-auto mt-5 max-w-3xl text-[42px] leading-[1.05] text-ink sm:text-[64px]">
            Know before you sign.
            <br />
            <span className="italic text-ink/80">Wallet safety that learns.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-6 text-ink-soft">
            Watchdog explains risky crypto transactions in plain English, checks real scam databases, and gets smarter every
            time an attack is verified.
          </p>
          <div className="mt-10 text-left">
            <AskBox />
          </div>
        </Container>
      </section>

      <ThreatField />

      <section className="bg-deep pt-16 pb-20 text-white">
        <Container>
          <div className="grid gap-8 border-b border-line-dark pb-12 md:grid-cols-[1.4fr_1fr] md:items-end">
            <h2 className="font-display text-4xl leading-[1.08] sm:text-5xl">
              It learns from the first attack,
              <br />
              and protects the next person.
            </h2>
            <p className="text-sm leading-6 text-white/65">
              Most crypto losses come from signatures and lookalike addresses people don&apos;t understand, not stolen seed
              phrases. Watchdog steps in before you sign, shows its evidence, and offers a safe fix.
            </p>
          </div>

          <div className="mt-12">
            <MonoLabel className="text-white/40">[N.01] &gt; How Watchdog protects you</MonoLabel>
            <div className="mt-5">
              <HowItWorks />
            </div>
          </div>

          <div className="mt-16">
            <MonoLabel className="text-white/40">[N.02] &gt; Proof of learning</MonoLabel>
            <div className="mt-5">
              <ProofStrip />
            </div>
          </div>

          <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-line-dark bg-deep-2 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h3 className="font-display text-3xl">See it stop an attack.</h3>
              <p className="mt-2 text-sm text-white/60">Two simulated wallets, real scam data, real SERV and Reppo calls.</p>
            </div>
            <CtaLink href="/demo" tone="light">
              Open the demo
            </CtaLink>
          </div>
        </Container>
      </section>
    </main>
  );
}
