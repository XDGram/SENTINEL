import "server-only";

/** Small TTL cache shared across requests in the same server instance. */
export class TtlCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: T) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { at: Date.now(), value });
  }
}

/** fetch with a hard timeout, so one slow source never blocks the user. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export const nowIso = () => new Date().toISOString();

/** example.com, sub.example.com → [sub.example.com, example.com] */
export function hostAndParents(host: string): string[] {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "timed out" : err.message;
  return String(err);
}
