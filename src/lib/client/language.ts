"use client";

// The language Watchdog explains in, shared across the whole app.
//
// Kept as a small module store rather than React context alone, because the
// API helpers in api.ts are plain functions and need to read the current
// choice without every caller threading it through.

import type { Language } from "@/lib/types";

/** Only languages SERV has actually been exercised in are offered. */
export const SUPPORTED_LANGUAGES: { code: Language; label: string; full: string }[] = [
  { code: "en", label: "EN", full: "English" },
  { code: "fr", label: "FR", full: "Français" },
  { code: "es", label: "ES", full: "Español" },
];

const isSupported = (v: unknown): v is Language => SUPPORTED_LANGUAGES.some((l) => l.code === v);

let current: Language = "en";
const listeners = new Set<(l: Language) => void>();

/**
 * Every visit starts in English, so the site always opens in a language the
 * owner can read and the picker always agrees with what is on screen. The
 * choice lasts for the visit, not beyond it.
 */
export function initLanguage(): Language {
  return current;
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(next: Language) {
  if (!isSupported(next) || next === current) return;
  current = next;
  for (const fn of listeners) fn(next);
}

export function subscribeLanguage(fn: (l: Language) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
