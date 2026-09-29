// Lifetime merge + Keep Supply seed-list integration.
//
// Search results keep every discovery record. Lifetime is keyed by facility
// (normalized company + city + state) and merges evidence from every record that
// maps to the same facility.

import type { Evidence, Prospect } from "./types";
import { companyKey, facilityKey, finalize, normName, strongerAmmonia, UNCLASSIFIED } from "./classify";
import { EXTERNAL_PROSPECTS, type ExternalProspect } from "./external-prospects";
import { isWesternState } from "./geo";

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs.filter((x) => x !== undefined && x !== null && x !== ("" as unknown as T)))];
}

function known(v?: string | null): string | undefined {
  const s = String(v ?? "").trim();
  return !s || /^(unknown|not found|needs verification|n\/a|na)$/i.test(s) ? undefined : s;
}

function evidenceKey(e: Evidence) {
  return `${e.source}|${e.label}|${e.url || ""}`.toLowerCase();
}

export function mergeEvidence(a: Evidence[] = [], b: Evidence[] = []): Evidence[] {
  const map = new Map<string, Evidence>();
  for (const e of [...a, ...b]) {
    const k = evidenceKey(e);
    if (!map.has(k)) map.set(k, e);
  }
  return [...map.values()].slice(0, 80);
}

// Normalize records written by earlier versions of the app (string evidence, missing fields).
export function upgradeLegacy(raw: Partial<Prospect> & Record<string, unknown>): Prospect {
  const evidence: Evidence[] = Array.isArray(raw.evidence)
    ? (raw.evidence as unknown[]).map((e) => (typeof e === "string" ? { label: e, source: String(raw.source || "Earlier search") } : (e as Evidence)))
    : [];
  const p: Prospect = {
    key: "",
    name: String(raw.name || "Unknown"),
    city: String(raw.city || "Unknown"),
    state: String(raw.state || "Unknown"),
    industry: String(raw.industry || raw.facilityType || "Unknown"),
    facilityType: String(raw.facilityType || UNCLASSIFIED),
    refrigeration: String(raw.refrigeration || "Needs verification"),
    ammonia: (raw.ammonia as Prospect["ammonia"]) || "Unknown",
    evidence,
    sourceUrls: Array.isArray(raw.sourceUrls) ? (raw.sourceUrls as string[]) : [],
    providers: Array.isArray(raw.providers) ? (raw.providers as string[]) : [String(raw.source || "Earlier search")],
    evidenceSources: Number(raw.evidenceSources || 0),
    confidence: (raw.confidence as Prospect["confidence"]) || "Low",
    score: Number(raw.score || 0),
    priority: (raw.priority as Prospect["priority"]) || "C",
    reason: String(raw.reason || ""),
    ...raw,
  } as Prospect;
  p.evidence = evidence;
  p.key = facilityKey(p);
  return p;
}

