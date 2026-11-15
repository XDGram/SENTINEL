"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/#check", label: "Check" },
  { href: "/demo", label: "Demo" },
  { href: "/memory", label: "Threat memory" },
  { href: "/developers", label: "Developers" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/80 backdrop-blur-md">
      <Container className="flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-medium tracking-tight" aria-label="Sentinel home">
          <Logo className="h-5 w-5" />
          Sentinel
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-ink-soft md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn("transition-colors hover:text-ink", path === l.href && "text-ink")}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/demo"
            className="hidden h-8 items-center rounded-full bg-ink px-4 text-xs font-medium text-white transition-colors hover:bg-ink/90 sm:inline-flex"
          >
            Try the demo
          </Link>
          <button
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>
      {open && (
        <nav className="border-t border-line/60 md:hidden" aria-label="Mobile">
          <Container className="flex flex-col py-2">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2.5 text-sm text-ink">
                {l.label}
              </Link>
            ))}
          </Container>
        </nav>
      )}
    </header>
  );
}
