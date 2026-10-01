// EPA Risk Management Program (RMP) — facilities registered for ammonia.
//
// RMP registration is required when a process holds more than the threshold quantity:
// 10,000 lb for anhydrous ammonia, 20,000 lb for aqueous ammonia (≥20%). Each registration
// lists the quantity per process, so this is the one public source that documents ammonia
// charge sizes. Data: EPA RMP database obtained via FOIA and published by the Data
// Liberation Project (CC BY-SA 4.0), refreshed monthly into lib/rmp-west.json.

import type { Evidence, Prospect, ProviderLog } from "./types";
import { cached, csvObjects, fetchText } from "./http";
import { classifyFacility, facilityTypeFromNaics, normName, UNCLASSIFIED } from "./classify";
import { ABBR_STATE, STATE_ABBR, titleCase } from "./geo";
import { allowedTypes, makeRecord, num, targetsMatching } from "./targeting";
import RMP_SNAPSHOT from "./rmp-west.json";

export const RMP_CSV = "https://raw.githubusercontent.com/data-liberation-project/epa-rmp-spreadsheets/main/data/output/facilities.csv";
export const RMP_DATASET = "https://www.data-liberation-project.org/datasets/epa-risk-management-program-database/";
const viewerUrl = (id: string) => `https://data-liberation-project.github.io/epa-rmp-viewer/#/facility:${id}`;

const WEST = new Set(Object.values(STATE_ABBR));
// Industries where an ammonia RMP process is (almost always) refrigeration.
const RELEVANT = /^(311|312|4931|4244|4245|115114|42448|72231)/;
// Ammonia used as fertilizer, power-plant NOx control, refining, water treatment, chemicals.
const EXCLUDED = /^(2211|2213|2111|3241|42491|325311|325312|325314|115112|4246|3344|2122|2123|2131|4862|3314|3251)/;
const NAME_SIGNAL = /cold|storage|frozen|freez|\bice\b|dairy|creamery|cheese|meat|beef|pork|poultry|foods?\b|packing|fruit|produce|brew|winery|seafood|fish|potato|cherry|apple|onion|logistics|lineage|americold/i;

export type RmpRow = Record<string, string>;

export function rmpChemicals(text: string): Array<{ name: string; lb: number }> {
  return String(text || "").split("•").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.*?)\s*\{([\d.]+)\}\s*$/);
    return m ? { name: m[1].trim(), lb: Number(m[2]) } : { name: s, lb: 0 };
  });
}

export function rmpCodes(row: RmpRow): string[] {
  return String(row.NAICSCodesInLatest || "").split(/[•,]/).map((c) => c.trim()).filter(Boolean);
}

// Western, still registered, lists ammonia.
export function rmpBaseFilter(row: RmpRow): boolean {
  return WEST.has(row.State) && !row.LatestDeregDate && /ammonia/i.test(row.ChemicalsInLatest || "");
}

export function rmpRelevant(row: RmpRow): boolean {
  const codes = rmpCodes(row);
  if (codes.some((c) => RELEVANT.test(c))) return true;
  return NAME_SIGNAL.test(row.Name || "") && !codes.every((c) => EXCLUDED.test(c));
}

type RmpData = { rows: RmpRow[]; origin: "snapshot" | "live"; detail: string };

async function loadRmp(): Promise<RmpData> {
  return cached("rmp-west", 24 * 3600_000, async () => {
    if (RMP_SNAPSHOT.rows > 0) {
      return { rows: csvObjects(RMP_SNAPSHOT.csv), origin: "snapshot" as const, detail: `EPA RMP data snapshot ${RMP_SNAPSHOT.retrieved}` };
    }
    const r = await fetchText(RMP_CSV, { timeout: 25000 });
    if (!r.ok || !/EPAFacilityID/.test(r.text.slice(0, 200))) throw new Error(r.error || `HTTP ${r.status}`);
    return { rows: csvObjects(r.text).filter(rmpBaseFilter), origin: "live" as const, detail: "EPA RMP data (live file)" };
  });
}

export async function rmpRowsForState(state: string): Promise<{ rows: RmpRow[]; detail: string }> {
  const data = await loadRmp();
  const abbr = STATE_ABBR[state];
  return { rows: data.rows.filter((r) => r.State === abbr && rmpBaseFilter(r)), detail: data.detail };
}

