import { NextResponse } from "next/server";

const UA = "KeepSupplyProspector/2.6";
const ENGINES = ["ddg", "bing", "yahoo", "google", "startpage", "mojeek"] as const;
type Hit = { title: string; url: string; snippet: string };

function clean(v: string) { return v.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim(); }
function unwrap(raw: string) { try { const d = decodeURIComponent(raw); const m = d.match(/[?&](?:uddg|url|u)=([^&]+)/i); return m ? decodeURIComponent(m[1]) : d; } catch { return raw; } }
function links(html: string, blocked: string[] = []): Hit[] { const out: Hit[] = []; const seen = new Set<string>(); const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m: RegExpExecArray | null; while ((m = re.exec(html)) && out.length < 25) { const url = unwrap(m[1]); const title = clean(m[2]); if (!/^https?:/i.test(url) || title.length < 5 || blocked.some((x) => url.includes(x)) || seen.has(url)) continue; seen.add(url); out.push({ title, url, snippet: "" }); } return out; }
async function html(url: string) { const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 2500); try { const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store", signal: ctl.signal }); return r.ok ? await r.text() : ""; } catch { return ""; } finally { clearTimeout(timer); } }
async function search(engine: string, q: string) {
  if (engine === "ddg") return links(await html(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`), ["duckduckgo.com"]);
  if (engine === "bing") { const raw = await html(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10`); const out: Hit[] = []; for (const b of raw.split(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>/i).slice(1)) { const m = b.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i); if (m) out.push({ title: clean(m[2]), url: m[1], snippet: "" }); if (out.length >= 12) break; } return out; }
  if (engine === "yahoo") return links(await html(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}`), ["yahoo.com"]);
  if (engine === "startpage") return links(await html(`https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}&cat=web`), ["startpage.com", "google.com"]);
  if (engine === "mojeek") return links(await html(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`), ["mojeek.com"]);
  return links(await html(`https://www.google.com/search?q=${encodeURIComponent(q)}`), ["google.com", "gstatic.com"]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prospect = body?.prospect || {};
    const name = String(prospect.name || "").trim();
    const city = String(prospect.city || "").trim();
    const state = String(prospect.state || "").trim();
    if (!name) return NextResponse.json({ error: "Prospect name is required." }, { status: 400 });
    const seed = [
      `"${name}" ${city} ${state} plant`,
      `"${name}" ${city} ${state} warehouse`,
      `"${name}" ${city} ${state} distribution center`,
      `"${name}" ${city} ${state} facility`,
      `"${name}" refrigeration`,
      `"${name}" ammonia`,
      `"${name}" cold storage`,
      `"${name}" permit`,
      `"${name}" filetype:pdf`,
      `"${name}" expansion`,
      `"${name}" RMP PSM`,
      `"${name}" site:gov`
    ];
    const queries = seed.slice(0, 8);
    const results = await Promise.allSettled(queries.flatMap((q) => ENGINES.map((e) => search(e, q))));
    const hits = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
    const deduped = Array.from(new Map(hits.map((h) => [h.url, h])).values()).slice(0, 80);
    return NextResponse.json({ name, city, state, queryCount: queries.length, engineCount: ENGINES.length, hitCount: deduped.length, sources: deduped.map((h) => ({ title: h.title, url: h.url })) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Expansion research failed." }, { status: 500 }); }
}
