"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_TARGET_FILTERS, DEFAULT_TARGETS, TARGET_DEFS, TARGET_GROUPS } from "../../lib/target-filters";
import { ALL_WESTERN, TERRITORY_OPTIONS } from "../../lib/geo";
import { LS, readLs, writeLs } from "../../lib/client-utils";

// Full-screen Target Filters workspace. Selections are saved in the browser and drive
// the main Deep Search (web terms, EPA NAICS codes, USDA FSIS, OpenStreetMap tags).
export default function FiltersPage() {
  const [territory, setTerritory] = useState(ALL_WESTERN);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [newCustom, setNewCustom] = useState("");
  const [filter, setFilter] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = readLs<string[]>(LS.filters, []);
    setSelected(Array.isArray(saved) ? saved : []);
    setCustom(readLs<string[]>(LS.custom, []));
    setTerritory(readLs(LS.territory, ALL_WESTERN));
    setLoaded(true);
  }, []);

  useEffect(() => { if (loaded) writeLs(LS.filters, selected); }, [selected, loaded]);
  useEffect(() => { if (loaded) writeLs(LS.custom, custom); }, [custom, loaded]);
  useEffect(() => { if (loaded) writeLs(LS.territory, territory); }, [territory, loaded]);

  const groups = useMemo(() => ({ ...TARGET_GROUPS, ...(custom.length ? { "Custom target types": custom } : {}) }), [custom]);
  const all = useMemo(() => [...new Set([...ALL_TARGET_FILTERS, ...custom])], [custom]);
  const q = filter.trim().toLowerCase();

  function toggle(value: string) {
    setSelected((cur) => (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]));
  }
  function toggleGroup(values: string[]) {
    const allOn = values.every((v) => selected.includes(v));
    setSelected((cur) => (allOn ? cur.filter((x) => !values.includes(x)) : [...new Set([...cur, ...values])]));
  }
  function addCustom() {
    const v = newCustom.trim();
    if (!v || all.includes(v)) return;
    setCustom((c) => [...c, v]);
    setSelected((s) => [...s, v]);
    setNewCustom("");
  }
  function removeCustom(v: string) {
    setCustom((c) => c.filter((x) => x !== v));
    setSelected((s) => s.filter((x) => x !== v));
  }
  function run() {
    writeLs(LS.filters, selected);
    writeLs(LS.territory, territory);
    window.location.href = "/?deep=1";
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <div className="eyebrow">KEEP SUPPLY</div>
          <h1>Target Filters</h1>
          <p>Choose the customer and facility types Deep Search should hunt for. Nothing selected = the core industrial-refrigeration markets.</p>
        </div>
        <div className="pill">WESTERN U.S.</div>
      </header>

      <div className="actions">
        <a href="/" className="primary linkPrimary">← Back to Prospecting Engine</a>
        <button className="primary" onClick={run}>Run Deep Search with {selected.length ? `${selected.length} target types` : "core targets"}</button>
        <span className="progress">{selected.length} selected · saved automatically · each type maps to web search terms, EPA NAICS codes, USDA FSIS and OpenStreetMap tags</span>
      </div>

      <section className="controls filterControls">
        <div className="control">
          <label>Territory</label>
          <select value={territory} onChange={(e) => setTerritory(e.target.value)}>{TERRITORY_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="control wide">
          <label>Find a target type</label>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="dairy, ammonia, contractor…" />
        </div>
        <button className="mini" onClick={() => setSelected([])}>Clear all</button>
        <button className="mini" onClick={() => setSelected(all)}>Select all</button>
        <button className="mini" onClick={() => setSelected(DEFAULT_TARGETS)}>Core set</button>
      </section>

      <section className="filterGroups">
        {Object.entries(groups).map(([group, values]) => {
          const shown = values.filter((v) => !q || v.toLowerCase().includes(q) || group.toLowerCase().includes(q));
          if (!shown.length) return null;
          const on = values.filter((v) => selected.includes(v)).length;
          return (
            <section className="filterGroup" key={group}>
              <div className="filterGroupHead">
                <strong>{group}</strong>
                <span className="muted small">{on}/{values.length}</span>
                <button className="mini" onClick={() => toggleGroup(values)}>{on === values.length ? "Clear group" : "Select group"}</button>
              </div>
              <div className="filterGrid">
                {shown.map((value) => {
                  const def = TARGET_DEFS[value];
                  const hint = def ? [def.naics?.length ? `NAICS ${def.naics.slice(0, 3).join(", ")}` : "", def.fsis ? "USDA FSIS" : "", def.osm?.length ? "OSM" : ""].filter(Boolean).join(" · ") : "custom search term";
                  return (
                    <label key={`${group}-${value}`} className={selected.includes(value) ? "filterItem on" : "filterItem"} title={def ? def.aliases.join(", ") : value}>
                      <input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />
                      <span>{value}<small>{hint || "web search terms"}</small></span>
                      {group === "Custom target types" && <button className="linkBtn" onClick={(e) => { e.preventDefault(); removeCustom(value); }}>remove</button>}
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </section>

      <section className="actions">
        <div className="control wide grow">
          <label>Add a custom target type</label>
          <input value={newCustom} onChange={(e) => setNewCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} placeholder="e.g. tortilla manufacturers, egg processing, hemp extraction" />
        </div>
        <button className="mini" onClick={addCustom} disabled={!newCustom.trim()}>Add</button>
        <button className="primary" onClick={run}>Run Deep Search</button>
      </section>
    </main>
  );
}
