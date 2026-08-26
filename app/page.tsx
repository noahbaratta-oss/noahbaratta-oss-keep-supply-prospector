"use client";

import { useEffect, useMemo, useState } from "react";

const STATES = ["All Western States","Arizona","California","Colorado","Idaho","Montana","Nevada","New Mexico","Oregon","Utah","Washington","Wyoming","Alaska","Hawaii"];
const FILTER_KEY = "keep-supply-target-filters-v1";
const SWEEP_KEY = "keep-supply-prospect-sweep-v1";
const MEMORY_KEY = "keep-supply-prospect-memory-v1";
const DB_NAME = "keep-supply-prospector-db-v2";
const PAGE_SIZE = 100;

type Prospect = {
  name:string; city:string; state:string; industry:string; refrigeration:string;
  ammonia:"Confirmed"|"Likely"|"Unknown"|"None indicated"; ammoniaLb?:number|null;
  score:number; priority:"A"|"B"|"C"; reason:string; sourceUrls?:string[];
  isNew?:boolean; saved?:boolean; firstSeen?:number; lastSeen?:number;
  estimatedPartsOpportunity?:string; equipmentBrands?:string[]; buyerType?:string;
  coldCallPriority?:string; territoryAssignment?:string; salesApproach?:string;
  source?:string; facilityType?:string; confidence?:"High"|"Medium"|"Low";
  evidence?:string[]; evidenceSources?:number;
};

type Snapshot = { lifetime:Record<string,Prospect>; saved:Record<string,Prospect>; lastSearch:Prospect[]; memory:Record<string,number>; sweep:number };

function keyFor(p:Pick<Prospect,"name"|"city"|"state">){return `${p.name}|${p.city}|${p.state}`.toLowerCase().replace(/\s+/g," ").trim();}
function readJson<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}}
function openDb():Promise<IDBDatabase|null>{if(typeof window==="undefined"||!("indexedDB"in window))return Promise.resolve(null);return new Promise(resolve=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore("state");req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);});}
async function dbGet<T>(key:string,fallback:T):Promise<T>{const db=await openDb();if(!db)return fallback;return new Promise(resolve=>{const tx=db.transaction("state","readonly");const req=tx.objectStore("state").get(key);req.onsuccess=()=>resolve((req.result as T|undefined)??fallback);req.onerror=()=>resolve(fallback);});}
async function dbSet<T>(key:string,value:T){const db=await openDb();if(!db)return;await new Promise<void>(resolve=>{const tx=db.transaction("state","readwrite");tx.objectStore("state").put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});}

