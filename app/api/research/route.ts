import { NextResponse } from "next/server";

const WESTERN_STATES = ["Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const UA = "KeepSupplyProspector/1.0 (public research tool)";
const SEARCH_TIMEOUT_MS = 3200;

type SearchHit = { title: string; url: string; snippet: string };

type Prospect = {
  name: string;
  city: string;
  state: string;
  industry: string;
  refrigeration: string;
  ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated";
  ammoniaLb: number | null;
  score: number;
  priority: "A" | "B" | "C";
  reason: string;
  sourceUrls: string[];
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleToName(title: string) {
  return title
    .replace(/\s*[-|–—]\s*(official|website|homepage|linkedin|facebook|yelp|yellowpages|indeed|mapquest).*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .trim();
}

function guessCityState(text: string, stateHint: string) {
  const state = WESTERN_STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(text)) || stateHint || "Unknown";
  const cityMatch = text.match(/\b(?:in|near|at|—)\s+([A-Z][A-Za-z .'-]{2,40}),?\s+(?:AZ|CA|CO|ID|MT|NV|NM|OR|UT|WA|WY|AK|HI)\b/);
  return { city: cityMatch?.[1]?.trim() || "Unknown", state };
}

function classify(hit: SearchHit, stateHint: string): Prospect {
  const corpus = `${hit.title} ${hit.snippet}`.toLowerCase();
  const refrigerationTerms = [
    "industrial refrigeration", "refrigerated warehouse", "cold storage", "cold chain", "ammonia refrigeration",
    "co2 refrigeration", "carbon dioxide refrigeration", "refrigeration system", "freezer", "freezing", "blast freezer",
    "food processing", "meat processing", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce packing",
    "fruit packing", "beverage manufacturing", "brewery", "distillery", "refrigerated distribution"
  ];
  const strongFacilityTerms = ["cold storage", "food processing", "meat", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce", "brewery", "refrigerated warehouse"];
  const ammoniaTerms = ["ammonia", "anhydrous ammonia", "rmp ammonia", "psm ammonia"];
  const nonAmmoniaTerms = ["co2 refrigeration", "glycol", "hfc", "hcfc", "nh3/co2", "carbon dioxide refrigeration"];

  const refrigerationHits = refrigerationTerms.filter((t) => corpus.includes(t)).length;
  const strongHits = strongFacilityTerms.filter((t) => corpus.includes(t)).length;
  const ammoniaHits = ammoniaTerms.filter((t) => corpus.includes(t)).length;
  const nonAmmoniaHits = nonAmmoniaTerms.filter((t) => corpus.includes(t)).length;

  let score = 35 + Math.min(32, refrigerationHits * 5) + Math.min(16, strongHits * 4);
  if (ammoniaHits) score += 8;
  if (nonAmmoniaHits) score += 5;
  if (/parts|maintenance|service|mechanical|hvac|refrigeration contractor/.test(corpus)) score += 4;
  score = Math.max(0, Math.min(100, score));

  const ammonia: Prospect["ammonia"] = ammoniaHits >= 2 ? "Confirmed" : ammoniaHits === 1 ? "Likely" : "None indicated";
  const ammoniaLbMatch = corpus.match(/(?:over|more than|exceeding|at least|approximately|\b)(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)\b[^.]{0,50}ammonia|ammonia[^.]{0,50}(\d{1,3}(?:,\d{3})+|\d{5,})\s*(?:lb|lbs|pounds)/i);
  const ammoniaLb = ammoniaLbMatch ? Number((ammoniaLbMatch[1] || ammoniaLbMatch[2]).replace(/,/g, "")) : null;
  const { city, state } = guessCityState(`${hit.title} ${hit.snippet}`, stateHint === "All Western States" ? "Western U.S." : stateHint);

  const industry = strongHits ? hit.title : refrigerationHits ? "Industrial refrigeration / cold-chain facility" : "Industrial facility — refrigeration candidate";
  const refrigeration = nonAmmoniaHits ? "Industrial refrigeration (non-ammonia signal)" : ammoniaHits ? "Industrial refrigeration (ammonia signal)" : "Industrial refrigeration candidate — verify system type";
  const priority: Prospect["priority"] = score >= 88 ? "A" : score >= 72 ? "B" : "C";
  const reason = ammonia === "Confirmed" && ammoniaLb && ammoniaLb >= 10000
    ? "Strong industrial-refrigeration fit with evidence of ammonia at or above the 10,000-lb threshold."
    : "Public web evidence indicates an industrial refrigeration or cold-chain opportunity; system type and equipment details should be verified.";

  return { name: titleToName(hit.title), city, state, industry, refrigeration, ammonia, ammoniaLb, score, priority, reason, sourceUrls: [hit.url] };
}

async function duckSearch(query: string): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: controller.signal });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < 8) {
      hits.push({ title: stripHtml(m[2]), url: m[1], snippet: stripHtml(m[3]) });
    }
    return hits;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function buildQueries(state: string, batch = 0) {
  const scope = state === "All Western States" ? WESTERN_STATES : [state];
  const industries = [
    "cold storage refrigerated warehouse",
    "food processing meat poultry seafood",
    "dairy cheese ice cream",
    "fruit produce packing cold chain",
    "beverage brewery manufacturing refrigeration",
    "industrial refrigeration distribution center"
  ];
  const all = scope.flatMap((s) => industries.map((i) => `"${s}" ${i} refrigeration`));
  all.push(...scope.map((s) => `"${s}" ammonia refrigeration facility RMP`));
  all.push(...scope.map((s) => `"${s}" "industrial refrigeration" plant facility`));
  const size = 6;
  return { queries: all.slice(batch * size, (batch + 1) * size), totalBatches: Math.ceil(all.length / size) };
}

function dedupeProspects(items: Prospect[]) {
  const map = new Map<string, Prospect>();
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.city.toLowerCase()}|${item.state.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || item.score > existing.score) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

function formatResearch(name: string, hits: SearchHit[]) {
  if (!hits.length) return `No public-search results were retrieved for ${name}. Try a broader facility name, city, or industry keyword.`;
  return [
    `LIVE PUBLIC WEB RESEARCH: ${name}`,
    "",
    ...hits.slice(0, 10).map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   Source: ${h.url}`),
    "",
    "Qualification note: industrial refrigeration is the primary target. Ammonia is optional; the 10,000-lb test applies only when ammonia evidence is present."
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body?.mode === "discover" ? "discover" : "research";
    const state = body?.state || "All Western States";

    if (mode === "discover") {
      const batch = Math.max(0, Number(body?.batch) || 0);
      const { queries, totalBatches } = buildQueries(state, batch);
      const batches = await Promise.all(queries.map(duckSearch));
      const hits = batches.flat();
      const prospects = dedupeProspects(hits.map((h) => classify(h, state))).filter((p) => p.score >= 45);
      return NextResponse.json({ mode, batch, totalBatches, prospects, raw: `Batch ${batch + 1} of ${totalBatches}: ${hits.length} public search results, ${prospects.length} candidates.` });
    }

    const prospect = body?.prospect || {};
    const name = prospect.name || "industrial refrigeration facility";
    const city = prospect.city || "";
    const searchTerms = [
      `"${name}" ${city} industrial refrigeration`,
      `"${name}" ammonia refrigeration`,
      `"${name}" cold storage refrigerated`,
      `"${name}" site:epa.gov ammonia`,
      `"${name}" site:osha.gov refrigeration ammonia`,
    ];
    const batches = await Promise.all(searchTerms.map(duckSearch));
    const hits = Array.from(new Map(batches.flat().map((h) => [h.url, h])).values()).slice(0, 20);
    return NextResponse.json({ mode, dossier: formatResearch(name, hits), sources: hits.map((h) => h.url) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected public-web research error." }, { status: 500 });
  }
}