export function mergeProspect(base: Prospect | undefined, incoming: Prospect): Prospect {
  if (!base) return finalize({ ...incoming, timesSeen: incoming.timesSeen || 1 });
  const lb = Math.max(base.ammoniaLb || 0, incoming.ammoniaLb || 0) || null;
  const merged: Prospect = {
    ...base,
    // Keep the most specific known value for each descriptive field.
    name: base.name || incoming.name,
    facilityName: known(base.facilityName) || known(incoming.facilityName) || (incoming.name && normName(incoming.name) !== normName(base.name) ? incoming.name : undefined),
    city: known(base.city) || incoming.city,
    state: known(base.state) || incoming.state,
    address: known(base.address) || known(incoming.address),
    zip: known(base.zip) || known(incoming.zip),
    phone: known(base.phone) || known(incoming.phone),
    website: known(base.website) || known(incoming.website),
    lat: base.lat ?? incoming.lat,
    lon: base.lon ?? incoming.lon,
    industry: known(base.industry) && base.industry !== UNCLASSIFIED ? base.industry : incoming.industry,
    facilityType: base.facilityType && base.facilityType !== UNCLASSIFIED ? base.facilityType : incoming.facilityType,
    refrigeration: pickRefrigeration(base.refrigeration, incoming.refrigeration),
    ammonia: strongerAmmonia(base.ammonia, incoming.ammonia),
    ammoniaLb: lb,
    ammoniaLbSource: lb === (incoming.ammoniaLb || 0) ? incoming.ammoniaLbSource || base.ammoniaLbSource : base.ammoniaLbSource,
    co2: Boolean(base.co2 || incoming.co2),
    otherSignals: uniq([...(base.otherSignals || []), ...(incoming.otherSignals || [])]),
    equipmentBrands: uniq([...(base.equipmentBrands || []), ...(incoming.equipmentBrands || [])]),
    brandsSource: base.brandsSource || incoming.brandsSource,
    evidence: mergeEvidence(base.evidence, incoming.evidence),
    sourceUrls: uniq([...(base.sourceUrls || []), ...(incoming.sourceUrls || [])]).slice(0, 60),
    providers: uniq([...(base.providers || []), ...(incoming.providers || [])]),
    targetCategories: uniq([...(base.targetCategories || []), ...(incoming.targetCategories || [])]),
    naics: uniq([...(base.naics || []), ...(incoming.naics || [])]),
    registryIds: uniq([...(base.registryIds || []), ...(incoming.registryIds || [])]),
    sizeClass: base.sizeClass || incoming.sizeClass,
    parentCompany: known(base.parentCompany) || known(incoming.parentCompany),
    estimatedPartsOpportunity: base.estimatedPartsOpportunity || incoming.estimatedPartsOpportunity,
    buyerType: base.buyerType || incoming.buyerType,
    coldCallPriority: base.coldCallPriority || incoming.coldCallPriority,
    territoryAssignment: base.territoryAssignment || incoming.territoryAssignment,
    salesApproach: base.salesApproach || incoming.salesApproach,
    inSeedList: Boolean(base.inSeedList || incoming.inSeedList),
    seedPriorityScore: base.seedPriorityScore || incoming.seedPriorityScore,
    source: base.source || incoming.source,
    firstSeen: Math.min(base.firstSeen || Date.now(), incoming.firstSeen || Date.now()),
    lastSeen: Math.max(base.lastSeen || 0, incoming.lastSeen || 0) || Date.now(),
    timesSeen: (base.timesSeen || 1) + 1,
    lastResearched: Math.max(base.lastResearched || 0, incoming.lastResearched || 0) || undefined,
    saved: Boolean(base.saved || incoming.saved),
  };
  return finalize(merged);
}

function pickRefrigeration(a?: string, b?: string): string {
  const rank = (s?: string) => {
    const v = (s || "").toLowerCase();
    if (!v || /needs verification|unknown|not found/.test(v)) return 0;
    if (/candidate|verify|likely/.test(v)) return 1;
    if (/indicated|signal/.test(v)) return 2;
    return 3;
  };
  return rank(b) > rank(a) ? (b as string) : (a || b || "Needs verification");
}

// ---------------------------------------------------------------------------
// Keep Supply seed list
// ---------------------------------------------------------------------------

export const SEED_VERSION = 3;

function fmtParts(range?: string): string | undefined {
  if (!range) return undefined;
  const pretty = range.replace(/\d+/g, (n) => `$${Number(n).toLocaleString("en-US")}`).replace("-", "–");
  return `${pretty} (Keep Supply estimate)`;
}

export function seedToProspect(s: ExternalProspect): Prospect {
  const nh3 = /nh3|ammonia/i.test(s.refrigeration);
  const co2 = /co2/i.test(s.refrigeration);
  const p: Prospect = {
    key: "",
    name: s.name,
    city: "Unknown",
    state: s.state,
    industry: s.industry,
    facilityType: seedFacilityType(s),
    refrigeration: `${s.refrigeration} (Keep Supply list — needs verification)`,
    ammonia: nh3 ? "Likely" : "Unknown",
    ammoniaLb: null,
    co2,
    equipmentBrands: s.equipmentBrands || [],
    brandsSource: "Keep Supply prospect list",
    evidence: [
      { label: "Keep Supply imported prospect list", detail: `Refrigeration: ${s.refrigeration}; priority ${s.priorityScore ?? "n/a"}; cold-call ${s.coldCallPriority || "n/a"}`, source: "Keep Supply seed list", kind: "seed" },
    ],
    sourceUrls: [],
    providers: ["Keep Supply seed list"],
    evidenceSources: 1,
    confidence: "Medium",
    score: 0,
    priority: "C",
    reason: "",
    estimatedPartsOpportunity: fmtParts(s.estimatedPartsOpportunity),
    buyerType: s.buyerType,
    coldCallPriority: s.coldCallPriority,
    territoryAssignment: s.territoryAssignment,
    salesApproach: s.salesApproach,
    inSeedList: true,
    seedPriorityScore: s.priorityScore,
    source: s.source,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
  };
  p.key = companyKey(p);
  return finalize(p);
}

