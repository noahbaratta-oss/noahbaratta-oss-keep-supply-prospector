"use client";

import { useEffect, useMemo, useState } from "react";

const STATES = ["All Western States", "Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const MEMORY_KEY = "keep-supply-prospect-memory-v1";

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
  { name: "Large CO₂ Cold Storage Example", city: "Boise", state: "Idaho", industry: "Cold storage", refrigeration: "CO₂ / industrial refrigeration", ammonia: "None indicated", ammoniaLb: null, score: 84, priority: "A", reason: "Strong industrial-refrigeration fit. Non-ammonia systems are still valid Keep Supply prospects." },
  { name: "Oregon Ice Cream Company", city: "Eugene", state: "Oregon", industry: "Ice cream manufacturing", refrigeration: "Industrial refrigeration", ammonia: "Likely", ammoniaLb: null, score: 78, priority: "B", reason: "Public EPA documentation provides historical ammonia evidence; current charge needs verification." },
  { name: "Multistar Industries", city: "Othello", state: "Washington", industry: "Storage / distribution", refrigeration: "Industrial refrigeration", ammonia: "Confirmed", ammoniaLb: 10000, score: 77, priority: "B", reason: "EPA documentation identifies more than 10,000 lb of stored anhydrous ammonia; refrigeration fit requires facility-level confirmation." }
];

