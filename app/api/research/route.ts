import { NextResponse } from "next/server";
import type { DiscoverRequest, DiscoverResponse, Prospect } from "../../../lib/types";
import { echoProvider, fsisProvider, osmProvider, triProvider } from "../../../lib/providers";
import { ENGINES, keyedConfigured, searchAll, webTask } from "../../../lib/web";
import { researchProspect } from "../../../lib/research";
import { isWesternState } from "../../../lib/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { mode: "task", task, targets, ammoniaOnly, providers }  → one discovery pack
// POST { mode: "research", prospect, providers }                → Research Now dossier
// GET  ?probe=1                                                  → live source health check
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const mode = String(body.mode || "");
  const providers = (body.providers && typeof body.providers === "object" ? body.providers : {}) as Record<string, boolean>;

  try {
    if (mode === "task") {
      const { task, targets = [], ammoniaOnly = false } = body as unknown as DiscoverRequest;
      if (!task || !task.kind) return NextResponse.json({ error: "Missing task." }, { status: 400 });
      const cleanTargets = Array.isArray(targets) ? targets.filter((t): t is string => typeof t === "string").slice(0, 200) : [];
      let out: DiscoverResponse;
      if (task.kind === "fsis") {
        const r = await fsisProvider(task.states.filter(isWesternState), cleanTargets);
        out = { records: r.records, rawHits: r.rawHits, diagnostics: [r.log] };
      } else if (task.kind === "tri") {
        const r = await triProvider(task.state, cleanTargets);
        out = { records: r.records, rawHits: r.rawHits, diagnostics: [r.log] };
      } else if (task.kind === "echo") {
        const r = await echoProvider(task.state, task.naics || [], cleanTargets);
        out = { records: r.records, rawHits: r.rawHits, diagnostics: [r.log] };
      } else if (task.kind === "osm") {
        const r = await osmProvider(task.state, cleanTargets);
        out = { records: r.records, rawHits: r.rawHits, diagnostics: [r.log] };
      } else if (task.kind === "web") {
        const queries = (task.queries || []).filter((q) => typeof q === "string").slice(0, 8);
        const r = await webTask(queries, task.state, cleanTargets, providers);
        out = { records: r.records, rawHits: r.rawHits, diagnostics: r.logs, leadPages: r.leadPages };
      } else {
        return NextResponse.json({ error: "Unknown task kind." }, { status: 400 });
      }
      if (ammoniaOnly) {
        // Ammonia Only never discards discoveries (they still go to Lifetime); the UI filters the view.
        out.diagnostics.push({ provider: "Ammonia Only", ok: true, status: "ok", count: out.records.filter((p) => p.ammonia === "Confirmed" || p.ammonia === "Likely").length, ms: 0, detail: "records with ammonia evidence in this pack" });
      }
      return NextResponse.json(out);
    }

    if (mode === "research") {
      const prospect = body.prospect as Prospect | undefined;
      if (!prospect || !prospect.name) return NextResponse.json({ error: "Prospect name is required." }, { status: 400 });
      const result = await researchProspect(prospect, providers);
      return NextResponse.json({ mode: "research", ...result });
    }

    if (mode === "discover" || mode === "categoryDiscover") {
      return NextResponse.json({ error: "The Prospecting Engine was updated. Please reload the page." }, { status: 409 });
    }

    return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected research error." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!url.searchParams.get("probe")) {
    return NextResponse.json({
      engines: ENGINES.map((e) => ({ ...e, configured: keyedConfigured(e.id) })),
      structured: ["USDA FSIS", "EPA TRI", "EPA ECHO", "OpenStreetMap"],
    });
  }
  const started = Date.now();
  const [fsis, tri, echo, osm, web] = await Promise.all([
    fsisProvider(["Idaho"], ["Beef processing plants"]),
    triProvider("Idaho", []),
    echoProvider("Idaho", ["493120", "311511"], []),
    url.searchParams.get("osm") ? osmProvider("Wyoming", ["Cold storage warehouses", "Beef processing plants"]) : Promise.resolve(null),
    searchAll(["Idaho cold storage warehouse"], Object.fromEntries(ENGINES.map((e) => [e.id, true]))),
  ]);
  return NextResponse.json({
    ms: Date.now() - started,
    structured: [fsis.log, tri.log, echo.log, ...(osm ? [osm.log] : [])],
    engines: web.logs,
    sample: [...fsis.records.slice(0, 2), ...tri.records.slice(0, 2), ...echo.records.slice(0, 2)].map((p) => `${p.name} — ${p.city}, ${p.state} (${p.providers.join("+")}, score ${p.score})`),
  });
}
