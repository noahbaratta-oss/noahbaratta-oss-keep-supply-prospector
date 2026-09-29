// Structured public-data providers (no API keys, no per-search cost):
//   USDA FSIS MPI Directory  — every federally inspected meat/poultry establishment
//   EPA TRI basic data       — facilities that reported ammonia (CAS 7664-41-7)
//   EPA ECHO facility search — EPA-regulated facilities by NAICS code
//   OpenStreetMap (Overpass) — mapped industrial facilities by tag
// Each provider returns records + a ProviderLog. A failure never throws.

import type { Evidence, Prospect, ProviderLog } from "./types";
import { cached, csvObjects, fetchText } from "./http";
import { classifyFacility, facilityKey, facilityTypeFromNaics, finalize, UNCLASSIFIED } from "./classify";
import { ABBR_STATE, STATE_ABBR, titleCase } from "./geo";
import { DEFAULT_TARGETS, TARGET_DEFS, defFor, fsisModeFor, naicsFor, osmClausesFor } from "./target-filters";
import { crossReferenceSeed } from "./merge";

type Result = { records: Prospect[]; log: ProviderLog; rawHits: number };

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

function base(partial: Partial<Prospect> & Pick<Prospect, "name" | "city" | "state" | "facilityType">): Prospect {
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

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

// ---------------------------------------------------------------------------
// USDA FSIS MPI Directory
// ---------------------------------------------------------------------------

const FSIS_CSV = "https://www.fsis.usda.gov/sites/default/files/media_file/documents/MPI_Directory_by_Establishment_Name.csv";
const FSIS_PAGE = "https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory";

async function loadFsis(): Promise<Array<Record<string, string>>> {
  return cached("fsis-mpi", 12 * 3600_000, async () => {
    const r = await fetchText(FSIS_CSV, { timeout: 25000 });
    if (!r.ok || r.text.length < 1000) throw new Error(r.error || `HTTP ${r.status}`);
    return csvObjects(r.text);
  });
}

export async function fsisProvider(states: string[], targets: string[]): Promise<Result> {
  const started = Date.now();
  const mode = fsisModeFor(targets.length ? targets : DEFAULT_TARGETS);
  if (mode === "none") return { records: [], rawHits: 0, log: { provider: "USDA FSIS", ok: true, status: "skipped", count: 0, ms: 0, detail: "No meat/poultry targets selected" } };
  try {
    const rows = await loadFsis();
    const abbrs = new Set(states.map((s) => STATE_ABBR[s]).filter(Boolean));
    const records: Prospect[] = [];
    for (const row of rows) {
      if (!abbrs.has(row.state)) continue;
      const act = row.activities || "";
      if (mode === "meat" && !/meat/i.test(act)) continue;
      if (mode === "poultry" && !/poultry/i.test(act)) continue;
      const rawName = row.establishment_name || "";
      const prefix = rawName.match(/^\(([^)]+)\)\s*-\s*(.+)$/);
      const name = (prefix ? prefix[2] : rawName).trim();
      const slaughter = /slaughter/i.test(act);
      const poultryOnly = /poultry/i.test(act) && !/meat/i.test(act);
      const typeText = `${name} ${row.dbas || ""}`;
      let type = classifyFacility(typeText);
      if (type.type === UNCLASSIFIED || type.type === "Food Ingredient / Other Food Manufacturing") {
        type = classifyFacility(poultryOnly ? "poultry processing" : /egg/i.test(act) && !/meat|poultry/i.test(act) ? "food manufacturing egg products" : "meat processing");
      }
      const actSummary = act.split(";").map((s) => s.trim()).filter(Boolean).slice(0, 8).join("; ");
      const ev: Evidence = {
        label: `USDA FSIS inspected establishment ${row.establishment_number}`,
        detail: `Activities: ${actSummary || "n/a"} · HACCP size: ${row.size || "n/a"} · Grant date: ${row.grant_date || "n/a"}${row.dbas ? ` · DBAs: ${row.dbas}` : ""}`,
        url: FSIS_PAGE,
        source: "USDA FSIS MPI Directory",
        kind: "registry",
      };
      records.push(base({
        recordId: `fsis:${row.establishment_id || row.establishment_number}`,
        name: titleCase(name),
        facilityName: prefix ? titleCase(rawName) : undefined,
        city: titleCase(row.city || "Unknown"),
        state: ABBR_STATE[row.state] || row.state,
        address: row.street ? titleCase(row.street.trim()) : undefined,
        zip: row.zip,
        phone: row.phone || undefined,
        lat: num(row.latitude),
        lon: num(row.longitude),
        facilityType: type.type,
        industry: `${slaughter ? "Slaughter & processing" : "Processing"} — ${poultryOnly ? "poultry" : /meat/i.test(act) ? "meat" : "egg/other"} (USDA FSIS)`,
        refrigeration: "Refrigerated meat/poultry processing — system type not found",
        sizeClass: row.size || undefined,
        evidence: [ev],
        sourceUrls: [FSIS_PAGE],
        providers: ["USDA FSIS"],
        registryIds: [`FSIS ${row.establishment_number}`],
        targetCategories: targetsMatching(targets, ["311611", "311612", "311615"], type.type),
        source: "USDA FSIS MPI Directory",
      }));
    }
    return { records, rawHits: records.length, log: { provider: "USDA FSIS", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started } };
  } catch (e) {
    return { records: [], rawHits: 0, log: { provider: "USDA FSIS", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: e instanceof Error ? e.message : "failed" } };
  }
}

