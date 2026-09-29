"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DiscoverResponse, DiscoverTask, Prospect, ProviderLog } from "../lib/types";
import { ALL_WESTERN, TERRITORY_OPTIONS } from "../lib/geo";
import { buildPlan, type Depth } from "../lib/plan";
import { SEED_VERSION, mergeIntoLifetime, mergeProspect, westernSeedProspects } from "../lib/merge";
import { isRelevantWebText } from "../lib/classify";
import { deleteRecord, getMeta, loadState, putRecords, setMeta } from "../lib/store";
import { LS, download, fmt, parseFacilityList, readLs, selectedTargets, toCsv, writeLs } from "../lib/client-utils";
import Dossier from "./Dossier";

const PAGE_SIZE = 100;

type View = "search" | "lifetime" | "new" | "saved";
type SortKey = "score" | "newest" | "name" | "location" | "sources";
type Health = Record<string, ProviderLog & { calls: number; failures: number }>;

const PROVIDER_TOGGLES: Array<{ id: string; label: string; group: "Public records" | "Web search" | "Optional API"; defaultOn: boolean; note?: string }> = [
  { id: "fsis", label: "USDA FSIS inspected establishments", group: "Public records", defaultOn: true },
  { id: "tri", label: "EPA TRI ammonia reporters", group: "Public records", defaultOn: true },
  { id: "echo", label: "EPA ECHO regulated facilities", group: "Public records", defaultOn: true },
  { id: "osm", label: "OpenStreetMap mapped facilities", group: "Public records", defaultOn: true },
  { id: "web", label: "Public web discovery packs", group: "Web search", defaultOn: true },
  { id: "bing", label: "Bing", group: "Web search", defaultOn: true },
  { id: "ddg", label: "DuckDuckGo", group: "Web search", defaultOn: true },
  { id: "yahoo", label: "Yahoo", group: "Web search", defaultOn: true },
  { id: "mojeek", label: "Mojeek", group: "Web search", defaultOn: true },
  { id: "startpage", label: "Startpage", group: "Web search", defaultOn: true },
  { id: "google", label: "Google (HTML)", group: "Web search", defaultOn: false, note: "Google HTML results need JavaScript" },
  { id: "marginalia", label: "Marginalia", group: "Web search", defaultOn: false },
  { id: "brave", label: "Brave Search API", group: "Optional API", defaultOn: true, note: "needs BRAVE_SEARCH_API_KEY in Vercel" },
  { id: "googlecse", label: "Google Programmable Search", group: "Optional API", defaultOn: true, note: "needs GOOGLE_CSE_KEY + GOOGLE_CSE_CX" },
];

const PROVIDER_LOG_NAMES: Record<string, string> = { fsis: "USDA FSIS", tri: "EPA TRI", echo: "EPA ECHO", osm: "OpenStreetMap", bing: "Bing", ddg: "DuckDuckGo", yahoo: "Yahoo", mojeek: "Mojeek", startpage: "Startpage", google: "Google (HTML)", marginalia: "Marginalia", brave: "Brave Search API", googlecse: "Google Programmable Search" };

function defaultProviders(): Record<string, boolean> {
  return Object.fromEntries(PROVIDER_TOGGLES.map((p) => [p.id, p.defaultOn]));
}

