"use client";

// Toast notifications, adapted from Uiverse.io (Yaya12085/smooth-seahorse-63, MIT):
// white card, round icon, title + description, a small tag and an action button.

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { createContext, useCallback, useContext, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Toast {
  id: number;
  title: string;
  description: string;
  tag?: string;
  tone?: "good" | "bad" | "info";
  action?: { label: string; href: string };
  icon?: React.ReactNode;
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const dismiss = (id: number) => setList((l) => l.filter((t) => t.id !== id));
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq;
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), 7000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-3 shadow-[0_30px_50px_-20px_rgb(30_42_40/.35)] ring-1 ring-line"
            >
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                  t.tone === "bad" ? "bg-risky/12 text-risky" : t.tone === "good" ? "bg-safe/12 text-safe" : "bg-accent/25 text-ink",
                )}
              >
                {t.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                <p className="truncate text-xs text-ink-soft">{t.description}</p>
                {t.tag && <span className="mt-1 inline-block rounded-md bg-accent/25 px-1.5 font-mono text-[11px] text-ink">{t.tag}</span>}
              </div>
              {t.action ? (
                <Link href={t.action.href} className="shrink-0 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-ink/90">
                  {t.action.label}
                </Link>
              ) : (
                <button onClick={() => dismiss(t.id)} className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-black/5" aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
