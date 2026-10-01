// "Research Now": secondary, facility-level research for one prospect.
//   1. Recursive public-web queries ("ABC Foods" refrigeration / ammonia / permit / RMP …)
//   2. Structured lookups by name: EPA ECHO, EPA TRI ammonia reporters, USDA FSIS
//   3. Fetch a few relevant public pages and scan their text for refrigeration evidence
//   4. Surface other facilities of the same company found along the way
// Everything returned carries a source URL; nothing is inferred without a label.

import type { Evidence, Prospect, ProviderLog } from "./types";
import { fetchText } from "./http";
import { classifyFacility, extractBrands, facilityKey, finalize, normName, refrigerationLabel, strongerAmmonia, textSignals } from "./classify";
import { CITIES, STATE_ABBR, isWesternState, titleCase } from "./geo";
import { researchQueries } from "./plan";
import { clean, searchAll, type Hit } from "./web";
import { echoQuery, echoToProspect, fsisProvider, triAmmonia } from "./providers";
import { mergeEvidence, mergeProspect } from "./merge";
import { rmpEvidence, rmpRowsForState, rmpToProspect, type RmpRow } from "./rmp";

export type ResearchResult = {
  prospect: Prospect;
  related: Prospect[];
  dossier: string;
  sources: string[];
  diagnostics: ProviderLog[];
};

function tokensOf(name: string) {
  return normName(name).split(" ").filter((t) => t.length > 2 && !/^(and|foods?|farms?|company|group|usa|logistics|services?)$/.test(t));
}

function mentions(text: string, name: string) {
  const toks = tokensOf(name);
  if (!toks.length) return false;
  const t = normName(text);
  const need = Math.min(2, toks.length);
  return toks.filter((x) => ` ${t} `.includes(` ${x} `)).length >= need;
}

async function pageText(url: string): Promise<string> {
  if (/\.(pdf|docx?|xlsx?|zip)($|\?)/i.test(url)) return "";
  const r = await fetchText(url, { timeout: 7000, headers: { Accept: "text/html" } });
  if (!r.ok || !/<html|<body|<p/i.test(r.text.slice(0, 5000))) return "";
  return clean(r.text).slice(0, 60000);
}

// A different facility of the same company: copy only company-level fields, never
// facility-specific ones (address, phone, registry ids, size, coordinates).
function relatedFacility(p: Prospect, f: Partial<Prospect> & Pick<Prospect, "name" | "city">): Prospect {
  return finalize({
    key: "", state: p.state, facilityType: classifyFacility(`${f.name} ${p.facilityType}`).type || p.facilityType, industry: p.industry,
    refrigeration: "Needs verification", ammonia: "Unknown", ammoniaLb: null, evidence: [], sourceUrls: [], providers: [],
    evidenceSources: 1, confidence: "Low", score: 0, priority: "C", reason: "",
    website: p.website, parentCompany: p.parentCompany || p.name, inSeedList: p.inSeedList, seedPriorityScore: p.seedPriorityScore,
    buyerType: p.buyerType, salesApproach: p.salesApproach, coldCallPriority: p.coldCallPriority, territoryAssignment: p.territoryAssignment,
    estimatedPartsOpportunity: p.estimatedPartsOpportunity, firstSeen: Date.now(), lastSeen: Date.now(),
    ...f,
  });
}