// ---------------------------------------------------------------------------
// EPA TRI — ammonia reporters
// ---------------------------------------------------------------------------

const TRI_RELEVANT_NAICS = ["311", "312", "3251", "3253", "3254", "4931", "424", "115", "3261", "3262", "722310"];

async function loadTriState(abbr: string): Promise<{ year: string; rows: Array<Record<string, string>>; url: string }> {
  return cached(`tri-${abbr}`, 24 * 3600_000, async () => {
    const thisYear = new Date().getFullYear();
    let lastErr = "";
    for (const year of [thisYear - 1, thisYear - 2, thisYear - 3]) {
      const url = `https://data.epa.gov/efservice/downloads/tri/mv_tri_basic_download/${year}_${abbr}/csv`;
      const r = await fetchText(url, { timeout: 25000 });
      if (r.ok && r.text.length > 500 && /FACILITY NAME/i.test(r.text.slice(0, 2000))) {
        const rows = csvObjects(r.text).map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/^\d+\.\s*/, "").trim(), v])));
        return { year: String(year), rows, url };
      }
      lastErr = r.error || `HTTP ${r.status}`;
    }
    throw new Error(`TRI data unavailable (${lastErr})`);
  });
}

export async function triAmmonia(abbr: string): Promise<{ year: string; url: string; rows: Array<Record<string, string>> }> {
  const data = await loadTriState(abbr);
  return { year: data.year, url: data.url, rows: data.rows.filter((r) => /^ammonia\b/i.test(r["CHEMICAL"] || "")) };
}

export async function triProvider(state: string, targets: string[]): Promise<Result> {
  const started = Date.now();
  const abbr = STATE_ABBR[state];
  try {
    const { year, url, rows } = await triAmmonia(abbr);
    const allowed = allowedTypes(targets);
    const records: Prospect[] = [];
    for (const r of rows) {
      const naics = [r["PRIMARY NAICS"], r["NAICS 2"], r["NAICS 3"]].filter(Boolean);
      const name = r["FACILITY NAME"] || "";
      const relevantNaics = naics.some((c) => TRI_RELEVANT_NAICS.some((p) => c.startsWith(p)));
      const nameSignal = /cold|refrig|freez|frozen|dairy|meat|foods|ice\b/i.test(name);
      if (!relevantNaics && !nameSignal) continue;
      let type = facilityTypeFromNaics(naics);
      if (type.type === UNCLASSIFIED) type = classifyFacility(name);
      if (allowed && !allowed.has(type.type)) continue;
      const food = naics.some((c) => /^(311|312|4931|424|115)/.test(c));
      const frs = r["FRS ID"];
      const dfr = frs ? `https://echo.epa.gov/detailed-facility-report?fid=${frs}` : url;
      const parent = [r["STANDARD PARENT CO NAME"], r["PARENT CO NAME"]].find((x) => x && x !== "NA");
      records.push(base({
        recordId: `tri:${r["TRIFD"]}`,
        name: titleCase(name),
        city: titleCase(r["CITY"] || "Unknown"),
        state,
        address: r["STREET ADDRESS"] ? titleCase(r["STREET ADDRESS"]) : undefined,
        zip: r["ZIP"],
        lat: num(r["LATITUDE"]),
        lon: num(r["LONGITUDE"]),
        facilityType: type.type,
        industry: `${r["INDUSTRY SECTOR"] || "Industry"} (NAICS ${naics[0] || "n/a"})`,
        refrigeration: food ? "Ammonia on site (EPA TRI) — refrigeration use likely for this industry; verify" : "Ammonia on site (EPA TRI) — may be process use; verify refrigeration",
        ammonia: "Confirmed",
        naics,
        parentCompany: parent ? titleCase(parent) : undefined,
        evidence: [{
          label: `EPA TRI: ammonia reported (${year})`,
          detail: `TRI Form ${r["FORM TYPE"] || "?"} for Ammonia (CAS 7664-41-7). On-site release total: ${r["ON-SITE RELEASE TOTAL"] || "0"} lb. TRI reporting is triggered by >10,000 lb/yr otherwise-used or >25,000 lb/yr manufactured/processed — an annual activity threshold, not the system charge.`,
          url: dfr,
          source: "EPA Toxics Release Inventory",
          kind: "government",
        }],
        sourceUrls: [dfr],
        providers: ["EPA TRI"],
        registryIds: [`TRI ${r["TRIFD"]}`, ...(frs ? [`FRS ${frs}`] : [])],
        targetCategories: targetsMatching(targets, naics, type.type),
        source: "EPA TRI",
      }));
    }
    return { records, rawHits: rows.length, log: { provider: "EPA TRI", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started, detail: `${state} ${year}: ${rows.length} ammonia reports` } };
  } catch (e) {
    return { records: [], rawHits: 0, log: { provider: "EPA TRI", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: `${state}: ${e instanceof Error ? e.message : "failed"}` } };
  }
}

