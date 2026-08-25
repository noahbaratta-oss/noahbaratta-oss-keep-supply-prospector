import { NextResponse } from "next/server";

const WESTERN_STATES = ["Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const UA = "KeepSupplyProspector/1.0 (public research tool)";

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

const INDUSTRIES = [
  "cold storage refrigerated warehouse",
  "food processing meat poultry seafood",
  "dairy cheese ice cream",
  "fruit produce packing cold chain",
  "frozen food manufacturing",
  "beverage brewery manufacturing refrigeration",
  "refrigerated distribution logistics",
  "industrial refrigeration plant facility",
  "food distribution center freezer",
  "potato processing frozen vegetable processing",
  "seafood processing cold storage",
  "pharmaceutical temperature controlled warehouse",
  "large commercial refrigeration facility",
];

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
    "fruit packing", "beverage manufacturing", "brewery", "distillery", "refrigerated distribution", "temperature controlled"
  ];
  const strongFacilityTerms = ["cold storage", "food processing", "meat", "poultry", "seafood", "dairy", "cheese", "ice cream", "produce", "brewery", "refrigerated warehouse", "frozen food", "distribution center", "food distribution"];
  const ammoniaTerms = ["ammonia", "anhydrous ammonia", "rmp ammonia", "psm ammonia", "nh3"];
  const nonAmmoniaTerms = ["co2 refrigeration", "glycol", "hfc", "hcfc", "nh3/co2", "carbon dioxide refrigeration"];

  const refrigerationHits = refrigerationTerms.filter((t) => corpus.includes(t)).length;
  const strongHits = strongFacilityTerms.filter((t) => corpus.includes(t)).length;
  const ammoniaHits = ammoniaTerms.filter((t) => corpus.includes(t)).length;
  const nonAmmoniaHits = nonAmmoniaTerms.filter((t) => corpus.includes(t)).length;

  let score = 34 + Math.min(32, refrigerationHits * 4) + Math.min(18, strongHits * 3);
  if (ammoniaHits) score += 8;
  if (nonAmmoniaHits) score += 6;
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
    : "Public web evidence indicates an industrial refrigeration, cold-chain, freezer, processing, or temperature-controlled opportunity; system type and equipment details should be verified.";

  return { name: titleToName(hit.title), city, state, industry, refrigeration, ammonia, ammoniaLb, score, priority, reason, sourceUrls: [hit.url] };
}

async function duckSearch(query: string): Promise<SearchHit[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < 10) {
      hits.push({ title: stripHtml(m[2]), url: m[1], snippet: stripHtml(m[3]) });
    }
    return hits;
  } catch {
    return [];
  }
}

function buildQueries(state: string) {
  const states = state === "All Western States" ? WESTERN_STATES : [state];
  const queries: string[] = [];
  for (const s of states) {
    for (const industry of INDUSTRIES) {
      queries.push(`"${s}" ${industry}`);
    }
    queries.push(`"${s}" ammonia refrigeration facility RMP`);
    queries.push(`"${s}" "industrial refrigeration" plant facility`);
    queries.push(`"${s}" "refrigerated warehouse" company`);
  }
  return queries;
}

function dedupeProspects(items: Prospect[]) {
  const map = new Map<string, Prospect>();
  for (const item of items) {
    const normalizedName = item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const key = `${normalizedName}|${item.state.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || item.score > existing.score) map.set(key, { ...item, sourceUrls: Array.from(new Set([...(existing?.sourceUrls || []), ...item.sourceUrls])) });
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function formatResearch(name: string, hits: SearchHit[]) {
  if (!hits.length) return `No public-search results were retrieved for ${name}. Try a broader facility name, city, or industry keyword.`;
  return [
    `LIVE PUBLIC WEB RESEARCH: ${name}`,
    "",
    ...hits.slice(0, 20).map((h, i) => `${i + 1}. ${h.title}\n   ${h.snippet}\n   Source: ${h.url}`),
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
      const queries = buildQueries(state);
      const allHits: SearchHit[] = [];
      for (const batch of chunk(queries, 6)) {
        const results = await Promise.all(batch.map(duckSearch));
        allHits.push(...results.flat());
        if (allHits.length >= 1000) break;
      }
      const uniqueHits = Array.from(new Map(allHits.map((h) => [h.url, h])).values());
      const prospects = dedupeProspects(uniqueHits.map((h) => classify(h, state))).filter((p) => p.score >= 48).slice(0, 250);
      return NextResponse.json({ mode, prospects, raw: `Ran ${Math.min(queries.length, Math.ceil(allHits.length / 3))} targeted public-web searches, collected ${uniqueHits.length} unique sources, and qualified ${prospects.length} refrigeration candidates.` });
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
      `"${name}" permit refrigeration`,
      `"${name}" food processing refrigeration`,
      `"${name}" freezer warehouse`
    ];
    const batches = await Promise.all(searchTerms.map(duckSearch));
    const hits = Array.from(new Map(batches.flat().map((h) => [h.url, h])).values()).slice(0, 40);
    return NextResponse.json({ mode, dossier: formatResearch(name, hits), sources: hits.map((h) => h.url) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected public-web research error." }, { status: 500 });
  }
}
