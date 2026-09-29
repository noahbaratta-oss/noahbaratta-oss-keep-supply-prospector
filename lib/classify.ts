// Classification, signal extraction, keys and scoring. Deterministic and evidence-based:
// nothing here invents facts — it only labels what the source text / registry says.

import type { AmmoniaStatus, Confidence, Evidence, Priority, Prospect } from "./types";
import { STATE_ABBR, toStateName } from "./geo";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const SUFFIXES = /\b(incorporated|inc|llc|l l c|llp|lp|ltd|limited|co|corp|corporation|company|companies|plc|pbc|the|dba)\b/g;

export function normName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normCity(city: string): string {
  const c = String(city || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !c || c === "unknown" || c === "not found" ? "?" : c;
}

export function stateCode(state: string): string {
  const s = toStateName(state);
  return STATE_ABBR[s] || (s || "??").slice(0, 2).toUpperCase();
}

export function facilityKey(p: { name: string; city: string; state: string }): string {
  return `${normName(p.name)}|${normCity(p.city)}|${stateCode(p.state)}`;
}

export function companyKey(p: { name: string; state: string }): string {
  return `${normName(p.name)}|?|${stateCode(p.state)}`;
}

// ---------------------------------------------------------------------------
// Facility types
// ---------------------------------------------------------------------------

export const FACILITY_TYPES: Array<{ type: string; base: number; re: RegExp; buyer: string }> = [
  { type: "Cold Storage / Refrigerated Warehouse", base: 72, re: /(cold storage|refrigerated (warehous|storage|distribution)|freezer (warehouse|storage)|frozen (storage|warehouse)|cold chain|temperature[- ]controlled (warehouse|logistics|storage)|3pl cold|493120)/i, buyer: "Chief Engineer / Refrigeration Manager" },
  { type: "Poultry Processing", base: 70, re: /(poultry|chicken|turkey) (processing|slaughter|plant|products)|poultry processing|poultry slaughter|311615/i, buyer: "Plant Engineer / Maintenance Manager" },
  { type: "Meat / Protein Processing", base: 68, re: /(beef|pork|meat|protein|sausage|slaughter|packing plant|packinghouse|meat packing|meat processing|meats\b|311611|311612)/i, buyer: "Plant Engineer / Maintenance Manager" },
  { type: "Rendering", base: 55, re: /(render(ing)?\b|311613)/i, buyer: "Maintenance Manager" },
  { type: "Seafood Processing", base: 70, re: /(seafood|fish processing|salmon|pollock|crab|shellfish|311710)/i, buyer: "Plant Engineer / Refrigeration Lead" },
  { type: "Ice Cream / Frozen Dessert", base: 70, re: /(ice cream|frozen dessert|gelato plant|311520)/i, buyer: "Engineering Manager" },
  { type: "Dairy Processing", base: 68, re: /(dairy|milk|cheese|yogurt|creamery|butter|whey|311511|311512|311513|311514)/i, buyer: "Plant Engineer / Engineering Manager" },
  { type: "Frozen Food / Produce Processing", base: 70, re: /(frozen food|frozen (fruit|vegetable|potato)|french fr|potato process|vegetable process|iqf|311411|311412|311423)/i, buyer: "Plant Engineer / Refrigeration Supervisor" },
  { type: "Produce Packing / Storage", base: 64, re: /(produce|fruit pack|packing house|packinghouse|apple storage|controlled atmosphere|onion storage|leafy green|115114|424480)/i, buyer: "Facilities / Refrigeration Supervisor" },
  { type: "Food Distribution Center", base: 60, re: /(food distribution|foodservice distribution|grocery distribution|distribution center|424410|424420|424430|424470)/i, buyer: "Facilities Manager / Maintenance Manager" },
  { type: "Brewery", base: 55, re: /(brewery|brewing|312120)/i, buyer: "Brewmaster / Maintenance Manager" },
  { type: "Distillery", base: 50, re: /(distiller|spirits|whiskey|vodka|312140)/i, buyer: "Operations / Maintenance Manager" },
  { type: "Winery", base: 48, re: /(winery|wine cellar|vineyard|312130)/i, buyer: "Winemaker / Facilities Manager" },
  { type: "Beverage / Bottling", base: 58, re: /(beverage|bottling|soft drink|juice|soda|water bottl|312111|312112|424810|424820)/i, buyer: "Engineering / Maintenance Manager" },
  { type: "Ice Manufacturing", base: 62, re: /(\bice (company|plant|manufactur|house)|packaged ice|312113)/i, buyer: "Plant Manager" },
  { type: "Pharma Distribution / Cold Chain", base: 58, re: /(pharmaceutical (distribution|cold|warehouse)|pharma cold|424210)/i, buyer: "Facilities / Validation Manager" },
  { type: "Pharma / Life Sciences Manufacturing", base: 55, re: /(pharmaceutical|pharma\b|biotech|biologic|vaccine|life science|api manufactur|325411|325412|325413|325414)/i, buyer: "Facilities Engineering Manager" },
  { type: "Chemical / Industrial Gas", base: 48, re: /(chemical|industrial gas|air separation|carbon dioxide plant|co2 plant|fertilizer|325120|3251|3253|325199)/i, buyer: "Maintenance / Reliability Engineer" },
  { type: "Plastics / Rubber Manufacturing", base: 42, re: /(plastic|rubber|polymer|resin|3261|3262|325211)/i, buyer: "Maintenance Manager" },
  { type: "Refrigeration Contractor / Service", base: 62, re: /(refrigeration (contractor|service|company|engineering|mechanical|inc|co\b)|mechanical contractor|hvac\/?r|refrigeration & |refrigeration and (air|hvac)|ammonia refrigeration (contractor|service))/i, buyer: "Owner / Service Manager / Purchasing" },
  { type: "Food Ingredient / Other Food Manufacturing", base: 55, re: /(food (manufactur|processing|plant|ingredient|products)|foods\b|ingredient|flavor|bakery|snack|311\d{3})/i, buyer: "Plant Engineer" },
];

export const UNCLASSIFIED = "Industrial Facility (unclassified)";

export function classifyFacility(text: string): { type: string; base: number; buyer: string } {
  const hit = FACILITY_TYPES.find((f) => f.re.test(text));
  return hit ? { type: hit.type, base: hit.base, buyer: hit.buyer } : { type: UNCLASSIFIED, base: 35, buyer: "Maintenance Manager" };
}

export function facilityTypeFromNaics(codes: string[]): { type: string; base: number; buyer: string } {
  const joined = codes.join(" ");
  return classifyFacility(joined);
}

// ---------------------------------------------------------------------------
// Signals from text
// ---------------------------------------------------------------------------

const REFRIG_TERMS = ["industrial refrigeration", "ammonia refrigeration", "refrigeration system", "refrigeration plant", "engine room", "machine room", "blast freezer", "spiral freezer", "iqf", "process cooling", "glycol", "evaporative condenser", "screw compressor", "cold storage", "refrigerated warehouse", "freezer", "refrigerated"];
const AMMONIA_RE = /\b(anhydrous ammonia|ammonia|nh3|r-?717)\b/i;
const CO2_RE = /\b(co2|carbon dioxide|r-?744|transcritical)\b[^.]{0,40}\b(refrigerat|system|cascade|rack)|\b(refrigerat)[^.]{0,40}\b(co2|carbon dioxide|r-?744)\b/i;
const OTHER_REFRIG_RE = /\b(freon|r-?22|r-?404a|r-?507|hfc|hcfc|glycol)\b/i;

const BRAND_PATTERNS: Array<[string, RegExp]> = [
  ["Frick", /\bfrick\b/i], ["Vilter", /\bvilter\b/i], ["Mycom / Mayekawa", /\b(mycom|mayekawa)\b/i],
  ["GEA", /\bgea\b/i], ["Grasso", /\bgrasso\b/i], ["Sabroe", /\bsabroe\b/i], ["Howden", /\bhowden\b/i],
  ["BAC", /\b(baltimore aircoil|bac cooling|bac evaporative)\b/i], ["Evapco", /\bevapco\b/i],
  ["Danfoss", /\bdanfoss\b/i], ["Hansen", /\bhansen (valve|technologies|technology)\b/i],
  ["Parker", /\bparker[- ](hannifin|refrigeration|valve)/i], ["Alfa Laval", /\balfa laval\b/i],
  ["Colmac", /\bcolmac\b/i], ["Krack", /\bkrack\b/i], ["Recold", /\brecold\b/i], ["Güntner", /\bg(ü|u)ntner\b/i],
  ["Bitzer", /\bbitzer\b/i], ["Copeland", /\bcopeland\b/i], ["Johnson Controls", /\bjohnson controls\b/i],
  ["York", /\byork (chiller|compressor|refrigeration|frick)/i], ["Carrier", /\bcarrier (chiller|refrigeration|transicold)/i],
  ["Trane", /\btrane\b/i], ["Hillphoenix", /\bhillphoenix\b/i], ["Imeco", /\bimeco\b/i], ["Logix / M&M", /\bm&m refrigeration\b/i],
];

export function extractBrands(text: string): string[] {
  const hasContext = /refrigerat|compressor|chiller|condenser|evaporator|valve|ammonia|cooling/i.test(text);
  if (!hasContext) return [];
  return BRAND_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

export type TextSignals = {
  refrigerationHits: number;
  ammonia: boolean;
  co2: boolean;
  other: boolean;
  brands: string[];
  ammoniaLb: number | null;
  ammoniaLbExcerpt?: string;
};

const THRESHOLD_PHRASE = /(threshold|more than|greater than|in excess of|exceed(s|ing)?|over|at least|above|or more|subject to|requires?|must)\b/i;

// Only returns a quantity when the sentence ties an explicit number of pounds to ammonia and
// does not read like the generic RMP/PSM regulatory threshold sentence.
export function extractAmmoniaQuantity(text: string, facilityName?: string): { lb: number; excerpt: string } | null {
  const sentences = String(text || "").split(/(?<=[.;!?])\s+/);
  const nameTokens = normName(facilityName || "").split(" ").filter((t) => t.length > 3);
  for (const s of sentences) {
    if (!AMMONIA_RE.test(s)) continue;
    const m = s.match(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s*(?:lb|lbs|pounds)\b/i);
    if (!m) continue;
    const lb = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(lb) || lb < 100) continue;
    const generic = (lb === 10000 || lb === 500) && THRESHOLD_PHRASE.test(s);
    if (generic) continue;
    if (nameTokens.length && !nameTokens.some((t) => s.toLowerCase().includes(t))) continue;
    return { lb, excerpt: s.trim().slice(0, 300) };
  }
  return null;
}

export function textSignals(text: string, facilityName?: string): TextSignals {
  const t = String(text || "").toLowerCase();
  const refrigerationHits = REFRIG_TERMS.filter((x) => t.includes(x)).length;
  const q = extractAmmoniaQuantity(text, facilityName);
  return {
    refrigerationHits,
    ammonia: AMMONIA_RE.test(text) && /(refrigerat|cold|freez|rmp|psm|risk management|process safety|system|plant|storage|tank)/i.test(text),
    co2: CO2_RE.test(text),
    other: OTHER_REFRIG_RE.test(text),
    brands: extractBrands(text),
    ammoniaLb: q ? q.lb : null,
    ammoniaLbExcerpt: q?.excerpt,
  };
}

// ---------------------------------------------------------------------------
// Scoring (recomputed after every merge so it always reflects the evidence)
// ---------------------------------------------------------------------------

const AMMONIA_RANK: Record<AmmoniaStatus, number> = { Confirmed: 3, Likely: 2, "None indicated": 1, Unknown: 0 };

export function strongerAmmonia(a: AmmoniaStatus | undefined, b: AmmoniaStatus | undefined): AmmoniaStatus {
  const x = a || "Unknown";
  const y = b || "Unknown";
  return AMMONIA_RANK[y] > AMMONIA_RANK[x] ? y : x;
}

export function baseForType(type: string): number {
  return FACILITY_TYPES.find((f) => f.type === type)?.base ?? 35;
}

export function buyerForType(type: string): string {
  return FACILITY_TYPES.find((f) => f.type === type)?.buyer ?? "Maintenance Manager";
}

function has(evidence: Evidence[], re: RegExp) {
  return evidence.some((e) => re.test(`${e.label} ${e.detail || ""}`));
}

export function scoreProspect(p: Prospect): { score: number; priority: Priority; confidence: Confidence; reason: string } {
  const ev = p.evidence || [];
  let score = baseForType(p.facilityType);
  const reasons: string[] = [p.facilityType];

  const tri = has(ev, /EPA TRI: ammonia/i);
  if (tri) { score += 18; reasons.push("ammonia reported to EPA TRI"); }
  else if (p.ammonia === "Confirmed") { score += 12; reasons.push("ammonia confirmed in public record"); }
  else if (p.ammonia === "Likely") { score += 6; reasons.push("ammonia likely"); }

  if (p.ammoniaLb && p.ammoniaLb >= 10000) { score += 10; reasons.push(`${p.ammoniaLb.toLocaleString()} lb ammonia documented`); }
  if (/industrial refrigeration|ammonia|co2|refrigerated/i.test(p.refrigeration) && !/candidate|verify|unknown/i.test(p.refrigeration)) score += 6;
  if (p.co2) { score += 4; reasons.push("CO₂ refrigeration signal"); }
  if ((p.equipmentBrands || []).length) score += 4;

  const size = (p.sizeClass || "").toLowerCase();
  if (size === "large") { score += 12; reasons.push("FSIS large establishment"); }
  else if (size === "small") score += 3;
  else if (size === "very small") score -= 12;
  if (has(ev, /Clean Air Act permit/i)) score += 3;

  const providers = new Set(p.providers || []);
  score += Math.min(12, Math.max(0, providers.size - 1) * 4);
  if (providers.size === 1 && providers.has("Web search") && (p.evidence || []).length <= 1) score -= 5;
  if (/^\d+\s+(\w+\s+){0,3}(st|street|ave|avenue|rd|road|blvd|boulevard|way|dr|drive|ln|lane|hwy|highway|pkwy|parkway|ct|court|pl|place|loop|cir|circle)\b/i.test(p.name)) score -= 10; // registry name is a street address

  if (p.inSeedList) {
    const ps = Number(p.seedPriorityScore || 0);
    if (ps > 0) score = Math.max(score, 40 + ps * 10);
    reasons.push("in Keep Supply prospect list");
  }

  score = Math.max(1, Math.min(100, Math.round(score)));
  const priority: Priority = score >= 85 ? "A" : score >= 70 ? "B" : "C";

  const gov = has(ev, /^(EPA|USDA|FSIS)/i) || ev.some((e) => e.kind === "government" || e.kind === "registry");
  const confidence: Confidence =
    gov && (providers.size >= 2 || p.ammonia === "Confirmed") ? "High"
      : gov || p.inSeedList || providers.size >= 2 || (p.evidenceSources || 0) >= 3 ? "Medium"
        : "Low";

  const reason = reasons.slice(0, 5).join(" · ");
  return { score, priority, confidence, reason };
}

export function finalize(p: Prospect): Prospect {
  const sourceUrls = [...new Set((p.sourceUrls || []).filter(Boolean))];
  const providers = [...new Set((p.providers || []).filter(Boolean))];
  const evidenceSources = new Set([...sourceUrls, ...providers.filter((x) => x === "Keep Supply seed list")]).size || providers.length;
  const next: Prospect = { ...p, sourceUrls, providers, evidenceSources, key: p.key || facilityKey(p) };
  if (!next.likelyBuyerType && !next.buyerType) next.likelyBuyerType = `${buyerForType(next.facilityType)} (inferred)`;
  return { ...next, ...scoreProspect(next) };
}

export function refrigerationLabel(sig: { ammonia: boolean; co2: boolean; other: boolean; refrigerationHits: number }, fallback: string): string {
  if (sig.ammonia && sig.co2) return "Industrial refrigeration — ammonia + CO₂ signals";
  if (sig.ammonia) return "Industrial refrigeration — ammonia signal";
  if (sig.co2) return "Industrial refrigeration — CO₂ signal (non-ammonia)";
  if (sig.other) return "Refrigeration — HFC/glycol signal (non-ammonia)";
  if (sig.refrigerationHits >= 2) return "Industrial refrigeration indicated — system type not found";
  return fallback;
}
