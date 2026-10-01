// Structured public-data providers (no API keys, no per-search cost):
//   USDA FSIS MPI Directory  — every federally inspected meat/poultry establishment
//   EPA TRI basic data       — facilities that reported ammonia (CAS 7664-41-7)
//   EPA ECHO facility search — EPA-regulated facilities by NAICS code
//   OpenStreetMap (Overpass) — mapped industrial facilities by tag
// Each provider returns records + a ProviderLog. A failure never throws.

import type { Evidence, Prospect, ProviderLog } from "./types";
import { cached, csvObjects, fetchText } from "./http";
import { classifyFacility, facilityTypeFromNaics, UNCLASSIFIED } from "./classify";
import { ABBR_STATE, STATE_ABBR, titleCase } from "./geo";
import { DEFAULT_TARGETS, fsisModeFor, naicsFor } from "./target-filters";
import { allowedTypes, makeRecord, num, targetsMatching } from "./targeting";
import { OVERPASS_ENDPOINTS, osmElementsToRecords, osmQuery, type OsmElement } from "./osm";
import FSIS_SNAPSHOT from "./fsis-west.json";

type Result = { records: Prospect[]; log: ProviderLog; rawHits: number };

export { allowedTypes, targetsMatching } from "./targeting";
const base = makeRecord;

// ---------------------------------------------------------------------------
// USDA FSIS MPI Directory
// ---------------------------------------------------------------------------

const FSIS_CSV = "https://www.fsis.usda.gov/sites/default/files/media_file/documents/MPI_Directory_by_Establishment_Name.csv";
const FSIS_PAGE = "https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory";

type FsisData = { rows: Array<Record<string, string>>; origin: "live" | "snapshot"; detail: string };

// Live USDA download first; FSIS blocks some cloud servers (HTTP 403), so fall back to the
// bundled Western-territory snapshot (lib/fsis-west.json) instead of returning nothing.
async function loadFsis(): Promise<FsisData> {
  return cached("fsis-mpi", 12 * 3600_000, async () => {
    const r = await fetchText(FSIS_CSV, { timeout: 12000, headers: { Accept: "text/csv,text/plain,*/*" } });
    if (r.ok && r.text.length > 1000 && /establishment_name/i.test(r.text.slice(0, 500))) {
      return { rows: csvObjects(r.text), origin: "live" as const, detail: "live USDA download" };
    }
    const why = r.error || `HTTP ${r.status}`;
    return { rows: csvObjects(FSIS_SNAPSHOT.csv), origin: "snapshot" as const, detail: `USDA snapshot ${FSIS_SNAPSHOT.retrieved} (live download unavailable: ${why})` };
  });
}

