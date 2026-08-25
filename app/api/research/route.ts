import { NextResponse } from "next/server";

const WESTERN_STATES = new Set([
  "Alaska", "Arizona", "California", "Colorado", "Hawaii", "Idaho", "Montana",
  "Nevada", "New Mexico", "North Dakota", "Oregon", "South Dakota", "Utah",
  "Washington", "Wyoming",
]);

const INDUSTRIES = [
  "cold storage",
  "food processing",
  "meat processing",
  "poultry processing",
  "seafood processing",
  "dairy processing",
  "cheese manufacturing",
  "frozen food manufacturing",
  "produce packing",
  "beverage manufacturing",
  "refrigerated distribution",
  "ice manufacturing",
];

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeSearchUrl(href: string) {
  try {
    const url = new URL(href, "https://html.duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

async function webSearch(query: string) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "KeepSupplyProspector/1.0 (+https://keep-supply-prospector.vercel.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });
  if (!response.ok) return [];

  const html = await response.text();
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const blocks = html.split(/result results_links|result__body/).slice(1);

  for (const block of blocks.slice(0, 12)) {
    const anchor = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const title = cleanText(anchor[2].replace(/<[^>]+>/g, ""));
    const url = decodeSearchUrl(anchor[1]);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a?>/i);
    const snippet = cleanText((snippetMatch?.[1] || "").replace(/<[^>]+>/g, ""));
    if (url.startsWith("http") && title) results.push({ title, url, snippet });
  }
  return results;
}

function scoreCandidate(item: { title: string; snippet: string; url: string }) {
  const text = `${item.title} ${item.snippet}`.toLowerCase();
  let score = 35;
  if (/cold storage|refrigerat|freez|warehouse|food processing|meat|poultry|seafood|dairy|cheese|produce|beverage|ice plant/.test(text)) score += 30;
  if (/ammonia|anhydrous ammonia|nh3/.test(text)) score += 15;
  if (/rmp|risk management plan|epa|envirofacts|osha|psm/.test(text)) score += 10;
  if (/distribution|manufactur|processing|packing/.test(text)) score += 5;
  return Math.min(100, score);
}

function inferAmmonia(text: string) {
  const lower = text.toLowerCase();
  if (!/(ammonia|anhydrous ammonia|nh3)/.test(lower)) return "None indicated";
  return "Likely";
}

function inferState(text: string) {
  for (const state of WESTERN_STATES) {
    if (text.includes(state)) return state;
  }
  const abbreviations: Record<string, string> = {
    CA: "California", CO: "Colorado", AZ: "Arizona", ID: "Idaho", MT: "Montana",
    NV: "Nevada", NM: "New Mexico", OR: "Oregon", UT: "Utah", WA: "Washington",
    WY: "Wyoming", ND: "North Dakota", SD: "South Dakota", AK: "Alaska", HI: "Hawaii",
  };
  for (const [abbr, state] of Object.entries(abbreviations)) {
    if (new RegExp(`\\b${abbr}\\b`).test(text)) return state;
  }
  return "Unknown";
}

async function discoverFree(state: string) {
  const states = state === "All Western States" ? Array.from(WESTERN_STATES) : [state];
  const selectedStates = states.slice(0, 6);
  const queries: string[] = [];

  for (const s of selectedStates) {
    for (const industry of INDUSTRIES.slice(0, 4)) {
      queries.push(`"${s}" "${industry}" refrigeration facility`);
    }
    queries.push(`"${s}" ammonia refrigeration RMP facility`);
    queries.push(`site:epa.gov "${s}" ammonia refrigeration facility`);
  }

  const searchResults = await Promise.all(queries.slice(0, 24).map(webSearch));
  const seen = new Set<string>();
  const prospects = [];

  for (const batch of searchResults) {
    for (const item of batch) {
      const key = item.url.split("#")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      const text = `${item.title} ${item.snippet}`;
      const score = scoreCandidate(item);
      if (score < 45) continue;
      prospects.push({
        name: item.title.slice(0, 100),
        city: "Unknown",
        state: inferState(text),
        industry: INDUSTRIES.find((industry) => text.toLowerCase().includes(industry)) || "Industrial refrigeration",
        refrigeration: /refrigerat|cold storage|freez|ice plant/i.test(text) ? "Likely" : "Unknown",
        ammonia: inferAmmonia(text),
        ammoniaLb: null,
        score,
        priority: score >= 80 ? "A" : score >= 65 ? "B" : "C",
        reason: item.snippet || "Public web result indicates a potential industrial refrigeration operation.",
        sourceUrls: [item.url],
      });
      if (prospects.length >= 30) break;
    }
    if (prospects.length >= 30) break;
  }

  prospects.sort((a, b) => b.score - a.score);
  return prospects.slice(0, 15);
}

async function researchFree(prospect: unknown) {
  const text = JSON.stringify(prospect);
  const queries = [
    `${text} industrial refrigeration facility`,
    `${text} ammonia refrigeration`,
    `${text} EPA RMP OSHA`,
    `${text} expansion refrigerated warehouse food processing`,
  ];
  const batches = await Promise.all(queries.map(webSearch));
  const flat = batches.flat().slice(0, 20);

  const sources = flat.map((item) => `- ${item.title}: ${item.url}\n  ${item.snippet}`).join("\n");
  const combined = flat.map((x) => `${x.title} ${x.snippet}`).join(" ");
  const ammonia = inferAmmonia(combined);
  const ammoniaEvidence = ammonia === "None indicated"
    ? "No public ammonia evidence was found in the current free web sweep."
    : "Public web results contain ammonia-related evidence; treat the charge as unconfirmed until a facility-level source or regulatory record states the quantity.";

  return `Prospect summary\n${text}\n\nIndustrial refrigeration evidence\nPublic web results were found for this facility and related operations.\n\nRefrigeration technology\nBased on the free web sweep: ${/refrigerat|cold storage|freez/i.test(combined) ? "Likely industrial/refrigerated operations" : "Unknown"}.\n\nAmmonia evidence\n${ammonia}. ${ammoniaEvidence}\n\nAmmonia charge and 10,000-lb status\nNot established by the free web sweep. The 10,000-lb test is only applicable if ammonia is actually present.\n\nWhy Keep Supply should care\nThe evidence should be validated against the facility before outreach. Industrial refrigeration is the primary qualification.\n\nRecommended next action\nOpen the strongest source, verify the facility address and refrigeration technology, then prioritize the account based on evidence quality.\n\nSources\n${sources || "No source results returned."}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body?.mode === "discover" ? "discover" : "research";
    const state = body?.state || "All Western States";

    if (mode === "discover") {
      const prospects = await discoverFree(state);
      return NextResponse.json({
        mode,
        prospects,
        provider: "free-web-sweep",
        note: "Core discovery uses public web results and does not require a paid AI provider.",
      });
    }

    const dossier = await researchFree(body?.prospect);
    return NextResponse.json({ mode, dossier, provider: "free-web-sweep" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected free research error." },
      { status: 500 }
    );
  }
}