function keyFor(p: Pick<Prospect, "name" | "city" | "state">) {
  return `${p.name}|${p.city}|${p.state}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export default function Home() {
  const [state, setState] = useState(STATES[0]);
  const [query, setQuery] = useState("");
  const [ammoniaOnly, setAmmoniaOnly] = useState(false);
  const [minScore, setMinScore] = useState(70);
  const [prospects, setProspects] = useState<Prospect[]>(seedProspects);
  const [memory, setMemory] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [researching, setResearching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [progress, setProgress] = useState("");
  const [researchText, setResearchText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      if (saved && typeof saved === "object") setMemory(saved);
      setProspects(seedProspects.map(p => ({ ...p, isNew: !(saved?.[keyFor(p)]) })));
    } catch {
      setProspects(seedProspects.map(p => ({ ...p, isNew: false })));
    }
  }, []);

  const filtered = useMemo(() => prospects.filter(p =>
    (state === STATES[0] || p.state === state) &&
    (!query || `${p.name} ${p.city} ${p.state} ${p.industry} ${p.refrigeration}`.toLowerCase().includes(query.toLowerCase())) &&
    p.score >= minScore &&
    (!ammoniaOnly || p.ammonia !== "None indicated")
  ).sort((a,b) => b.score - a.score), [state, query, ammoniaOnly, minScore, prospects]);

  const ammonia10k = filtered.filter(p => p.ammonia === "Confirmed" && (p.ammoniaLb === null || (p.ammoniaLb ?? 0) >= 10000)).length;
  const newCount = filtered.filter(p => p.isNew).length;
  const territoryMemoryCount = Object.keys(memory).length;

  function remember(newItems: Prospect[]) {
    const next = { ...memory };
    for (const p of newItems) next[keyFor(p)] = Date.now();
    setMemory(next);
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(next)); } catch { /* browser storage may be disabled */ }
    return next;
  }

  function mergeProspects(incoming: Prospect[], nextMemory: Record<string, number>) {
    const map = new Map<string, Prospect>();
    for (const p of prospects) map.set(keyFor(p), { ...p, isNew: !nextMemory[keyFor(p)] });
    for (const p of incoming) {
      const k = keyFor(p);
      const prior = map.get(k);
      map.set(k, { ...p, isNew: !nextMemory[k] || !prior?.isNew });
    }
    return [...map.values()].sort((a,b) => b.score - a.score);
  }

  async function researchProspect(p: Prospect) {
    setSelected(p); setResearchText(""); setError(""); setResearching(true);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "research", prospect: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      setResearchText(data.dossier || "No dossier returned.");
      const nextMemory = remember([p]);
      setProspects(current => current.map(x => keyFor(x) === keyFor(p) ? { ...x, isNew: false } : x));
      setMemory(nextMemory);
    } catch (e) { setError(e instanceof Error ? e.message : "Research failed"); }
    finally { setResearching(false); }
  }

  async function discoverTerritory() {
    setError(""); setDiscovering(true); setResearchText(""); setSelected(null); setProgress("Starting territory sweep…");
    try {
      const first = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "discover", state, batch: 0 }) });
      const firstData = await first.json();
      if (!first.ok) throw new Error(firstData.error || "Discovery failed");
      const totalBatches = Number(firstData.totalBatches) || 1;
      let allIncoming: Prospect[] = [];
      const processBatch = (data: any) => {
        const normalized = Array.isArray(data.prospects) ? data.prospects.map((p: Partial<Prospect>, i: number) => ({
          name: p.name || `Web-discovered prospect ${allIncoming.length + i + 1}`,
          city: p.city || "Unknown",
          state: p.state || (state === STATES[0] ? "Western U.S." : state),
          industry: p.industry || "Industrial facility",
          refrigeration: p.refrigeration || "Industrial refrigeration — needs verification",
          ammonia: p.ammonia || "Unknown",
          ammoniaLb: typeof p.ammoniaLb === "number" ? p.ammoniaLb : null,
          score: Math.max(0, Math.min(100, Number(p.score) || 50)),
          priority: p.priority === "A" || p.priority === "B" || p.priority === "C" ? p.priority : "B",
          reason: p.reason || "Identified through public web research; facility-level verification still recommended.",
          sourceUrls: Array.isArray(p.sourceUrls) ? p.sourceUrls : []
        })) as Prospect[] : [];
        allIncoming = [...allIncoming, ...normalized];
        return normalized;
      };
      processBatch(firstData);
      setProgress(`Scanned batch 1 of ${totalBatches}… found ${allIncoming.length} candidates.`);

      for (let batch = 1; batch < totalBatches; batch++) {
        const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "discover", state, batch }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Discovery failed on batch ${batch + 1}`);
        processBatch(data);
        setProgress(`Scanned batch ${batch + 1} of ${totalBatches}… found ${allIncoming.length} candidates.`);
      }

      const nextMemory = remember(allIncoming);
      setProspects(current => mergeProspects(allIncoming, nextMemory));
      setMemory(nextMemory);
      setProgress(`Sweep complete. Found ${allIncoming.length} raw candidates and saved them to territory memory.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
      setProgress("");
    } finally { setDiscovering(false); }
  }

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

      <section className="controls">
        <div className="control wide"><label>Search facilities</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="cold storage, food processing, company, city…" /></div>
        <div className="control"><label>Territory</label><select value={state} onChange={e=>setState(e.target.value)}>{STATES.map(s=><option key={s}>{s}</option>)}</select></div>
        <div className="control"><label>Minimum score</label><input type="range" min="0" max="100" value={minScore} onChange={e=>setMinScore(Number(e.target.value))}/><span className="rangeValue">{minScore}</span></div>
        <label className="check"><input type="checkbox" checked={ammoniaOnly} onChange={e=>setAmmoniaOnly(e.target.checked)} /> Ammonia only</label>
      </section>

      <section className="actions">
        <button className="primary" onClick={discoverTerritory} disabled={discovering}>{discovering ? "Scanning…" : `Find new prospects ${state === STATES[0] ? "across the West" : `in ${state}`}`}</button>
        <span>{progress || "Public-web discovery runs in short batches so it works on the free Vercel tier. Territory memory is saved in this browser."}</span>
      </section>

      {error && <div className="errorBox">{error}</div>}
      <section className="stats">
        <div className="stat"><span>Qualified refrigeration prospects</span><strong>{filtered.length}</strong></div>
        <div className="stat"><span>New in this territory view</span><strong>{newCount}</strong></div>
        <div className="stat"><span>Territory memory saved</span><strong>{territoryMemoryCount}</strong></div>
        <div className="stat"><span>Ammonia 10k+ / evidence class</span><strong>{ammonia10k}</strong></div>
      </section>

      <section className="note"><strong>Scoring rule:</strong> non-ammonia industrial refrigeration can score highly. The 10,000-lb test is applied only when ammonia evidence exists.</section>

      <section className="tableWrap">
        <table>
          <thead><tr><th>Score</th><th>Prospect</th><th>Location</th><th>Industry</th><th>Refrigeration</th><th>Ammonia</th><th>Priority</th><th></th></tr></thead>
          <tbody>
            {filtered.map(p => <tr key={`${p.name}-${p.city}`} onClick={()=>setSelected(p)}>
              <td><span className={`score s${p.score >= 90 ? "high" : p.score >= 80 ? "mid" : "low"}`}>{p.score}</span></td>
              <td><strong>{p.name}</strong>{p.isNew ? <small> • NEW</small> : ""}</td><td>{p.city}, {p.state}</td><td>{p.industry}</td><td>{p.refrigeration}</td>
              <td>{p.ammonia === "None indicated" ? "—" : p.ammonia}{p.ammonia === "Confirmed" && p.ammoniaLb ? <small> • ≥10k</small> : ""}</td>
              <td><span className={`priority p${p.priority}`}>{p.priority}</span></td>
              <td><button className="mini" onClick={e=>{e.stopPropagation(); researchProspect(p)}}>Research</button></td>
            </tr>)}
            {!filtered.length && <tr><td colSpan={8} className="empty">No prospects match the current filters.</td></tr>}
          </tbody>
        </table>
      </section>

      {selected && <div className="overlay" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}>
        <button className="close" onClick={()=>setSelected(null)}>×</button>
        <div className="eyebrow">PROSPECT DOSSIER</div><h2>{selected.name}</h2>
        <p className="muted">{selected.city}, {selected.state} · {selected.industry}</p>
        <div className="dossierGrid"><div><span>Score</span><strong>{selected.score}/100</strong></div><div><span>Priority</span><strong>{selected.priority}</strong></div><div><span>Refrigeration</span><strong>{selected.refrigeration}</strong></div><div><span>Ammonia</span><strong>{selected.ammonia}</strong></div></div>
        {selected.ammoniaLb !== null && selected.ammoniaLb !== undefined && selected.ammonia === "Confirmed" && <div className="ammoniaBox"><strong>Ammonia threshold signal</strong><p>Evidence supports the 10,000+ lb qualification for ammonia. This threshold is specific to ammonia and does not determine whether the account is a refrigeration prospect.</p></div>}
        <div className="researchHeader"><h3>Live web research</h3><button className="mini" onClick={()=>researchProspect(selected)} disabled={researching}>{researching ? "Researching…" : "Research now"}</button></div>
        {researchText ? <pre className="researchText">{researchText}</pre> : <p className="muted">Run live research to collect current public evidence, sources, refrigeration technology, and ammonia qualification.</p>}
        {selected.sourceUrls?.length ? <><h3>Discovery sources</h3><div className="sources">{selected.sourceUrls.map(u=><a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}</div></> : null}
      </aside></div>}
    </main>
  );
}
