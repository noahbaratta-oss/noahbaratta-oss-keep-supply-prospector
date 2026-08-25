"use client";

import { useEffect, useMemo, useState } from "react";

const STATES = ["All Western States", "Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const MEMORY_KEY = "keep-supply-prospect-memory-v1";
const SWEEP_KEY = "keep-supply-prospect-sweep-v1";

type Prospect = {
  name: string; city: string; state: string; industry: string; refrigeration: string;
  ammonia: "Confirmed" | "Likely" | "Unknown" | "None indicated";
  ammoniaLb?: number | null; score: number; priority: "A" | "B" | "C";
  reason: string; sourceUrls?: string[]; isNew?: boolean;
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

export default function Home() {
  const [state, setState] = useState(STATES[0]);
  const [query, setQuery] = useState("");
  const [ammoniaOnly, setAmmoniaOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [minScore, setMinScore] = useState(45);
  const [prospects, setProspects] = useState<Prospect[]>(seedProspects);
  const [memory, setMemory] = useState<Record<string, number>>({});
  const [sweep, setSweep] = useState(0);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [researching, setResearching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [researchText, setResearchText] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}") as Record<string, number>;
      const nextSweep = Number(localStorage.getItem(SWEEP_KEY) || "0");
      setMemory(saved); setSweep(Number.isFinite(nextSweep) ? nextSweep : 0);
      setProspects(seedProspects.map((p) => ({ ...p, isNew: !saved[keyFor(p)] })));
    } catch { /* browser storage may be unavailable */ }
  }, []);

  const filtered = useMemo(() => prospects
    .filter((p) => state === STATES[0] || p.state === state)
    .filter((p) => !query || `${p.name} ${p.city} ${p.state} ${p.industry} ${p.refrigeration}`.toLowerCase().includes(query.toLowerCase()))
    .filter((p) => p.score >= minScore)
    .filter((p) => !ammoniaOnly || p.ammonia !== "None indicated")
    .filter((p) => !newOnly || p.isNew)
    .sort((a, b) => b.score - a.score), [state, query, minScore, ammoniaOnly, newOnly, prospects]);

  const newCount = prospects.filter((p) => p.isNew).length;
  const territoryMemoryCount = Object.keys(memory).length;
  const ammonia10k = filtered.filter((p) => p.ammonia === "Confirmed" && (p.ammoniaLb == null || p.ammoniaLb >= 10000)).length;

  function saveMemory(items: Prospect[]) {
    const next = { ...memory };
    for (const p of items) next[keyFor(p)] = next[keyFor(p)] ?? Date.now();
    setMemory(next);
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }

  async function researchProspect(p: Prospect) {
    setSelected(p); setResearchText(""); setError(""); setResearching(true);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "research", prospect: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      setResearchText(data.dossier || "No dossier returned.");
      saveMemory([p]);
      setProspects((current) => current.map((x) => keyFor(x) === keyFor(p) ? { ...x, isNew: false } : x));
    } catch (e) { setError(e instanceof Error ? e.message : "Research failed"); }
    finally { setResearching(false); }
  }

  async function discoverTerritory() {
    setError(""); setDiscovering(true); setSelected(null); setResearchText("");
    const priorMemory = { ...memory };
    const currentSweep = sweep;
    const total = state === STATES[0] ? 18 : 8;
    setProgress(`Starting search cycle ${currentSweep + 1}…`);
    try {
      const allIncoming: Prospect[] = [];
      for (let batch = 0; batch < total; batch++) {
        const res = await fetch("/api/research", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "discover", state, batch, sweep: currentSweep, knownKeys: Object.keys(priorMemory) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Discovery failed on batch ${batch + 1}`);
        if (Array.isArray(data.prospects)) allIncoming.push(...data.prospects);
        setProgress(`Search cycle ${currentSweep + 1}: batch ${batch + 1}/${total} — ${allIncoming.length} new candidates found.`);
      }

      const deduped = new Map<string, Prospect>();
      for (const p of allIncoming) {
        const k = keyFor(p);
        const existing = deduped.get(k);
        if (!existing || p.score > existing.score) deduped.set(k, p);
      }
      const incoming = [...deduped.values()].map((p) => ({ ...p, isNew: !priorMemory[keyFor(p)] }));
      setProspects((current) => {
        const map = new Map<string, Prospect>();
        for (const p of current) map.set(keyFor(p), p);
        for (const p of incoming) map.set(keyFor(p), p);
        return [...map.values()].sort((a, b) => b.score - a.score);
      });

      const nextMemory = saveMemory(incoming);
      setMemory(nextMemory);
      const nextSweep = currentSweep + 1;
      setSweep(nextSweep);
      try { localStorage.setItem(SWEEP_KEY, String(nextSweep)); } catch { /* ignore */ }
      setProgress(`Cycle ${currentSweep + 1} complete — ${incoming.length} genuinely NEW prospects added. Next cycle will use a different search strategy.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
      setProgress("");
    } finally { setDiscovering(false); }
  }

  return (
    <main className="page">
      <header className="header"><div><div className="eyebrow">KEEP SUPPLY</div><h1>Prospecting Engine</h1><p>Industrial refrigeration first. Ammonia is a qualifier—not a requirement.</p></div><div className="pill">WESTERN U.S.</div></header>
      <section className="controls">
        <div className="control wide"><label>Search facilities</label><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="cold storage, food processing, company, city…" /></div>
        <div className="control"><label>Territory</label><select value={state} onChange={(e) => setState(e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="control"><label>Minimum score</label><input type="range" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}/><span className="rangeValue">{minScore}</span></div>
        <label className="check"><input type="checkbox" checked={ammoniaOnly} onChange={(e) => setAmmoniaOnly(e.target.checked)} /> Ammonia only</label>
        <label className="check"><input type="checkbox" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} /> New only</label>
      </section>
      <section className="actions"><button className="primary" onClick={discoverTerritory} disabled={discovering}>{discovering ? "Scanning…" : `Find new prospects ${state === STATES[0] ? "across the West" : `in ${state}`}`}</button><span>{progress || `Search cycle ${sweep + 1}. Each cycle rotates the discovery strategy so the engine keeps looking for different customers.`}</span></section>
      {error && <div className="errorBox">{error}</div>}
      <section className="stats"><div className="stat"><span>Prospects shown</span><strong>{filtered.length}</strong></div><div className="stat"><span>NEW prospects</span><strong>{newCount}</strong></div><div className="stat"><span>Territory memory</span><strong>{territoryMemoryCount}</strong></div><div className="stat"><span>Ammonia 10k+ signal</span><strong>{ammonia10k}</strong></div></section>
      <section className="note"><strong>Qualification:</strong> any industrial refrigeration can be a Keep Supply prospect. The 10,000-lb threshold applies only when ammonia is present.</section>
      <section className="tableWrap"><table><thead><tr><th>Score</th><th>Prospect</th><th>Location</th><th>Industry</th><th>Refrigeration</th><th>Ammonia</th><th>Priority</th><th></th></tr></thead><tbody>
        {filtered.map((p) => <tr key={keyFor(p)} onClick={() => setSelected(p)}><td><span className={`score s${p.score >= 90 ? "high" : p.score >= 80 ? "mid" : "low"}`}>{p.score}</span></td><td><strong>{p.name}</strong>{p.isNew ? <small> • NEW</small> : ""}</td><td>{p.city}, {p.state}</td><td>{p.industry}</td><td>{p.refrigeration}</td><td>{p.ammonia === "None indicated" ? "—" : p.ammonia}{p.ammoniaLb != null && p.ammoniaLb >= 10000 ? <small> • ≥10k</small> : ""}</td><td><span className={`priority p${p.priority}`}>{p.priority}</span></td><td><button className="mini" onClick={(e) => { e.stopPropagation(); researchProspect(p); }}>Research</button></td></tr>)}
        {!filtered.length && <tr><td colSpan={8} className="empty">No prospects match the current filters. Run another search cycle or lower the score filter.</td></tr>}
      </tbody></table></section>
      {selected && <div className="overlay" onClick={() => setSelected(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><div className="eyebrow">PROSPECT DOSSIER</div><h2>{selected.name}</h2><p className="muted">{selected.city}, {selected.state} · {selected.industry}</p><div className="dossierGrid"><div><span>Score</span><strong>{selected.score}/100</strong></div><div><span>Priority</span><strong>{selected.priority}</strong></div><div><span>Refrigeration</span><strong>{selected.refrigeration}</strong></div><div><span>Ammonia</span><strong>{selected.ammonia}</strong></div></div><div className="researchHeader"><h3>Live web research</h3><button className="mini" onClick={() => researchProspect(selected)} disabled={researching}>{researching ? "Researching…" : "Research now"}</button></div>{researchText ? <pre className="researchText">{researchText}</pre> : <p className="muted">Run live research to collect current public evidence and source links.</p>}</aside></div>}
    </main>
  );
}
