import { NextResponse } from "next/server";

const MODEL = process.env.OPENAI_PROSPECTOR_MODEL || "openai/gpt-5.4";
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/responses";

function cleanJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : text;
}

function getGatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.OPENAI_API_KEY || null;
}

export async function POST(req: Request) {
  const token = getGatewayToken();
  if (!token) {
    return NextResponse.json(
      {
        error: "Live research backend is not available in this deployment. The app is configured for Vercel AI Gateway and needs its automatic Vercel OIDC credential or an AI Gateway key.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const mode = body?.mode === "discover" ? "discover" : "research";
    const prospect = body?.prospect;
    const state = body?.state || "All Western States";

    const system = `You are the Keep Supply industrial refrigeration prospecting researcher.
Your job is to identify and qualify commercial/industrial facilities that are plausible Keep Supply prospects in the Western United States.
IMPORTANT BUSINESS RULES:
1. Industrial refrigeration is the primary target. A prospect does NOT need ammonia.
2. Treat ammonia as a technology signal only.
3. Only evaluate the 10,000 lb threshold when ammonia is actually present and supported by evidence.
4. Never invent an ammonia charge. Distinguish confirmed, likely, unknown, and none indicated.
5. Prefer facility-level evidence over generic corporate information.
6. Prefer primary/public sources: EPA, OSHA, state environmental agencies, company/facility websites, official PDFs, permits, enforcement records, expansion announcements. Use industry sources as secondary evidence.
7. Return concise, sales-useful reasoning and include source URLs in the answer.
8. Do not expose private/personal information. Business contact roles are fine.
`;

    const prompt = mode === "discover"
      ? `Find up to 15 new Keep Supply prospects in ${state}. Search across multiple industries that commonly operate industrial refrigeration: cold storage, food processing, meat/poultry/seafood, dairy/cheese, frozen food, produce packing, beverage manufacturing, refrigerated distribution, and similar operations. Cover more than one city/metro where practical.

Return ONLY a JSON array. Each object must have:
name, city, state, industry, refrigeration, ammonia, ammoniaLb, score, priority, reason, sourceUrls
where ammonia is one of Confirmed, Likely, Unknown, None indicated; ammoniaLb is a number only when an explicit or well-supported figure is available, otherwise null; score is 0-100; priority is A/B/C. Score the overall industrial refrigeration opportunity first, then add ammonia evidence as a secondary signal.`
      : `Research this facility for Keep Supply:
${JSON.stringify(prospect)}

Return a concise research dossier with these headings:
1. Prospect summary
2. Industrial refrigeration evidence
3. Refrigeration technology (confirmed/likely/unknown)
4. Ammonia evidence (confirmed/likely/unknown/none indicated)
5. Ammonia charge and 10,000-lb status (only if ammonia is present)
6. Why Keep Supply should care
7. Recommended next action
8. Sources

Be explicit about uncertainty and do not infer an ammonia charge merely because the facility is refrigerated.`;

    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: "web_search" }],
        input: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || "The live research provider rejected the request." }, { status: response.status });
    }

    const text = data?.output_text || "No research result was returned.";

    if (mode === "discover") {
      try {
        const parsed = JSON.parse(cleanJson(text));
        return NextResponse.json({ mode, prospects: parsed, raw: text });
      } catch {
        return NextResponse.json({ mode, prospects: [], raw: text, parseWarning: true });
      }
    }

    return NextResponse.json({ mode, dossier: text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected live research error." }, { status: 500 });
  }
}
