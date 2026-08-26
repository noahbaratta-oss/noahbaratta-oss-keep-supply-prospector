"use client";

import { useEffect, useMemo, useState } from "react";

const STATES = ["All Western States", "Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const MEMORY_KEY = "keep-supply-prospect-memory-v1";
const SWEEP_KEY = "keep-supply-prospect-sweep-v1";
const LIFETIME_KEY = "keep-supply-prospect-lifetime-v2";
const LAST_SEARCH_KEY = "keep-supply-prospect-last-search-v2";
const SAVED_KEY = "keep-supply-prospect-saved-v2";

type Prospect = {
  name: string; city: string; state: string; industry: string; refrigeration: string;
  ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated";
  ammoniaLb?: number | null; score: number; priority: "A" | "B" | "C";
  reason: string; sourceUrls?: string[]; isNew?: boolean; saved?: boolean; firstSeen?: number; lastSeen?: number;
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

function keyFor(p: Pick<Prospect, "name" | "city" | "state">) { return `${p.name}|${p.city}|${p.state}`.toLowerCase().replace(/\s+/g, " ").trim(); }
function readJson<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } }

export default function Home() {
  const [view, setView] = useState<"search" | "lifetime" | "new" | "saved">("search");
  const [state, setState] = useState(STATES[0]);
  const [query, setQuery] = useState("");
  const [ammoniaOnly, setAmmoniaOnly] = useState(false);
  const [minScore, setMinScore] = useState(45);
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

  useEffect(() => {
    const savedMemory = readJson<Record<string, number>>(MEMORY_KEY, {});
    const savedLifetime = readJson<Record<string, Prospect>>(LIFETIME_KEY, {});
    const savedLast = readJson<Prospect[]>(LAST_SEARCH_KEY, []);
    const savedSaved = readJson<Record<string, Prospect>>(SAVED_KEY, {});
    const nextSweep = Number(localStorage.getItem(SWEEP_KEY) || "0");
    const base = Object.keys(savedLifetime).length ? Object.values(savedLifetime) : seedProspects;
    const nextLifetime: Record<string, Prospect> = { ...savedLifetime };
    for (const p of seedProspects) if (!nextLifetime[keyFor(p)]) nextLifetime[keyFor(p)] = p;
    setMemory(savedMemory); setLifetime(nextLifetime); setProspects(base.map((p) => ({ ...p, saved: Boolean(savedSaved[keyFor(p)]), isNew: savedLast.some((x) => keyFor(x) === keyFor(p)) })));
    setLastSearch(savedLast); setSaved(savedSaved); setSweep(Number.isFinite(nextSweep) ? nextSweep : 0);
  }, []);

  const activePool = useMemo(() => view === "lifetime" ? Object.values(lifetime) : view === "new" ? lastSearch : view === "saved" ? Object.values(saved) : prospects, [view, lifetime, lastSearch, saved, prospects]);
  const filtered = useMemo(() => activePool.filter((p) => state === STATES[0] || p.state === state).filter((p) => !query || `${p.name} ${p.city} ${p.state} ${p.industry} ${p.refrigeration}`.toLowerCase().includes(query.toLowerCase())).filter((p) => p.score >= minScore).filter((p) => !ammoniaOnly || p.ammonia !== "None indicated").sort((a, b) => b.score - a.score), [activePool, state, query, minScore, ammoniaOnly]);
  const newCount = lastSearch.length;
  const territoryMemoryCount = Object.keys(lifetime).length;
  const savedCount = Object.keys(saved).length;

  function persistLifetime(items: Prospect[]) {
    const next = { ...lifetime }; const now = Date.now();
    for (const raw of items) { const k = keyFor(raw); const prior = next[k]; next[k] = { ...prior, ...raw, firstSeen: prior?.firstSeen ?? now, lastSeen: now, saved: Boolean(saved[k]), isNew: true }; }
    setLifetime(next); try { localStorage.setItem(LIFETIME_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ } return next;
  }
  function persistMemory(items: Prospect[]) {
    const next = { ...memory }; for (const p of items) next[keyFor(p)] = next[keyFor(p)] ?? Date.now(); setMemory(next); try { localStorage.setItem(MEMORY_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }
  function toggleSaved(p: Prospect) {
    const k = keyFor(p); const next = { ...saved }; if (next[k]) delete next[k]; else next[k] = { ...p, saved: true };
    setSaved(next); setLifetime((current) => ({ ...current, [k]: { ...current[k], ...p, saved: Boolean(next[k]) } })); setProspects((current) => current.map((x) => keyFor(x) === k ? { ...x, saved: Boolean(next[k]) } : x));
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ } return Boolean(next[k]);
  }

  async function researchProspect(p: Prospect) {
    setSelected(p); setResearchText(""); setError(""); setResearching(true);
    try { const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "research", prospect: p }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Research failed"); setResearchText(data.dossier || "No dossier returned."); persistMemory([p]); }
    catch (e) { setError(e instanceof Error ? e.message : "Research failed"); } finally { setResearching(false); }
  }

  async function discoverTerritory() {
    setError(""); setDiscovering(true); setSelected(null); setResearchText(""); setView("search");
    const priorMemory = { ...memory }; const currentSweep = sweep; setProgress(`Deep searching ${state === STATES[0] ? "the entire Western territory" : state}…`);
    try {
      const allIncoming: Prospect[] = [];
      const firstRes = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "discover", state, batch: 0, sweep: currentSweep, knownKeys: Object.keys(priorMemory) }) });
      const firstData = await firstRes.json(); if (!firstRes.ok) throw new Error(firstData.error || "Discovery request failed");
      const total = Math.max(1, Number(firstData.totalBatches) || (state === STATES[0] ? 10 : 4));
      if (Array.isArray(firstData.prospects)) allIncoming.push(...firstData.prospects);
      setProgress(`Research pack 1/${total} complete — ${allIncoming.length} candidates collected.`);

      const concurrency = 3;
      for (let start = 1; start < total; start += concurrency) {
        const numbers = Array.from({ length: Math.min(concurrency, total - start) }, (_, i) => start + i);
        const responses = await Promise.all(numbers.map((batch) => fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "discover", state, batch, sweep: currentSweep, knownKeys: Object.keys(priorMemory) }) })));
        const payloads = await Promise.all(responses.map(async (res) => ({ ok: res.ok, data: await res.json() })));
        for (const payload of payloads) { if (!payload.ok) throw new Error(payload.data.error || "Discovery request failed"); if (Array.isArray(payload.data.prospects)) allIncoming.push(...payload.data.prospects); }
        setProgress(`Deep searching… ${Math.min(start + concurrency, total)}/${total} research packs complete — ${allIncoming.length} candidates collected.`);
      }

      const deduped = new Map<string, Prospect>(); for (const p of allIncoming) { const k = keyFor(p); const existing = deduped.get(k); if (!existing || p.score > existing.score) deduped.set(k, p); }
      const incoming = [...deduped.values()].map((p) => ({ ...p, isNew: !priorMemory[keyFor(p)], saved: Boolean(saved[keyFor(p)]) }));
      persistLifetime(incoming); persistMemory(incoming); setLastSearch(incoming); try { localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(incoming)); } catch { /* storage unavailable */ }
      setProspects((current) => { const map = new Map<string, Prospect>(); for (const p of current) map.set(keyFor(p), p); for (const p of incoming) map.set(keyFor(p), p); return [...map.values()].sort((a, b) => b.score - a.score); });
      const nextSweep = currentSweep + 1; setSweep(nextSweep); try { localStorage.setItem(SWEEP_KEY, String(nextSweep)); } catch { /* storage unavailable */ }
      setProgress(`Deep search complete — ${incoming.filter((p) => p.isNew).length} NEW prospects returned, ${incoming.length} unique candidates found.`); setView("new");
    } catch (e) { setError(e instanceof Error ? e.message : "Discovery failed"); setProgress(""); } finally { setDiscovering(false); }
  }

  return (
    <main className="page">
      <header className="header"><div><div className="eyebrow">KEEP SUPPLY</div><h1>Prospecting Engine</h1><p>Industrial refrigeration first. Ammonia is a qualifier—not a requirement.</p></div><div className="pill">WESTERN U.S.</div></header>
      <nav className="tabs"><button className={view === "search" ? "tab active" : "tab"} onClick={() => setView("search")}>Deep Search</button><button className={view === "lifetime" ? "tab active" : "tab"} onClick={() => setView("lifetime")}>Lifetime <span>{territoryMemoryCount}</span></button><button className={view === "new" ? "tab active" : "tab"} onClick={() => setView("new")}>New From Last Search <span>{newCount}</span></button><button className={view === "saved" ? "tab active" : "tab"} onClick={() => setView("saved")}>Saved <span>{savedCount}</span></button></nav>
      <section className="controls"><div className="control wide"><label>Search facilities</label><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="cold storage, food processing, company, city…" /></div><div className="control"><label>Territory</label><select value={state} onChange={(e) => setState(e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div><div className="control"><label>Minimum score</label><input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}/><span className="rangeValue">{minScore}</span></div><label className="check"><input type="checkbox" checked={ammoniaOnly} onChange={(e) => setAmmoniaOnly(e.target.checked)} /> Ammonia only</label><a className="check filterTab" href="/filters">☷ Target Filters</a></section>
      <section className="actions"><button className="primary" onClick={discoverTerritory} disabled={discovering}>{discovering ? "Deep searching…" : `Deep Search ${state === STATES[0] ? "the West" : state}`}</button><span>{progress || `Search cycle ${sweep + 1}. One click runs the full discovery sweep using larger internal research packs.`}</span></section>
      {error && <div className="errorBox">{error}</div>}
      <section className="stats"><div className="stat"><span>Showing</span><strong>{filtered.length}</strong></div><div className="stat"><span>New last search</span><strong>{newCount}</strong></div><div className="stat"><span>Lifetime prospects</span><strong>{territoryMemoryCount}</strong></div><div className="stat"><span>Saved</span><strong>{savedCount}</strong></div></section>
      <section className="note"><strong>Qualification:</strong> any industrial refrigeration can be a Keep Supply prospect. The 10,000-lb threshold applies only when ammonia is present.</section>
      <section className="tableWrap"><table><thead><tr><th>Score</th><th>Prospect</th><th>Location</th><th>Industry</th><th>Refrigeration</th><th>Ammonia</th><th>Priority</th><th>Save</th><th></th></tr></thead><tbody>{filtered.map((p) => <tr key={keyFor(p)} onClick={() => setSelected(p)}><td><span className={`score s${p.score >= 90 ? "high" : p.score >= 80 ? "mid" : "low"}`}>{p.score}</span></td><td><strong>{p.name}</strong>{p.isNew ? <small> • NEW</small> : ""}</td><td>{p.city}, {p.state}</td><td>{p.industry}</td><td>{p.refrigeration}</td><td>{p.ammonia === "None indicated" ? "—" : p.ammonia}{p.ammoniaLb != null && p.ammoniaLb >= 10000 ? <small> • ≥10k</small> : ""}</td><td><span className={`priority p${p.priority}`}>{p.priority}</span></td><td><button className="saveBtn" aria-label={p.saved ? "Remove from saved" : "Save prospect"} onClick={(e) => { e.stopPropagation(); toggleSaved(p); }}>{p.saved ? "★" : "☆"}</button></td><td><button className="mini" onClick={(e) => { e.stopPropagation(); researchProspect(p); }}>Research</button></td></tr>)}{!filtered.length && <tr><td colSpan={9} className="empty">Nothing here yet. Run a Deep Search or change the filters.</td></tr>}</tbody></table></section>
      {selected && <div className="overlay" onClick={() => setSelected(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><div className="eyebrow">PROSPECT DOSSIER</div><div className="drawerTitleRow"><div><h2>{selected.name}</h2><p className="muted">{selected.city}, {selected.state} · {selected.industry}</p></div><button className="saveLarge" onClick={() => { const next = toggleSaved(selected); setSelected({ ...selected, saved: next }); }}>{selected.saved ? "★ Saved" : "☆ Save"}</button></div><div className="dossierGrid"><div><span>Score</span><strong>{selected.score}/100</strong></div><div><span>Priority</span><strong>{selected.priority}</strong></div><div><span>Refrigeration</span><strong>{selected.refrigeration}</strong></div><div><span>Ammonia</span><strong>{selected.ammonia}</strong></div></div><p className="reason">{selected.reason}</p><div className="researchHeader"><h3>Live web research</h3><button className="mini" onClick={() => researchProspect(selected)} disabled={researching}>{researching ? "Researching…" : "Research now"}</button></div>{researchText ? <pre className="researchText">{researchText}</pre> : <p className="muted">Run live research to collect current public evidence and source links.</p>}</aside></div>}
    </main>
  );
}
