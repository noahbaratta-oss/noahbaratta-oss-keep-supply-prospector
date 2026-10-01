// OpenStreetMap (Overpass) query building + parsing. Client-safe: the browser runs the
// query itself (Overpass rate-limits shared cloud IPs), the server is only a fallback.

import type { Prospect } from "./types";
import { classifyFacility, UNCLASSIFIED } from "./classify";
import { STATE_ABBR } from "./geo";
import { DEFAULT_TARGETS, osmClausesFor } from "./target-filters";
import { allowedTypes, makeRecord, targetsMatching } from "./targeting";

export const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export function osmQuery(state: string, targets: string[]): string | null {
  const abbr = STATE_ABBR[state];
  const clauses = osmClausesFor(targets.length ? targets : DEFAULT_TARGETS);
  if (!abbr || !clauses.length) return null;
  return `[out:json][timeout:22];area["ISO3166-2"="US-${abbr}"]->.a;(${clauses.map((c) => `${c}(area.a);`).join("")});out center tags 1500;`;
}

export function osmElementsToRecords(els: OsmElement[], state: string, targets: string[]): Prospect[] {
  const allowed = allowedTypes(targets);
  const records: Prospect[] = [];
  for (const el of els) {
    const t = el.tags || {};
    const name = t.name || t.operator || t.brand;
    if (!name) continue;
    if (t.shop || /^(restaurant|bar|pub|cafe|fast_food)$/.test(t.amenity || "")) continue;
    const tagSummary = ["industrial", "craft", "man_made", "product", "building", "office"].filter((k) => t[k]).map((k) => `${k}=${t[k]}`).join(", ");
    const type = classifyFacility(`${name} ${t.industrial || ""} ${t.craft || ""} ${t.product || ""}`);
    if (type.type === UNCLASSIFIED && !/refrigerat|cold|freez/i.test(name)) continue;
    if (allowed && !allowed.has(type.type)) continue;
    const url = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    records.push(makeRecord({
      recordId: `osm:${el.type}/${el.id}`,
      name,
      facilityName: t.operator && t.operator !== name ? `${name} (operator: ${t.operator})` : undefined,
      city: t["addr:city"] || "Unknown",
      state,
      address: street || undefined,
      zip: t["addr:postcode"],
      phone: t.phone || t["contact:phone"] || undefined,
      website: t.website || t["contact:website"] || undefined,
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
      facilityType: type.type,
      industry: `${type.type} (OpenStreetMap: ${tagSummary || "named feature"})`,
      evidence: [{ label: `OpenStreetMap mapped facility (${tagSummary || "named industrial feature"})`, url, source: "OpenStreetMap (community data)", kind: "osm" }],
      sourceUrls: [url],
      providers: ["OpenStreetMap"],
      targetCategories: targetsMatching(targets, [], type.type),
      source: "OpenStreetMap",
    }));
  }
  return records;
}
