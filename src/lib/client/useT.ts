"use client";

// Interface copy that follows the chosen language.

import { t, type CopyKey } from "@/lib/i18n";
import { useCurrentLanguage } from "./hooks";

export function useT(): (key: CopyKey) => string {
  const language = useCurrentLanguage();
  return (key: CopyKey) => t(key, language);
}
