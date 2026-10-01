// Public web search adapters. Every engine is independent: a blocked or failing engine is
// logged and skipped, never fatal. Keyed engines (Brave Search API) are
// optional and only run when their environment variables are configured.

import type { Evidence, Prospect, ProviderLog } from "./types";
import { fetchText, looksBlocked } from "./http";
import { classifyFacility, facilityKey, finalize, isRelevantWebText, normName, refrigerationLabel, textSignals, UNCLASSIFIED } from "./classify";
import { detectCity, detectState, isWesternState } from "./geo";
import { crossReferenceSeed } from "./merge";
import { targetsMatching } from "./targeting";

export type Hit = { title: string; url: string; snippet: string; engine: string };

export type EngineMeta = { id: string; label: string; defaultOn: boolean; keyed?: boolean; note?: string };

export const ENGINES: EngineMeta[] = [
  { id: "bing", label: "Bing", defaultOn: true },
  { id: "ddg", label: "DuckDuckGo", defaultOn: true },
  { id: "yahoo", label: "Yahoo", defaultOn: true },
  { id: "mojeek", label: "Mojeek", defaultOn: true },
  { id: "startpage", label: "Startpage", defaultOn: true },
  { id: "google", label: "Google (HTML)", defaultOn: false, note: "Google HTML results require JavaScript" },
  { id: "marginalia", label: "Marginalia", defaultOn: false },
  { id: "brave", label: "Brave Search API", defaultOn: true, keyed: true, note: "Optional: BRAVE_SEARCH_API_KEY ($5/month credit ≈ 1,000 searches)" },
];