export default function Home(){
 const [view,setView]=useState<"search"|"lifetime"|"new"|"saved">("search");
 const [state,setState]=useState(STATES[0]); const [query,setQuery]=useState("");
 const [ammoniaOnly,setAmmoniaOnly]=useState(false); const [minScore,setMinScore]=useState(45);
 const [page,setPage]=useState(0); const [lifetime,setLifetime]=useState<Record<string,Prospect>>({});
 const [lastSearch,setLastSearch]=useState<Prospect[]>([]); const [saved,setSaved]=useState<Record<string,Prospect>>({});
 const [memory,setMemory]=useState<Record<string,number>>({}); const [sweep,setSweep]=useState(0);
 const [selected,setSelected]=useState<Prospect|null>(null); const [researchText,setResearchText]=useState("");
 const [researching,setResearching]=useState(false); const [discovering,setDiscovering]=useState(false); const [progress,setProgress]=useState(""); const [error,setError]=useState("");
 const [filterCount,setFilterCount]=useState(0); const [rawHits,setRawHits]=useState(0);

 useEffect(()=>{let cancelled=false;(async()=>{const fallback:Snapshot={lifetime:{},saved:{},lastSearch:[],memory:{},sweep:Number(localStorage.getItem(SWEEP_KEY)||0)||0};const snap=await dbGet<Snapshot>("app",fallback);if(cancelled)return;setLifetime(snap.lifetime||{});setSaved(snap.saved||{});setLastSearch(snap.lastSearch||[]);setMemory(snap.memory||{});setSweep(snap.sweep||0);setRawHits((snap.lastSearch||[]).length);setFilterCount(readJson<string[]>(FILTER_KEY,[]).length);})();return()=>{cancelled=true;};},[]);
 useEffect(()=>setPage(0),[view,state,query,minScore,ammoniaOnly]);

 const pool=useMemo(()=>view==="lifetime"?Object.values(lifetime):view==="saved"?Object.values(saved):view==="new"?lastSearch:lastSearch,[view,lifetime,saved,lastSearch]);
 const filtered=useMemo(()=>pool.filter(p=>state===STATES[0]||p.state===state).filter(p=>!query||`${p.name} ${p.city} ${p.state} ${p.industry} ${p.refrigeration}`.toLowerCase().includes(query.toLowerCase())).filter(p=>p.score>=minScore).filter(p=>!ammoniaOnly||p.ammonia!=="None indicated").sort((a,b)=>b.score-a.score),[pool,state,query,minScore,ammoniaOnly]);
 const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); const safePage=Math.min(page,pageCount-1); const visible=filtered.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE); const start=filtered.length?safePage*PAGE_SIZE+1:0; const end=Math.min((safePage+1)*PAGE_SIZE,filtered.length);

 async function saveSnapshot(next:Snapshot){await dbSet("app",next);try{localStorage.setItem(MEMORY_KEY,JSON.stringify(next.memory));localStorage.setItem(SWEEP_KEY,String(next.sweep));}catch{} }
 async function toggleSaved(p:Prospect){const k=keyFor(p);const next={...saved};if(next[k])delete next[k];else next[k]={...p,saved:true};const nextLifetime={...lifetime,[k]:{...lifetime[k],...p,saved:Boolean(next[k])}};setSaved(next);setLifetime(nextLifetime);await saveSnapshot({lifetime:nextLifetime,saved:next,lastSearch,memory,sweep});}
 async function researchProspect(p:Prospect){setSelected(p);setResearchText("");setResearching(true);setError("");try{const r=await fetch("/api/research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"research",prospect:p})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Research failed");setResearchText(d.dossier||"No dossier returned.");}catch(e){setError(e instanceof Error?e.message:"Research failed");}finally{setResearching(false);}}

 async function discover(){setDiscovering(true);setError("");setProgress("Starting full Western discovery sweep…");setView("new");setPage(0);const prior={...memory};const currentSweep=sweep;const selectedCategories=readJson<string[]>(FILTER_KEY,[]);setFilterCount(selectedCategories.length);try{
  const all:Prospect[]=[];let hits=0;let total=13;
  for(let batch=0;batch<total;batch++){const r=await fetch("/api/research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"discover",state,batch,sweep:currentSweep,knownKeys:Object.keys(prior),selectedCategories})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Discovery failed");if(Array.isArray(d.prospects))all.push(...d.prospects.map((p:Prospect)=>({...p,isNew:!prior[keyFor(p)],saved:Boolean(saved[keyFor(p)])})));hits+=Number(d.hitCount||0)+Number(d.epaCount||0)+Number(d.importedCount||0);total=Number(d.totalBatches)||total;setProgress(`Research pack ${batch+1}/${total} complete — ${all.length} discovery records from ${hits} raw hits.`);}
  const nextLifetime={...lifetime};const now=Date.now();const nextMemory={...memory};for(const p of all){const k=keyFor(p);const priorP=nextLifetime[k];nextLifetime[k]={...priorP,...p,firstSeen:priorP?.firstSeen??now,lastSeen:now,saved:Boolean(saved[k]),isNew:true};nextMemory[k]=nextMemory[k]??now;}
  const nextSweep=currentSweep+1;const snap={lifetime:nextLifetime,saved,lastSearch:all,memory:nextMemory,sweep:nextSweep};await saveSnapshot(snap);setLifetime(nextLifetime);setLastSearch(all);setMemory(nextMemory);setSweep(nextSweep);setRawHits(hits);setProgress(`Complete — ${all.filter(p=>p.isNew).length} new discovery records, ${all.length} total records across the sweep, ${Object.keys(nextLifetime).length} unique Lifetime prospects.`);
 }catch(e){setError(e instanceof Error?e.message:"Discovery failed");setProgress("");}finally{setDiscovering(false);}}

 return <main className="page">
  <header className="header"><div><div className="eyebrow">KEEP SUPPLY</div><h1>Prospecting Engine</h1><p>Industrial refrigeration first. Ammonia is a qualifier—not a requirement.</p></div><div className="pill">WESTERN U.S.</div></header>
  <nav className="tabs"><button className={view==="search"?"tab active":"tab"} onClick={()=>setView("search")}>Deep Search</button><button className={view==="lifetime"?"tab active":"tab"} onClick={()=>setView("lifetime")}>Lifetime <span>{Object.keys(lifetime).length}</span></button><button className={view==="new"?"tab active":"tab"} onClick={()=>setView("new")}>New From Last Search <span>{lastSearch.length}</span></button><button className={view==="saved"?"tab active":"tab"} onClick={()=>setView("saved")}>Saved <span>{Object.keys(saved).length}</span></button></nav>
  <section className="controls"><div className="control wide"><label>Search facilities</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="cold storage, food processing, company, city…"/></div><div className="control"><label>Territory</label><select value={state} onChange={e=>setState(e.target.value)}>{STATES.map(s=><option key={s}>{s}</option>)}</select></div><div className="control"><label>Minimum score</label><input type="range" min="0" max="100" value={minScore} onChange={e=>setMinScore(Number(e.target.value))}/><span className="rangeValue">{minScore}</span></div><label className="check"><input type="checkbox" checked={ammoniaOnly} onChange={e=>setAmmoniaOnly(e.target.checked)}/> Ammonia only</label><a className="check filterTab" href="/filters">☷ Target Filters{filterCount?` (${filterCount})`:""}</a></section>
  <section className="actions"><button className="primary" onClick={discover} disabled={discovering}>{discovering?"Deep searching…":"Deep Search"}</button><span>{progress||`100 results per page. Full discovery output is retained; Lifetime is deduplicated.`}</span></section>
  {error&&<div className="errorBox">{error}</div>}
  <section className="stats"><div className="stat"><span>Showing</span><strong>{start}-{end}</strong><small> of {filtered.length}</small></div><div className="stat"><span>Pages</span><strong>{pageCount}</strong></div><div className="stat"><span>Discovery records</span><strong>{rawHits||lastSearch.length}</strong></div><div className="stat"><span>Lifetime prospects</span><strong>{Object.keys(lifetime).length}</strong></div></section>
  <section className="note"><strong>Qualification:</strong> every industrial-refrigeration discovery stays browsable here. Lifetime deduplicates by company/facility. The 10,000-lb rule applies only when ammonia is present.</section>
  <section className="tableWrap"><table><thead><tr><th>Score</th><th>Prospect</th><th>Location</th><th>Industry</th><th>Refrigeration</th><th>Ammonia</th><th>Priority</th><th>Save</th><th></th></tr></thead><tbody>{visible.map((p,i)=><tr key={`${keyFor(p)}-${safePage}-${i}`} onClick={()=>setSelected(p)}><td><span className={`score s${p.score>=90?"high":p.score>=80?"mid":"low"}`}>{p.score}</span></td><td><strong>{p.name}</strong>{p.isNew?<small> • NEW</small>:""}</td><td>{p.city}, {p.state}</td><td>{p.industry}</td><td>{p.refrigeration}</td><td>{p.ammonia==="None indicated"?"—":p.ammonia}{p.ammoniaLb!=null&&p.ammoniaLb>=10000?<small> • ≥10k</small>:""}</td><td><span className={`priority p${p.priority}`}>{p.priority}</span></td><td><button className="saveBtn" onClick={e=>{e.stopPropagation();toggleSaved(p)}}>{saved[keyFor(p)]?"★":"☆"}</button></td><td><button className="mini" onClick={e=>{e.stopPropagation();researchProspect(p)}}>Research</button></td></tr>)}{!visible.length&&<tr><td colSpan={9} className="empty">No results match the current filters.</td></tr>}</tbody></table></section>
  <div className="pager"><button className="mini" disabled={safePage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>← Previous</button><span>Page {safePage+1} of {pageCount} · {start}-{end} of {filtered.length}</span><button className="mini" disabled={safePage>=pageCount-1} onClick={()=>setPage(p=>Math.min(pageCount-1,p+1))}>Next →</button></div>
  {selected&&<div className="overlay" onClick={()=>setSelected(null)}><aside className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="eyebrow">PROSPECT DOSSIER</div><div className="drawerTitleRow"><div><h2>{selected.name}</h2><p className="muted">{selected.city}, {selected.state} · {selected.industry}</p></div><button className="saveLarge" onClick={()=>toggleSaved(selected)}>{saved[keyFor(selected)]?"★ Saved":"☆ Save"}</button></div><div className="dossierGrid"><div><span>Score</span><strong>{selected.score}/100</strong></div><div><span>Priority</span><strong>{selected.priority}</strong></div><div><span>Refrigeration</span><strong>{selected.refrigeration}</strong></div><div><span>Ammonia</span><strong>{selected.ammonia}</strong></div></div><p className="reason">{selected.reason}</p><div className="researchHeader"><h3>Live web research</h3><button className="mini" onClick={()=>researchProspect(selected)} disabled={researching}>{researching?"Researching…":"Research now"}</button></div>{researchText?<pre className="researchText">{researchText}</pre>:<p className="muted">Run live research to collect current public evidence and source links.</p>}</aside></div>}
 </main>;
}