export async function fsisProvider(states: string[], targets: string[]): Promise<Result> {
  const started = Date.now();
  const mode = fsisModeFor(targets.length ? targets : DEFAULT_TARGETS);
  if (mode === "none") return { records: [], rawHits: 0, log: { provider: "USDA FSIS", ok: true, status: "skipped", count: 0, ms: 0, detail: "No meat/poultry targets selected" } };
  try {
    const data = await loadFsis();
    const rows = data.rows;
    const abbrs = new Set(states.map((s) => STATE_ABBR[s]).filter(Boolean));
    const records: Prospect[] = [];
    for (const row of rows) {
      if (!abbrs.has(row.state)) continue;
      const act = row.activities || "";
      const importHouse = /import/i.test(act) && !/processing|slaughter/i.test(act);
      if (mode === "meat" && !/meat/i.test(act) && !importHouse) continue;
      if (mode === "poultry" && !/poultry/i.test(act)) continue;
      const rawName = row.establishment_name || "";
      const prefix = rawName.match(/^\(([^)]+)\)\s*-\s*(.+)$/);
      const name = (prefix ? prefix[2] : rawName).trim().replace(/[\s,;:]+$/, "");
      const slaughter = /slaughter/i.test(act);
      const poultryOnly = /poultry/i.test(act) && !/meat/i.test(act);
      const typeText = `${name} ${row.dbas || ""}`;
      let type = classifyFacility(typeText);
      if (importHouse && type.type !== "Cold Storage / Refrigerated Warehouse") {
        // FSIS official import inspection establishments are typically cold-storage warehouses.
        type = classifyFacility("cold storage");
      } else if (type.type === UNCLASSIFIED || type.type === "Food Ingredient / Other Food Manufacturing") {
        type = classifyFacility(poultryOnly ? "poultry processing" : /egg/i.test(act) && !/meat|poultry/i.test(act) ? "food manufacturing egg products" : "meat processing");
      }
      const actSummary = act.split(";").map((s) => s.trim()).filter(Boolean).slice(0, 8).join("; ");
      const ev: Evidence = {
        label: `USDA FSIS inspected establishment ${row.establishment_number}${importHouse ? " (official import inspection establishment)" : ""}`,
        detail: `Activities: ${actSummary || "n/a"} · HACCP size: ${row.size || "n/a"} · Grant date: ${row.grant_date || "n/a"}${row.dbas ? ` · DBAs: ${row.dbas}` : ""} · Source: ${data.origin === "live" ? "live USDA directory" : `USDA directory snapshot ${FSIS_SNAPSHOT.retrieved}`}`,
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
        industry: importHouse ? "USDA official import inspection establishment (meat/poultry cold storage)" : `${slaughter ? "Slaughter & processing" : "Processing"} — ${poultryOnly ? "poultry" : /meat/i.test(act) ? "meat" : "egg/other"} (USDA FSIS)`,
        refrigeration: importHouse ? "Refrigerated/frozen import storage — system type not found" : "Refrigerated meat/poultry processing — system type not found",
        sizeClass: row.size || undefined,
        evidence: [ev],
        sourceUrls: [FSIS_PAGE],
        providers: ["USDA FSIS"],
        registryIds: [`FSIS ${row.establishment_number}`],
        targetCategories: targetsMatching(targets, ["311611", "311612", "311615"], type.type),
        source: "USDA FSIS MPI Directory",
      }));
    }
    return { records, rawHits: records.length, log: { provider: "USDA FSIS", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started, detail: data.detail } };
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

// ECHO is intermittently overloaded (HTTP 503 / timeouts), so retry with a short backoff.
async function echoFetch(url: string, timeout: number, attempts = 3) {
  let last = { ok: false, status: 0, text: "", ms: 0, error: "" } as Awaited<ReturnType<typeof fetchText>>;
  for (let i = 0; i < attempts; i++) {
    last = await fetchText(url, { timeout });
    if (last.ok && last.text.trim().startsWith("{")) return last;
    if (last.status && last.status < 500 && last.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  throw new Error(last.error || `HTTP ${last.status}`);
}

export async function echoQuery(params: string, timeout = 15000): Promise<EchoFacility[]> {
  const first = await echoFetch(`${ECHO}.get_facilities?output=JSON&${params}`, timeout);
  const j = JSON.parse(first.text);
  const qid = j?.Results?.QueryID;
  const rows = Number(j?.Results?.QueryRows || 0);
  if (!qid || !rows) return [];
  const out: EchoFacility[] = [];
  for (let page = 1; page <= 6 && out.length < rows; page++) {
    const r = await echoFetch(`${ECHO}.get_qid?output=JSON&qid=${qid}&pageno=${page}`, timeout, 2).catch(() => null);
    if (!r) break;
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

export async function osmProvider(state: string, targets: string[]): Promise<Result> {
  const started = Date.now();
  const query = osmQuery(state, targets);
  if (!query) return { records: [], rawHits: 0, log: { provider: "OpenStreetMap", ok: true, status: "skipped", count: 0, ms: 0, detail: "No map tags for selected targets" } };
  let lastErr = "";
  for (const [i, endpoint] of OVERPASS_ENDPOINTS.entries()) {
    const r = await fetchText(endpoint, { method: "POST", body: `data=${encodeURIComponent(query)}`, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: i === 0 ? 25000 : 20000 });
    if (!r.ok) { lastErr = r.error || `HTTP ${r.status}`; continue; }
    try {
      const els: OsmElement[] = JSON.parse(r.text).elements || [];
      const records = osmElementsToRecords(els, state, targets);
      return { records, rawHits: els.length, log: { provider: "OpenStreetMap", ok: true, status: records.length ? "ok" : "empty", count: records.length, ms: Date.now() - started, detail: `${state}: ${els.length} mapped features (server)` } };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "bad response";
    }
  }
  return { records: [], rawHits: 0, log: { provider: "OpenStreetMap", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: `${state}: ${lastErr}` } };
}