export function keyedConfigured(id: string): boolean {
  if (id === "brave") return Boolean(process.env.BRAVE_SEARCH_API_KEY);
  return true;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function decodeEntities(v: string) {
  return v
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

export function clean(v: string) {
  return decodeEntities(String(v || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

type Anchor = { attrs: Record<string, string>; inner: string; index: number; end: number };

function anchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs: Record<string, string> = {};
    const ar = /([a-zA-Z_:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[1]))) attrs[a[1].toLowerCase()] = decodeEntities(a[3] ?? a[4] ?? "");
    out.push({ attrs, inner: m[2], index: m.index, end: re.lastIndex });
  }
  return out;
}

function snippetAfter(html: string, from: number, classRe: RegExp) {
  const win = html.slice(from, from + 3000);
  const m = win.match(classRe);
  return m ? clean(m[1]) : "";
}

function b64urlDecode(s: string) {
  try {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(b + "===".slice((b.length + 3) % 4), "base64").toString("utf8");
  } catch { return ""; }
}

function unwrapUrl(raw: string): string {
  let url = raw.trim();
  if (url.startsWith("//")) url = `https:${url}`;
  try {
    const u = new URL(url, "https://example.com");
    if (/duckduckgo\.com$/.test(u.hostname) && u.searchParams.get("uddg")) return u.searchParams.get("uddg") as string;
    if (/bing\.com$/.test(u.hostname) && u.pathname.startsWith("/ck/")) {
      const enc = u.searchParams.get("u") || "";
      const dec = enc.startsWith("a1") ? b64urlDecode(enc.slice(2)) : "";
      if (/^https?:/.test(dec)) return dec;
    }
    if (/google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") return u.searchParams.get("q") || u.searchParams.get("url") || url;
    if (/yahoo\.com$/.test(u.hostname)) {
      const ru = url.match(/\/RU=([^/]+)\//);
      if (ru) return decodeURIComponent(ru[1]);
    }
  } catch { /* keep raw */ }
  return url;
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

type EngineOut = { hits: Hit[]; status: ProviderLog["status"]; detail?: string };

async function html(url: string, timeout = 6500): Promise<{ text: string; status: ProviderLog["status"]; detail?: string }> {
  const r = await fetchText(url, { timeout, headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!r.ok) return { text: "", status: r.status === 403 || r.status === 429 || r.status === 202 ? "blocked" : "error", detail: r.error || `HTTP ${r.status}` };
  return { text: r.text, status: "ok" };
}

// Classifies the outcome. A page is only called "blocked" when nothing parsed AND it looks
// like a bot-check page (normal result pages can contain words like "captcha" in scripts).
function done(hits: Hit[], status: ProviderLog["status"], detail?: string, page?: string): EngineOut {
  const good = hits.filter((h) => /^https?:\/\//i.test(h.url) && h.title.length > 2);
  if (status === "ok" && !good.length) {
    if (page && looksBlocked(page)) return { hits: [], status: "blocked", detail: "bot check / consent page" };
    return { hits: [], status: "empty", detail: page ? `no results parsed (${page.length} bytes)` : detail };
  }
  return { hits: good, status, detail };
}

async function bing(q: string): Promise<EngineOut> {
  const r = await html(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=30&setlang=en-US&cc=US`);
  if (r.status !== "ok") return done([], r.status, r.detail);
  const hits: Hit[] = [];
  for (const block of r.text.split(/<li[^>]+class="[^"]*\bb_algo\b[^"]*"[^>]*>/i).slice(1)) {
    const a = block.match(/<h2[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    hits.push({ title: clean(a[2]), url: unwrapUrl(decodeEntities(a[1])), snippet: p ? clean(p[1]) : "", engine: "Bing" });
  }
  return done(hits, "ok", undefined, r.text);
}

async function ddg(q: string): Promise<EngineOut> {
  const r = await html(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=us-en`);
  if (r.status !== "ok") return done([], r.status, r.detail);
  const hits = anchors(r.text)
    .filter((a) => /\bresult__a\b/.test(a.attrs.class || ""))
    .map((a) => ({ title: clean(a.inner), url: unwrapUrl(a.attrs.href || ""), snippet: snippetAfter(r.text, a.end, /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i), engine: "DuckDuckGo" }));
  return done(hits, "ok", undefined, r.text);
}

async function yahoo(q: string): Promise<EngineOut> {
  const r = await html(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}&n=30`);
  if (r.status !== "ok") return done([], r.status, r.detail);
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const a of anchors(r.text)) {
    const href = a.attrs.href || "";
    if (!/r\.search\.yahoo\.com\/.+\/RU=/.test(href)) continue;
    const url = unwrapUrl(href);
    if (seen.has(url) || /yahoo\.com/.test(url)) continue;
    const title = clean(a.inner.replace(/<span[^>]*>[\s\S]*?<\/span>/i, ""));
    if (!title) continue;
    seen.add(url);
    hits.push({ title, url, snippet: snippetAfter(r.text, a.end, /<p[^>]*>([\s\S]*?)<\/p>/i), engine: "Yahoo" });
  }
  return done(hits, "ok", undefined, r.text);
}

async function mojeek(q: string): Promise<EngineOut> {
  const r = await html(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`);
  if (r.status !== "ok") return done([], r.status, r.detail);
  const hits = anchors(r.text)
    .filter((a) => /\btitle\b/.test(a.attrs.class || "") && /^https?:/.test(a.attrs.href || ""))
    .map((a) => ({ title: clean(a.inner), url: a.attrs.href, snippet: snippetAfter(r.text, a.end, /<p class="s"[^>]*>([\s\S]*?)<\/p>/i), engine: "Mojeek" }));
  return done(hits, "ok", undefined, r.text);
}

async function startpage(q: string): Promise<EngineOut> {
  const r = await html(`https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}&cat=web&language=english`);
  if (r.status !== "ok") return done([], r.status, r.detail);
  const hits = anchors(r.text)
    .filter((a) => /result-(title|link)|w-gl__result-title/.test(a.attrs.class || "") && /^https?:/.test(a.attrs.href || "") && !/startpage\.com/.test(a.attrs.href))
    .map((a) => ({ title: clean(a.inner), url: a.attrs.href, snippet: snippetAfter(r.text, a.end, /<p class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i), engine: "Startpage" }));
  return done(hits, "ok", undefined, r.text);
}

async function google(q: string): Promise<EngineOut> {
  const r = await html(`https://www.google.com/search?q=${encodeURIComponent(q)}&num=20&hl=en&gbv=1`);
  if (r.status !== "ok") return done([], r.status, r.detail);
  const hits = anchors(r.text)
    .filter((a) => (a.attrs.href || "").startsWith("/url?") && /<h3/i.test(a.inner))
    .map((a) => ({ title: clean(a.inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || a.inner), url: unwrapUrl(`https://www.google.com${a.attrs.href}`), snippet: "", engine: "Google" }));
  return done(hits, "ok", "no parsable results (JavaScript required)", r.text);
}

async function marginalia(q: string): Promise<EngineOut> {
  const r = await fetchText(`https://api.marginalia.nu/public/search/${encodeURIComponent(q)}?count=20`, { timeout: 6500 });
  if (!r.ok) return done([], r.status === 429 ? "blocked" : "error", r.error || `HTTP ${r.status}`);
  try {
    const j = JSON.parse(r.text);
    return done((j.results || []).map((x: { url: string; title: string; description: string }) => ({ title: x.title, url: x.url, snippet: x.description || "", engine: "Marginalia" })), "ok");
  } catch { return done([], "error", "bad JSON"); }
}

async function brave(q: string): Promise<EngineOut> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return done([], "disabled", "BRAVE_SEARCH_API_KEY not set");
  const r = await fetchText(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&country=us`, { timeout: 6500, headers: { Accept: "application/json", "X-Subscription-Token": key } });
  if (!r.ok) return done([], r.status === 429 ? "blocked" : "error", r.error || `HTTP ${r.status}`);
  try {
    const j = JSON.parse(r.text);
    return done((j.web?.results || []).map((x: { url: string; title: string; description: string }) => ({ title: clean(x.title), url: x.url, snippet: clean(x.description || ""), engine: "Brave" })), "ok");
  } catch { return done([], "error", "bad JSON"); }
}

const ENGINE_FNS: Record<string, (q: string) => Promise<EngineOut>> = { bing, ddg, yahoo, mojeek, startpage, google, marginalia, brave };

export function enabledEngines(providers: Record<string, boolean>): string[] {
  return ENGINES.filter((e) => (providers[e.id] ?? e.defaultOn) && (!e.keyed || keyedConfigured(e.id))).map((e) => e.id);
}

// Runs every query on every enabled engine. Keyed (quota-limited) engines only run the
// first query of each batch to protect free quotas.
export async function searchAll(queries: string[], providers: Record<string, boolean>): Promise<{ hits: Hit[]; logs: ProviderLog[] }> {
  const engines = enabledEngines(providers);
  const jobs: Array<Promise<{ engine: string; out: EngineOut; ms: number }>> = [];
  queries.forEach((q, qi) => {
    for (const id of engines) {
      const meta = ENGINES.find((e) => e.id === id);
      if (meta?.keyed && qi > 0) continue;
      const started = Date.now();
      jobs.push(ENGINE_FNS[id](q).then((out) => ({ engine: id, out, ms: Date.now() - started })).catch((e) => ({ engine: id, out: { hits: [], status: "error" as const, detail: String(e) }, ms: Date.now() - started })));
    }
  });
  const results = await Promise.all(jobs);
  const byEngine = new Map<string, ProviderLog>();
  const hits: Hit[] = [];
  for (const { engine, out, ms } of results) {
    hits.push(...out.hits);
    const label = ENGINES.find((e) => e.id === engine)?.label || engine;
    const prev = byEngine.get(engine) || { provider: label, ok: false, status: out.status, count: 0, ms: 0 };
    prev.count += out.hits.length;
    prev.ms = Math.max(prev.ms, ms);
    if (out.status === "ok") { prev.ok = true; prev.status = "ok"; }
    else if (!prev.ok) { prev.status = out.status; prev.detail = out.detail; }
    byEngine.set(engine, prev);
  }
  return { hits, logs: [...byEngine.values()] };
}

// ---------------------------------------------------------------------------
// Hit → discovery record
// ---------------------------------------------------------------------------

const SKIP_DOMAINS = /(wikipedia\.org|youtube\.com|reddit\.com|quora\.com|pinterest\.|amazon\.|ebay\.|indeed\.com|glassdoor\.|ziprecruiter\.|simplyhired\.|monster\.com|careerbuilder\.|salary\.com|merriam-webster|dictionary\.|britannica\.com|investopedia\.|tiktok\.com|instagram\.com|twitter\.com|x\.com\/|bing\.com|google\.com|yahoo\.com|duckduckgo\.com|mojeek\.com|startpage\.com|microsoft\.com|apple\.com|wiktionary|thesaurus|imdb\.com|tripadvisor\.|zillow\.|realtor\.com|loopnet\.com|crexi\.com|apartments\.com)/i;
const LISTICLE = /^(top|best|the \d+|\d+ (best|top|largest|biggest)|list of|how |what |why |when |where |guide|find |search |jobs?\b|careers?\b|\w+ jobs)|near me|companies in\b|in your area|salary|salaries|job openings|\bjobs\b|for sale|for lease|definition|meaning/i;
const GENERIC_NAMES = /^(home|welcome|about( us)?|contact( us)?|locations?|services|products|careers|news|facilities|our facilities|cold storage|refrigerated warehousing|industrial refrigeration|refrigeration|ammonia refrigeration|food processing|meat processing|brewery|distillery|dairy|index|untitled|pdf)$/i;
const COMPANY_HINT = /\b(inc|llc|co|corp|company|foods?|farms?|dairy|dairies|creamery|meats?|packing|packers|cold storage|logistics|warehous\w*|brewing|brewery|distill\w*|beverages?|bottling|seafoods?|fisheries|refrigeration|mechanical|industries|group|enterprises|processing|produce|ice)\b/i;

function domainName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch { return url; }
}

export function nameFromTitle(title: string, url: string): string {
  const parts = clean(title)
    .split(/\s+[|–—-]\s+|\s*::\s*|\s*»\s*/)
    .map((s) => s.replace(/^(welcome to|home of|home -)\s+/i, "").replace(/\s*(official site|official website|homepage|home page)$/i, "").trim())
    .filter((s) => s.length > 2 && !/^(linkedin|facebook|yelp|mapquest|bbb|yellowpages|manta|dnb|zoominfo|bloomberg|crunchbase)$/i.test(s));
  const companyLike = parts.find((p) => COMPANY_HINT.test(p) && !GENERIC_NAMES.test(p) && p.length <= 80);
  const first = parts.find((p) => !GENERIC_NAMES.test(p) && p.length <= 80);
  return (companyLike || first || domainName(url)).trim();
}

// True when the result's domain looks like the company's own site (e.g. "abccoldstorage.com" for "ABC Cold Storage").
function domainMatchesName(domain: string, name: string): boolean {
  const label = domain.split(".").slice(-2, -1)[0] || "";
  const compact = normName(name).replace(/ /g, "");
  const first = normName(name).split(" ")[0] || "";
  return label.length >= 4 && (compact.startsWith(label.slice(0, 8)) || (first.length >= 4 && label.startsWith(first)));
}

export function hitToRecord(hit: Hit, stateHint: string, targets: string[]): Prospect | null {
  if (SKIP_DOMAINS.test(hit.url)) return null;
  const title = clean(hit.title);
  if (!title || LISTICLE.test(title)) return null;
  const text = `${title}. ${hit.snippet}`;
  const sig = textSignals(text);
  const name = nameFromTitle(title, hit.url);
  if (!name || GENERIC_NAMES.test(name)) return null;
  const detected = detectState(`${text} ${hit.url}`, "");
  if (detected !== "Unknown" && !isWesternState(detected)) return null; // outside territory
  const state = detected !== "Unknown" ? detected : stateHint;
  if (!isWesternState(state)) return null;
  if (!isRelevantWebText(text)) return null;
  const type = classifyFacility(text);
  if (type.type === UNCLASSIFIED && !sig.refrigerationHits && !sig.ammonia) return null;
  const city = detectCity(text, state);
  const domain = domainName(hit.url);
  const kind: Evidence["kind"] = /\.pdf($|\?)/i.test(hit.url) ? "document" : /\.(gov|us)$|\.gov\//i.test(domain) ? "government" : "web";
  const evidence: Evidence[] = [{ label: `${kind === "document" ? "Public document" : kind === "government" ? "Government web page" : "Web result"} (${hit.engine}): ${title.slice(0, 140)}`, detail: hit.snippet.slice(0, 400) || undefined, url: hit.url, source: "Web search", kind }];
  if (detected === "Unknown") evidence.push({ label: `State assigned from search territory (${state}) — not stated in the source`, source: "Search context", kind: "inferred" });
  if (sig.ammoniaLb && sig.ammoniaLbExcerpt) evidence.push({ label: `Ammonia quantity stated: ${sig.ammoniaLb.toLocaleString()} lb`, detail: sig.ammoniaLbExcerpt, url: hit.url, source: "Web search", kind });
  const p: Prospect = {
    key: "",
    recordId: `web:${hit.url}`,
    name,
    city,
    state,
    website: kind === "web" && domainMatchesName(domain, name) ? `https://${domain}` : undefined,
    facilityType: type.type,
    industry: type.type,
    refrigeration: refrigerationLabel(sig, "Needs verification"),
    ammonia: sig.ammonia ? "Likely" : sig.co2 || sig.other ? "None indicated" : "Unknown",
    ammoniaLb: sig.ammoniaLb,
    ammoniaLbSource: sig.ammoniaLb ? hit.url : undefined,
    co2: sig.co2,
    otherSignals: sig.other ? ["HFC/glycol mention"] : [],
    equipmentBrands: sig.brands,
    brandsSource: sig.brands.length ? "public web mention" : undefined,
    evidence,
    sourceUrls: [hit.url],
    providers: ["Web search"],
    evidenceSources: 1,
    confidence: "Low",
    score: 0,
    priority: "C",
    reason: "",
    targetCategories: targetsMatching(targets, [], type.type),
    source: `Web search (${hit.engine})`,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
  };
  p.key = facilityKey(p);
  return finalize(crossReferenceSeed(p));
}

export async function webTask(queries: string[], state: string, targets: string[], providers: Record<string, boolean>): Promise<{ records: Prospect[]; rawHits: number; logs: ProviderLog[]; leadPages: number }> {
  const { hits, logs } = await searchAll(queries, providers);
  const byUrl = new Map<string, { hit: Hit; engines: Set<string> }>();
  for (const h of hits) {
    const k = h.url.replace(/#.*$/, "").replace(/\/$/, "");
    const prev = byUrl.get(k);
    if (prev) prev.engines.add(h.engine);
    else byUrl.set(k, { hit: h, engines: new Set([h.engine]) });
  }
  const records: Prospect[] = [];
  let leadPages = 0;
  for (const { hit, engines } of byUrl.values()) {
    const rec = hitToRecord({ ...hit, engine: [...engines].join(", ") }, state, targets);
    if (rec) records.push(rec); else leadPages++;
  }
  return { records, rawHits: hits.length, logs, leadPages };
}
