import { NextResponse } from "next/server";
import { INDUSTRY_SEARCH_ALIASES } from "../../../lib/target-filters";

const STATES = ["Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const ABBR: Record<string, string> = { Arizona: "AZ", California: "CA", Colorado: "CO", Idaho: "ID", Montana: "MT", Nevada: "NV", "New Mexico": "NM", Oregon: "OR", Utah: "UT", Washington: "WA", Wyoming: "WY", Alaska: "AK", Hawaii: "HI" };
const GEO: Record<string, string[]> = {
  Arizona: ["Phoenix", "Tucson", "Yuma", "Goodyear", "Tolleson"], California: ["Los Angeles", "Inland Empire", "Fresno", "Bakersfield", "Salinas", "Stockton", "Sacramento", "Modesto"], Colorado: ["Denver", "Greeley", "Fort Collins", "Pueblo", "Grand Junction"], Idaho: ["Boise", "Nampa", "Twin Falls", "Idaho Falls", "Jerome"], Montana: ["Billings", "Great Falls", "Missoula", "Bozeman"], Nevada: ["Las Vegas", "Reno", "Sparks", "Fernley"], "New Mexico": ["Albuquerque", "Las Cruces", "Clovis", "Roswell"], Oregon: ["Portland", "Salem", "Eugene", "Ontario", "Hood River"], Utah: ["Salt Lake City", "Ogden", "Provo", "Logan", "St George"], Washington: ["Seattle", "Yakima", "Wenatchee", "Pasco", "Spokane", "Ellensburg"], Wyoming: ["Cheyenne", "Casper", "Rock Springs", "Gillette"], Alaska: ["Anchorage", "Fairbanks", "Wasilla"], Hawaii: ["Honolulu", "Hilo", "Kahului"]
};
const MODES = [
  ["facility", ["cold storage", "refrigerated warehouse", "cold chain", "temperature controlled warehouse", "frozen food warehouse", "refrigerated distribution", "3PL cold storage", "temperature controlled logistics"]],
  ["protein", ["beef processing", "pork processing", "poultry processing", "meat packing", "rendering plant", "sausage manufacturing", "frozen meat", "further processing", "protein processing", "slaughterhouse"]],
  ["dairy", ["milk processing", "cheese manufacturing", "yogurt plant", "ice cream manufacturing", "butter plant", "milk powder", "dairy ingredients", "dairy processing"]],
  ["produce", ["produce packing", "fruit packing", "potato processing", "vegetable processing", "apple storage", "onion storage", "fresh produce warehouse", "produce cold storage"]],
  ["beverage", ["brewery", "beverage manufacturing", "distillery", "bottling plant", "juice processing", "beverage distribution", "food distribution"]],
  ["pharma", ["pharmaceutical manufacturing", "biotech manufacturing", "vaccine facility", "pharmaceutical distribution", "cold chain pharmaceutical", "API manufacturing", "medical product manufacturing"]],
  ["industrial", ["industrial refrigeration", "process cooling", "ammonia refrigeration", "CO2 refrigeration", "glycol refrigeration", "industrial freezer", "process chiller", "chemical processing", "industrial gases"]],
  ["government", ["refrigeration permit", "RMP ammonia", "PSM ammonia", "ammonia permit", "cold storage permit", "environmental permit refrigeration", "risk management plan"]],
  ["documents", ["refrigeration filetype:pdf", "ammonia filetype:pdf", "cold storage filetype:pdf", "RMP filetype:pdf", "PSM filetype:pdf", "refrigeration engineering filetype:pdf"]]
] as const;

const UA = "KeepSupplyProspector/2.4";
type Hit = { title: string; url: string; snippet: string };
type Prospect = { name: string; city: string; state: string; industry: string; refrigeration: string; ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated"; ammoniaLb: number | null; score: number; priority: "A" | "B" | "C"; reason: string; sourceUrls: string[] };

function clean(v: string) { return v.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim(); }
function ddgUrl(raw: string) { try { const d = decodeURIComponent(raw); const m = d.match(/[?&]uddg=([^&]+)/i); return m ? decodeURIComponent(m[1]) : raw; } catch { return raw; } }
function parseDdg(html: string): Hit[] { const out: Hit[] = []; for (const b of html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1)) { const m = b.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i); if (!m) continue; const s = b.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i); const url = ddgUrl(m[1]); if (/^https?:/i.test(url)) out.push({ title: clean(m[2]), url, snippet: s ? clean(s[1]) : "" }); if (out.length >= 10) break; } return out; }
function parseBing(html: string): Hit[] { const out: Hit[] = []; for (const b of html.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1)) { const m = b.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i); if (!m) continue; const s = b.match(/<p[^>]*>([\s\S]*?)<\/p>/i); if (/^https?:/i.test(m[1])) out.push({ title: clean(m[2]), url: m[1], snippet: s ? clean(s[1]) : "" }); if (out.length >= 10) break; } return out; }
function parseYahoo(html: string): Hit[] { const out: Hit[] = []; const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m: RegExpExecArray | null; while ((m = re.exec(html)) && out.length < 20) { const title = clean(m[2]); const url = m[1]; if (title.length < 4 || !/^https?:/i.test(url) || /yahoo\.com/i.test(url)) continue; out.push({ title, url, snippet: "" }); } return out; }
function parseGoogle(html: string): Hit[] { const out: Hit[] = []; const re = /<a href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m: RegExpExecArray | null; while ((m = re.exec(html)) && out.length < 20) { const title = clean(m[2]); if (title.length < 5 || /google\.com/i.test(m[1])) continue; out.push({ title, url: m[1], snippet: "" }); } return out; }
async function html(url: string, timeout = 2500) { const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout); try { const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store", signal: ctl.signal }); return r.ok ? await r.text() : ""; } catch { return ""; } finally { clearTimeout(t); } }
async function engine(engine: string, q: string, offset: number): Promise<Hit[]> {
  if (engine === "ddg") return parseDdg(await html(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&s=${offset}`));
  if (engine === "bing") return parseBing(await html(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10&first=${offset + 1}`));
  if (engine === "yahoo") return parseYahoo(await html(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}&b=${offset + 1}`));
  return parseGoogle(await html(`https://www.google.com/search?q=${encodeURIComponent(q)}&start=${offset}`));
}
async function multiSearch(q: string, offset: number): Promise<Hit[]> {
  const results = await Promise.allSettled(["ddg", "bing", "yahoo", "google"].map((e) => engine(e, q, offset)));
  return results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
}
function key(p: Pick<Prospect, "name" | "city" | "state">) { return `${p.name}|${p.city}|${p.state}`.toLowerCase().replace(/\s+/g, " ").trim(); }
function titleName(t: string) { return clean(t).replace(/\s*[-|–—]\s*(official|homepage|website|linkedin|facebook|yelp|yellowpages|mapquest).*$/i, "").replace(/\s*\|\s*.*$/, "").trim(); }
function stateGuess(txt: string, hint: string) { return STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(txt)) || (hint === "All Western States" ? "Unknown" : hint); }
function cityGuess(txt: string, st: string) { return (GEO[st] || []).find((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(txt)) || "Unknown"; }
function classify(h: Hit, hint: string): Prospect {
  const c = `${h.title} ${h.snippet}`.toLowerCase();
  const refrigerationTerms = ["industrial refrigeration","refrigerated warehouse","cold storage","cold chain","ammonia refrigeration","co2 refrigeration","carbon dioxide refrigeration","refrigeration system","refrigeration plant","process cooling","temperature controlled","freezer","blast freezer","frozen food","refrigerated distribution","food processing","meat processing","poultry","seafood","dairy","cheese","ice cream","produce packing","fruit packing","brewery","beverage manufacturing","distillery","rendering","slaughterhouse","protein processing","pharmaceutical","biotech","vaccine","industrial gases","chemical processing"];
  const strongTerms = ["cold storage","refrigerated warehouse","food processing","meat processing","poultry","seafood","dairy","cheese","ice cream","produce packing","refrigerated distribution","brewery","frozen food","rendering","slaughterhouse","protein processing","pharmaceutical","biotech","vaccine","chemical processing"];
  const hits = refrigerationTerms.filter((x) => c.includes(x)).length, strong = strongTerms.filter((x) => c.includes(x)).length;
  const ammoHits = ["ammonia","anhydrous ammonia","rmp","psm","nh3"].filter((x) => c.includes(x)).length;
  const nonAmmo = ["co2 refrigeration","carbon dioxide refrigeration","glycol","hfc","hcfc"].some((x) => c.includes(x));
  let score = 28 + Math.min(44, hits * 6) + Math.min(18, strong * 4) + (ammoHits ? 7 : 0) + (nonAmmo ? 6 : 0); if (/maintenance|service|mechanical|refrigeration contractor|parts/.test(c)) score += 4; score = Math.min(100, score);
  const ammo = ammoHits >= 2 ? "Confirmed" : ammoHits === 1 ? "Likely" : "None indicated";
  const m = c.match(/(?:ammonia|anhydrous ammonia)[^.]{0,120}(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)|(?:over|more than|at least|exceeding)\s*(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)[^.]{0,120}ammonia/i);
  const ammoniaLb = m ? Number((m[1] || m[2]).replace(/,/g, "")) : null;
  const state = stateGuess(`${h.title} ${h.snippet}`, hint), city = cityGuess(`${h.title} ${h.snippet}`, state);
  return { name: titleName(h.title), city, state, industry: strong ? titleName(h.title) : "Industrial facility / refrigeration candidate", refrigeration: nonAmmo ? "Industrial refrigeration (non-ammonia signal)" : ammoHits ? "Industrial refrigeration (ammonia signal)" : "Industrial refrigeration candidate — verify", ammonia: ammo, ammoniaLb, score, priority: score >= 88 ? "A" : score >= 72 ? "B" : "C", reason: ammoniaLb && ammoniaLb >= 10000 ? "Public evidence suggests ammonia at or above 10,000 lb." : "Public evidence suggests a potential industrial-refrigeration customer; facility-level verification recommended.", sourceUrls: [h.url] };
}
async function epaRmp(state: string): Promise<Prospect[]> {
  const sts = state === "All Western States" ? STATES : [state];
  const urls = sts.map((s) => `https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities?state_abbr=${ABBR[s]}&pgm_sys_acrnm=RMP&program_output=yes&output=JSON`);
  const raws = await Promise.all(urls.map((u) => html(u, 5000))); const out: Prospect[] = [];
  raws.forEach((raw, i) => { try { const rows = JSON.parse(raw) as Array<Record<string, unknown>>; for (const r of rows.slice(0, 250)) { const name = String(r.FACILITY_NAME || r.facility_name || r.PROGRAM_FACILITY_NAME || r.program_facility_name || "").trim(); if (!name) continue; const city = String(r.CITY_NAME || r.city_name || "Unknown").trim() || "Unknown"; out.push({ name, city, state: sts[i], industry: "EPA RMP / regulated facility", refrigeration: "Industrial refrigeration candidate — verify", ammonia: "Confirmed", ammoniaLb: null, score: 72, priority: "B", reason: "Facility appears in EPA's public RMP registry; refrigeration and ammonia details should be verified.", sourceUrls: [urls[i]] }); } } catch { /* ignore */ } }); return out;
}
function queries(state: string, batch: number, sweep: number, selected: string[]) {
  const sts = state === "All Western States" ? STATES : [state]; const mode = MODES[sweep % MODES.length]; const pack = state === "All Western States" ? 3 : 1; const start = (batch * pack) % sts.length; const use = Array.from({ length: Math.min(pack, sts.length) }, (_, i) => sts[(start + i) % sts.length]);
  const aliases = selected.flatMap((x) => INDUSTRY_SEARCH_ALIASES[x] || [x]); const terms = (aliases.length ? aliases : mode[1]).slice(0, 24); const qs: string[] = [];
  for (const s of use) { for (let i = 0; i < Math.min(6, terms.length); i++) { const term = terms[(batch * 4 + sweep * 3 + i) % terms.length]; qs.push(`"${s}" ${term}`); qs.push(`"${s}" ${term} refrigeration`); } const cities = GEO[s] || []; if (cities.length) { const c = cities[(batch + sweep) % cities.length]; const term = terms[(batch + sweep) % terms.length]; qs.push(`"${c}" ${term}`); qs.push(`"${c}" ${term} permit`); qs.push(`"${c}" ${term} filetype:pdf`); } qs.push(`"${s}" ${terms[(batch + sweep + 5) % terms.length]} site:gov`); }
  return { qs: [...new Set(qs)], offset: (batch * 10 + Math.floor(sweep / MODES.length) * 30) % 90, total: state === "All Western States" ? 13 : 5, label: mode[0] };
}
function dedupe(items: Prospect[]) { const m = new Map<string, Prospect>(); for (const p of items) { const k = key(p); const old = m.get(k); if (!old || p.score > old.score) m.set(k, p); } return [...m.values()].sort((a, b) => b.score - a.score); }

export async function POST(req: Request) {
  try {
    const b = await req.json(); const mode = b?.mode || "research"; const state = b?.state || "All Western States"; const known = new Set<string>(Array.isArray(b?.knownKeys) ? b.knownKeys : []);
    if (mode === "discover" || mode === "categoryDiscover") {
      const batch = Math.max(0, Number(b?.batch) || 0), sweep = Math.max(0, Number(b?.sweep) || 0), selected = Array.isArray(b?.selectedCategories) ? b.selectedCategories.filter((x: unknown): x is string => typeof x === "string") : [];
      const cfg = queries(state, batch, sweep, selected); const [web, epa] = await Promise.all([Promise.all(cfg.qs.map((q) => multiSearch(q, cfg.offset))), epaRmp(state)]); const hits = web.flat(); const webProspects = hits.map((h) => classify(h, state)); const candidates = dedupe([...webProspects, ...epa]).filter((p) => !known.has(key(p)) && p.score >= 25);
      return NextResponse.json({ mode: "discover", batch, totalBatches: cfg.total, sweep, searchMode: cfg.label, queryCount: cfg.qs.length, hitCount: hits.length, epaCount: epa.length, prospects: candidates, raw: `${cfg.label} pack ${batch + 1}/${cfg.total}: ${cfg.qs.length} queries across DDG, Bing, Yahoo, Google + EPA RMP; ${candidates.length} new candidates.` });
    }
    const p = b?.prospect || {}; const name = p.name || "industrial refrigeration facility", city = p.city || ""; const qs = [`"${name}" ${city} industrial refrigeration`, `"${name}" ${city} ammonia refrigeration`, `"${name}" ${city} cold storage`, `"${name}" site:epa.gov ammonia`, `"${name}" site:gov refrigeration permit`, `"${name}" filetype:pdf refrigeration`]; const groups = await Promise.all(qs.map((q) => multiSearch(q, 0))); const hits = Array.from(new Map(groups.flat().map((h) => [h.url, h])).values()).slice(0, 40); return NextResponse.json({ mode: "research", dossier: hits.length ? [`LIVE PUBLIC WEB RESEARCH: ${name}`, "", ...hits.map((h, i) => `${i + 1}. ${h.title}\n${h.snippet}\nSource: ${h.url}`), "", "Industrial refrigeration is the primary target. Ammonia is optional; 10,000 lb applies only when ammonia is present."].join("\n") : `No public-search results were retrieved for ${name}.`, sources: hits.map((h) => h.url) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected public-web research error." }, { status: 500 }); }
}
