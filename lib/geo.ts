// Western U.S. territory geography: State → metro / city → industrial corridor.
// Used by the query planner (web discovery) and by record normalization.

export const WESTERN_STATES = [
  "Arizona", "California", "Colorado", "Idaho", "Montana", "Nevada", "New Mexico",
  "Oregon", "Utah", "Washington", "Wyoming", "Alaska", "Hawaii",
] as const;

export const ALL_WESTERN = "All Western States";
export const TERRITORY_OPTIONS = [ALL_WESTERN, ...WESTERN_STATES];

export const STATE_ABBR: Record<string, string> = {
  Arizona: "AZ", California: "CA", Colorado: "CO", Idaho: "ID", Montana: "MT", Nevada: "NV",
  "New Mexico": "NM", Oregon: "OR", Utah: "UT", Washington: "WA", Wyoming: "WY", Alaska: "AK", Hawaii: "HI",
};

export const ABBR_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBR).map(([state, abbr]) => [abbr, state]),
);

// Cities and smaller industrial towns, not just major metros. Ordered roughly by
// industrial-refrigeration relevance so the first entries are searched first.
export const CITIES: Record<string, string[]> = {
  Arizona: ["Phoenix", "Tolleson", "Goodyear", "Glendale", "Chandler", "Mesa", "Tempe", "Tucson", "Yuma", "Nogales", "Casa Grande", "Buckeye", "Coolidge", "Maricopa", "Avondale", "Eloy", "Willcox", "Flagstaff", "Kingman", "Prescott Valley"],
  California: ["Vernon", "Los Angeles", "City of Industry", "Commerce", "Ontario", "Fontana", "Riverside", "Rancho Cucamonga", "Chino", "Perris", "Fresno", "Bakersfield", "Visalia", "Tulare", "Hanford", "Selma", "Kingsburg", "Modesto", "Turlock", "Merced", "Stockton", "Tracy", "Lathrop", "Manteca", "Sacramento", "West Sacramento", "Woodland", "Salinas", "Watsonville", "Gilroy", "Oxnard", "Santa Maria", "Santa Fe Springs", "Carson", "Fullerton", "Hayward", "San Leandro", "Petaluma", "Yuba City", "Chico", "El Centro", "Brawley", "Delano", "Madera"],
  Colorado: ["Denver", "Commerce City", "Aurora", "Greeley", "Fort Morgan", "Brighton", "Fort Collins", "Loveland", "Longmont", "Pueblo", "Colorado Springs", "Grand Junction", "Henderson", "Sterling", "Monte Vista", "Alamosa", "Golden"],
  Idaho: ["Boise", "Nampa", "Caldwell", "Meridian", "Kuna", "Twin Falls", "Jerome", "Gooding", "Burley", "Rupert", "Heyburn", "Paul", "American Falls", "Pocatello", "Blackfoot", "Idaho Falls", "Rexburg", "Shelley", "Aberdeen", "Payette", "Weiser", "Lewiston"],
  Montana: ["Billings", "Great Falls", "Missoula", "Bozeman", "Belgrade", "Butte", "Helena", "Kalispell", "Sidney", "Miles City"],
  Nevada: ["Las Vegas", "North Las Vegas", "Henderson", "Reno", "Sparks", "McCarran", "Fernley", "Carson City", "Elko", "Winnemucca"],
  "New Mexico": ["Albuquerque", "Rio Rancho", "Las Cruces", "Santa Teresa", "Clovis", "Portales", "Roswell", "Hobbs", "Artesia", "Farmington", "Belen", "Deming"],
  Oregon: ["Portland", "Gresham", "Clackamas", "Tualatin", "Salem", "Woodburn", "Albany", "Eugene", "Springfield", "Medford", "Klamath Falls", "Hermiston", "Boardman", "Hood River", "The Dalles", "Ontario", "Tillamook", "Astoria", "Newport", "Pendleton", "Milton-Freewater"],
  Utah: ["Salt Lake City", "West Valley City", "West Jordan", "Ogden", "Clearfield", "Logan", "Hyrum", "Smithfield", "Provo", "Spanish Fork", "American Fork", "Tooele", "Delta", "Beaver", "Cedar City", "St George", "Richfield"],
  Washington: ["Seattle", "Kent", "Auburn", "Tacoma", "Fife", "Everett", "Bellingham", "Lynden", "Burlington", "Mount Vernon", "Yakima", "Sunnyside", "Toppenish", "Grandview", "Wenatchee", "Quincy", "Moses Lake", "Othello", "Pasco", "Kennewick", "Wallula", "Walla Walla", "Spokane", "Ellensburg", "Vancouver", "Longview"],
  Wyoming: ["Cheyenne", "Casper", "Laramie", "Rock Springs", "Gillette", "Sheridan", "Riverton", "Torrington", "Worland", "Evanston"],
  Alaska: ["Anchorage", "Fairbanks", "Kodiak", "Unalaska", "Dutch Harbor", "Kenai", "Homer", "Ketchikan", "Petersburg", "Sitka", "Naknek", "Juneau", "Wasilla", "Palmer", "Cordova"],
  Hawaii: ["Honolulu", "Kapolei", "Pearl City", "Waipahu", "Hilo", "Kailua-Kona", "Kahului", "Lihue"],
};

