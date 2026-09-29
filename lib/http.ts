// Server-side HTTP helper with timeouts, block detection, and a small in-memory cache
// (per warm serverless instance) for large public datasets.

export const USER_AGENT = "KeepSupplyProspector/3.0 (+https://keep-supply-prospector.vercel.app; public-data research)";

export type FetchResult = { ok: boolean; status: number; text: string; ms: number; error?: string };

export async function fetchText(url: string, opts: { timeout?: number; method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<FetchResult> {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout ?? 8000);
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      body: opts.body,
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9", ...(opts.headers || {}) },
      cache: "no-store",
      signal: ctl.signal,
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, ms: Date.now() - started };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, status: 0, text: "", ms: Date.now() - started, error: aborted ? "timeout" : e instanceof Error ? e.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

type CacheEntry = { at: number; value: unknown };
const CACHE = new Map<string, CacheEntry>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  CACHE.set(key, { at: Date.now(), value });
  return value;
}

// Minimal RFC-4180 CSV parser (handles quoted fields, embedded commas/quotes/newlines).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function csvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export function looksBlocked(html: string): boolean {
  return /(unusual traffic|captcha|are you a robot|bots use duckduckgo|anomaly-modal|verify you are human|enable javascript to continue|consent\.google|detected unusual|access denied)/i.test(html);
}
