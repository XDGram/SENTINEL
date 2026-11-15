import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

export const metadata: Metadata = {
  title: "Watchdog · Know before you sign",
  description:
    "Watchdog explains risky crypto transactions in plain English, checks real scam databases, and gets smarter every time an attack is verified through Reppo.",
};

export const viewport: Viewport = {
  themeColor: "#e8ebea",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