// ---------------------------------------------------------------------------
// EPA ECHO — regulated facilities by NAICS
// ---------------------------------------------------------------------------

const ECHO = "https://echodata.epa.gov/echo/echo_rest_services";

type EchoFacility = Record<string, string | null>;

export async function echoQuery(params: string, timeout = 25000): Promise<EchoFacility[]> {
  const first = await fetchText(`${ECHO}.get_facilities?output=JSON&${params}`, { timeout });
  if (!first.ok) throw new Error(first.error || `HTTP ${first.status}`);
  const j = JSON.parse(first.text);
  const qid = j?.Results?.QueryID;
  const rows = Number(j?.Results?.QueryRows || 0);
  if (!qid || !rows) return [];
  const out: EchoFacility[] = [];
  for (let page = 1; page <= 6 && out.length < rows; page++) {
    const r = await fetchText(`${ECHO}.get_qid?output=JSON&qid=${qid}&pageno=${page}`, { timeout });
    if (!r.ok) break;
    const f = JSON.parse(r.text)?.Results?.Facilities || [];
    if (!f.length) break;
    out.push(...f);
  }
  return out;
}

export function echoToProspect(f: EchoFacility, state: string, targets: string[]): Prospect {
  const codes = String(f.FacNAICSCodes || "").split(/\s+/).filter(Boolean);
  const name = String(f.FacName || "Unknown");
  let type = facilityTypeFromNaics(codes);
  if (type.type === UNCLASSIFIED) type = classifyFacility(name);
  const dfr = `https://echo.epa.gov/detailed-facility-report?fid=${f.RegistryID}`;
  const evidence: Evidence[] = [{
    label: "EPA ECHO regulated facility",
    detail: `NAICS ${codes.join(", ") || "n/a"} · Clean Air Act: ${f.AIRFlag === "Y" ? "yes" : "no"} · TRI reporter: ${f.TRIFlag === "Y" ? "yes" : "no"} · Last inspection: ${f.FacDateLastInspection || "n/a"}`,
    url: dfr,
    source: "EPA ECHO",
    kind: "government",
  }];
  if (f.AIRFlag === "Y") evidence.push({ label: "Clean Air Act permit on file (EPA ECHO)", url: dfr, source: "EPA ECHO", kind: "government" });
  return base({
    recordId: `echo:${f.RegistryID}`,
    name: titleCase(name),
    city: titleCase(String(f.FacCity || "Unknown")),
    state: ABBR_STATE[String(f.FacState || "")] || state,
    address: f.FacStreet ? titleCase(String(f.FacStreet)) : undefined,
    zip: f.FacZip ? String(f.FacZip) : undefined,
    lat: num(f.FacLat),
    facilityType: type.type,
    industry: `NAICS ${codes.slice(0, 3).join(", ") || "n/a"} (EPA ECHO)`,
    naics: codes,
    evidence,
    sourceUrls: [dfr],
    providers: ["EPA ECHO"],
    registryIds: [`FRS ${f.RegistryID}`],
    targetCategories: targetsMatching(targets, codes, type.type),
    source: "EPA ECHO",
  });
}

