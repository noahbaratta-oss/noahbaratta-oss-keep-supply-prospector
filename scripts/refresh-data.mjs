// Refreshes the bundled public-data snapshots used by the Prospecting Engine.
//   lib/rmp-west.json  — EPA RMP ammonia registrations (Western states, active), from the
//                        Data Liberation Project's FOIA copy of the RMP database (CC BY-SA 4.0)
//   lib/fsis-west.json — USDA FSIS inspected establishments (Western states)
// Run by .github/workflows/refresh-data.yml monthly. Files are only rewritten when the data
// actually changed. Usage: node scripts/refresh-data.mjs  (RMP_FILE=/path/facilities.csv to use a local copy)

import { readFileSync, writeFileSync } from "node:fs";

const WEST = new Set(["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY", "AK", "HI"]);
const UA = "Mozilla/5.0 (compatible; KeepSupplyProspector-refresh/1.0; +https://github.com/noahbaratta-oss/noahbaratta-oss-keep-supply-prospector)";
const today = new Date().toISOString().slice(0, 10);

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
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

const q = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function project(rows, keep, filter) {
  const header = rows[0].map((h) => h.trim());
  const idx = keep.map((k) => header.indexOf(k));
  if (idx.some((i) => i < 0)) throw new Error(`missing columns: ${keep.filter((_, j) => idx[j] < 0).join(", ")}`);
  const out = [keep.join(",")];
  let n = 0;
  for (const r of rows.slice(1)) {
    const obj = Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()]));
    if (!filter(obj)) continue;
    out.push(idx.map((i) => q((r[i] ?? "").trim())).join(","));
    n++;
  }
  return { csv: out.join("\n") + "\n", rows: n };
}

function writeIfChanged(path, base, csv, rows) {
  let existing = {};
  try { existing = JSON.parse(readFileSync(path, "utf8")); } catch { /* new file */ }
  if (existing.csv === csv) { console.log(`${path}: unchanged (${rows} rows)`); return false; }
  writeFileSync(path, JSON.stringify({ ...base, retrieved: today, rows, csv }) + "\n");
  console.log(`${path}: updated (${rows} rows)`);
  return true;
}

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/csv,text/plain,*/*" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

// --- EPA RMP -----------------------------------------------------------------
const RMP_URL = "https://raw.githubusercontent.com/data-liberation-project/epa-rmp-spreadsheets/main/data/output/facilities.csv";
try {
  const text = process.env.RMP_FILE ? readFileSync(process.env.RMP_FILE, "utf8") : await get(RMP_URL);
  const keep = ["EPAFacilityID", "Name", "LatestCompany1", "LatestOperator", "Addr1", "City", "State", "ZipCode", "Lat", "Lng", "LatestValidationDate", "NAICSCodesInLatest", "ChemicalsInLatest", "NumAccidentsInLatest"];
  const { csv, rows } = project(parseCsv(text), keep, (r) => WEST.has(r.State) && !r.LatestDeregDate && /ammonia/i.test(r.ChemicalsInLatest || ""));
  if (rows < 100) throw new Error(`only ${rows} RMP rows — refusing to overwrite`);
  writeIfChanged("lib/rmp-west.json", {
    source: RMP_URL,
    note: "Western-territory, active, ammonia-registered facilities from the EPA Risk Management Program database (obtained via FOIA by the Data Liberation Project, CC BY-SA 4.0).",
  }, csv, rows);
} catch (e) {
  console.error(`RMP refresh failed: ${e.message}`);
  process.exitCode = 1;
}

// --- USDA FSIS ---------------------------------------------------------------
const FSIS_URL = "https://www.fsis.usda.gov/sites/default/files/media_file/documents/MPI_Directory_by_Establishment_Name.csv";
try {
  const text = await get(FSIS_URL);
  const keep = ["establishment_id", "establishment_number", "establishment_name", "street", "city", "state", "zip", "phone", "grant_date", "activities", "dbas", "size", "latitude", "longitude"];
  const { csv, rows } = project(parseCsv(text), keep, (r) => WEST.has(r.state));
  if (rows < 500) throw new Error(`only ${rows} FSIS rows — refusing to overwrite`);
  writeIfChanged("lib/fsis-west.json", {
    source: FSIS_URL,
    page: "https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory",
    note: "Western-territory subset of the USDA FSIS MPI Directory (public data). Used when the live file cannot be downloaded from the server.",
  }, csv, rows);
} catch (e) {
  // FSIS sometimes blocks cloud IP ranges; keep the existing snapshot.
  console.warn(`FSIS refresh skipped: ${e.message}`);
}
