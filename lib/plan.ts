// Deep Search planner: turns Territory + Target Filters + options into many small
// research packs ("tasks"). The client runs them with limited concurrency so every
// serverless call stays short and progress is visible.
//
// Discovery graph: Western U.S. → state → public registries (FSIS / TRI / ECHO / OSM)
// → metro / city / industrial corridor → industry terms → refrigeration / ammonia /
// permit / document / expansion paths.

import type { DiscoverTask } from "./types";
import { CITIES, CORRIDORS, STATE_ABBR, STATE_AGENCIES, statesFor } from "./geo";
import { DEFAULT_TARGETS, aliasesFor, fsisModeFor, naicsFor, osmClausesFor } from "./target-filters";

export type Depth = "standard" | "deep" | "exhaustive";

export type PlanOptions = {
  territory: string;
  targets: string[];
  ammoniaOnly: boolean;
  depth: Depth;
  sweep: number;
  text?: string;
  providers: Record<string, boolean>;
};

const DEPTH = {
  standard: { terms: 4, cities: 3, corridors: 0, tasksPerState: 4 },
  deep: { terms: 8, cities: 6, corridors: 2, tasksPerState: 10 },
  exhaustive: { terms: 16, cities: 14, corridors: 4, tasksPerState: 24 },
} as const;

function rotate<T>(xs: T[], by: number): T[] {
  if (!xs.length) return xs;
  const n = ((by % xs.length) + xs.length) % xs.length;
  return [...xs.slice(n), ...xs.slice(0, n)];
}

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function webQueriesForState(state: string, opts: PlanOptions): string[] {
  const d = DEPTH[opts.depth];
  const st = STATE_ABBR[state];
  const targets = opts.targets.length ? opts.targets : DEFAULT_TARGETS;
  const terms = rotate(aliasesFor(targets), opts.sweep * 3).slice(0, d.terms);
  const cities = rotate(CITIES[state] || [], opts.sweep * d.cities).slice(0, d.cities);
  const corridors = rotate(CORRIDORS[state] || [], opts.sweep).slice(0, d.corridors);
  const agency = STATE_AGENCIES[state];
  const text = (opts.text || "").trim();
  const q: string[] = [];

  if (text) {
    q.push(`"${state}" ${text}`, `${state} ${text} refrigeration`, `${state} ${text} ammonia`);
    for (const c of cities.slice(0, 3)) q.push(`"${c}, ${st}" ${text}`);
  }
  if (opts.ammoniaOnly) {
    for (const t of terms.slice(0, 4)) q.push(`${state} ${t} ammonia refrigeration`, `${state} ${t} anhydrous ammonia RMP`);
    q.push(`${state} ammonia refrigeration facility risk management plan`, `${state} ammonia PSM refrigeration plant`);
  }
  for (const [i, t] of terms.entries()) {
    q.push(`"${state}" ${t}`);
    q.push(`${state} ${t} industrial refrigeration`);
    if (opts.depth !== "standard") q.push(`${state} ${t} ammonia refrigeration`, `${state} ${t} expansion`);
    if (opts.depth === "exhaustive") q.push(`${state} ${t} permit`, `${state} ${t} refrigeration filetype:pdf`);
    const city = cities[i % Math.max(1, cities.length)];
    if (city) q.push(`"${city}, ${st}" ${t}`);
  }
  for (const [i, c] of cities.entries()) {
    const t = terms[(i + 1) % Math.max(1, terms.length)];
    if (t) q.push(`"${c}" ${st} ${t} plant OR warehouse`);
  }
  for (const corridor of corridors) q.push(`"${corridor}" ${terms[0] || "cold storage"}`, `"${corridor}" refrigeration`);
  q.push(
    `${state} ammonia refrigeration facility`,
    `${state} cold storage expansion`,
    `${state} food processing plant expansion refrigeration`,
    `${state} refrigeration permit food processing`,
  );
  if (agency) q.push(`site:${agency.domain} ammonia refrigeration`, `${agency.names[0]} ammonia refrigeration permit`);
  return [...new Set(q)];
}

export function buildPlan(opts: PlanOptions): DiscoverTask[] {
  const states = statesFor(opts.territory);
  const targets = opts.targets.length ? opts.targets : DEFAULT_TARGETS;
  const on = (id: string, dflt = true) => opts.providers[id] ?? dflt;
  const tasks: DiscoverTask[] = [];

  // One pack per state keeps each response well under the serverless response-size limit.
  const fsis = on("fsis") && fsisModeFor(targets) !== "none";
  const naicsChunks = chunk(naicsFor(targets), 6);
  for (const state of states) {
    if (on("rmp")) tasks.push({ id: `rmp-${state}`, kind: "rmp", state, label: `EPA RMP ammonia registrations · ${state}` });
    if (fsis) tasks.push({ id: `fsis-${state}`, kind: "fsis", states: [state], label: `USDA FSIS inspected establishments · ${state}` });
    if (on("tri")) tasks.push({ id: `tri-${state}`, kind: "tri", state, label: `EPA TRI ammonia reporters · ${state}` });
    if (on("echo")) naicsChunks.forEach((naics, i) => tasks.push({ id: `echo-${state}-${i}`, kind: "echo", state, naics, label: `EPA ECHO facilities · ${state} · NAICS group ${i + 1}/${naicsChunks.length}` }));
  }
  if (on("osm") && osmClausesFor(targets).length) {
    for (const state of states) tasks.push({ id: `osm-${state}`, kind: "osm", state, label: `OpenStreetMap facilities · ${state}` });
  }
  if (on("web")) {
    const d = DEPTH[opts.depth];
    const perState = states.map((state) => chunk(webQueriesForState(state, opts), 4).slice(0, d.tasksPerState).map((queries, i) => ({ id: `web-${state}-${i}`, kind: "web" as const, state, queries, label: `Web discovery · ${state} · pack ${i + 1}` })));
    // Interleave states so early packs cover the whole territory.
    const max = Math.max(0, ...perState.map((x) => x.length));
    for (let i = 0; i < max; i++) for (const list of perState) if (list[i]) tasks.push(list[i]);
  }
  return tasks;
}

// Secondary research queries for one company / facility (recursive research pass).
export function researchQueries(name: string, city: string, state: string): string[] {
  const loc = [city && city !== "Unknown" ? city : "", state && state !== "Unknown" ? state : ""].filter(Boolean).join(" ");
  const n = `"${name}"`;
  return [
    `${n} ${loc} refrigeration`,
    `${n} industrial refrigeration`,
    `${n} ammonia`,
    `${n} ${loc} cold storage`,
    `${n} ${loc} facility`,
    `${n} ${loc} plant`,
    `${n} warehouse distribution ${state}`,
    `${n} ${state} permit`,
    `${n} RMP ammonia`,
    `${n} PSM`,
    `${n} expansion ${state}`,
    `${n} refrigeration filetype:pdf`,
  ].map((s) => s.replace(/\s+/g, " ").trim());
}