export async function echoProvider(state: string, naics: string[], targets: string[]): Promise<Result> {
  const started = Date.now();
  const abbr = STATE_ABBR[state];
  const codes = naics.length ? naics : naicsFor(targets.length ? targets : DEFAULT_TARGETS);
  if (!codes.length) return { records: [], rawHits: 0, log: { provider: "EPA ECHO", ok: true, status: "skipped", count: 0, ms: 0, detail: "No NAICS mapped for selected targets" } };
  try {
    const facilities = await echoQuery(`p_st=${abbr}&p_act=Y&p_ncs=${codes.join(",")}`);
    const records = facilities.map((f) => echoToProspect(f, state, targets));
    return { records, rawHits: facilities.length, log: { provider: "EPA ECHO", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started, detail: `${state}: ${codes.length} NAICS codes` } };
  } catch (e) {
    return { records: [], rawHits: 0, log: { provider: "EPA ECHO", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: `${state}: ${e instanceof Error ? e.message : "failed"}` } };
  }
}

// ---------------------------------------------------------------------------
// OpenStreetMap via Overpass
// ---------------------------------------------------------------------------

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export async function osmProvider(state: string, targets: string[]): Promise<Result> {
  const started = Date.now();
  const abbr = STATE_ABBR[state];
  const clauses = osmClausesFor(targets.length ? targets : DEFAULT_TARGETS);
  if (!clauses.length) return { records: [], rawHits: 0, log: { provider: "OpenStreetMap", ok: true, status: "skipped", count: 0, ms: 0, detail: "No map tags for selected targets" } };
  const query = `[out:json][timeout:30];area["ISO3166-2"="US-${abbr}"]->.a;(${clauses.map((c) => `${c}(area.a);`).join("")});out center tags 1500;`;
  let lastErr = "";
  for (const [i, endpoint] of OVERPASS.entries()) {
    const r = await fetchText(endpoint, { method: "POST", body: `data=${encodeURIComponent(query)}`, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: i === 0 ? 32000 : 14000 });
    if (!r.ok) { lastErr = r.error || `HTTP ${r.status}`; continue; }
    try {
      const j = JSON.parse(r.text);
      const els: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> = j.elements || [];
      const allowed = allowedTypes(targets);
      const records: Prospect[] = [];
      for (const el of els) {
        const t = el.tags || {};
        const name = t.name || t.operator || t.brand;
        if (!name) continue;
        if (t.shop || /^(restaurant|bar|pub|cafe|fast_food)$/.test(t.amenity || "")) continue;
        const tagSummary = ["industrial", "craft", "man_made", "product", "building", "office"].filter((k) => t[k]).map((k) => `${k}=${t[k]}`).join(", ");
        const type = classifyFacility(`${name} ${t.industrial || ""} ${t.craft || ""} ${t.product || ""}`);
        if (type.type === UNCLASSIFIED && !/refrigerat|cold|freez/i.test(name)) continue;
        if (allowed && !allowed.has(type.type)) continue;
        const url = `https://www.openstreetmap.org/${el.type}/${el.id}`;
        const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
        records.push(base({
          recordId: `osm:${el.type}/${el.id}`,
          name,
          facilityName: t.operator && t.operator !== name ? `${name} (operator: ${t.operator})` : undefined,
          city: t["addr:city"] || "Unknown",
          state,
          address: street || undefined,
          zip: t["addr:postcode"],
          phone: t.phone || t["contact:phone"] || undefined,
          website: t.website || t["contact:website"] || undefined,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          facilityType: type.type,
          industry: `${type.type} (OpenStreetMap: ${tagSummary || "named feature"})`,
          evidence: [{ label: `OpenStreetMap mapped facility (${tagSummary || "named industrial feature"})`, url, source: "OpenStreetMap (community data)", kind: "osm" }],
          sourceUrls: [url],
          providers: ["OpenStreetMap"],
          targetCategories: targetsMatching(targets, [], type.type),
          source: "OpenStreetMap",
        }));
      }
      return { records, rawHits: els.length, log: { provider: "OpenStreetMap", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started, detail: `${state}: ${els.length} mapped features` } };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "bad response";
    }
  }
  return { records: [], rawHits: 0, log: { provider: "OpenStreetMap", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: `${state}: ${lastErr}` } };
}
