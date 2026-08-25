import { NextResponse } from "next/server";

const WESTERN_STATES = ["Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const UA = "KeepSupplyProspector/2.1 (public research tool)";
const SEARCH_TIMEOUT_MS = 2800;

type SearchHit = { title: string; url: string; snippet: string };
type Prospect = {
  name: string; city: string; state: string; industry: string; refrigeration: string;
  ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated";
  ammoniaLb: number | null; score: number; priority: "A" | "B" | "C";
  reason: string; sourceUrls: string[];
};

type SearchMode = { label: string; terms: string[]; suffixes: string[] };
const MODES: SearchMode[] = [
  { label: "facility", terms: ["cold storage", "refrigerated warehouse", "cold chain", "temperature controlled warehouse", "frozen food warehouse", "refrigerated distribution", "cold warehouse", "freezer warehouse"], suffixes: ["facility", "company", "plant"] },
  { label: "food", terms: ["meat processing", "poultry processing", "seafood processing", "dairy plant", "cheese manufacturing", "ice cream manufacturing", "food processing", "frozen food manufacturing"], suffixes: ["industrial refrigeration", "refrigeration", "cold storage"] },
  { label: "produce", terms: ["produce packing", "fruit packing", "potato processing", "vegetable processing", "apple storage", "cold chain produce", "onion storage", "fresh produce warehouse"], suffixes: ["refrigeration", "cold storage", "facility"] },
  { label: "beverage", terms: ["brewery", "beverage manufacturing", "winery", "distillery", "food distribution", "frozen foods", "beverage plant", "drink manufacturing"], suffixes: ["refrigeration", "cold storage", "industrial refrigeration"] },
  { label: "industrial", terms: ["industrial refrigeration", "process cooling", "ammonia refrigeration", "CO2 refrigeration", "glycol refrigeration", "industrial freezer", "process chiller", "thermal processing"], suffixes: ["plant", "facility", "company"] },
  { label: "government", terms: ["refrigeration permit", "RMP ammonia", "PSM ammonia", "ammonia permit", "cold storage permit", "refrigeration inspection", "environmental permit refrigeration", "facility risk management plan"], suffixes: ["site:gov", "site:state.us", "site:epa.gov"] },
  { label: "documents", terms: ["refrigeration filetype:pdf", "ammonia filetype:pdf", "cold storage filetype:pdf", "RMP filetype:pdf", "PSM filetype:pdf", "refrigeration plan filetype:pdf", "facility permit filetype:pdf", "refrigeration engineering filetype:pdf"], suffixes: ["", "site:gov", "site:edu"] },
];

function clean(s: string) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/\s+/g, " ").trim();
}
function decodeDdg(raw: string) { try { const d = decodeURIComponent(raw); const m = d.match(/[?&]uddg=([^&]+)/i); return m ? decodeURIComponent(m[1]) : raw; } catch { return raw; } }
function nameFromTitle(t: string) { return t.replace(/\s*[-|–—]\s*(official|homepage|website|linkedin|facebook|yelp|yellowpages|mapquest).*$/i, "").replace(/\s*\|\s*.*$/, "").trim(); }
function keyFor(p: Pick<Prospect, "name" | "city" | "state">) { return `${p.name}|${p.city}|${p.state}`.toLowerCase().replace(/\s+/g, " ").trim(); }
function guessState(text: string, hint: string) { return WESTERN_STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(text)) || hint || "Unknown"; }

function classify(hit: SearchHit, stateHint: string): Prospect {
  const c = `${hit.title} ${hit.snippet}`.toLowerCase();
  const refrigeration = ["industrial refrigeration", "refrigerated warehouse", "cold storage", "cold chain", "ammonia refrigeration", "co2 refrigeration", "carbon dioxide refrigeration", "refrigeration system", "refrigeration plant", "warehouse refrigeration", "process cooling", "temperature controlled", "temperature-controlled", "freezer", "blast freezer", "frozen food", "refrigerated distribution", "food processing", "meat processing", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce packing", "fruit packing", "brewery", "beverage manufacturing", "distillery"].filter((t) => c.includes(t)).length;
  const strong = ["cold storage", "refrigerated warehouse", "food processing", "meat processing", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce packing", "refrigerated distribution", "brewery", "frozen food"].filter((t) => c.includes(t)).length;
  const ammoHits = ["ammonia", "anhydrous ammonia", "rmp", "psm", "nh3"].filter((t) => c.includes(t)).length;
  const nonAmmo = ["co2 refrigeration", "carbon dioxide refrigeration", "glycol", "hfc", "hcfc"].filter((t) => c.includes(t)).length;
  let score = 32 + Math.min(40, refrigeration * 6) + Math.min(16, strong * 4) + (ammoHits ? 7 : 0) + (nonAmmo ? 6 : 0);
  if (/maintenance|service|mechanical|facility maintenance|refrigeration contractor|parts/.test(c)) score += 4;
  score = Math.min(100, score);
  const ammo: Prospect["ammonia"] = ammoHits >= 2 ? "Confirmed" : ammoHits === 1 ? "Likely" : "None indicated";
  const lb = c.match(/(?:ammonia|anhydrous ammonia)[^.]{0,90}(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)|(?:over|more than|at least|exceeding)\s*(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)[^.]{0,90}ammonia/i);
  const ammoniaLb = lb ? Number((lb[1] || lb[2]).replace(/,/g, "")) : null;
  const state = guessState(`${hit.title} ${hit.snippet}`, stateHint === "All Western States" ? "Unknown" : stateHint);
  return {
    name: nameFromTitle(hit.title), city: "Unknown", state,
    industry: strong ? hit.title : "Industrial facility / refrigeration candidate",
    refrigeration: nonAmmo ? "Industrial refrigeration (non-ammonia signal)" : ammoHits ? "Industrial refrigeration (ammonia signal)" : "Industrial refrigeration candidate — verify",
    ammonia: ammo, ammoniaLb, score, priority: score >= 88 ? "A" : score >= 72 ? "B" : "C",
    reason: ammo === "Confirmed" && ammoniaLb && ammoniaLb >= 10000 ? "Strong industrial-refrigeration fit with public evidence of ammonia at or above 10,000 lb." : "Public evidence suggests a potential industrial-refrigeration customer; facility-level verification recommended.",
    sourceUrls: [hit.url]
  };
}

function parseDdg(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  for (const block of html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1)) {
    if (out.length >= 10) break;
    const m = block.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const s = block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    const url = decodeDdg(m[1]);
    if (/^https?:/i.test(url)) out.push({ title: clean(m[2]), url, snippet: s ? clean(s[1]) : "" });
  }
  return out;
}
function parseBing(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  for (const block of html.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1)) {
    if (out.length >= 10) break;
    const m = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!m) continue;
    const s = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (/^https?:/i.test(m[1])) out.push({ title: clean(m[2]), url: m[1], snippet: s ? clean(s[1]) : "" });
  }
  return out;
}
async function fetchHtml(url: string) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store", signal: ctl.signal });
    return r.ok ? r.text() : "";
  } catch { return ""; } finally { clearTimeout(timer); }
}
async function search(query: string, offset: number) {
  const ddg = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${offset}`);
  const d = ddg ? parseDdg(ddg) : [];
  if (d.length) return d;
  const b = await fetchHtml(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&first=${offset + 1}&setlang=en-US`);
  return b ? parseBing(b) : [];
}

