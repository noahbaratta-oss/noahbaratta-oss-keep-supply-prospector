// Browser persistence (IndexedDB). Lifetime + Saved are stored per record so large
// databases update incrementally; the latest search and settings live in "meta".
//
// Migration: the previous version stored one snapshot object in the "state" store
// (key "app") and even earlier versions used localStorage. Both are read once and
// merged in. The legacy data is left in place (not deleted).

import type { Prospect } from "./types";
import { mergeProspect, upgradeLegacy } from "./merge";

const DB_NAME = "keep-supply-prospector-db-v2"; // same database the previous version used
const DB_VERSION = 2;
const LEGACY_LS = { lifetime: "keep-supply-prospect-lifetime-v2", lastSearch: "keep-supply-prospect-last-search-v2", memory: "keep-supply-prospect-memory-v1", sweep: "keep-supply-prospect-sweep-v1" };

export type LoadedState = {
  lifetime: Record<string, Prospect>;
  saved: Record<string, Prospect>;
  lastSearch: Prospect[];
  lastSearchNew: string[];
  lastSearchMeta: { at?: number; rawHits?: number; territory?: string; targets?: string[] } | null;
  memory: Record<string, number>;
  sweep: number;
  seedVersion: number;
  persisted: boolean;
  migrated: number;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("lifetime")) db.createObjectStore("lifetime", { keyPath: "key" });
      if (!db.objectStoreNames.contains("saved")) db.createObjectStore("saved", { keyPath: "key" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // never block a future upgrade from another tab
      resolve(db);
    };
    req.onerror = () => resolve(null);
    // onblocked: an older tab still holds the v1 connection; the open completes once it closes.
  });
  return dbPromise;
}

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}

async function getAll(store: string): Promise<Prospect[]> {
  const db = await openDb();
  if (!db) return [];
  return reqP(db.transaction(store, "readonly").objectStore(store).getAll() as IDBRequest<Prospect[]>);
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const db = await openDb();
  if (!db) return fallback;
  try {
    const v = await reqP(db.transaction("meta", "readonly").objectStore("meta").get(key));
    return (v as T | undefined) ?? fallback;
  } catch { return fallback; }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  await txDone(tx);
}

export async function putRecords(store: "lifetime" | "saved", records: Prospect[]): Promise<void> {
  if (!records.length) return;
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const r of records) os.put(r);
  await txDone(tx);
}

export async function deleteRecord(store: "lifetime" | "saved", key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

function readLs<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

async function migrateLegacy(): Promise<{ lifetime: Prospect[]; saved: Prospect[]; lastSearch: Prospect[]; memory: Record<string, number>; sweep: number }> {
  const db = await openDb();
  let snap: { lifetime?: Record<string, unknown>; saved?: Record<string, unknown>; lastSearch?: unknown[]; memory?: Record<string, number>; sweep?: number } | undefined;
  if (db) {
    try { snap = await reqP(db.transaction("state", "readonly").objectStore("state").get("app")); } catch { snap = undefined; }
  }
  const lsLifetime = readLs<Record<string, unknown>>(LEGACY_LS.lifetime, {});
  const lsLast = readLs<unknown[]>(LEGACY_LS.lastSearch, []);
  const lsMemory = readLs<Record<string, number>>(LEGACY_LS.memory, {});
  const lsSweep = Number(readLs<number>(LEGACY_LS.sweep, 0)) || 0;
  const up = (x: unknown) => upgradeLegacy(x as Parameters<typeof upgradeLegacy>[0]);
  const lifetimeMap: Record<string, Prospect> = {};
  for (const raw of [...Object.values(lsLifetime), ...Object.values(snap?.lifetime || {})]) {
    const p = up(raw);
    lifetimeMap[p.key] = mergeProspect(lifetimeMap[p.key], p);
  }
  return {
    lifetime: Object.values(lifetimeMap),
    saved: Object.values(snap?.saved || {}).map((x) => ({ ...up(x), saved: true })),
    lastSearch: [...(snap?.lastSearch || lsLast)].map(up),
    memory: { ...lsMemory, ...(snap?.memory || {}) },
    sweep: Math.max(lsSweep, Number(snap?.sweep || 0)),
  };
}

export async function loadState(): Promise<LoadedState> {
  let persisted = false;
  try { persisted = Boolean(await navigator.storage?.persist?.()); } catch { persisted = false; }
  const db = await openDb();
  let migrated = 0;
  if (db && !(await getMeta<boolean>("migratedV3", false))) {
    const legacy = await migrateLegacy();
    migrated = legacy.lifetime.length;
    await putRecords("lifetime", legacy.lifetime);
    await putRecords("saved", legacy.saved);
    if (legacy.lastSearch.length) await setMeta("lastSearch", legacy.lastSearch);
    await setMeta("memory", legacy.memory);
    await setMeta("sweep", legacy.sweep);
    await setMeta("migratedV3", true);
  }
  const [lifetimeList, savedList, lastSearch, lastSearchNew, lastSearchMeta, memory, sweep, seedVersion] = await Promise.all([
    getAll("lifetime"), getAll("saved"), getMeta<Prospect[]>("lastSearch", []), getMeta<string[]>("lastSearchNew", []),
    getMeta<LoadedState["lastSearchMeta"]>("lastSearchMeta", null), getMeta<Record<string, number>>("memory", {}), getMeta<number>("sweep", 0), getMeta<number>("seedVersion", 0),
  ]);
  return {
    lifetime: Object.fromEntries(lifetimeList.map((p) => [p.key, p])),
    saved: Object.fromEntries(savedList.map((p) => [p.key, p])),
    lastSearch, lastSearchNew, lastSearchMeta, memory, sweep, seedVersion, persisted, migrated,
  };
}

export async function storageAvailable(): Promise<boolean> {
  return Boolean(await openDb());
}
