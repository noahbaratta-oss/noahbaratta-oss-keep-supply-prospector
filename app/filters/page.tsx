"use client";

import { useEffect, useMemo, useState } from "react";

const STATES = ["All Western States", "Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico", "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii"];
const MEMORY_KEY = "keep-supply-prospect-memory-v1";
const LIFETIME_KEY = "keep-supply-prospect-lifetime-v2";
const LAST_SEARCH_KEY = "keep-supply-prospect-last-search-v2";

const GROUPS: Record<string, string[]> = {
  "Meat & Protein": [
    "Beef processing plants", "Pork processing plants", "Poultry processing plants", "Rendering facilities", "Meat packing plants", "Sausage/processed meat manufacturers", "Frozen meat processors", "Further-processing facilities", "Distribution facilities attached to meat producers", "Large butcher/processing operations"
  ],
  "Cold Storage & Distribution": [
    "Cold storage warehouses", "Frozen food warehouses", "Refrigerated distribution centers", "Temperature-controlled logistics", "3PL cold storage", "Food distribution centers", "Frozen storage facilities", "Produce cold storage", "Meat cold storage", "Pharmaceutical cold storage", "Regional refrigerated warehouses"
  ],
  "Dairy": [
    "Milk processors", "Cheese manufacturers", "Yogurt manufacturers", "Ice cream manufacturers", "Butter producers", "Powdered milk facilities", "Dairy ingredient processors"
  ],
  "Beverage": [
    "Beverage manufacturers", "Soft drink plants", "Juice processors", "Bottling facilities", "Brewing companies", "Large breweries", "Distilleries", "Beverage distribution"
  ],
  "Brewing / Distilling": [
    "Regional breweries", "Craft breweries with significant production", "Spirits manufacturers", "Beverage plants", "Fermentation facilities", "Beverage distribution centers", "Production facility", "Distribution center", "Barrel aging", "Fermentation", "Packaging line", "Cold storage", "Industrial refrigeration", "Ammonia", "CO₂ refrigeration"
  ],
  "Pharmaceutical / Life Sciences": [
    "Pharmaceutical manufacturing", "Biotech manufacturing", "Vaccine facilities", "Life sciences manufacturing", "Pharmaceutical distribution", "Cold-chain pharmaceutical warehouses", "API manufacturing", "Medical product manufacturing", "Specialty chemical/pharmaceutical facilities"
  ],
  "Chemical / Industrial Manufacturing": [
    "Chemical manufacturing", "Plastics manufacturing", "Rubber manufacturing", "Industrial gases", "Chemical processing", "Large-scale manufacturing", "Process cooling facilities", "Industrial freezing", "Thermal processing", "Food ingredient manufacturing", "Industrial production facilities"
  ],
  "Refrigeration Contractors & Service": [
    "Industrial refrigeration contractors", "Industrial refrigeration service companies", "Ammonia refrigeration contractors", "Commercial refrigeration contractors", "Refrigeration engineering firms", "HVAC/R contractors specializing in industrial systems", "Refrigeration maintenance companies", "Refrigeration system integrators", "Industrial mechanical contractors", "Refrigeration equipment installers"
  ]
};

const ALL_FILTERS = Object.values(GROUPS).flat();

