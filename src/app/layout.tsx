import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel · Wallet safety that learns",
  description:
    "A wallet safety agent for everyday crypto users. It explains risky transactions in plain language, verifies new attacks through Reppo, and protects the next person.",
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