// Industrial corridors / districts with dense food, cold-chain, and process activity.
export const CORRIDORS: Record<string, string[]> = {
  Arizona: ["West Valley industrial corridor", "Tolleson cold storage", "Nogales produce district", "Yuma Valley agriculture", "Pinal County industrial"],
  California: ["Vernon industrial district", "Inland Empire logistics", "Central Valley Highway 99", "San Joaquin Valley food processing", "Salinas Valley produce", "Imperial Valley", "Port of Oakland cold chain", "Port of Long Beach cold storage"],
  Colorado: ["Weld County food processing", "I-76 corridor", "Denver north industrial", "San Luis Valley potatoes"],
  Idaho: ["Magic Valley food processing", "Treasure Valley industrial", "Eastern Idaho potato processing"],
  Montana: ["Yellowstone County industrial", "Gallatin Valley"],
  Nevada: ["Tahoe Reno Industrial Center", "North Las Vegas industrial", "Apex Industrial Park"],
  "New Mexico": ["Santa Teresa border industrial", "Clovis Portales dairy", "Albuquerque South Valley industrial"],
  Oregon: ["Columbia River food processing", "Willamette Valley food processing", "Port of Portland cold chain", "Umatilla County food processing"],
  Utah: ["Northern Utah food processing", "Salt Lake northwest quadrant", "Cache Valley dairy"],
  Washington: ["Kent Valley warehouses", "Yakima Valley fruit storage", "Columbia Basin food processing", "Wenatchee fruit packing", "Skagit Valley", "Tri-Cities food processing"],
  Wyoming: ["Cheyenne industrial"],
  Alaska: ["Bristol Bay seafood processing", "Kodiak seafood processing", "Dutch Harbor seafood"],
  Hawaii: ["Campbell Industrial Park", "Kapolei industrial"],
};

// State agency web domains / names used for public-record discovery paths.
export const STATE_AGENCIES: Record<string, { domain: string; names: string[] }> = {
  Arizona: { domain: "azdeq.gov", names: ["ADEQ", "Maricopa County Air Quality"] },
  California: { domain: "ca.gov", names: ["CalARP", "CARB", "air district"] },
  Colorado: { domain: "colorado.gov", names: ["CDPHE", "APCD"] },
  Idaho: { domain: "idaho.gov", names: ["Idaho DEQ"] },
  Montana: { domain: "mt.gov", names: ["Montana DEQ"] },
  Nevada: { domain: "nv.gov", names: ["NDEP", "Clark County DES"] },
  "New Mexico": { domain: "nm.gov", names: ["NMED"] },
  Oregon: { domain: "oregon.gov", names: ["Oregon DEQ"] },
  Utah: { domain: "utah.gov", names: ["Utah DEQ", "Utah DAQ"] },
  Washington: { domain: "wa.gov", names: ["Washington Ecology"] },
  Wyoming: { domain: "wyo.gov", names: ["Wyoming DEQ"] },
  Alaska: { domain: "alaska.gov", names: ["ADEC"] },
  Hawaii: { domain: "hawaii.gov", names: ["Hawaii DOH Clean Air"] },
};

export function statesFor(territory: string): string[] {
  if (!territory || territory === ALL_WESTERN) return [...WESTERN_STATES];
  return (WESTERN_STATES as readonly string[]).includes(territory) ? [territory] : [...WESTERN_STATES];
}

export function isWesternState(state: string): boolean {
  return (WESTERN_STATES as readonly string[]).includes(state);
}

export function toStateName(value: string | undefined | null): string {
  const v = String(value || "").trim();
  if (!v) return "Unknown";
  if (ABBR_STATE[v.toUpperCase()]) return ABBR_STATE[v.toUpperCase()];
  const hit = WESTERN_STATES.find((s) => s.toLowerCase() === v.toLowerCase());
  return hit || v;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function detectState(text: string, hint: string): string {
  const found = WESTERN_STATES.find((s) => new RegExp(`\\b${escapeRe(s)}\\b`, "i").test(text));
  if (found) return found;
  const abbr = text.match(/,\s*(AZ|CA|CO|ID|MT|NV|NM|OR|UT|WA|WY|AK|HI)\b(?:\s+\d{5})?/);
  if (abbr) return ABBR_STATE[abbr[1]];
  return hint && hint !== ALL_WESTERN ? hint : "Unknown";
}

export function detectCity(text: string, state: string): string {
  const list = CITIES[state] || [];
  const hit = list.find((c) => new RegExp(`\\b${escapeRe(c)}\\b`, "i").test(text));
  return hit || "Unknown";
}

export function titleCase(value: string): string {
  const v = String(value || "").trim();
  if (!v) return v;
  // Only re-case strings that are ALL CAPS (government registries); keep brand casing otherwise.
  if (v !== v.toUpperCase()) return v;
  return v
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Llc|Inc|Lp|Llp|Usa|Us|Ii|Iii|Dba|Pbc)\b/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, c) => `Mc${c.toUpperCase()}`);
}