export function rmpEvidence(row: RmpRow): { evidence: Evidence; maxLb: number; totalLb: number; chemical: string } {
  const amm = rmpChemicals(row.ChemicalsInLatest).filter((c) => /ammonia/i.test(c.name));
  const maxLb = Math.max(0, ...amm.map((c) => c.lb));
  const totalLb = amm.reduce((a, c) => a + c.lb, 0);
  const chemical = amm[0]?.name || "Ammonia";
  const owner = [row.LatestCompany1, row.LatestOperator].filter(Boolean)[0];
  const threshold = /anhydrous/i.test(chemical) ? "10,000 lb (anhydrous)" : "20,000 lb (aqueous ≥20%)";
  return {
    maxLb,
    totalLb,
    chemical,
    evidence: {
      label: `EPA RMP: ${chemical} registered — largest process ${maxLb.toLocaleString("en-US")} lb`,
      detail: `${amm.length} ammonia process${amm.length === 1 ? "" : "es"}, ${totalLb.toLocaleString("en-US")} lb listed in total · latest RMP validated ${row.LatestValidationDate || "n/a"} · accidents in 5-year history: ${row.NumAccidentsInLatest || "0"}${owner ? ` · owner/operator: ${owner}` : ""}. RMP registration threshold: ${threshold} in a process.`,
      url: viewerUrl(row.EPAFacilityID),
      source: "EPA Risk Management Program (FOIA data via Data Liberation Project)",
      kind: "government",
    },
  };
}

export function rmpToProspect(row: RmpRow, targets: string[]): Prospect {
  const codes = rmpCodes(row);
  let type = facilityTypeFromNaics(codes);
  if (type.type === UNCLASSIFIED) type = classifyFacility(row.Name || "");
  const { evidence, maxLb } = rmpEvidence(row);
  const food = codes.some((c) => /^(311|312|4931|424|115)/.test(c));
  const owner = [row.LatestCompany1, row.LatestOperator].find((x) => x && normName(x) !== normName(row.Name));
  return makeRecord({
    recordId: `rmp:${row.EPAFacilityID}`,
    name: titleCase((row.Name || "Unknown").replace(/\s+/g, " ").trim()),
    city: titleCase(row.City || "Unknown"),
    state: ABBR_STATE[row.State] || row.State,
    address: row.Addr1 ? titleCase(row.Addr1) : undefined,
    zip: (row.ZipCode || "").slice(0, 5) || undefined,
    lat: num(row.Lat),
    lon: num(row.Lng),
    facilityType: type.type,
    industry: `NAICS ${codes.slice(0, 3).join(", ") || "n/a"} (EPA RMP)`,
    refrigeration: food ? "Ammonia refrigeration — EPA RMP registered process" : "Ammonia process — EPA RMP registered; verify refrigeration use",
    ammonia: "Confirmed",
    ammoniaLb: maxLb || null,
    ammoniaLbSource: evidence.url,
    naics: codes,
    parentCompany: owner ? titleCase(owner) : undefined,
    evidence: [evidence],
    sourceUrls: [evidence.url as string],
    providers: ["EPA RMP"],
    registryIds: [`RMP ${row.EPAFacilityID}`],
    targetCategories: targetsMatching(targets, codes, type.type),
    source: "EPA RMP",
  });
}

export async function rmpProvider(state: string, targets: string[]): Promise<{ records: Prospect[]; rawHits: number; log: ProviderLog }> {
  const started = Date.now();
  try {
    const { rows, detail } = await rmpRowsForState(state);
    const allowed = allowedTypes(targets);
    const records = rows.filter(rmpRelevant).map((r) => rmpToProspect(r, targets)).filter((p) => !allowed || allowed.has(p.facilityType));
    return { records, rawHits: rows.length, log: { provider: "EPA RMP", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started, detail: `${state}: ${rows.length} ammonia registrations · ${detail}` } };
  } catch (e) {
    return { records: [], rawHits: 0, log: { provider: "EPA RMP", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: `${state}: ${e instanceof Error ? e.message : "failed"}` } };
  }
}
