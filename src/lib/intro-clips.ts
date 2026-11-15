// The spoken page introductions, one recording per language.
//
// Each was generated once with the same voice and committed as a static file,
// so it plays instantly and costs nothing per visitor. Lengths and cue points
// are measured from the audio itself, not estimated: the cue is where the
// closing sentence about muting begins, taken from the last pause in the file.

import type { Language } from "./types";

export type IntroPage = "home" | "demo" | "dashboard";

export interface IntroClip {
  src: string;
  seconds: number;
  /** Where the clip names the mute control, if it does. */
  muteCue?: number;
}

const CLIPS: Record<IntroPage, Partial<Record<Language, IntroClip>>> = {
  home: {
    en: { src: "/intro-watchdog.mp3", seconds: 24, muteCue: 21.2 },
    fr: { src: "/intro-watchdog-fr.mp3", seconds: 25, muteCue: 20.9 },
    es: { src: "/intro-watchdog-es.mp3", seconds: 26, muteCue: 22.3 },
  },
  demo: {
    en: { src: "/intro-demo.mp3", seconds: 39 },
    fr: { src: "/intro-demo-fr.mp3", seconds: 43 },
    es: { src: "/intro-demo-es.mp3", seconds: 48 },
  },
  dashboard: {
    en: { src: "/intro-dashboard.mp3", seconds: 31 },
    fr: { src: "/intro-dashboard-fr.mp3", seconds: 34 },
    es: { src: "/intro-dashboard-es.mp3", seconds: 32 },
  },
};

/** The recording for this page, falling back to English if one is missing. */
export function introClip(page: IntroPage, language: Language): IntroClip {
  const byLang = CLIPS[page];
  return byLang[language] ?? byLang.en!;
}
