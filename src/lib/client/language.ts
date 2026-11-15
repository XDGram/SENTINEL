"use client";

// The language Watchdog explains in, shared across the whole app.
//
// Kept as a small module store rather than React context alone, because the
// API helpers in api.ts are plain functions and need to read the current
// choice without every caller threading it through.

import type { Language } from "@/lib/types";

const KEY = "watchdog:language";

/** Only languages SERV has actually been exercised in are offered. */
export const SUPPORTED_LANGUAGES: { code: Language; label: string; full: string }[] = [
  { code: "en", label: "EN", full: "English" },
  { code: "fr", label: "FR", full: "Français" },
  { code: "es", label: "ES", full: "Español" },
];

const isSupported = (v: unknown): v is Language => SUPPORTED_LANGUAGES.some((l) => l.code === v);

let current: Language = "en";
const listeners = new Set<(l: Language) => void>();

/** Read the stored choice once, on the client. */
export function initLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (isSupported(stored)) current = stored;
  } catch {
    // Blocked storage just means the choice lasts for this page only.
  }
  return current;
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(next: Language) {
  if (!isSupported(next) || next === current) return;
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Not essential.
  }
  for (const fn of listeners) fn(next);
}

export function subscribeLanguage(fn: (l: Language) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
