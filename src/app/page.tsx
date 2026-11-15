import { Container, MonoLabel } from "@/components/ui";
import { ArrowLink, CtaLink } from "@/components/ui/elements";
import { AskBox } from "@/components/home/AskBox";
import { ThreatField } from "@/components/home/ThreatField";
import { SourcesMarquee } from "@/components/home/SourcesMarquee";
import { Threats } from "@/components/home/Threats";
import { HowItWorksStory } from "@/components/home/HowItWorksStory";
import { LearningLoop } from "@/components/home/LearningLoop";
import { ProofStrip } from "@/components/home/ProofStrip";

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="pt-16 pb-14 sm:pt-24">
        <Container className="text-center">
          <MonoLabel className="text-ink-soft">Wallet safety agent · SERV Reasoning × Reppo</MonoLabel>
          <h1 className="font-display mx-auto mt-5 max-w-3xl text-[44px] leading-[1.04] text-ink sm:text-[68px]">
            Know before you sign.
            <br />
            <span className="text-ink/75 italic">Wallet safety that learns.</span>
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

      {/* The problem */}
      <section className="bg-deep pt-16 pb-20 text-white sm:pt-20">
        <Container>
          <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
            <div>
              <MonoLabel className="text-white/40">[N.01] &gt; What it stops</MonoLabel>
              <h2 className="font-display mt-4 text-[40px] leading-[1.05] sm:text-[56px]">
                Most wallets aren&apos;t hacked.
                <br />
                <span className="text-white/55 italic">They&apos;re tricked.</span>
              </h2>
            </div>
            <p className="text-[15px] leading-7 text-white/65">
              Losses rarely come from stolen seed phrases. They come from one signature or one copied address that looked
              fine. Existing warnings speak jargon, so beginners click through them.
            </p>
          </div>
          <div className="mt-10">
            <SourcesMarquee />
          </div>
          <div className="mt-10">
            <Threats />
          </div>
        </Container>
      </section>

      {/* How it works (illustrated) */}
      <section className="py-20 sm:py-28">
        <Container>
          <div className="mb-12 max-w-2xl">
            <MonoLabel className="text-ink-soft">[N.02] &gt; How it works</MonoLabel>
            <h2 className="font-display mt-4 text-[40px] leading-[1.05] text-ink sm:text-[56px]">
              Five seconds between you <span className="text-ink/60 italic">and a drained wallet.</span>
            </h2>
          </div>
          <HowItWorksStory />
        </Container>
      </section>

      {/* Learning loop + proof */}
      <section className="bg-deep py-20 text-white sm:py-28">
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
            <LearningLoop />
            <div>
              <MonoLabel className="text-white/40">[N.03] &gt; Proof of learning</MonoLabel>
              <h2 className="font-display mt-4 text-[40px] leading-[1.05] sm:text-[52px]">
                It learns from the first attack <span className="text-white/55 italic">and protects the next person.</span>
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-7 text-white/65">
                New attackers are sent to Reppo&apos;s independent evaluators. Nothing is trusted until Reppo accepts it. Once
                it does, everyone is protected, with no AI call needed.
              </p>
              <div className="mt-8">
                <ProofStrip compact />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="flex flex-col items-start justify-between gap-8 rounded-[28px] bg-surface p-8 ring-1 ring-line sm:p-12 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-[36px] leading-[1.05] text-ink sm:text-[48px]">
                See it stop an attack.
              </h2>
              <p className="mt-3 max-w-md text-[15px] text-ink-soft">Two simulated wallets, real scam data, real SERV and Reppo calls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CtaLink href="/demo">Open the demo</CtaLink>
              <ArrowLink href="/dashboard">View dashboard</ArrowLink>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
