// Browser side of cloud sync (see app/api/lifetime/route.ts). Lifetime stays in IndexedDB
// for speed and offline use; the server copy lets it follow you to other browsers.

import type { Prospect } from "./types";

export type CloudStatus = { configured: boolean; database: boolean; passcode: boolean };
export type CloudRecord = { store: "lifetime" | "saved" | "meta"; key: string; data: unknown; deleted: boolean; updatedAt: string };

const PASS_KEY = "ks-cloud-passcode";

export function storedPasscode(): string {
  try { return localStorage.getItem(PASS_KEY) || ""; } catch { return ""; }
}
export function rememberPasscode(p: string) {
  try { if (p) localStorage.setItem(PASS_KEY, p); else localStorage.removeItem(PASS_KEY); } catch { /* ignore */ }
}

export async function cloudStatus(): Promise<CloudStatus> {
  try {
    const r = await fetch("/api/lifetime?status=1", { cache: "no-store" });
    if (!r.ok) return { configured: false, database: false, passcode: false };
    return await r.json();
  } catch { return { configured: false, database: false, passcode: false }; }
}

export async function cloudPull(passcode: string, since: string): Promise<{ records: CloudRecord[]; latest: string }> {
  const all: CloudRecord[] = [];
  let cursor = since;
  for (let page = 0; page < 200; page++) {
    const r = await fetch(`/api/lifetime?since=${encodeURIComponent(cursor)}&limit=1000`, { headers: { "x-app-passcode": passcode }, cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Cloud sync failed (HTTP ${r.status})`);
    all.push(...(d.records || []));
    if (d.records?.length) cursor = d.records[d.records.length - 1].updatedAt;
    if (!d.more) break;
  }
  return { records: all, latest: cursor };
}

export async function cloudPush(passcode: string, upserts: Array<{ store: string; key: string; data: unknown }>, deletes: Array<{ store: string; key: string }> = []): Promise<void> {
  // Keep each request well under the serverless body limit.
  const chunks: Array<typeof upserts> = [];
  let cur: typeof upserts = [];
  let size = 0;
  for (const u of upserts) {
    const n = JSON.stringify(u.data).length;
    if (cur.length && (size + n > 1_500_000 || cur.length >= 400)) { chunks.push(cur); cur = []; size = 0; }
    cur.push(u); size += n;
  }
  if (cur.length) chunks.push(cur);
  if (!chunks.length && deletes.length) chunks.push([]);
  for (const [i, chunk] of chunks.entries()) {
    const r = await fetch("/api/lifetime", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-passcode": passcode },
      body: JSON.stringify({ upserts: chunk, deletes: i === 0 ? deletes : [] }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `Cloud sync failed (HTTP ${r.status})`);
    }
  }
}

export function asProspect(x: unknown): Prospect | null {
  const p = x as Prospect;
  return p && typeof p === "object" && typeof p.key === "string" && typeof p.name === "string" ? p : null;
}