export async function researchProspect(input: Prospect, providers: Record<string, boolean>): Promise<ResearchResult> {
  const p: Prospect = { ...input, evidence: input.evidence || [], sourceUrls: input.sourceUrls || [], providers: input.providers || [] };
  const state = p.state;
  const abbr = STATE_ABBR[state];
  const logs: ProviderLog[] = [];
  const newEvidence: Evidence[] = [];
  const related: Prospect[] = [];

  // 1 + 2 in parallel
  const webJob = searchAll(researchQueries(p.name, p.city, state), providers);
  const echoJob = (async () => {
    if (!abbr || providers.echo === false) return [] as Prospect[];
    const started = Date.now();
    try {
      const first = tokensOf(p.name).slice(0, 2).join(" ") || p.name;
      const rows = await echoQuery(`p_st=${abbr}&p_act=Y&p_fn=${encodeURIComponent(first)}`, 15000);
      const matches = rows.filter((f) => mentions(String(f.FacName || ""), p.name)).slice(0, 25).map((f) => echoToProspect(f, state, []));
      logs.push({ provider: "EPA ECHO (by name)", ok: true, status: matches.length ? "ok" : "empty", count: matches.length, ms: Date.now() - started });
      return matches;
    } catch (e) {
      logs.push({ provider: "EPA ECHO (by name)", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: e instanceof Error ? e.message : "failed" });
      return [];
    }
  })();
  const triJob = (async (): Promise<Array<Record<string, string>>> => {
    if (!abbr || providers.tri === false) return [];
    const started = Date.now();
    try {
      const { rows, year } = await triAmmonia(abbr);
      const matches: Array<Record<string, string>> = rows.filter((r) => mentions(`${r["FACILITY NAME"]} ${r["PARENT CO NAME"]} ${r["STANDARD PARENT CO NAME"]}`, p.name)).map((r) => ({ ...r, YEAR: year }));
      logs.push({ provider: "EPA TRI ammonia (by name)", ok: true, status: matches.length ? "ok" : "empty", count: matches.length, ms: Date.now() - started });
      return matches;
    } catch (e) {
      logs.push({ provider: "EPA TRI ammonia (by name)", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: e instanceof Error ? e.message : "failed" });
      return [];
    }
  })();
  const fsisJob = (async () => {
    if (!isWesternState(state) || providers.fsis === false) return [] as Prospect[];
    const res = await fsisProvider([state], ["Frozen meat processors"]);
    const matches = res.records.filter((r) => mentions(`${r.name} ${r.facilityName || ""}`, p.name));
    logs.push({ ...res.log, provider: "USDA FSIS (by name)", count: matches.length, status: res.log.ok ? (matches.length ? "ok" : "empty") : res.log.status });
    return matches;
  })();

  const rmpJob = (async (): Promise<RmpRow[]> => {
    if (!isWesternState(state) || providers.rmp === false) return [];
    const started = Date.now();
    try {
      const { rows } = await rmpRowsForState(state);
      const matches = rows.filter((r) => mentions(`${r.Name} ${r.LatestCompany1 || ""} ${r.LatestOperator || ""}`, p.name));
      logs.push({ provider: "EPA RMP (by name)", ok: true, status: matches.length ? "ok" : "empty", count: matches.length, ms: Date.now() - started });
      return matches;
    } catch (e) {
      logs.push({ provider: "EPA RMP (by name)", ok: false, status: "error", count: 0, ms: Date.now() - started, detail: e instanceof Error ? e.message : "failed" });
      return [];
    }
  })();

  const [web, echoMatches, triMatches, fsisMatches, rmpMatches] = await Promise.all([webJob, echoJob, triJob, fsisJob, rmpJob]);
  logs.push(...web.logs);

  // Web hits that actually mention the company.
  const hits: Hit[] = [...new Map(web.hits.map((h) => [h.url, h])).values()].filter((h) => mentions(`${h.title} ${h.snippet} ${h.url}`, p.name));
  for (const h of hits.slice(0, 40)) {
    const sig = textSignals(`${h.title}. ${h.snippet}`, p.name);
    const kind: Evidence["kind"] = /\.pdf($|\?)/i.test(h.url) ? "document" : /\.gov(\/|$)/i.test(h.url) ? "government" : "web";
    const label = sig.ammonia ? "Public source mentions ammonia" : sig.co2 ? "Public source mentions CO₂ refrigeration" : sig.refrigerationHits ? "Public source mentions refrigeration" : "Public source about this company";
    newEvidence.push({ label: `${label} (${h.engine})`, detail: `${clean(h.title)} — ${h.snippet}`.slice(0, 400), url: h.url, source: "Web research", kind });
  }

  // 3. Fetch a few pages: company site first, then government / refrigeration-signal pages.
  const candidates = [
    ...(p.website ? [p.website] : []),
    ...hits.filter((h) => /\.gov(\/|$)/i.test(h.url)).map((h) => h.url),
    ...hits.filter((h) => textSignals(`${h.title} ${h.snippet}`).refrigerationHits > 0 || /ammonia/i.test(h.snippet)).map((h) => h.url),
    ...hits.map((h) => h.url),
  ];
  const toFetch = [...new Set(candidates)].slice(0, 6);
  const started = Date.now();
  const pages = await Promise.all(toFetch.map(async (url) => ({ url, text: await pageText(url) })));
  let pagesRead = 0;
  let ammonia = p.ammonia;
  let ammoniaLb = p.ammoniaLb || null;
  let ammoniaLbSource = p.ammoniaLbSource;
  let co2 = Boolean(p.co2);
  const brands = new Set(p.equipmentBrands || []);
  const otherCities = new Map<string, string>();
  for (const { url, text } of pages) {
    if (!text) continue;
    pagesRead++;
    const relevant = mentions(text, p.name);
    if (!relevant) continue;
    const sig = textSignals(text, p.name);
    const sentence = (re: RegExp) => text.split(/(?<=[.!?])\s+/).find((s) => re.test(s) && s.length < 400);
    if (sig.ammonia) {
      const s = sentence(/ammonia|nh3|r-?717/i);
      newEvidence.push({ label: "Page text mentions ammonia refrigeration / ammonia system", detail: s, url, source: "Page scan", kind: /\.gov/i.test(url) ? "government" : "web" });
      // A company's own page or a government page naming the company counts as confirmation.
      if (/refrigerat/i.test(s || "") || /\.gov/i.test(url)) ammonia = strongerAmmonia(ammonia, "Confirmed");
      else ammonia = strongerAmmonia(ammonia, "Likely");
    }
    if (sig.ammoniaLb && (!ammoniaLb || sig.ammoniaLb > ammoniaLb)) {
      ammoniaLb = sig.ammoniaLb; ammoniaLbSource = url;
      newEvidence.push({ label: `Ammonia quantity stated: ${sig.ammoniaLb.toLocaleString()} lb`, detail: sig.ammoniaLbExcerpt, url, source: "Page scan", kind: "document" });
    }
    if (sig.co2) { co2 = true; newEvidence.push({ label: "Page text mentions CO₂ refrigeration", detail: sentence(/co2|carbon dioxide|transcritical/i), url, source: "Page scan", kind: "web" }); }
    for (const b of extractBrands(text)) brands.add(b);
    // Other facilities: "<City>, <ST>" or "<City> plant/facility/warehouse" mentions in-territory.
    for (const c of CITIES[state] || []) {
      if (c.toLowerCase() === (p.city || "").toLowerCase()) continue;
      const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^.]{0,60}\\b(plant|facility|warehouse|distribution center|processing|cold storage|location)`, "i");
      const m = text.match(re);
      if (m && !otherCities.has(c)) otherCities.set(c, url);
    }
  }
  logs.push({ provider: "Page scan", ok: true, status: pagesRead ? "ok" : "empty", count: pagesRead, ms: Date.now() - started, detail: `${pagesRead}/${toFetch.length} pages readable` });

  // Structured matches → evidence on this record, and related facility records.
  for (const r of rmpMatches) {
    const sameCity = (r.City || "").toLowerCase() === (p.city || "").toLowerCase();
    if (sameCity || (p.city === "Unknown" && rmpMatches.length === 1)) {
      const { evidence, maxLb } = rmpEvidence(r);
      newEvidence.push(evidence);
      ammonia = "Confirmed";
      if (maxLb && (!ammoniaLb || maxLb > ammoniaLb)) { ammoniaLb = maxLb; ammoniaLbSource = evidence.url; }
      p.registryIds = [...new Set([...(p.registryIds || []), `RMP ${r.EPAFacilityID}`])];
      p.providers = [...new Set([...p.providers, "EPA RMP"])];
    } else {
      related.push({ ...rmpToProspect(r, []), inSeedList: p.inSeedList, buyerType: p.buyerType, salesApproach: p.salesApproach });
    }
  }
  for (const t of triMatches) {
    const sameCity = (t["CITY"] || "").toLowerCase() === (p.city || "").toLowerCase();
    const frs = t["FRS ID"];
    const url = frs ? `https://echo.epa.gov/detailed-facility-report?fid=${frs}` : undefined;
    const ev: Evidence = { label: `EPA TRI: ammonia reported (${t.YEAR})`, detail: `${titleCase(t["FACILITY NAME"])} — ${titleCase(t["STREET ADDRESS"] || "")}, ${titleCase(t["CITY"] || "")}`, url, source: "EPA Toxics Release Inventory", kind: "government" };
    if (sameCity || p.city === "Unknown") { newEvidence.push(ev); ammonia = "Confirmed"; }
    else related.push(relatedFacility(p, {
      recordId: `tri:${t["TRIFD"]}`, name: titleCase(t["FACILITY NAME"]), city: titleCase(t["CITY"] || "Unknown"),
      address: titleCase(t["STREET ADDRESS"] || "") || undefined, zip: t["ZIP"], ammonia: "Confirmed",
      refrigeration: "Ammonia on site (EPA TRI) — verify refrigeration use", evidence: [ev], sourceUrls: url ? [url] : [], providers: ["EPA TRI"],
    }));
  }
  for (const r of [...echoMatches, ...fsisMatches]) {
    const sameCity = r.city.toLowerCase() === (p.city || "").toLowerCase();
    if (sameCity) {
      newEvidence.push(...r.evidence);
      if (!p.address && r.address) p.address = r.address;
      if (!p.zip && r.zip) p.zip = r.zip;
      if (!p.phone && r.phone) p.phone = r.phone;
      p.providers = [...new Set([...p.providers, ...r.providers])];
      p.sourceUrls = [...new Set([...p.sourceUrls, ...r.sourceUrls])];
      p.registryIds = [...new Set([...(p.registryIds || []), ...(r.registryIds || [])])];
    } else {
      related.push({ ...r, name: r.name, inSeedList: p.inSeedList, buyerType: p.buyerType, salesApproach: p.salesApproach });
    }
  }
  for (const [c, url] of otherCities) {
    if (related.some((r) => r.city.toLowerCase() === c.toLowerCase())) continue;
    related.push(relatedFacility(p, {
      recordId: `related:${normName(p.name)}:${c}`, name: p.name, city: c,
      evidence: [{ label: `Company page mentions a ${c} location`, url, source: "Page scan", kind: "web" }],
      sourceUrls: [url], providers: ["Web research"],
    }));
  }

  const sources = [...new Set([...newEvidence.map((e) => e.url).filter(Boolean) as string[]])];
  const enriched = mergeProspect(p, {
    ...p,
    ammonia,
    ammoniaLb,
    ammoniaLbSource,
    co2,
    equipmentBrands: [...brands],
    brandsSource: p.brandsSource || (brands.size ? "public web mention" : undefined),
    refrigeration: refrigerationLabel({ ammonia: ammonia === "Confirmed" || ammonia === "Likely", co2, other: false, refrigerationHits: newEvidence.filter((e) => /refrigerat/i.test(e.label)).length }, p.refrigeration),
    evidence: mergeEvidence(p.evidence, newEvidence),
    sourceUrls: [...p.sourceUrls, ...sources],
    providers: [...p.providers, ...(hits.length ? ["Web research"] : [])],
    lastResearched: Date.now(),
  });
  enriched.key = p.key || facilityKey(p);
  enriched.timesSeen = p.timesSeen;

  const lines: string[] = [
    `LIVE PUBLIC RESEARCH — ${p.name}${p.city && p.city !== "Unknown" ? `, ${p.city}` : ""}, ${state}`,
    `${hits.length} web sources mention the company · ${pagesRead} pages scanned · ${rmpMatches.length} EPA RMP ammonia registrations · ${triMatches.length} TRI ammonia matches · ${echoMatches.length} EPA ECHO matches · ${fsisMatches.length} FSIS matches`,
    `Ammonia: ${enriched.ammonia}${enriched.ammoniaLb ? ` · ${enriched.ammoniaLb.toLocaleString()} lb stated (see source)` : ""} · CO₂: ${enriched.co2 ? "signal found" : "not found"} · OEM mentions: ${[...brands].join(", ") || "none found"}`,
    related.length ? `Other facilities found: ${related.map((r) => `${r.name} — ${r.city}`).slice(0, 12).join("; ")}` : "No other facilities found in this pass.",
    "The 10,000-lb threshold applies only when ammonia is present and a public document states the quantity.",
  ];
  return { prospect: enriched, related: related.filter((r) => r.key !== enriched.key).slice(0, 40), dossier: lines.join("\n"), sources, diagnostics: logs };
}
