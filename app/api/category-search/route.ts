import { NextResponse } from "next/server";

const WESTERN_STATES = ["Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const UA = "KeepSupplyProspector/2.1 (public research tool)";
const TIMEOUT = 2600;

type Hit = { title: string; url: string; snippet: string };

const TERMS: Record<string, string[]> = {
  "Beef processing plants": ["beef processing", "beef plant", "beef packing"],
  "Pork processing plants": ["pork processing", "pork plant", "pork packing"],
  "Poultry processing plants": ["poultry processing", "poultry plant", "chicken processing"],
  "Rendering facilities": ["rendering plant", "animal rendering", "rendering facility"],
  "Meat packing plants": ["meat packing", "meat packing plant", "meat processing"],
  "Sausage/processed meat manufacturers": ["sausage manufacturing", "processed meat", "meat products manufacturer"],
  "Frozen meat processors": ["frozen meat processing", "frozen meat plant", "frozen meat"],
  "Further-processing facilities": ["further processing", "food further processing", "meat further processing"],
  "Distribution facilities attached to meat producers": ["meat distribution center", "meat producer distribution", "refrigerated meat distribution"],
  "Large butcher/processing operations": ["large butcher", "butcher processing", "custom meat processing"],
  "Cold storage warehouses": ["cold storage warehouse", "cold storage facility"],
  "Frozen food warehouses": ["frozen food warehouse", "frozen storage warehouse"],
  "Refrigerated distribution centers": ["refrigerated distribution center", "refrigerated distribution"],
  "Temperature-controlled logistics": ["temperature controlled logistics", "temperature-controlled warehouse", "cold chain logistics"],
  "3PL cold storage": ["3PL cold storage", "third party logistics cold storage", "3PL refrigerated warehouse"],
  "Food distribution centers": ["food distribution center", "food distribution warehouse"],
  "Frozen storage facilities": ["frozen storage facility", "frozen warehouse"],
  "Produce cold storage": ["produce cold storage", "fruit cold storage", "vegetable cold storage"],
  "Meat cold storage": ["meat cold storage", "refrigerated meat warehouse"],
  "Pharmaceutical cold storage": ["pharmaceutical cold storage", "pharma cold chain warehouse"],
  "Regional refrigerated warehouses": ["regional refrigerated warehouse", "refrigerated warehouse regional"],
  "Milk processors": ["milk processing plant", "milk processor"],
  "Cheese manufacturers": ["cheese manufacturing", "cheese plant"],
  "Yogurt manufacturers": ["yogurt manufacturing", "yogurt plant"],
  "Ice cream manufacturers": ["ice cream manufacturing", "ice cream plant"],
  "Butter producers": ["butter production", "butter plant"],
  "Powdered milk facilities": ["powdered milk plant", "milk powder facility"],
  "Dairy ingredient processors": ["dairy ingredients", "dairy ingredient processor"],
  "Beverage manufacturers": ["beverage manufacturing", "beverage plant"],
  "Soft drink plants": ["soft drink plant", "soft drink manufacturing", "soda bottling plant"],
  "Juice processors": ["juice processing", "juice plant"],
  "Bottling facilities": ["bottling facility", "bottling plant"],
  "Brewing companies": ["brewery", "brewing company"],
  "Large breweries": ["large brewery", "production brewery"],
  "Distilleries": ["distillery", "distilling company"],
  "Beverage distribution": ["beverage distribution center", "beverage distribution"],
  "Regional breweries": ["regional brewery", "regional brewing"],
  "Craft breweries with significant production": ["large craft brewery", "production craft brewery", "craft brewery production"],
  "Spirits manufacturers": ["spirits manufacturer", "spirits production"],
  "Beverage plants": ["beverage plant", "beverage manufacturing facility"],
  "Fermentation facilities": ["fermentation facility", "industrial fermentation"],
  "Beverage distribution centers": ["beverage distribution center", "beer distribution center"],
  "Production facility": ["production facility", "manufacturing facility"],
  "Distribution center": ["distribution center", "distribution facility"],
  "Barrel aging": ["barrel aging facility", "barrel warehouse"],
  "Fermentation": ["fermentation plant", "fermentation process"],
  "Packaging line": ["packaging line", "packaging facility"],
  "Cold storage": ["cold storage", "refrigerated storage"],
  "Industrial refrigeration": ["industrial refrigeration", "industrial refrigeration system"],
  "Ammonia": ["ammonia refrigeration", "ammonia system", "anhydrous ammonia"],
  "CO₂ refrigeration": ["CO2 refrigeration", "carbon dioxide refrigeration", "CO2 refrigeration system"],
  "Pharmaceutical manufacturing": ["pharmaceutical manufacturing", "pharma manufacturing"],
  "Biotech manufacturing": ["biotech manufacturing", "biotechnology manufacturing"],
  "Vaccine facilities": ["vaccine manufacturing facility", "vaccine plant"],
  "Life sciences manufacturing": ["life sciences manufacturing", "life sciences facility"],
  "Pharmaceutical distribution": ["pharmaceutical distribution center", "pharma distribution"],
  "Cold-chain pharmaceutical warehouses": ["pharma cold chain warehouse", "pharmaceutical cold chain"],
  "API manufacturing": ["API manufacturing", "active pharmaceutical ingredient manufacturing"],
  "Medical product manufacturing": ["medical product manufacturing", "medical device manufacturing"],
  "Specialty chemical/pharmaceutical facilities": ["specialty chemical pharmaceutical", "specialty pharma facility"],
  "Chemical manufacturing": ["chemical manufacturing", "chemical plant"],
  "Plastics manufacturing": ["plastics manufacturing", "plastic manufacturing plant"],
  "Rubber manufacturing": ["rubber manufacturing", "rubber plant"],
  "Industrial gases": ["industrial gases", "industrial gas plant"],
  "Chemical processing": ["chemical processing", "chemical process plant"],
  "Large-scale manufacturing": ["large scale manufacturing", "large manufacturing plant"],
  "Process cooling facilities": ["process cooling", "industrial process cooling"],
  "Industrial freezing": ["industrial freezing", "industrial freezer"],
  "Thermal processing": ["thermal processing", "thermal processing plant"],
  "Food ingredient manufacturing": ["food ingredient manufacturing", "food ingredients plant"],
  "Industrial production facilities": ["industrial production facility", "industrial manufacturing facility"],
  "Industrial refrigeration contractors": ["industrial refrigeration contractor", "industrial refrigeration service"],
  "Industrial refrigeration service companies": ["industrial refrigeration service", "industrial refrigeration maintenance"],
  "Ammonia refrigeration contractors": ["ammonia refrigeration contractor", "ammonia refrigeration service"],
  "Commercial refrigeration contractors": ["commercial refrigeration contractor", "commercial refrigeration service"],
  "Refrigeration engineering firms": ["refrigeration engineering firm", "refrigeration engineering"],
  "HVAC/R contractors specializing in industrial systems": ["industrial HVACR contractor", "industrial HVAC refrigeration"],
  "Refrigeration maintenance companies": ["refrigeration maintenance", "refrigeration maintenance company"],
  "Refrigeration system integrators": ["refrigeration system integrator", "refrigeration controls integrator"],
  "Industrial mechanical contractors": ["industrial mechanical contractor", "industrial mechanical services"],
  "Refrigeration equipment installers": ["refrigeration equipment installer", "industrial refrigeration installation"]
};

function clean(s: string) { return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim(); }
function decodeDdg(raw: string) { try { const u = decodeURIComponent(raw); const m = u.match(/[?&]uddg=([^&]+)/i); return m ? decodeURIComponent(m[1]) : u; } catch { return raw; } }
function parseDdg(html: string): Hit[] {
  const out: Hit[] = [];
  for (const block of html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1)) {
    const m = block.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const s = block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    const url = decodeDdg(m[1]);
    if (/^https?:/i.test(url)) out.push({ title: clean(m[2]), url, snippet: s ? clean(s[1]) : "" });
    if (out.length >= 10) break;
  }
  return out;
}
async function fetchHtml(url: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try { const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: ctl.signal }); return r.ok ? r.text() : ""; } catch { return ""; } finally { clearTimeout(t); }
}
async function search(q: string, offset: number) {
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&s=${offset}`);
  return html ? parseDdg(html) : [];
}
function score(hit: Hit, category: string) {
  const c = `${hit.title} ${hit.snippet}`.toLowerCase();
  const refrigeration = ["refrigeration", "cold storage", "refrigerated", "freezer", "freezing", "cold chain", "ammonia", "co2", "carbon dioxide", "process cooling", "temperature controlled"].filter((x) => c.includes(x)).length;
  const ammonia = ["ammonia", "anhydrous ammonia", "nh3", "rmp", "psm"].filter((x) => c.includes(x)).length;
  let n = 38 + Math.min(36, refrigeration * 6) + (ammonia ? 8 : 0) + (category.toLowerCase().includes("contractor") ? 5 : 0);
  if (/maintenance|service|engineering|mechanical|installer|contractor/.test(c)) n += 4;
  return Math.min(100, n);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const state = body?.state || "All Western States";
    const selected: string[] = Array.isArray(body?.selectedCategories) ? body.selectedCategories.filter((x: unknown) => typeof x === "string" && TERMS[x]) : [];
    const known = new Set<string>(Array.isArray(body?.knownKeys) ? body.knownKeys : []);
    const batch = Math.max(0, Number(body?.batch) || 0);
    const states = state === "All Western States" ? WESTERN_STATES : [state];
    const chosen = selected.length ? selected : Object.keys(TERMS);
    const groups: string[][] = [];
    for (let i = 0; i < chosen.length; i += 4) groups.push(chosen.slice(i, i + 4));
    const pack = groups[batch % Math.max(1, groups.length)] || chosen;
    const selectedStates = states.slice((batch * 3) % states.length).concat(states).slice(0, Math.min(4, states.length));
    const queries = selectedStates.flatMap((s) => pack.flatMap((category) => TERMS[category].slice(0, 1).map((term) => `"${s}" ${term} refrigeration`)));
    const offset = Math.floor(batch / Math.max(1, groups.length)) * 10;
    const hits = (await Promise.all(queries.slice(0, 14).map((q) => search(q, offset)))).flat();
    const dedup = new Map<string, any>();
    for (const hit of hits) {
      const c = `${hit.title} ${hit.snippet}`.toLowerCase();
      const refrigerationSignal = /refrigerat|cold storage|cold chain|freezer|freezing|ammonia|co2|temperature controlled|process cooling/.test(c);
      if (!refrigerationSignal) continue;
      const name = hit.title.replace(/\s*[-|–—]\s*(official|homepage|website|linkedin|facebook|yelp|yellowpages).*$/i, "").trim();
      const stateMatch = WESTERN_STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(`${hit.title} ${hit.snippet}`));
      const actualState = stateMatch || (state === "All Western States" ? "Unknown" : state);
      const key = `${name}|Unknown|${actualState}`.toLowerCase().replace(/\s+/g, " ").trim();
      if (known.has(key)) continue;
      const category = pack.find((x) => TERMS[x].some((term) => c.includes(term))) || pack[0];
      const p = { name, city: "Unknown", state: actualState, industry: category, refrigeration: /ammonia/.test(c) ? "Industrial refrigeration — ammonia signal" : /co2|carbon dioxide/.test(c) ? "Industrial refrigeration — CO₂ signal" : "Industrial refrigeration candidate — verify", ammonia: /ammonia|anhydrous ammonia|nh3/.test(c) ? "Likely" : "None indicated", ammoniaLb: null, score: score(hit, category), priority: "C", reason: `Matched targeted Keep Supply filter: ${category}. Public web evidence: ${hit.title}`, sourceUrls: [hit.url] };
      p.priority = p.score >= 88 ? "A" : p.score >= 72 ? "B" : "C";
      if (!dedup.has(key) || p.score > dedup.get(key).score) dedup.set(key, p);
    }
    return NextResponse.json({ prospects: [...dedup.values()].sort((a, b) => b.score - a.score), batch, totalBatches: Math.max(1, groups.length), categories: pack, hitCount: hits.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Targeted search failed" }, { status: 500 });
  }
}
