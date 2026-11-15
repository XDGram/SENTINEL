import { BadgeCheck, BrainCircuit, Database, ListChecks, Radar } from "lucide-react";
import { MonoLabel } from "@/components/ui";
import { Spotlight } from "@/components/ui/Spotlight";

const STEPS = [
  { icon: ListChecks, title: "Rules", body: "Instant checks for lookalike addresses, zero-value bait, unlimited approvals and fake brand sites." },
  { icon: Radar, title: "Live scam sources", body: "GoPlus, ScamSniffer and MetaMask's phishing list are checked live, every time." },
  { icon: BrainCircuit, title: "SERV Reasoning", body: "Weighs the evidence, decides, and explains it in plain English with a step-by-step trace." },
  { icon: BadgeCheck, title: "Reppo verification", body: "New attackers go to Reppo's independent evaluators. Nothing is trusted until Reppo accepts it." },
  { icon: Database, title: "Shared threat memory", body: "Once verified, the attacker is blocked instantly for everyone, with no AI call needed." },
];

export function HowItWorks() {
  return (
    <section className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line-dark bg-line-dark sm:grid-cols-2 lg:grid-cols-5">
      {STEPS.map((s, i) => (
        <Spotlight key={s.title} lift={false} className="flex flex-col bg-deep p-5">
          <div className="flex items-center justify-between">
            <s.icon className="h-5 w-5 text-accent" aria-hidden />
            <MonoLabel className="text-white/35">{`// ${String(i + 1).padStart(3, "0")}`}</MonoLabel>
          </div>
          <h3 className="mt-8 text-[15px] font-medium text-white">{s.title}</h3>
          <p className="mt-2 text-sm leading-6 text-white/60">{s.body}</p>
        </Spotlight>
      ))}
    </section>
  );
}
