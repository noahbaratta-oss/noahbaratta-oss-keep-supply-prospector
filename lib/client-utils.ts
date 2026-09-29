// Client-only helpers: settings persistence, CSV export, list parsing.

import type { Prospect } from "./types";
import { facilityKey, finalize, classifyFacility } from "./classify";
import { ABBR_STATE, WESTERN_STATES, detectState } from "./geo";

export const LS = {
  filters: "keep-supply-target-filters-v1",
  custom: "ks-custom-targets-v1",
  providers: "ks-providers-v1",
  territory: "ks-territory-v1",
  depth: "ks-depth-v1",
  autoResearch: "ks-auto-research-v1",
};

export function readLs<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export function writeLs(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function selectedTargets(): string[] {
  const base = readLs<string[]>(LS.filters, []);
  return Array.isArray(base) ? base.filter((x) => typeof x === "string") : [];
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Prospect[]): string {
  const cols: Array<[string, (p: Prospect) => unknown]> = [
    ["Company", (p) => p.name], ["Facility", (p) => p.facilityName], ["Address", (p) => p.address], ["City", (p) => p.city],
    ["State", (p) => p.state], ["ZIP", (p) => p.zip], ["Phone (as published by source)", (p) => p.phone], ["Website", (p) => p.website],
    ["Facility type", (p) => p.facilityType], ["Industry", (p) => p.industry], ["Refrigeration", (p) => p.refrigeration],
    ["Ammonia", (p) => p.ammonia], ["Ammonia lb (documented)", (p) => p.ammoniaLb || ""], ["CO2 signal", (p) => (p.co2 ? "Yes" : "")],
    ["OEM brands", (p) => p.equipmentBrands], ["OEM source", (p) => p.brandsSource], ["Score", (p) => p.score], ["Priority", (p) => p.priority],
    ["Confidence", (p) => p.confidence], ["Supporting sources", (p) => p.evidenceSources], ["Providers", (p) => p.providers],
    ["Source URLs", (p) => (p.sourceUrls || []).slice(0, 5)], ["Buyer type (KS list)", (p) => p.buyerType], ["Likely buyer (inferred)", (p) => p.likelyBuyerType],
    ["Parts opportunity", (p) => p.estimatedPartsOpportunity || "Needs verification"], ["Cold call priority", (p) => p.coldCallPriority],
    ["Territory", (p) => p.territoryAssignment], ["Sales approach", (p) => p.salesApproach], ["In Keep Supply list", (p) => (p.inSeedList ? "Yes" : "")],
    ["Registry IDs", (p) => p.registryIds], ["First seen", (p) => (p.firstSeen ? new Date(p.firstSeen).toISOString().slice(0, 10) : "")],
    ["Last seen", (p) => (p.lastSeen ? new Date(p.lastSeen).toISOString().slice(0, 10) : "")],
  ];
  const lines = [cols.map(([h]) => csvCell(h)).join(",")];
  for (const p of rows) lines.push(cols.map(([, f]) => csvCell(f(p))).join(","));
  return lines.join("\n");
}

export function download(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Parse pasted facility lists (e.g. copied from Google Maps results or a spreadsheet):
//   "ABC Cold Storage, Tolleson, AZ"   "ABC Foods — 123 Main St, Boise, ID 83705"   "ABC Meats\tYakima\tWA"
export function parseFacilityList(text: string, fallbackState: string): Prospect[] {
  const out: Prospect[] = [];
  const now = Date.now();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 3 || /^(rating|reviews?|open|closed|directions|website|\d(\.\d)?\s*\(\d+\))/i.test(line)) continue;
    const parts = line.split(/\t| — | – | - |,|\|/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const name = parts[0];
    let state = detectState(line, "");
    const abbr = line.match(/\b(AZ|CA|CO|ID|MT|NV|NM|OR|UT|WA|WY|AK|HI)\b/);
    if (state === "Unknown" && abbr) state = ABBR_STATE[abbr[1]];
    if (state === "Unknown") state = (WESTERN_STATES as readonly string[]).includes(fallbackState) ? fallbackState : "Unknown";
    const stIdx = parts.findIndex((p) => /^(AZ|CA|CO|ID|MT|NV|NM|OR|UT|WA|WY|AK|HI)(\s+\d{5})?$/.test(p) || (WESTERN_STATES as readonly string[]).includes(p));
    const city = stIdx > 1 ? parts[stIdx - 1] : parts.length >= 2 && !/\d/.test(parts[1]) ? parts[1] : "Unknown";
    const street = parts.slice(1, stIdx > 1 ? stIdx - 1 : 1).find((p) => /^\d+\s+\w+/.test(p));
    const zip = line.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
    const type = classifyFacility(line);
    const p: Prospect = {
      key: "", recordId: `list:${name}|${city}|${state}`, name, city, state, address: street, zip,
      facilityType: type.type, industry: type.type, refrigeration: "Needs verification", ammonia: "Unknown", ammoniaLb: null,
      evidence: [{ label: "Added from pasted facility list", detail: line.slice(0, 200), source: "Manual list", kind: "inferred" }],
      sourceUrls: [], providers: ["Manual list"], evidenceSources: 0, confidence: "Low", score: 0, priority: "C", reason: "",
      source: "Pasted list", firstSeen: now, lastSeen: now,
    };
    p.key = facilityKey(p);
    out.push(finalize(p));
  }
  return out;
}

export const fmt = (n: number) => n.toLocaleString("en-US");