function hasAmmonia(p: Prospect) {
  return p.ammonia === "Confirmed" || p.ammonia === "Likely";
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("search");
  const [territory, setTerritory] = useState(ALL_WESTERN);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [minScore, setMinScore] = useState(45);
  const [ammoniaOnly, setAmmoniaOnly] = useState(false);
  const [targetCount, setTargetCount] = useState(0);
  const [depth, setDepth] = useState<Depth>("deep");
  const [autoResearch, setAutoResearch] = useState(true);
  const [providers, setProviders] = useState<Record<string, boolean>>(defaultProviders);
  const [showSources, setShowSources] = useState(false);
  const [uniqueOnly, setUniqueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState("1");

  // Data. Lifetime lives in a ref (source of truth) and a tick triggers re-render.
  const lifetimeRef = useRef<Record<string, Prospect>>({});
  const [lifetimeTick, setLifetimeTick] = useState(0);
  const [saved, setSaved] = useState<Record<string, Prospect>>({});
  const [lastSearch, setLastSearch] = useState<Prospect[]>([]);
  const [lastSearchNew, setLastSearchNew] = useState<string[]>([]);
  const [lastMeta, setLastMeta] = useState<{ at?: number; rawHits?: number; territory?: string; targets?: string[] } | null>(null);
  const memoryRef = useRef<Record<string, number>>({});
  const sweepRef = useRef(0);
  const [persisted, setPersisted] = useState(false);

  // Run state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Health>({});
  const abortRef = useRef<{ stop: boolean }>({ stop: false });

  // Dossier
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<Prospect | null>(null);
  const [researchingKey, setResearchingKey] = useState<string | null>(null);
  const [researchNotes, setResearchNotes] = useState<Record<string, { dossier: string; related: Prospect[] }>>({});

  // Data tools
  const [showTools, setShowTools] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const bumpLifetime = useCallback(() => setLifetimeTick((t) => t + 1), []);

  // ---------------------------------------------------------------------------
  // Load persisted state + seed list
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTerritory(readLs(LS.territory, ALL_WESTERN));
      setDepth(readLs<Depth>(LS.depth, "deep"));
      setAutoResearch(readLs(LS.autoResearch, true));
      setProviders({ ...defaultProviders(), ...readLs<Record<string, boolean>>(LS.providers, {}) });
      setTargetCount(selectedTargets().length);
      try {
        const s = await loadState();
        if (cancelled) return;
        lifetimeRef.current = s.lifetime;
        if (s.seedVersion < SEED_VERSION) {
          const { changed } = mergeIntoLifetime(lifetimeRef.current, westernSeedProspects());
          await putRecords("lifetime", changed);
          await setMeta("seedVersion", SEED_VERSION);
        }
        // One-time cleanup: drop web-only records that fail the stricter relevance check
        // (never touches saved, seed-list, registry or researched records).
        if ((await getMeta<number>("webFilterVersion", 0)) < 2) {
          const junk = Object.values(lifetimeRef.current).filter((p) =>
            !s.saved[p.key] && !p.inSeedList && !p.lastResearched &&
            (p.providers || []).every((x) => x === "Web search") &&
            !isRelevantWebText((p.evidence || []).map((e) => `${e.label} ${e.detail || ""}`).join(" ")));
          for (const p of junk) { delete lifetimeRef.current[p.key]; await deleteRecord("lifetime", p.key); }
          s.lastSearch = (s.lastSearch || []).filter((r) => !((r.providers || []).every((x) => x === "Web search") && !isRelevantWebText((r.evidence || []).map((e) => `${e.label} ${e.detail || ""}`).join(" "))));
          s.lastSearchNew = (s.lastSearchNew || []).filter((k) => lifetimeRef.current[k]);
          await Promise.all([setMeta("webFilterVersion", 2), setMeta("lastSearch", s.lastSearch), setMeta("lastSearchNew", s.lastSearchNew)]);
        }
        memoryRef.current = s.memory || {};
        sweepRef.current = s.sweep || 0;
        setSaved(s.saved);
        setLastSearch(s.lastSearch || []);
        setLastSearchNew(s.lastSearchNew || []);
        setLastMeta(s.lastSearchMeta);
        setPersisted(s.persisted);
        bumpLifetime();
      } catch (e) {
        setError(`Could not open browser storage: ${e instanceof Error ? e.message : "unknown error"}`);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [bumpLifetime]);

  // Launched from the Target Filters workspace with ?deep=1
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!ready || autoStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("deep") === "1") {
      autoStarted.current = true;
      window.history.replaceState(null, "", "/");
      void runDeepSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => { if (ready) writeLs(LS.territory, territory); }, [territory, ready]);
  useEffect(() => { if (ready) writeLs(LS.depth, depth); }, [depth, ready]);
  useEffect(() => { if (ready) writeLs(LS.autoResearch, autoResearch); }, [autoResearch, ready]);
  useEffect(() => { if (ready) writeLs(LS.providers, providers); }, [providers, ready]);

  // Reset to page 1 only when the *filters* change (not when a running search appends data).
  useEffect(() => { setPage(0); }, [view, territory, deferredQuery, minScore, ammoniaOnly, uniqueOnly, sortKey]);

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------
  const lifetimeList = useMemo(() => Object.values(lifetimeRef.current), [lifetimeTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const lifetimeCount = lifetimeList.length;

  const pool = useMemo<Prospect[]>(() => {
    const lt = lifetimeRef.current;
    if (view === "lifetime") return lifetimeList;
    if (view === "saved") return Object.keys(saved).map((k) => lt[k] || saved[k]);
    if (view === "new") return lastSearchNew.map((k) => lt[k]).filter(Boolean);
    if (uniqueOnly) {
      const seen = new Set<string>();
      const out: Prospect[] = [];
      for (const r of lastSearch) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        out.push(lt[r.key] || r);
      }
      return out;
    }
    return lastSearch;
  }, [view, lifetimeList, saved, lastSearchNew, lastSearch, uniqueOnly]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const out = pool.filter((p) =>
      (territory === ALL_WESTERN || p.state === territory) &&
      p.score >= minScore &&
      (!ammoniaOnly || hasAmmonia(p)) &&
      (!q || `${p.name} ${p.facilityName || ""} ${p.city} ${p.state} ${p.industry} ${p.facilityType} ${p.refrigeration} ${(p.targetCategories || []).join(" ")} ${p.address || ""}`.toLowerCase().includes(q)),
    );
    const cmp: Record<SortKey, (a: Prospect, b: Prospect) => number> = {
      score: (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      newest: (a, b) => (b.firstSeen || 0) - (a.firstSeen || 0) || b.score - a.score,
      name: (a, b) => a.name.localeCompare(b.name),
      location: (a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || b.score - a.score,
      sources: (a, b) => (b.evidenceSources || 0) - (a.evidenceSources || 0) || b.score - a.score,
    };
    return out.sort(cmp[sortKey]);
  }, [pool, territory, minScore, ammoniaOnly, deferredQuery, sortKey]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = total ? safePage * PAGE_SIZE + 1 : 0;
  const end = Math.min((safePage + 1) * PAGE_SIZE, total);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPageInput(String(safePage + 1)); }, [safePage]);

  const uniqueInLast = useMemo(() => new Set(lastSearch.map((r) => r.key)).size, [lastSearch]);

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------
  async function toggleSaved(p: Prospect) {
    const key = p.key;
    const lt = lifetimeRef.current;
    const next = { ...saved };
    const isSaved = Boolean(next[key]);
    if (isSaved) delete next[key];
    else next[key] = { ...(lt[key] || p), saved: true };
    setSaved(next);
    const base = lt[key] || p;
    lt[key] = { ...base, saved: !isSaved };
    bumpLifetime();
    await putRecords("lifetime", [lt[key]]);
    if (isSaved) await deleteRecord("saved", key);
    else await putRecords("saved", [next[key]]);
  }

  // ---------------------------------------------------------------------------
  // Research Now (secondary research for one prospect)
  // ---------------------------------------------------------------------------
  const researchOne = useCallback(async (p: Prospect): Promise<boolean> => {
    const lt = lifetimeRef.current;
    const current = lt[p.key] || p;
    setResearchingKey(p.key);
    try {
      const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "research", prospect: current, providers }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Research failed (${r.status})`);
      const enriched: Prospect = mergeProspect(lt[p.key], { ...d.prospect, key: p.key });
      enriched.key = p.key;
      enriched.timesSeen = current.timesSeen;
      lt[p.key] = enriched;
      const related: Prospect[] = Array.isArray(d.related) ? d.related : [];
      const { changed, newKeys } = mergeIntoLifetime(lt, related);
      const now = Date.now();
      for (const k of newKeys) memoryRef.current[k] = memoryRef.current[k] ?? now;
      await putRecords("lifetime", [enriched, ...changed]);
      if (saved[p.key]) await putRecords("saved", [{ ...enriched, saved: true }]);
      setResearchNotes((m) => ({ ...m, [p.key]: { dossier: String(d.dossier || ""), related } }));
      if (newKeys.length) await setMeta("memory", memoryRef.current);
      bumpLifetime();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed");
      return false;
    } finally {
      setResearchingKey(null);
    }
  }, [providers, saved, bumpLifetime]);

  // ---------------------------------------------------------------------------
  // Deep Search
  // ---------------------------------------------------------------------------
  async function runDeepSearch() {
    if (running) return;
    const targets = selectedTargets();
    setTargetCount(targets.length);
    const sweep = sweepRef.current;
    const plan = buildPlan({ territory, targets, ammoniaOnly, depth, sweep, text: query, providers });
    abortRef.current = { stop: false };
    setRunning(true);
    setError("");
    setView("search");
    setUniqueOnly(false);
    setPage(0);
    setLastSearch([]);
    setHealth({});

    const priorMemory = { ...memoryRef.current };
    const records: Prospect[] = [];
    const recordIds = new Set<string>();
    const newKeys = new Set<string>();
    const healthAcc: Health = {};
    let rawHits = 0;
    let done = 0;
    let webDone = 0;
    let webHits = 0;
    let lastPersist = Date.now();
    // Sources that keep failing (overloaded / blocking the server) are skipped for the rest of the sweep.
    const skipKinds = new Set<string>();
    const failStreak: Record<string, number> = {};
    const SKIP_AFTER: Record<string, number> = { osm: 2, echo: 5 };
    const lt = lifetimeRef.current;

    const record = (logs: ProviderLog[]) => {
      for (const l of logs) {
        const h = healthAcc[l.provider] || { ...l, count: 0, ms: 0, calls: 0, failures: 0 };
        h.calls += 1;
        h.count += l.count;
        h.ms = Math.max(h.ms, l.ms);
        if (l.ok) { h.ok = true; h.status = l.status === "empty" && h.status === "ok" ? "ok" : l.status; }
        else { h.failures += 1; if (!h.ok) { h.status = l.status; h.detail = l.detail; } }
        if (l.detail && !l.ok) h.detail = l.detail;
        healthAcc[l.provider] = h;
      }
      setHealth({ ...healthAcc });
    };

    const handle = async (task: DiscoverTask, res: DiscoverResponse) => {
      rawHits += res.rawHits || 0;
      record(res.diagnostics || []);
      const fresh: Prospect[] = [];
      for (const rec of res.records || []) {
        const id = rec.recordId || `${rec.key}|${rec.sourceUrls?.[0] || ""}`;
        if (recordIds.has(id)) continue; // the identical record (same source) returned twice
        recordIds.add(id);
        const isNew = !priorMemory[rec.key];
        fresh.push({ ...rec, isNew, saved: Boolean(saved[rec.key]) });
      }
      records.push(...fresh);
      const { changed, newKeys: nk } = mergeIntoLifetime(lt, fresh);
      const now = Date.now();
      for (const k of nk) { newKeys.add(k); memoryRef.current[k] = memoryRef.current[k] ?? now; }
      for (const r of fresh) memoryRef.current[r.key] = memoryRef.current[r.key] ?? now;
      await putRecords("lifetime", changed);
      if (task.kind === "web") { webDone++; webHits += res.rawHits || 0; }
      setLastSearch(records.slice());
      setLastSearchNew([...newKeys]);
      bumpLifetime();
      if (Date.now() - lastPersist > 8000) {
        lastPersist = Date.now();
        await Promise.all([setMeta("lastSearch", records), setMeta("lastSearchNew", [...newKeys]), setMeta("memory", memoryRef.current)]);
      }
    };

    const queue = [...plan];
    let osmActive = 0;
    const worker = async () => {
      while (queue.length && !abortRef.current.stop) {
        const idx = queue.findIndex((t) => t.kind !== "osm" || osmActive < 1);
        if (idx < 0) { await new Promise((r) => setTimeout(r, 400)); continue; }
        const task = queue.splice(idx, 1)[0];
        if (skipKinds.has(task.kind)) { done++; continue; }
        if (task.kind === "osm") osmActive++;
        setProgress(`Pack ${done + 1}/${plan.length} · ${task.label} · ${fmt(records.length)} discovery records · ${fmt(newKeys.size)} new facilities`);
        let failed = false;
        try {
          const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "task", task, targets, ammoniaOnly, providers }) });
          const d = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          if (!r.ok) {
            failed = true;
            record([{ provider: task.label, ok: false, status: "error", count: 0, ms: 0, detail: d.error || `HTTP ${r.status}` }]);
          } else {
            const res = d as DiscoverResponse;
            failed = (res.diagnostics || []).length > 0 && (res.diagnostics || []).every((x) => !x.ok);
            await handle(task, res);
          }
        } catch (e) {
          failed = true;
          record([{ provider: task.label, ok: false, status: "error", count: 0, ms: 0, detail: e instanceof Error ? e.message : "network error" }]);
        } finally {
          if (task.kind === "osm") osmActive--;
          done++;
          failStreak[task.kind] = failed ? (failStreak[task.kind] || 0) + 1 : 0;
          const limit = SKIP_AFTER[task.kind];
          if (limit && failStreak[task.kind] >= limit && !skipKinds.has(task.kind)) {
            skipKinds.add(task.kind);
            record([{ provider: task.kind === "osm" ? "OpenStreetMap" : "EPA ECHO", ok: false, status: "skipped", count: 0, ms: 0, detail: `${limit} packs in a row failed (source overloaded or unavailable); remaining packs skipped this sweep` }]);
          }
          // If the first 10 web packs return nothing from any engine, the engines are blocking
          // the server — skip the remaining web packs instead of waiting on them.
          if (task.kind === "web" && webDone >= 10 && webHits === 0 && !skipKinds.has("web")) {
            skipKinds.add("web");
            record([{ provider: "Web discovery", ok: false, status: "skipped", count: 0, ms: 0, detail: "Search engines returned no results to the server; remaining web packs skipped. Add a Brave or Google API key for reliable web search." }]);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));

    // Persist the sweep.
    sweepRef.current = sweep + 1;
    const meta = { at: Date.now(), rawHits, territory, targets };
    setLastMeta(meta);
    await Promise.all([
      setMeta("lastSearch", records), setMeta("lastSearchNew", [...newKeys]), setMeta("lastSearchMeta", meta),
      setMeta("memory", memoryRef.current), setMeta("sweep", sweepRef.current),
    ]);
    const stopped = abortRef.current.stop;
    const summary = `${fmt(records.length)} discovery records (${fmt(new Set(records.map((r) => r.key)).size)} unique facilities, ${fmt(newKeys.size)} new) from ${fmt(rawHits)} raw source rows`;
    setProgress(`${stopped ? "Stopped" : "Complete"} — ${summary}. Lifetime: ${fmt(Object.keys(lt).length)}.`);

    // Recursive research pass on the strongest new, thinly-sourced prospects.
    if (autoResearch && !stopped && newKeys.size) {
      const picks = [...newKeys].map((k) => lt[k]).filter((p) => p && (p.providers || []).length <= 2 && !p.lastResearched).sort((a, b) => b.score - a.score).slice(0, 8);
      for (const [i, p] of picks.entries()) {
        if (abortRef.current.stop) break;
        setProgress(`Secondary research ${i + 1}/${picks.length}: ${p.name} (${p.city}, ${p.state})…`);
        await researchOne(p);
      }
      setProgress(`Complete — ${summary}. Secondary research run on ${picks.length} top new prospects. Lifetime: ${fmt(Object.keys(lt).length)}.`);
    }
    setRunning(false);
  }

  // ---------------------------------------------------------------------------
  // Data tools
  // ---------------------------------------------------------------------------
  function exportCsv() {
    download(`keep-supply-${view}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(filtered));
  }

  function backupJson() {
    const payload = { app: "keep-supply-prospector", version: 3, exportedAt: new Date().toISOString(), lifetime: lifetimeRef.current, saved, memory: memoryRef.current };
    download(`keep-supply-lifetime-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload), "application/json");
  }

  async function restoreJson(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const records: Prospect[] = Object.values(data.lifetime || {});
      const { changed } = mergeIntoLifetime(lifetimeRef.current, records);
      await putRecords("lifetime", changed);
      const savedIn: Prospect[] = Object.values(data.saved || {});
      if (savedIn.length) {
        const next = { ...saved };
        for (const s of savedIn) next[s.key] = { ...s, saved: true };
        setSaved(next);
        await putRecords("saved", savedIn.map((s) => ({ ...s, saved: true })));
      }
      memoryRef.current = { ...(data.memory || {}), ...memoryRef.current };
      await setMeta("memory", memoryRef.current);
      bumpLifetime();
      setProgress(`Restored ${fmt(records.length)} Lifetime records and ${fmt(savedIn.length)} saved prospects.`);
    } catch (e) {
      setError(`Restore failed: ${e instanceof Error ? e.message : "invalid file"}`);
    }
  }

  async function importList() {
    const rows = parseFacilityList(pasteText, territory);
    if (!rows.length) { setError("No facilities recognized. Use one per line, e.g. “ABC Cold Storage, Tolleson, AZ”."); return; }
    const now = Date.now();
    const { changed, newKeys } = mergeIntoLifetime(lifetimeRef.current, rows);
    for (const k of newKeys) memoryRef.current[k] = memoryRef.current[k] ?? now;
    await putRecords("lifetime", changed);
    await setMeta("memory", memoryRef.current);
    bumpLifetime();
    setPasteText("");
    setView("lifetime");
    setSortKey("newest");
    setProgress(`Added ${fmt(rows.length)} facilities from the pasted list (${fmt(newKeys.length)} new). Researching them now…`);
    abortRef.current = { stop: false };
    setRunning(true);
    for (const [i, p] of rows.slice(0, 25).entries()) {
      if (abortRef.current.stop) break;
      setProgress(`Researching pasted list ${i + 1}/${Math.min(25, rows.length)}: ${p.name}…`);
      await researchOne(lifetimeRef.current[p.key] || p);
    }
    setRunning(false);
    setProgress(`Pasted list processed: ${fmt(rows.length)} facilities added to Lifetime.`);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const selected = selectedKey ? lifetimeRef.current[selectedKey] || selectedFallback : null;
  const healthRows = Object.values(health).sort((a, b) => b.count - a.count);
  const viewLabel: Record<View, string> = { search: "Deep Search results (every discovery record from the latest sweep)", lifetime: "Lifetime database (deduplicated by facility)", new: "New from last search (facilities first discovered in the latest sweep)", saved: "Saved prospects" };

  return (
    <main className="page">
      <header className="header">
        <div>
          <div className="eyebrow">KEEP SUPPLY</div>
          <h1>Prospecting Engine</h1>
          <p>Industrial refrigeration first. Ammonia is a qualifier—not a requirement.</p>
        </div>
        <div className="pill">WESTERN U.S.</div>
      </header>

      <nav className="tabs">
        <button className={view === "search" ? "tab active" : "tab"} onClick={() => setView("search")}>Deep Search <span>{fmt(lastSearch.length)}</span></button>
        <button className={view === "lifetime" ? "tab active" : "tab"} onClick={() => setView("lifetime")}>Lifetime <span>{fmt(lifetimeCount)}</span></button>
        <button className={view === "new" ? "tab active" : "tab"} onClick={() => setView("new")}>New From Last Search <span>{fmt(lastSearchNew.length)}</span></button>
        <button className={view === "saved" ? "tab active" : "tab"} onClick={() => setView("saved")}>Saved <span>{fmt(Object.keys(saved).length)}</span></button>
      </nav>

      <section className="controls">
        <div className="control wide">
          <label>Search text</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="cold storage, potato, company, city… (filters the list and focuses Deep Search)" />
        </div>
        <div className="control">
          <label>Territory</label>
          <select value={territory} onChange={(e) => setTerritory(e.target.value)}>{TERRITORY_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="control">
          <label>Minimum score</label>
          <input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          <span className="rangeValue">{minScore}</span>
        </div>
        <label className="check"><input type="checkbox" checked={ammoniaOnly} onChange={(e) => setAmmoniaOnly(e.target.checked)} /> Ammonia only</label>
        <a className="check filterTab" href="/filters">☷ Target Filters{targetCount ? ` (${targetCount})` : " (all core)"}</a>
      </section>

      <section className="actions">
        {running
          ? <button className="primary stop" onClick={() => { abortRef.current.stop = true; }}>■ Stop</button>
          : <button className="primary" onClick={() => void runDeepSearch()} disabled={!ready}>Deep Search</button>}
        <select className="depth" value={depth} onChange={(e) => setDepth(e.target.value as Depth)} disabled={running} title="Search depth">
          <option value="standard">Standard</option>
          <option value="deep">Deep</option>
          <option value="exhaustive">Exhaustive</option>
        </select>
        <label className="inlineCheck"><input type="checkbox" checked={autoResearch} onChange={(e) => setAutoResearch(e.target.checked)} /> Auto-research top new</label>
        <button className="mini" onClick={() => setShowSources((s) => !s)}>{showSources ? "Hide sources" : "Sources"}</button>
        <span className="progress">{progress || (ready ? "Public records (USDA FSIS, EPA TRI, EPA ECHO, OpenStreetMap) + public web discovery. 100 results per page." : "Loading your Lifetime database… (if this persists, close other Prospecting Engine tabs so the database upgrade can finish)")}</span>
      </section>

      {showSources && (
        <section className="srcPanel">
          <div className="srcGrid">
            {(["Public records", "Web search", "Optional API"] as const).map((group) => (
              <div key={group}>
                <div className="srcGroup">{group}</div>
                {PROVIDER_TOGGLES.filter((p) => p.group === group).map((p) => {
                  const h = health[PROVIDER_LOG_NAMES[p.id] || p.label];
                  return (
                    <label key={p.id} className="srcItem" title={p.note || ""}>
                      <input type="checkbox" checked={providers[p.id] ?? p.defaultOn} onChange={(e) => setProviders({ ...providers, [p.id]: e.target.checked })} />
                      <span>{p.label}</span>
                      {h && <em className={`health ${h.ok ? "ok" : h.status}`}>{h.ok ? `${fmt(h.count)} found` : h.status}</em>}
                      {p.note && <small className="srcNote">{p.note}</small>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {healthRows.length > 0 && (
            <div className="healthLog">
              <div className="srcGroup">Last sweep — source log</div>
              {healthRows.map((h) => (
                <div key={h.provider} className="healthRow">
                  <span className={`dot ${h.ok ? "ok" : h.status}`} />
                  <strong>{h.provider}</strong>
                  <span>{h.ok ? `${fmt(h.count)} records/hits · ${h.calls} calls${h.failures ? ` · ${h.failures} failed` : ""}` : `${h.status}${h.detail ? ` — ${h.detail}` : ""}`}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {error && <div className="errorBox" onClick={() => setError("")}>{error} <small>(click to dismiss)</small></div>}

      <section className="stats">
        <div className="stat"><span>Showing</span><strong>{fmt(start)}–{fmt(end)}</strong><small> of {fmt(total)}</small></div>
        <div className="stat"><span>Pages</span><strong>{fmt(pageCount)}</strong><small> · 100 per page</small></div>
        <div className="stat"><span>Discovery records (last sweep)</span><strong>{fmt(lastSearch.length)}</strong><small> · {fmt(uniqueInLast)} unique{lastMeta?.rawHits ? ` · ${fmt(lastMeta.rawHits)} raw rows` : ""}</small></div>
        <div className="stat"><span>Lifetime prospects</span><strong>{fmt(lifetimeCount)}</strong><small> · deduplicated</small></div>
      </section>

      <section className="note">
        <strong>{viewLabel[view]}.</strong> Industrial refrigeration qualifies a prospect with or without ammonia. The 10,000-lb threshold applies only when ammonia is present and a public document states the quantity.
      </section>

      <section className="toolbar">
        <label>Sort
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="score">Score</option>
            <option value="newest">Newest</option>
            <option value="sources">Most sources</option>
            <option value="location">State / city</option>
            <option value="name">Name</option>
          </select>
        </label>
        {view === "search" && <label className="inlineCheck"><input type="checkbox" checked={uniqueOnly} onChange={(e) => setUniqueOnly(e.target.checked)} /> Unique facilities only</label>}
        <span className="spacer" />
        <button className="mini" onClick={exportCsv} disabled={!total}>Export CSV ({fmt(total)})</button>
        <button className="mini" onClick={() => setShowTools((s) => !s)}>{showTools ? "Hide data tools" : "Data tools"}</button>
      </section>

      {showTools && (
        <section className="srcPanel tools">
          <div>
            <div className="srcGroup">Paste a facility list (Google Maps results, spreadsheet rows)</div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"One facility per line, e.g.\nABC Cold Storage, Tolleson, AZ\nXYZ Meats — 1200 Industrial Way, Yakima, WA 98901"} rows={5} />
            <button className="mini" onClick={() => void importList()} disabled={running || !pasteText.trim()}>Add to Lifetime + research</button>
          </div>
          <div>
            <div className="srcGroup">Backup / move your Lifetime database</div>
            <p className="muted small">Lifetime is stored in this browser (IndexedDB{persisted ? ", persistent storage granted" : ""}). Use a backup to move it to another browser or computer.</p>
            <button className="mini" onClick={backupJson}>Download backup (.json)</button>{" "}
            <label className="mini fileBtn">Restore backup<input type="file" accept="application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreJson(f); e.target.value = ""; }} /></label>
          </div>
        </section>
      )}

      <section className="tableWrap">
        <table>
          <thead>
            <tr><th>Score</th><th>Prospect</th><th>Location</th><th>Facility type</th><th>Refrigeration</th><th>Ammonia</th><th>Sources</th><th>Priority</th><th>Save</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((p, i) => (
              <tr key={`${p.recordId || p.key}-${safePage}-${i}`} onClick={() => { setSelectedKey(p.key); setSelectedFallback(p); }}>
                <td><span className={`score s${p.score >= 85 ? "high" : p.score >= 70 ? "mid" : "low"}`}>{p.score}</span></td>
                <td>
                  <strong>{p.name}</strong>
                  {p.isNew && view !== "lifetime" ? <em className="badge new">NEW</em> : null}
                  {p.inSeedList ? <em className="badge seed" title="In the Keep Supply prospect list">KS</em> : null}
                  {p.facilityName ? <div className="sub">{p.facilityName}</div> : null}
                  {view === "search" && !uniqueOnly ? <div className="sub">{p.source}</div> : null}
                </td>
                <td>{p.city}, {p.state}{p.address ? <div className="sub">{p.address}</div> : null}</td>
                <td>{p.facilityType}</td>
                <td className="refCell">{p.refrigeration}</td>
                <td>{p.ammonia === "Unknown" ? <span className="muted">Unknown</span> : p.ammonia === "None indicated" ? "Not indicated" : p.ammonia}{p.ammoniaLb != null && p.ammoniaLb >= 10000 ? <em className="badge amm">≥10k lb doc.</em> : null}</td>
                <td>{p.evidenceSources || (p.sourceUrls || []).length || 0}<div className="sub">{p.confidence}</div></td>
                <td><span className={`priority p${p.priority}`}>{p.priority}</span></td>
                <td><button className={saved[p.key] ? "saveBtn saved" : "saveBtn"} onClick={(e) => { e.stopPropagation(); void toggleSaved(p); }}>{saved[p.key] ? "★" : "☆"}</button></td>
                <td><button className="mini" disabled={researchingKey === p.key} onClick={(e) => { e.stopPropagation(); setSelectedKey(p.key); setSelectedFallback(p); void researchOne(p); }}>{researchingKey === p.key ? "…" : "Research"}</button></td>
              </tr>
            ))}
            {!visible.length && (
              <tr><td colSpan={10} className="empty">{!ready ? "Loading…" : running ? "Searching — records appear here as each research pack completes." : view === "search" ? "Run Deep Search to discover prospects." : "No results match the current filters."}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="pagination">
        <span>Showing {fmt(start)}–{fmt(end)} of {fmt(total)}</span>
        <div className="pageBtns">
          <button className="mini" disabled={safePage === 0} onClick={() => setPage(0)}>« First</button>
          <button className="mini" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, Math.min(p, pageCount - 1) - 1))}>← Previous</button>
          <strong>
            Page{" "}
            <input className="pageInput" value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { const n = Math.min(pageCount, Math.max(1, Number(pageInput) || 1)); setPage(n - 1); } }}
              onBlur={() => setPageInput(String(safePage + 1))} aria-label="Page number" />
            {" "}of {fmt(pageCount)}
          </strong>
          <button className="mini" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, Math.min(p, pageCount - 1) + 1))}>Next →</button>
          <button className="mini" disabled={safePage >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>Last »</button>
        </div>
      </div>

      {selected && (
        <Dossier
          prospect={selected}
          saved={Boolean(saved[selected.key])}
          researching={researchingKey === selected.key}
          notes={researchNotes[selected.key]}
          onClose={() => { setSelectedKey(null); setSelectedFallback(null); }}
          onSave={() => void toggleSaved(selected)}
          onResearch={() => void researchOne(selected)}
          onOpenRelated={(r) => { setSelectedKey(r.key); setSelectedFallback(r); }}
        />
      )}
    </main>
  );
}
