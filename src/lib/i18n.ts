// Interface copy in the three languages Watchdog speaks.
//
// Translated by hand, not generated: these are the words a judge and a
// frightened beginner both read first. Where a term is genuinely technical
// (USDT, Reppo, SERV Reasoning) it is left alone rather than invented.
//
// Anything not listed here falls back to English, so a missing string shows
// real words rather than a key.

import type { Language } from "./types";

export const COPY = {
  // Navigation
  "nav.dashboard": { en: "Dashboard", fr: "Tableau de bord", es: "Panel" },
  "nav.check": { en: "Check", fr: "Vérifier", es: "Comprobar" },
  "nav.demo": { en: "Demo", fr: "Démo", es: "Demo" },
  "nav.memory": { en: "Threat memory", fr: "Mémoire des menaces", es: "Memoria de amenazas" },
  "nav.developers": { en: "Developers", fr: "Développeurs", es: "Desarrolladores" },
  "nav.tryDemo": { en: "Try the demo", fr: "Essayer la démo", es: "Probar la demo" },

  // Hero
  "hero.eyebrow": {
    en: "Wallet safety agent · SERV Reasoning × Reppo",
    fr: "Agent de sécurité pour portefeuille · SERV Reasoning × Reppo",
    es: "Agente de seguridad de carteras · SERV Reasoning × Reppo",
  },
  "hero.line1": { en: "Spots a scam once.", fr: "Repère une arnaque une fois.", es: "Detecta una estafa una vez." },
  "hero.line2": { en: "Stops it for everyone.", fr: "La bloque pour tout le monde.", es: "La bloquea para todos." },
  "hero.sub": {
    en: "Watchdog explains risky crypto transactions in plain English, checks real scam databases, and blocks every attacker it has already seen.",
    fr: "Watchdog explique les transactions crypto risquées en mots simples, vérifie de vraies bases de données d'arnaques, et bloque chaque attaquant qu'il a déjà vu.",
    es: "Watchdog explica las transacciones cripto arriesgadas con palabras sencillas, consulta bases de datos reales de estafas y bloquea a cada atacante que ya ha visto.",
  },

  // The Ask box
  "ask.placeholder": {
    en: "Paste a wallet address, contract, or a suspicious link…",
    fr: "Collez une adresse de portefeuille, un contrat ou un lien suspect…",
    es: "Pega una dirección de cartera, un contrato o un enlace sospechoso…",
  },
  "ask.scan": { en: "Scan my wallet", fr: "Analyser mon portefeuille", es: "Analizar mi cartera" },
  "ask.checkLink": { en: "Check a link", fr: "Vérifier un lien", es: "Comprobar un enlace" },
  "ask.tryDemo": { en: "Try the demo", fr: "Essayer la démo", es: "Probar la demo" },
  "ask.try": { en: "Try:", fr: "Essayez :", es: "Prueba:" },
  "ask.drainer": { en: "a drainer address", fr: "une adresse de siphonnage", es: "una dirección de vaciado" },
  "ask.vitalik": { en: "Vitalik's wallet", fr: "le portefeuille de Vitalik", es: "la cartera de Vitalik" },

  // Voice controls
  "voice.hearHome": { en: "Hear how Watchdog works", fr: "Écoutez comment Watchdog fonctionne", es: "Escucha cómo funciona Watchdog" },
  "voice.hearDemo": { en: "Hear how this demo works", fr: "Écoutez comment marche cette démo", es: "Escucha cómo funciona esta demo" },
  "voice.hearDashboard": { en: "Hear what this dashboard shows", fr: "Écoutez ce que montre ce tableau de bord", es: "Escucha qué muestra este panel" },
  "voice.speaking": { en: "Watchdog is explaining this page", fr: "Watchdog explique cette page", es: "Watchdog está explicando esta página" },
  "voice.skip": { en: "Skip", fr: "Passer", es: "Omitir" },
  "voice.listen": { en: "Listen", fr: "Écouter", es: "Escuchar" },
  "voice.stop": { en: "Stop", fr: "Arrêter", es: "Parar" },
  "voice.preparing": { en: "Preparing", fr: "Préparation", es: "Preparando" },
  "voice.explain": { en: "Explain this to me", fr: "Explique-moi ça", es: "Explícamelo" },
  "voice.explainPreparing": { en: "Preparing the explanation…", fr: "Préparation de l'explication…", es: "Preparando la explicación…" },

  // Language invite
  "lang.title": {
    en: "Read and hear Watchdog in your language",
    fr: "Lisez et écoutez Watchdog dans votre langue",
    es: "Lee y escucha Watchdog en tu idioma",
  },
  "lang.note": {
    en: "Warnings, explanations and the voice.",
    fr: "Avertissements, explications et la voix.",
    es: "Avisos, explicaciones y la voz.",
  },

  // Demo
  "demo.eyebrow": {
    en: "Live demo · simulated wallets, real data",
    fr: "Démo en direct · portefeuilles simulés, données réelles",
    es: "Demo en vivo · carteras simuladas, datos reales",
  },
  "demo.line1": { en: "Two wallets.", fr: "Deux portefeuilles.", es: "Dos carteras." },
  "demo.line2": { en: "One shared memory.", fr: "Une mémoire partagée.", es: "Una memoria compartida." },
  "demo.reset": { en: "Reset demo", fr: "Réinitialiser", es: "Reiniciar" },

  // Other page headings
  "page.dashboard": { en: "Dashboard", fr: "Tableau de bord", es: "Panel" },
  "page.dashboardEyebrow": {
    en: "Your watchdog is on duty",
    fr: "Votre watchdog est en service",
    es: "Tu watchdog está de guardia",
  },
  "page.memory": { en: "Threat memory", fr: "Mémoire des menaces", es: "Memoria de amenazas" },
  "page.devLine1": {
    en: "Plug verified threat intelligence",
    fr: "Branchez des renseignements vérifiés sur les menaces",
    es: "Conecta inteligencia de amenazas verificada",
  },
  "page.devLine2": { en: "into your wallet.", fr: "à votre portefeuille.", es: "a tu cartera." },

  // Loading
  "loading.checking": {
    en: "Checking live scam sources and asking SERV…",
    fr: "Vérification des sources en direct et interrogation de SERV…",
    es: "Consultando fuentes en vivo y preguntando a SERV…",
  },
  "loading.rereading": {
    en: "Re-reading this in English…",
    fr: "Nouvelle lecture en français…",
    es: "Releyendo esto en español…",
  },

  // Results
  "result.safe": { en: "Looks safe", fr: "Semble sûr", es: "Parece seguro" },
  "result.risky": { en: "Dangerous", fr: "Dangereux", es: "Peligroso" },
  "result.uncertain": { en: "Be careful", fr: "Prudence", es: "Ten cuidado" },
  "result.confidence": { en: "Confidence", fr: "Confiance", es: "Confianza" },
  "result.whatToDo": { en: "What to do", fr: "Que faire", es: "Qué hacer" },
  "result.evidence": { en: "Evidence", fr: "Preuves", es: "Pruebas" },
  "result.sources": { en: "Live sources checked", fr: "Sources consultées en direct", es: "Fuentes consultadas en vivo" },
  "result.reasoning": { en: "Reasoning", fr: "Raisonnement", es: "Razonamiento" },
  "result.askTitle": { en: "Ask Watchdog", fr: "Demandez à Watchdog", es: "Pregunta a Watchdog" },
  "result.askPlaceholder": {
    en: "Ask a follow-up question…",
    fr: "Posez une question complémentaire…",
    es: "Haz una pregunta de seguimiento…",
  },
} as const satisfies Record<string, Partial<Record<Language, string>> & { en: string }>;

export type CopyKey = keyof typeof COPY;

/** Interface copy for a key, falling back to English when a language lacks it. */
export function t(key: CopyKey, language: Language): string {
  const entry = COPY[key] as Partial<Record<Language, string>>;
  return entry[language] ?? entry.en ?? key;
}