export default function FiltersPage() {
  const [state, setState] = useState("All Western States");
  const [selected, setSelected] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("keep-supply-target-filters-v1") || "[]");
      if (Array.isArray(saved)) setSelected(saved);
    } catch { /* ignore */ }
  }, []);

  const selectedByGroup = useMemo(() => Object.fromEntries(Object.entries(GROUPS).map(([group, values]) => [group, values.filter((v) => selected.includes(v)).length])), [selected]);

  function toggle(value: string) {
    setSelected((current) => current.includes(value) ? current.filter((x) => x !== value) : [...current, value]);
  }

  function toggleGroup(group: string) {
    const values = GROUPS[group];
    const allOn = values.every((v) => selected.includes(v));
    setSelected((current) => allOn ? current.filter((x) => !values.includes(x)) : [...new Set([...current, ...values])]);
  }

  async function runFilteredSearch() {
    setSearching(true); setError(""); setStatus("Starting targeted discovery…");
    try {
      const known = (() => { try { return Object.keys(JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}")); } catch { return []; } })();
      const packs = state === "All Western States" ? 8 : 4;
      const found: any[] = [];
      for (let batch = 0; batch < packs; batch++) {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "categoryDiscover", state, batch, selectedCategories: selected, knownKeys: known })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Targeted search failed");
        if (Array.isArray(data.prospects)) found.push(...data.prospects);
        setStatus(`Targeted search ${batch + 1}/${packs}… ${found.length} candidates collected.`);
      }

      const deduped = Array.from(new Map(found.map((p) => [`${p.name}|${p.city}|${p.state}`.toLowerCase(), p])).values());
      let lifetime: Record<string, any> = {};
      try { lifetime = JSON.parse(localStorage.getItem(LIFETIME_KEY) || "{}"); } catch { /* ignore */ }
      for (const p of deduped) lifetime[`${p.name}|${p.city}|${p.state}`.toLowerCase()] = { ...lifetime[`${p.name}|${p.city}|${p.state}`.toLowerCase()], ...p, isNew: true, firstSeen: lifetime[`${p.name}|${p.city}|${p.state}`.toLowerCase()]?.firstSeen || Date.now(), lastSeen: Date.now() };
      localStorage.setItem(LIFETIME_KEY, JSON.stringify(lifetime));
      localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(deduped));
      localStorage.setItem("keep-supply-target-filters-v1", JSON.stringify(selected));
      const mem: Record<string, number> = (() => { try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}"); } catch { return {}; } })();
      for (const p of deduped) mem[`${p.name}|${p.city}|${p.state}`.toLowerCase()] = mem[`${p.name}|${p.city}|${p.state}`.toLowerCase()] || Date.now();
      localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
      setStatus(`Complete — ${deduped.length} unique candidates returned. Go back to Prospecting Engine → New From Last Search.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Targeted search failed"); setStatus("");
    } finally { setSearching(false); }
  }

  return (
    <main className="page">
      <header className="header"><div><div className="eyebrow">KEEP SUPPLY</div><h1>Target Filters</h1><p>Build a focused search around the customer types you actually want to prospect.</p></div><div className="pill">WESTERN U.S.</div></header>
      <div className="actions"><a href="/" className="primary" style={{ textDecoration: "none" }}>← Back to Prospecting Engine</a><span>{selected.length} target types selected.</span></div>
      <section className="controls"><div className="control"><label>Territory</label><select value={state} onChange={(e) => setState(e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div><div className="control wide"><label>Selection</label><input readOnly value={selected.length ? selected.join(", ") : "All target types"} /></div><button className="primary" onClick={() => setSelected([])}>Clear</button><button className="primary" onClick={() => setSelected(ALL_FILTERS)}>Select all</button></section>
      {Object.entries(GROUPS).map(([group, values]) => <section className="tableWrap" style={{ marginBottom: 14 }} key={group}>
        <div style={{ padding: "15px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--panel-border, #dfe5ea)" }}><strong>{group}</strong><button className="mini" onClick={() => toggleGroup(group)}>{selectedByGroup[group] === values.length ? "Clear group" : `Select group (${values.length})`}</button></div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}>
          {values.map((value) => <label key={value} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", border: "1px solid #dfe5ea", borderRadius: 8, cursor: "pointer", fontSize: 13 }}><input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />{value}</label>)}
        </div>
      </section>)}
      <section className="actions"><button className="primary" disabled={searching || selected.length === 0} onClick={runFilteredSearch}>{searching ? "Searching…" : `Search ${selected.length || "all"} target types`}</button><span>{status || "Choose as many target types as you want. The engine will combine related searches into larger research packs."}</span></section>
      {error && <div className="errorBox">{error}</div>}
    </main>
  );
}
