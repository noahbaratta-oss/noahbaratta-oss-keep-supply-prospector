import { NextResponse } from "next/server";

const WESTERN_STATES = ["Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const STATE_CODES: Record<string, string> = { Arizona: "AZ", California: "CA", Colorado: "CO", Idaho: "ID", Montana: "MT", Nevada: "NV", "New Mexico": "NM", Oregon: "OR", Utah: "UT", Washington: "WA", Wyoming: "WY", Alaska: "AK", Hawaii: "HI" };
const UA = "KeepSupplyProspector/1.0 (public research tool)";
const SEARCH_TIMEOUT_MS = 3200;
const EPA_TIMEOUT_MS = 3500;

type SearchHit = { title: string; url: string; snippet: string };
type Prospect = { name: string; city: string; state: string; industry: string; refrigeration: string; ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated"; ammoniaLb: number | null; score: number; priority: "A" | "B" | "C"; reason: string; sourceUrls: string[] };
type FetchedFacility = { name?: string; city?: string; state?: string; registryId?: string; program?: string; address?: string };

function stripHtml(input: string) {
  return input.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/g, "/").replace(/\s+/g, " ").trim();
}
function decodeDdgUrl(raw: string) { try { const decoded = decodeURIComponent(raw); const match = decoded.match(/[?&]uddg=([^&]+)/i); return match ? decodeURIComponent(match[1]) : raw; } catch { return raw; } }
function titleToName(title: string) { return title.replace(/\s*[-|–—]\s*(official|website|homepage|linkedin|facebook|yelp|yellowpages|indeed|mapquest).*$/i, "").replace(/\s*\|\s*.*$/, "").trim(); }
function guessCityState(text: string, stateHint: string) {
  const state = WESTERN_STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(text)) || stateHint || "Unknown";
  const cityMatch = text.match(/\b(?:in|near|at|—)\s+([A-Z][A-Za-z .'-]{2,40}),?\s+(?:AZ|CA|CO|ID|MT|NV|NM|OR|UT|WA|WY|AK|HI)\b/);
  return { city: cityMatch?.[1]?.trim() || "Unknown", state };
}
function classify(hit: SearchHit, stateHint: string): Prospect {
  const corpus = `${hit.title} ${hit.snippet}`.toLowerCase();
  const refrigerationTerms = ["industrial refrigeration", "refrigerated warehouse", "cold storage", "cold chain", "ammonia refrigeration", "co2 refrigeration", "carbon dioxide refrigeration", "refrigeration system", "refrigeration plant", "freezer", "freezing", "blast freezer", "food processing", "meat processing", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce packing", "fruit packing", "beverage manufacturing", "brewery", "distillery", "refrigerated distribution", "temperature controlled", "temperature-controlled", "frozen foods", "frozen food", "warehouse refrigeration", "process cooling", "chilled warehouse"];
  const strongFacilityTerms = ["cold storage", "food processing", "meat", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce", "brewery", "refrigerated warehouse", "frozen foods", "refrigerated distribution"];
  const ammoniaTerms = ["ammonia", "anhydrous ammonia", "rmp ammonia", "psm ammonia", " nh3", "nh3/"];
  const nonAmmoniaTerms = ["co2 refrigeration", "glycol", "hfc", "hcfc", "nh3/co2", "carbon dioxide refrigeration"];
  const refrigerationHits = refrigerationTerms.filter((t) => corpus.includes(t)).length;
  const strongHits = strongFacilityTerms.filter((t) => corpus.includes(t)).length;
  const ammoniaHits = ammoniaTerms.filter((t) => corpus.includes(t)).length;
  const nonAmmoniaHits = nonAmmoniaTerms.filter((t) => corpus.includes(t)).length;
  let score = 35 + Math.min(32, refrigerationHits * 5) + Math.min(16, strongHits * 4);
  if (ammoniaHits) score += 8;
  if (nonAmmoniaHits) score += 5;
  if (/parts|maintenance|service|mechanical|hvac|refrigeration contractor|facility maintenance/.test(corpus)) score += 4;
  score = Math.max(0, Math.min(100, score));
  const ammonia: Prospect["ammonia"] = ammoniaHits >= 2 ? "Confirmed" : ammoniaHits === 1 ? "Likely" : "None indicated";
  const ammoniaLbMatch = corpus.match(/(?:over|more than|exceeding|at least|approximately)\s*(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)\b[^.]{0,80}ammonia|ammonia[^.]{0,80}(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)/i);
  const ammoniaLb = ammoniaLbMatch ? Number((ammoniaLbMatch[1] || ammoniaLbMatch[2]).replace(/,/g, "")) : null;
  const { city, state } = guessCityState(`${hit.title} ${hit.snippet}`, stateHint === "All Western States" ? "Western U.S." : stateHint);
  const industry = strongHits ? hit.title : refrigerationHits ? "Industrial refrigeration / cold-chain facility" : "Industrial facility — refrigeration candidate";
  const refrigeration = nonAmmoniaHits ? "Industrial refrigeration (non-ammonia signal)" : ammoniaHits ? "Industrial refrigeration (ammonia signal)" : "Industrial refrigeration candidate — verify system type";
  const priority: Prospect["priority"] = score >= 88 ? "A" : score >= 72 ? "B" : "C";
  const reason = ammonia === "Confirmed" && ammoniaLb && ammoniaLb >= 10000 ? "Strong industrial-refrigeration fit with evidence of ammonia at or above the 10,000-lb threshold." : "Public evidence indicates a likely industrial refrigeration or cold-chain opportunity; system type and equipment details should be verified.";
  return { name: titleToName(hit.title), city, state, industry, refrigeration, ammonia, ammoniaLb, score, priority, reason, sourceUrls: [hit.url] };
}
function classifyFacility(f: FetchedFacility): Prospect {
  const text = `${f.name || ""} ${f.city || ""} ${f.program || ""} ${f.address || ""}`.toLowerCase();
  const industryTerms = ["cold", "food", "meat", "poultry", "seafood", "dairy", "cheese", "ice", "produce", "fruit", "brew", "beverage", "warehouse", "distribution", "frozen", "processing", "packing"];
  const industryHits = industryTerms.filter((t) => text.includes(t)).length;
  const rmp = /\brmp\b|risk management plan/.test(text);
  let score = 48 + Math.min(22, industryHits * 4) + (rmp ? 22 : 0);
  if (/tri|rcra|echo/.test(text)) score += 3;
  score = Math.min(100, score);
  const priority: Prospect["priority"] = score >= 88 ? "A" : score >= 72 ? "B" : "C";
  const state = f.state || "Unknown";
  const source = f.registryId ? `https://data.epa.gov/efservice/frs.frs_program_facility/registry_id/equals/${encodeURIComponent(f.registryId)}/0:1/json` : "https://www.epa.gov/frs";
  return { name: f.name || "EPA registered facility", city: f.city || "Unknown", state, industry: industryHits ? "Industrial / commercial facility" : "EPA-registered facility", refrigeration: rmp || industryHits >= 2 ? "Potential industrial refrigeration candidate — verify" : "Potential refrigeration candidate — verify", ammonia: rmp ? "Likely" : "Unknown", ammoniaLb: null, score, priority, reason: rmp ? "EPA Facility Registry program signal indicates a Risk Management Plan; refrigeration and ammonia details require facility-level verification." : "EPA Facility Registry identifies the facility; additional public evidence is needed to confirm refrigeration fit.", sourceUrls: [source] };
}
function parseDdgResults(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blocks = html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1);
  for (const block of blocks) {
    if (hits.length >= 10) break;
    const titleMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) || block.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const snippetMatch = block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const url = decodeDdgUrl(titleMatch[1]);
    const title = stripHtml(titleMatch[2]);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
    if (title && url && /^https?:/i.test(url)) hits.push({ title, url, snippet });
  }
  return hits;
}
function parseBingResults(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blocks = html.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1);
  for (const block of blocks) {
    if (hits.length >= 10) break;
    const link = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!link) continue;
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = stripHtml(link[2]);
    const url = link[1];
    if (title && /^https?:/i.test(url)) hits.push({ title, url, snippet: snippet ? stripHtml(snippet[1]) : "" });
  }
  return hits;
}
async function searchEngine(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store", signal: controller.signal });
    if (!res.ok) return "";
    return await res.text();
  } catch { return ""; } finally { clearTimeout(timeout); }
}
async function multiSearch(query: string): Promise<SearchHit[]> {
  const ddg = await searchEngine(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  const ddgHits = ddg ? parseDdgResults(ddg) : [];
  if (ddgHits.length) return ddgHits;
  const bing = await searchEngine(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=en-US`);
  return bing ? parseBingResults(bing) : [];
}
async function fetchEpaState(stateCode: string): Promise<Prospect[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EPA_TIMEOUT_MS);
  try {
    const url = `https://data.epa.gov/efservice/frs.frs_program_facility/state_code/equals/${stateCode}/0:100/json`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const rows: any[] = Array.isArray(data) ? data : typeof data === "object" && data !== null && Array.isArray((data as { results?: unknown }).results) ? (data as { results: any[] }).results : [];
    return rows.slice(0, 100).map((r: any) => classifyFacility({ name: r.facility_name || r.facility_name_txt || r.name, city: r.city_name || r.city, state: r.state_code || stateCode, registryId: r.registry_id || r.registry_id_num, program: r.pgm_sys_acrnm || r.program_system_acronym, address: r.location_address || r.address })).filter((p: Prospect) => p.score >= 55);
  } catch { return []; } finally { clearTimeout(timeout); }
}
function buildQueries(state: string, batch = 0) {
  const scope = state === "All Western States" ? WESTERN_STATES : [state];
  const industries = ["cold storage refrigerated warehouse", "food processing meat poultry seafood", "dairy cheese ice cream", "fruit produce packing cold chain", "beverage brewery manufacturing refrigeration", "industrial refrigeration distribution center", "freezer frozen food manufacturing", "temperature controlled warehouse", "process cooling industrial plant"];
  const all = scope.flatMap((s) => industries.map((i) => `"${s}" ${i} refrigeration`));
  all.push(...scope.flatMap((s) => [`"${s}" ammonia refrigeration facility RMP`, `"${s}" "industrial refrigeration" plant facility`, `"${s}" filetype:pdf refrigeration permit`, `"${s}" site:gov refrigeration permit cold storage`, `"${s}" site:epa.gov ammonia refrigeration`, `"${s}" site:osha.gov ammonia refrigeration`]));
  const size = 4;
  return { queries: all.slice(batch * size, (batch + 1) * size), totalBatches: Math.ceil(all.length / size) };
}
function dedupeProspects(items: Prospect[]) {
  const map = new Map<string, Prospect>();
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.city.toLowerCase()}|${item.state.toLowerCase()}`;
    const old = map.get(key);
    if (!old || item.score > old.score) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}
function formatResearch(name: string, hits: SearchHit[]) {
  if (!hits.length) return `No public-search results were retrieved for ${name}. Try a broader facility name, city, or industry keyword.`;
  return [`LIVE PUBLIC WEB RESEARCH: ${name}`, "", ...hits.slice(0, 12).map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   Source: ${h.url}`), "", "Qualification note: industrial refrigeration is the primary target. Ammonia is optional; the 10,000-lb test applies only when ammonia evidence is present."].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body?.mode === "discover" ? "discover" : "research";
    const state = body?.state || "All Western States";
    if (mode === "discover") {
      const batch = Math.max(0, Number(body?.batch) || 0);
      const { queries, totalBatches } = buildQueries(state, batch);
      const stateScope = state === "All Western States" ? WESTERN_STATES : [state];
      const [webBatches, epaBatches] = await Promise.all([
        Promise.all(queries.map(multiSearch)),
        Promise.all(stateScope.slice(0, 2).map((s) => fetchEpaState(STATE_CODES[s])))
      ]);
      const hits = webBatches.flat();
      const webProspects = hits.map((h) => classify(h, state));
      const epaProspects = epaBatches.flat();
      const prospects = dedupeProspects([...webProspects, ...epaProspects]).filter((p) => p.score >= 45);
      return NextResponse.json({ mode, batch, totalBatches, prospects, hitCount: hits.length, epaCount: epaProspects.length, raw: `Batch ${batch + 1} of ${totalBatches}: ${hits.length} web results + ${epaProspects.length} EPA facility candidates → ${prospects.length} total candidates.` });
    }
    const prospect = body?.prospect || {};
    const name = prospect.name || "industrial refrigeration facility";
    const city = prospect.city || "";
    const searchTerms = [`"${name}" ${city} industrial refrigeration`, `"${name}" ammonia refrigeration`, `"${name}" cold storage refrigerated`, `"${name}" site:epa.gov ammonia`, `"${name}" site:osha.gov refrigeration ammonia`];
    const batches = await Promise.all(searchTerms.map(multiSearch));
    const hits = Array.from(new Map(batches.flat().map((h) => [h.url, h])).values()).slice(0, 20);
    return NextResponse.json({ mode, dossier: formatResearch(name, hits), sources: hits.map((h) => h.url) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected public-web research error." }, { status: 500 });
  }
}
