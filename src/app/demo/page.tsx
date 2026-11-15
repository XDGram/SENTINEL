import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { DemoClient } from "@/components/demo/DemoClient";

export const metadata: Metadata = {
  title: "Demo · Watchdog",
  description: "Two simulated wallets, real scam data, real SERV Reasoning and Reppo verification.",
};

export default function DemoPage() {
  return (
    <main className="pt-10 pb-24 sm:pt-14">
      <Container>
        <DemoClient />
      </Container>
    </main>
  );
}
