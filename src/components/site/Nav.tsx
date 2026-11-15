"use client";

// Floating glider-pill navbar, adapted from Uiverse.io (Pradeepsaranbishnoi/heavy-dragonfly-92, MIT):
// a white pill with a soft shadow, a sliding "glider" behind the active tab and a count badge.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFeed } from "@/lib/client/hooks";
import { MuteToggle } from "@/components/voice";
import { CtaLink } from "@/components/ui/elements";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Check" },
  { href: "/demo", label: "Demo" },
  { href: "/memory", label: "Threat memory", badge: true },
  { href: "/developers", label: "Developers" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const feed = useFeed();
  const verified = feed.data?.count;
  const active = LINKS.find((l) => (l.href === "/" ? path === "/" : path.startsWith(l.href)))?.href;

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3">
        <Link
          href="/"
          className="flex h-11 items-center gap-2 rounded-full bg-white/80 px-4 font-medium tracking-tight shadow-[0_0_1px_rgb(30_42_40/.2),0_6px_16px_-6px_rgb(30_42_40/.25)] backdrop-blur"
          aria-label="Watchdog home"
        >
          <Logo className="h-7 w-7" />
          Watchdog
        </Link>

        <nav
          aria-label="Main"
          className="relative hidden items-center gap-1 rounded-full bg-white/85 p-1.5 shadow-[0_0_1px_rgb(30_42_40/.2),0_6px_16px_-6px_rgb(30_42_40/.25)] backdrop-blur md:flex"
        >
          {LINKS.map((l) => {
            const isActive = active === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors",
                  isActive ? "text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-glider"
                    className="absolute inset-0 rounded-full bg-canvas"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{l.label}</span>
                {l.badge && verified != null && (
                  <span
                    className={cn(
                      "uv-tip relative grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] transition-colors",
                      isActive ? "bg-ink text-white" : "bg-ink/10 text-ink",
                    )}
                    data-tip="Reppo-verified attackers in memory"
                  >
                    {verified}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Watchdog reads a paused transaction out loud, so turning that off
              has to be reachable from anywhere, not just from a result card. */}
          <MuteToggle className="h-9 w-9 bg-white/85" />
          <CtaLink href="/demo" className="hidden h-11 sm:inline-flex">
            Try the demo
          </CtaLink>
          <button
            className="grid h-11 w-11 place-items-center rounded-full bg-white/85 shadow-[0_0_1px_rgb(30_42_40/.2),0_6px_16px_-6px_rgb(30_42_40/.25)] md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="mx-auto mt-2 max-w-[1200px] rounded-3xl bg-white/95 p-2 shadow-lg backdrop-blur md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cn("flex items-center justify-between rounded-2xl px-4 py-3 text-sm", active === l.href ? "bg-canvas text-ink" : "text-ink-soft")}
            >
              {l.label}
              {l.badge && verified != null && <span className="rounded-full bg-ink/10 px-2 font-mono text-[11px] text-ink">{verified}</span>}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