function buildQueries(state: string, batch: number, sweep: number) {
  const states = state === "All Western States" ? WESTERN_STATES : [state];
  const mode = MODES[sweep % MODES.length];
  const statePackSize = state === "All Western States" ? 5 : 1;
  const stateStart = (batch * statePackSize) % states.length;
  const selectedStates = Array.from({ length: Math.min(statePackSize, states.length) }, (_, i) => states[(stateStart + i) % states.length]);
  const termsPerPack = 3;
  const termStart = (Math.floor(batch / Math.max(1, Math.ceil(states.length / statePackSize))) * termsPerPack) % mode.terms.length;
  const suffixStart = batch % mode.suffixes.length;
  const queries = selectedStates.flatMap((s) => Array.from({ length: termsPerPack }, (_, i) => {
    const term = mode.terms[(termStart + i) % mode.terms.length];
    const suffix = mode.suffixes[(suffixStart + i) % mode.suffixes.length];
    return `"${s}" ${term} ${suffix}`.trim();
  }));
  const offset = (batch * 10 + Math.floor(sweep / MODES.length) * 20) % 60;
  const totalBatches = state === "All Western States" ? 10 : 4;
  return { queries, offset, totalBatches, mode: mode.label };
}
function dedupe(items: Prospect[]) {
  const m = new Map<string, Prospect>();
  for (const p of items) { const k = keyFor(p); const old = m.get(k); if (!old || p.score > old.score) m.set(k, p); }
  return [...m.values()].sort((a, b) => b.score - a.score);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body?.mode === "discover" ? "discover" : "research";
    const state = body?.state || "All Western States";
    if (mode === "discover") {
      const batch = Math.max(0, Number(body?.batch) || 0);
      const sweep = Math.max(0, Number(body?.sweep) || 0);
      const knownKeys = new Set<string>(Array.isArray(body?.knownKeys) ? body.knownKeys : []);
      const cfg = buildQueries(state, batch, sweep);
      const hitGroups = await Promise.all(cfg.queries.map((q) => search(q, cfg.offset)));
      const hits = hitGroups.flat();
      const candidates = dedupe(hits.map((h) => classify(h, state))).filter((p) => !knownKeys.has(keyFor(p)) && p.score >= 35);
      return NextResponse.json({ mode, batch, totalBatches: cfg.totalBatches, sweep, searchMode: cfg.mode, queryCount: cfg.queries.length, hitCount: hits.length, prospects: candidates, raw: `${cfg.mode} pack ${batch + 1}/${cfg.totalBatches}: ${cfg.queries.length} related searches, ${hits.length} hits → ${candidates.length} new candidates.` });
    }
    const p = body?.prospect || {};
    const name = p.name || "industrial refrigeration facility";
    const city = p.city || "";
    const qs = [`"${name}" ${city} industrial refrigeration`, `"${name}" ${city} ammonia refrigeration`, `"${name}" ${city} cold storage`, `"${name}" site:epa.gov ammonia`, `"${name}" site:gov refrigeration permit`];
    const groups = await Promise.all(qs.map((q) => search(q, 0)));
    const hits = Array.from(new Map(groups.flat().map((h) => [h.url, h])).values()).slice(0, 20);
    return NextResponse.json({ mode, dossier: hits.length ? [`LIVE PUBLIC WEB RESEARCH: ${name}`, "", ...hits.map((h, i) => `${i + 1}. ${h.title}\n${h.snippet}\nSource: ${h.url}`), "", "Industrial refrigeration is the primary target. Ammonia is optional; 10,000 lb applies only when ammonia is present."].join("\n") : `No public-search results were retrieved for ${name}.`, sources: hits.map((h) => h.url) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected public-web research error." }, { status: 500 });
  }
}
