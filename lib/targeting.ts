// Client-safe helpers shared by server providers and browser-side discovery.

import type { Prospect } from "./types";
import { classifyFacility, facilityKey, facilityTypeFromNaics, finalize, UNCLASSIFIED } from "./classify";
import { DEFAULT_TARGETS, TARGET_DEFS, defFor } from "./target-filters";
import { crossReferenceSeed } from "./merge";

const SIGNAL_TARGETS = new Set(["Ammonia", "Industrial refrigeration", "Cold storage", "CO₂ refrigeration", "Production facility", "Large-scale manufacturing", "Industrial production facilities", "Process cooling facilities", "Packaging line", "Distribution center"]);

// Facility types allowed by the selected targets (null = allow all).
export function allowedTypes(targets: string[]): Set<string> | null {
  if (!targets.length || targets.some((t) => SIGNAL_TARGETS.has(t))) return null;
  const types = new Set<string>();
  for (const t of targets) {
    const def = defFor(t);
    if (def.naics?.length) for (const code of def.naics) types.add(facilityTypeFromNaics([code]).type);
    types.add(classifyFacility(`${t} ${def.aliases.join(" ")}`).type);
    if (def.fsis) { types.add("Meat / Protein Processing"); types.add("Poultry Processing"); }
  }
  types.delete(UNCLASSIFIED);
  return types;
}

export function targetsMatching(targets: string[], codes: string[], type: string): string[] {
  const list = targets.length ? targets : DEFAULT_TARGETS;
  return list.filter((t) => {
    const def = TARGET_DEFS[t];
    if (!def) return false;
    if (def.naics?.some((c) => codes.some((x) => x.startsWith(c)))) return true;
    return classifyFacility(`${t} ${def.aliases.join(" ")}`).type === type;
  }).slice(0, 6);
}

// Build a finalized, seed-cross-referenced discovery record from partial fields.
export function makeRecord(partial: Partial<Prospect> & Pick<Prospect, "name" | "city" | "state" | "facilityType">): Prospect {
  const p: Prospect = {
    key: "",
    industry: partial.facilityType,
    refrigeration: "Needs verification",
    ammonia: "Unknown",
    ammoniaLb: null,
    evidence: [],
    sourceUrls: [],
    providers: [],
    evidenceSources: 0,
    confidence: "Low",
    score: 0,
    priority: "C",
    reason: "",
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    ...partial,
  };
  p.key = facilityKey(p);
  return finalize(crossReferenceSeed(p));
}

export const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