function seedFacilityType(s: ExternalProspect): string {
  const i = s.industry.toLowerCase();
  if (i.includes("cold storage")) return "Cold Storage / Refrigerated Warehouse";
  if (i.includes("protein") || i.includes("meat")) return "Meat / Protein Processing";
  if (i.includes("poultry")) return "Poultry Processing";
  if (i.includes("ice cream")) return "Ice Cream / Frozen Dessert";
  if (i.includes("dairy") || i.includes("cheese")) return "Dairy Processing";
  if (i.includes("seafood")) return "Seafood Processing";
  if (i.includes("frozen") || i.includes("potato")) return "Frozen Food / Produce Processing";
  if (i.includes("produce")) return "Produce Packing / Storage";
  if (i.includes("distribution")) return "Food Distribution Center";
  if (i.includes("beverage")) return "Beverage / Bottling";
  if (i.includes("brew")) return "Brewery";
  return "Food Ingredient / Other Food Manufacturing";
}

// Western-territory seed accounts, merged so duplicate rows (same company + state) become one.
export function westernSeedProspects(): Prospect[] {
  const map = new Map<string, Prospect>();
  for (const s of EXTERNAL_PROSPECTS) {
    if (!isWesternState(s.state)) continue; // out-of-territory rows stay in the source file, not in Lifetime
    const p = seedToProspect(s);
    const prev = map.get(p.key);
    map.set(p.key, prev ? mergeProspect(prev, p) : p);
  }
  return [...map.values()];
}

const SEED_INDEX: Array<{ norm: string; seed: ExternalProspect }> = EXTERNAL_PROSPECTS.map((seed) => ({ norm: normName(seed.name), seed }));

// Attach Keep Supply sales fields to a discovery record when it matches a seed account.
export function crossReferenceSeed(p: Prospect): Prospect {
  const n = normName(p.name);
  if (!n) return p;
  const match = SEED_INDEX.find(({ norm, seed }) => {
    if (seed.state !== p.state) return false;
    if (n === norm) return true;
    const padded = ` ${n} `;
    return padded.includes(` ${norm} `) || (n.split(" ").length >= 2 && ` ${norm} `.includes(padded));
  });
  if (!match) return p;
  const s = match.seed;
  return {
    ...p,
    inSeedList: true,
    seedPriorityScore: s.priorityScore,
    buyerType: p.buyerType || s.buyerType,
    estimatedPartsOpportunity: p.estimatedPartsOpportunity || fmtParts(s.estimatedPartsOpportunity),
    coldCallPriority: p.coldCallPriority || s.coldCallPriority,
    territoryAssignment: p.territoryAssignment || s.territoryAssignment,
    salesApproach: p.salesApproach || s.salesApproach,
    equipmentBrands: uniq([...(p.equipmentBrands || []), ...(s.equipmentBrands || [])]),
    brandsSource: p.brandsSource || "Keep Supply prospect list",
    ammonia: strongerAmmonia(p.ammonia, /nh3|ammonia/i.test(s.refrigeration) ? "Likely" : "Unknown"),
    providers: uniq([...(p.providers || []), "Keep Supply seed list"]),
    evidence: mergeEvidence(p.evidence, [{ label: "Matches Keep Supply prospect list account", detail: `${s.name} (${s.state}) — ${s.refrigeration}`, source: "Keep Supply seed list", kind: "seed" }]),
  };
}

// ---------------------------------------------------------------------------
// Lifetime dedupe
// ---------------------------------------------------------------------------
// A facility can appear under different names in different sources (e.g. TRI "McCain Foods USA Inc"
// vs ECHO "McCain Foods USA Burley Facility"). Records resolve to an existing Lifetime facility by:
//   1. identical facility key (normalized name + city + state)
//   2. a shared registry id (EPA FRS / TRI / FSIS establishment number)
//   3. same ZIP + street number AND at least one distinctive name word in common
//   4. company-level records (city unknown) attach to the company's single known facility

const GENERIC_TOKENS = new Set(["foods", "food", "company", "facility", "plant", "north", "america", "american", "products", "processing", "distribution", "center", "warehouse", "logistics", "cold", "storage", "dairy", "farms", "farm", "meats", "meat", "group", "holdings", "international", "west", "western", "services", "industries", "enterprises", "division", "site", "location"]);

function sigTokens(name: string): string[] {
  return normName(name).split(" ").filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t));
}

function addrKey(p: { address?: string; zip?: string }): string {
  const num = String(p.address || "").trim().match(/^(\d{1,6})\b/)?.[1];
  const zip = String(p.zip || "").match(/\d{5}/)?.[0];
  return num && zip ? `${zip}|${num}` : "";
}

