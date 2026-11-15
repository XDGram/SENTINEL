import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard · Watchdog",
  description: "Your wallet's approvals, Watchdog's verified threat memory and what it has learned, live.",
};

export default function DashboardPage() {
  return (
    <main className="pt-8 pb-24">
      <Container>
        <Dashboard />
      </Container>
    </main>
  );
}
