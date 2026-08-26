"use client";

import { useEffect, useMemo, useState } from "react";

const STATES = ["All Western States", "Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const MEMORY_KEY = "keep-supply-prospect-memory-v1";
const SWEEP_KEY = "keep-supply-prospect-sweep-v1";
const LAST_SEARCH_KEY = "keep-supply-prospect-last-search-v2";
const SAVED_KEY = "keep-supply-prospect-saved-v2";
const FILTER_KEY = "keep-supply-target-filters-v1";
const DB_NAME = "keep-supply-prospector-db-v1";
const DB_STORE = "state";
const PAGE_SIZES = [100, 250, 500];

type Prospect = {
  name: string;
  city: string;
  state: string;
  industry: string;
  refrigeration: string;
  ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated";
  ammoniaLb?: number | null;
  score: number;
  priority: "A" | "B" | "C";
  reason: string;
  sourceUrls?: string[];
  isNew?: boolean;
  saved?: boolean;
  firstSeen?: number;
  lastSeen?: number;
  estimatedPartsOpportunity?: string;
  equipmentBrands?: string[];
  buyerType?: string;
  coldCallPriority?: string;
  territoryAssignment?: string;
  salesApproach?: string;
  source?: string;
};

type AppSnapshot = {
  lifetime: Record<string, Prospect>;
  saved: Record<string, Prospect>;
  lastSearch: Prospect[];
  memory: Record<string, number>;
};

const seedProspects: Prospect[] = [
  { name: "Costco Wholesale – Mira Loma", city: "Mira Loma", state: "California", industry: "Cold storage / distribution", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 96, priority: "A", reason: "Public engineering documentation identifies an ammonia charge above the 10,000-lb threshold." },
  { name: "Ventura Coastal", city: "Visalia", state: "California", industry: "Citrus processing", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 94, priority: "A", reason: "EPA enforcement documentation identifies refrigeration equipment containing more than 10,000 lb of anhydrous ammonia." },
  { name: "Dovex Fruit Company", city: "Wenatchee", state: "Washington", industry: "Fruit processing", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 93, priority: "A", reason: "EPA documentation identifies use of more than 10,000 lb of anhydrous ammonia." },
  { name: "Sorrento Lactalis", city: "Nampa", state: "Idaho", industry: "Cheese manufacturing", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 93, priority: "A", reason: "EPA documentation identifies use of more than 10,000 lb of anhydrous ammonia." },
  { name: "Jerome Cheese", city: "Jerome", state: "Idaho", industry: "Cheese manufacturing", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 91, priority: "A", reason: "EPA documentation identifies a facility regulated because it uses more than 10,000 lb of ammonia." },
  { name: "Colorado Premium Cold Storage", city: "Denver", state: "Colorado", industry: "Cold storage", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: null, score: 89, priority: "A", reason: "EPA identifies the facility as subject to chemical risk-management requirements because of large ammonia quantities." },
  { name: "Anheuser-Busch – Fort Collins", city: "Fort Collins", state: "Colorado", industry: "Beverage manufacturing", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 88, priority: "A", reason: "EPA docket documentation identifies an ammonia process exceeding 10,000 lb." },
  { name: "Large CO₂ Cold Storage Example", city: "Boise", state: "Idaho", industry: "Cold storage", refrigeration: "CO₂ / industrial refrigeration", ammonia: "None indicated", ammoniaLb: null, score: 84, priority: "A", reason: "Strong industrial-refrigeration fit. Non-ammonia systems are valid Keep Supply prospects." },
];

function keyFor(p: Pick<Prospect, "name" | "city" | "state">) {
  return `${p.name}|${p.city}|${p.state}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function dbGet<T>(key: string, fallback: T): Promise<T> {
  const db = await openDb();
  if (!db) return fallback;
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? fallback);
    req.onerror = () => resolve(fallback);
  });
}

async function dbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export default function Home() {
  const [view, setView] = useState<"search" | "lifetime" | "new" | "saved">("search");
  const [state, setState] = useState(STATES[0]);
  const [query, setQuery] = useState("");
  const [ammoniaOnly, setAmmoniaOnly] = useState(false);
  const [minScore, setMinScore] = useState(45);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [prospects, setProspects] = useState<Prospect[]>(seedProspects);
  const [lifetime, setLifetime] = useState<Record<string, Prospect>>({});
  const [lastSearch, setLastSearch] = useState<Prospect[]>([]);
  const [saved, setSaved] = useState<Record<string, Prospect>>({});
  const [memory, setMemory] = useState<Record<string, number>>({});
  const [sweep, setSweep] = useState(0);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [researching, setResearching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [researchText, setResearchText] = useState("");
  const [filterCount, setFilterCount] = useState(0);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fallbackLifetime = readJson<Record<string, Prospect>>("keep-supply-prospect-lifetime-v2", {});
      const fallbackSaved = readJson<Record<string, Prospect>>(SAVED_KEY, {});
      const fallbackLast = readJson<Prospect[]>(LAST_SEARCH_KEY, []);
      const fallbackMemory = readJson<Record<string, number>>(MEMORY_KEY, {});
      const snapshot = await dbGet<AppSnapshot>("app", { lifetime: fallbackLifetime, saved: fallbackSaved, lastSearch: fallbackLast, memory: fallbackMemory });
      if (cancelled) return;
      const nextLifetime = { ...(snapshot.lifetime || {}) };
      for (const p of seedProspects) if (!nextLifetime[keyFor(p)]) nextLifetime[keyFor(p)] = p;
      const selectedFilters = readJson<string[]>(FILTER_KEY, []);
      const nextSweep = Number(localStorage.getItem(SWEEP_KEY) || "0");
      const nextSaved = snapshot.saved || {};
      const nextLast = snapshot.lastSearch || [];
      setMemory(snapshot.memory || {});
      setLifetime(nextLifetime);
      setLastSearch(nextLast);
      setSaved(nextSaved);
      setSweep(Number.isFinite(nextSweep) ? nextSweep : 0);
      setFilterCount(selectedFilters.length);
      setProspects(Object.values(nextLifetime).map((p) => ({ ...p, saved: Boolean(nextSaved[keyFor(p)]), isNew: nextLast.some((x) => keyFor(x) === keyFor(p)) })));
      setStorageReady(true);
      if (Object.keys(fallbackLifetime).length && !Object.keys(snapshot.lifetime || {}).length) await dbSet("app", { lifetime: nextLifetime, saved: nextSaved, lastSearch: nextLast, memory: snapshot.memory || {} });
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => setPage(0), [view, state, query, minScore, ammoniaOnly, pageSize]);

  const activePool = useMemo(
    () => view === "lifetime" ? Object.values(lifetime) : view === "new" ? lastSearch : view === "saved" ? Object.values(saved) : prospects,
    [view, lifetime, lastSearch, saved, prospects]
  );
  const filtered = useMemo(
    () => activePool
      .filter((p) => state === STATES[0] || p.state === state)
      .filter((p) => !query || `${p.name} ${p.city} ${p.state} ${p.industry} ${p.refrigeration}`.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => p.score >= minScore)
      .filter((p) => !ammoniaOnly || p.ammonia !== "None indicated")
      .sort((a, b) => b.score - a.score),
    [activePool, state, query, minScore, ammoniaOnly]
  );
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const newCount = lastSearch.length;
  const territoryMemoryCount = Object.keys(lifetime).length;
  const savedCount = Object.keys(saved).length;
  const rangeStart = filtered.length ? page * pageSize + 1 : 0;
  const rangeEnd = Math.min((page + 1) * pageSize, filtered.length);

  async function persistApp(next: AppSnapshot) {
    await dbSet("app", next);
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(next.memory));
      localStorage.setItem(SWEEP_KEY, String(sweep));
    } catch { /* IndexedDB remains primary */ }
  }

  async function persistLifetime(items: Prospect[]) {
    const next = { ...lifetime };
    const now = Date.now();
    for (const raw of items) {
      const k = keyFor(raw);
      const prior = next[k];
      next[k] = { ...prior, ...raw, firstSeen: prior?.firstSeen ?? now, lastSeen: now, saved: Boolean(saved[k]), isNew: true };
    }
    setLifetime(next);
    await persistApp({ lifetime: next, saved, lastSearch, memory });
    return next;
  }

  async function persistMemory(items: Prospect[]) {
    const next = { ...memory };
    for (const p of items) next[keyFor(p)] = next[keyFor(p)] ?? Date.now();
    setMemory(next);
    await persistApp({ lifetime, saved, lastSearch, memory: next });
  }

  async function toggleSaved(p: Prospect) {
    const k = keyFor(p);
    const next = { ...saved };
    if (next[k]) delete next[k]; else next[k] = { ...p, saved: true };
    const nextLifetime = { ...lifetime, [k]: { ...lifetime[k], ...p, saved: Boolean(next[k]) } };
    setSaved(next);
    setLifetime(nextLifetime);
    setProspects((current) => current.map((x) => keyFor(x) === k ? { ...x, saved: Boolean(next[k]) } : x));
    await persistApp({ lifetime: nextLifetime, saved: next, lastSearch, memory });
    return Boolean(next[k]);
  }

  async function researchProspect(p: Prospect) {
    setSelected(p); setResearchText(""); setError(""); setResearching(true);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "research", prospect: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      setResearchText(data.dossier || "No dossier returned.");
      await persistMemory([p]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally { setResearching(false); }
  }

  async function discoverTerritory() {
    setError(""); setDiscovering(true); setSelected(null); setResearchText(""); setView("search");
    const priorMemory = { ...memory };
    const currentSweep = sweep;
    const selectedCategories = readJson<string[]>(FILTER_KEY, []);
    setFilterCount(selectedCategories.length);
    setProgress(`Deep searching ${state === STATES[0] ? "the entire Western territory" : state}${selectedCategories.length ? ` across ${selectedCategories.length} target types` : ""}…`);
    try {
      const allIncoming: Prospect[] = [];
      const firstRes = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "discover", state, batch: 0, sweep: currentSweep, knownKeys: Object.keys(priorMemory), selectedCategories }) });
      const firstData = await firstRes.json();
      if (!firstRes.ok) throw new Error(firstData.error || "Discovery request failed");
      const total = Math.max(1, Number(firstData.totalBatches) || (state === STATES[0] ? 12 : 5));
      if (Array.isArray(firstData.prospects)) allIncoming.push(...firstData.prospects);
      setProgress(`Research pack 1/${total} complete — ${allIncoming.length} candidates collected.`);

      const concurrency = 3;
      for (let start = 1; start < total; start += concurrency) {
        const numbers = Array.from({ length: Math.min(concurrency, total - start) }, (_, i) => start + i);
        const responses = await Promise.all(numbers.map((batch) => fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "discover", state, batch, sweep: currentSweep, knownKeys: Object.keys(priorMemory), selectedCategories }) })));
        const payloads = await Promise.all(responses.map(async (res) => ({ ok: res.ok, data: await res.json() })));
        for (const payload of payloads) {
          if (!payload.ok) throw new Error(payload.data.error || "Discovery request failed");
          if (Array.isArray(payload.data.prospects)) allIncoming.push(...payload.data.prospects);
        }
        setProgress(`Deep searching… ${Math.min(start + concurrency, total)}/${total} research packs complete — ${allIncoming.length} candidates collected.`);
      }

      const deduped = new Map<string, Prospect>();
      for (const p of allIncoming) {
        const k = keyFor(p);
        const existing = deduped.get(k);
        if (!existing || p.score > existing.score) deduped.set(k, p);
      }
      const incoming = [...deduped.values()].map((p) => ({ ...p, isNew: !priorMemory[keyFor(p)], saved: Boolean(saved[keyFor(p)]) }));
      const now = Date.now();
      const nextLifetime = { ...lifetime };
      for (const p of incoming) {
        const k = keyFor(p);
        const prior = nextLifetime[k];
        nextLifetime[k] = { ...prior, ...p, firstSeen: prior?.firstSeen ?? now, lastSeen: now, saved: Boolean(saved[k]) };
      }
      const nextMemory = { ...priorMemory };
      for (const p of incoming) nextMemory[keyFor(p)] = nextMemory[keyFor(p)] ?? now;
      const nextSaved = { ...saved };
      const nextLast = incoming;
      const nextProspects = Object.values(nextLifetime).map((p) => ({ ...p, saved: Boolean(nextSaved[keyFor(p)]) }));
      setLifetime(nextLifetime); setMemory(nextMemory); setLastSearch(nextLast); setProspects(nextProspects);
      await dbSet("app", { lifetime: nextLifetime, saved: nextSaved, lastSearch: nextLast, memory: nextMemory });
      try { localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(nextLast)); } catch { /* IndexedDB is primary */ }
      const nextSweep = currentSweep + 1;
      setSweep(nextSweep);
      try { localStorage.setItem(SWEEP_KEY, String(nextSweep)); } catch { /* IndexedDB is primary */ }
      setPage(0);
      setProgress(`Deep search complete — ${incoming.filter((p) => p.isNew).length} NEW prospects returned, ${incoming.length} unique candidates found and saved to Lifetime.`);
      setView("new");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
      setProgress("");
    } finally { setDiscovering(false); }
  }

  return (
    <main className="page">
      <header className="header">
        <div><div className="eyebrow">KEEP SUPPLY</div><h1>Prospecting Engine</h1><p>Industrial refrigeration first. Ammonia is a qualifier—not a requirement.</p></div>
        <div className="pill">WESTERN U.S.</div>
      </header>
      <nav className="tabs">
        <button className={view === "search" ? "tab active" : "tab"} onClick={() => setView("search")}>Deep Search</button>
        <button className={view === "lifetime" ? "tab active" : "tab"} onClick={() => setView("lifetime")}>Lifetime <span>{territoryMemoryCount}</span></button>
        <button className={view === "new" ? "tab active" : "tab"} onClick={() => setView("new")}>New From Last Search <span>{newCount}</span></button>
        <button className={view === "saved" ? "tab active" : "tab"} onClick={() => setView("saved")}>Saved <span>{savedCount}</span></button>
      </nav>
      <section className="controls">
        <div className="control wide"><label>Search facilities</label><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="cold storage, food processing, company, city…" /></div>
        <div className="control"><label>Territory</label><select value={state} onChange={(e) => setState(e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="control"><label>Minimum score</label><input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}/><span className="rangeValue">{minScore}</span></div>
        <div className="control"><label>Rows per page</label><select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <label className="check"><input type="checkbox" checked={ammoniaOnly} onChange={(e) => setAmmoniaOnly(e.target.checked)} /> Ammonia only</label>
        <a className="check filterTab" href="/filters">☷ Target Filters{filterCount ? ` (${filterCount})` : ""}</a>
      </section>
      <section className="actions"><button className="primary" onClick={discoverTerritory} disabled={discovering}>{discovering ? "Deep searching…" : `Deep Search ${state === STATES[0] ? "the West" : state}`}</button><span>{progress || `Search cycle ${sweep + 1}. ${storageReady ? "Lifetime database is loaded." : "Loading lifetime database…"}`}</span></section>
      {error && <div className="errorBox">{error}</div>}
      <section className="stats">
        <div className="stat"><span>Showing</span><strong>{filtered.length.toLocaleString()}</strong></div>
        <div className="stat"><span>Visible now</span><strong>{visible.length.toLocaleString()}</strong></div>
        <div className="stat"><span>Lifetime prospects</span><strong>{territoryMemoryCount.toLocaleString()}</strong></div>
        <div className="stat"><span>Saved</span><strong>{savedCount.toLocaleString()}</strong></div>
      </section>
      <section className="note"><strong>Qualification:</strong> any industrial refrigeration can be a Keep Supply prospect. The 10,000-lb threshold applies only when ammonia is present. Lifetime is stored in a persistent browser database so large prospect lists survive normal reloads.</section>
      <section className="tableWrap">
        <table>
          <thead><tr><th>Score</th><th>Prospect</th><th>Location</th><th>Industry</th><th>Refrigeration</th><th>Ammonia</th><th>Priority</th><th>Save</th><th></th></tr></thead>
          <tbody>
            {visible.map((p) => <tr key={keyFor(p)} onClick={() => setSelected(p)}>
              <td><span className={`score s${p.score >= 90 ? "high" : p.score >= 80 ? "mid" : "low"}`}>{p.score}</span></td>
              <td><strong>{p.name}</strong>{p.isNew ? <small> • NEW</small> : ""}</td>
              <td>{p.city}, {p.state}</td><td>{p.industry}</td><td>{p.refrigeration}</td>
              <td>{p.ammonia === "None indicated" ? "—" : p.ammonia}{p.ammoniaLb != null && p.ammoniaLb >= 10000 ? <small> • ≥10k</small> : ""}</td>
              <td><span className={`priority p${p.priority}`}>{p.priority}</span></td>
              <td><button className="saveBtn" aria-label={p.saved ? "Remove from saved" : "Save prospect"} onClick={(e) => { e.stopPropagation(); void toggleSaved(p); }}>{p.saved ? "★" : "☆"}</button></td>
              <td><button className="mini" onClick={(e) => { e.stopPropagation(); void researchProspect(p); }}>Research</button></td>
            </tr>)}
            {!visible.length && <tr><td colSpan={9} className="empty">Nothing here yet. Run a Deep Search or change the filters.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="pagination">
        <span>Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {filtered.length.toLocaleString()}</span>
        <div className="pageBtns">
          <button className="mini" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Previous</button>
          <strong>Page {page + 1} of {maxPage + 1}</strong>
          <button className="mini" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Next →</button>
        </div>
      </section>
      {selected && <div className="overlay" onClick={() => setSelected(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={() => setSelected(null)}>×</button>
        <div className="eyebrow">PROSPECT DOSSIER</div>
        <div className="drawerTitleRow"><div><h2>{selected.name}</h2><p className="muted">{selected.city}, {selected.state} · {selected.industry}</p></div><button className="saveLarge" onClick={() => void toggleSaved(selected)}>{selected.saved ? "★ Saved" : "☆ Save"}</button></div>
        <div className="dossierGrid"><div><span>Score</span><strong>{selected.score}/100</strong></div><div><span>Priority</span><strong>{selected.priority}</strong></div><div><span>Refrigeration</span><strong>{selected.refrigeration}</strong></div><div><span>Ammonia</span><strong>{selected.ammonia}</strong></div></div>
        {selected.estimatedPartsOpportunity && <div className="reason"><strong>Estimated parts opportunity:</strong> {selected.estimatedPartsOpportunity}</div>}
        {selected.equipmentBrands?.length ? <div className="reason"><strong>Likely OEMs:</strong> {selected.equipmentBrands.join(" · ")}</div> : null}
        {selected.buyerType && <div className="reason"><strong>Likely buyer:</strong> {selected.buyerType}</div>}
        <p className="reason">{selected.reason}</p>
        <div className="researchHeader"><h3>Live web research</h3><button className="mini" onClick={() => void researchProspect(selected)} disabled={researching}>{researching ? "Researching…" : "Research now"}</button></div>
        {researchText ? <pre className="researchText">{researchText}</pre> : <p className="muted">Run live research to collect current public evidence and source links.</p>}
      </aside></div>}
    </main>
  );
}