type FacilityIndex = { byCompany: Map<string, string[]>; byReg: Map<string, string>; byAddr: Map<string, string[]> };

function push(map: Map<string, string[]>, k: string, v: string) {
  const list = map.get(k);
  if (list) { if (!list.includes(v)) list.push(v); } else map.set(k, [v]);
}

function indexFacility(idx: FacilityIndex, key: string, p: Prospect) {
  const [n, , st] = key.split("|");
  push(idx.byCompany, `${n}|${st}`, key);
  for (const id of p.registryIds || []) if (/^(FRS|TRI|FSIS) /.test(id) && !idx.byReg.has(id)) idx.byReg.set(id, key);
  const a = addrKey(p);
  if (a) push(idx.byAddr, a, key);
}

function buildIndex(lifetime: Record<string, Prospect>): FacilityIndex {
  const idx: FacilityIndex = { byCompany: new Map(), byReg: new Map(), byAddr: new Map() };
  for (const [k, p] of Object.entries(lifetime)) indexFacility(idx, k, p);
  return idx;
}

function resolveKey(lifetime: Record<string, Prospect>, idx: FacilityIndex, r: Prospect): string {
  const key = r.key || facilityKey(r);
  if (lifetime[key]) return key;
  for (const id of r.registryIds || []) {
    const k = idx.byReg.get(id);
    if (k && lifetime[k]) return k;
  }
  const a = addrKey(r);
  if (a) {
    const toks = sigTokens(r.name);
    const hit = (idx.byAddr.get(a) || []).find((k) => lifetime[k] && sigTokens(lifetime[k].name).some((t) => toks.includes(t)));
    if (hit) return hit;
  }
  const [n, city, st] = key.split("|");
  if (city === "?") {
    const facilities = (idx.byCompany.get(`${n}|${st}`) || []).filter((k) => k.split("|")[1] !== "?" && lifetime[k]);
    if (facilities.length === 1) return facilities[0];
  }
  return key;
}

// Merge a batch of discovery records into a Lifetime map (mutates the map).
// Returns the changed facilities, the keys that are new to Lifetime, and where each record landed.
export function mergeIntoLifetime(lifetime: Record<string, Prospect>, records: Prospect[], now = Date.now(), keepTimes = false): { changed: Prospect[]; newKeys: string[]; redirects: Record<string, string> } {
  return mergeWithIndex(lifetime, buildIndex(lifetime), records, now, keepTimes);
}

function mergeWithIndex(lifetime: Record<string, Prospect>, idx: FacilityIndex, records: Prospect[], now: number, keepTimes: boolean): { changed: Prospect[]; newKeys: string[]; redirects: Record<string, string> } {
  const changed = new Map<string, Prospect>();
  const newKeys: string[] = [];
  const redirects: Record<string, string> = {};
  for (const r of records) {
    const original = r.key || facilityKey(r);
    const key = resolveKey(lifetime, idx, { ...r, key: original });
    redirects[original] = key;
    const prev = lifetime[key];
    const times = keepTimes ? { firstSeen: Math.min(prev?.firstSeen ?? Infinity, r.firstSeen ?? now), lastSeen: Math.max(prev?.lastSeen ?? 0, r.lastSeen ?? now) } : { firstSeen: prev?.firstSeen ?? now, lastSeen: now };
    const merged = mergeProspect(prev, { ...r, key, ...times });
    merged.key = key;
    if (keepTimes) { merged.firstSeen = times.firstSeen; merged.lastSeen = times.lastSeen; }
    lifetime[key] = merged;
    changed.set(key, merged);
    indexFacility(idx, key, merged);
    if (!prev) newKeys.push(key);
  }
  return { changed: [...changed.values()], newKeys, redirects };
}

// Re-run facility resolution over an existing Lifetime (used once after dedupe rules improve).
export function consolidateLifetime(lifetime: Record<string, Prospect>): { lifetime: Record<string, Prospect>; remap: Record<string, string>; removed: string[] } {
  const entries = Object.values(lifetime).sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0));
  const next: Record<string, Prospect> = {};
  const remap: Record<string, string> = {};
  const idx = buildIndex(next);
  for (const p of entries) {
    const { redirects } = mergeWithIndex(next, idx, [p], Date.now(), true);
    const to = redirects[p.key] || p.key;
    if (to !== p.key) remap[p.key] = to;
  }
  const removed = Object.keys(lifetime).filter((k) => !next[k]);
  return { lifetime: next, remap, removed };
}
