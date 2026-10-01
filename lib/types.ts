// Shared prospect data model (client + server).

export type AmmoniaStatus = "Confirmed" | "Likely" | "Unknown" | "None indicated";
export type Priority = "A" | "B" | "C";
export type Confidence = "High" | "Medium" | "Low";

export type Evidence = {
  label: string;      // short statement, e.g. "EPA TRI: ammonia reported (2024)"
  detail?: string;    // supporting excerpt or data
  url?: string;       // public source
  source: string;     // provider name
  kind?: "government" | "registry" | "web" | "document" | "seed" | "osm" | "inferred";
};

export type Prospect = {
  key: string;                 // facility-level dedupe key (Lifetime key)
  recordId?: string;           // unique id for this discovery record (search results)
  name: string;                // company / operator name
  facilityName?: string;       // facility / DBA name if different
  city: string;
  state: string;
  address?: string;            // street address when publicly available
  zip?: string;
  phone?: string;              // only when published by the source (FSIS / OSM / TRI)
  website?: string;
  lat?: number;
  lon?: number;
  industry: string;
  facilityType: string;
  refrigeration: string;
  ammonia: AmmoniaStatus;
  ammoniaLb?: number | null;   // only when a public document states a quantity
  ammoniaLbSource?: string;
  co2?: boolean;
  otherSignals?: string[];
  equipmentBrands?: string[];
  brandsSource?: string;       // "Keep Supply list" | "public web mention"
  evidence: Evidence[];
  sourceUrls: string[];
  providers: string[];         // distinct providers that surfaced this facility
  evidenceSources: number;     // distinct supporting sources
  confidence: Confidence;
  score: number;
  priority: Priority;
  reason: string;
  targetCategories?: string[];
  naics?: string[];
  sizeClass?: string;          // e.g. FSIS HACCP size
  parentCompany?: string;
  registryIds?: string[];      // EPA FRS registry, FSIS establishment number, TRI id…
  // Keep Supply seed / sales fields (only from the imported list or user edits)
  estimatedPartsOpportunity?: string;
  buyerType?: string;
  likelyBuyerType?: string;    // inferred, always labeled as inferred in UI
  coldCallPriority?: string;
  territoryAssignment?: string;
  salesApproach?: string;
  inSeedList?: boolean;
  seedPriorityScore?: number;
  source?: string;             // primary source label
  // Lifecycle
  isNew?: boolean;
  saved?: boolean;
  firstSeen?: number;
  lastSeen?: number;
  timesSeen?: number;
  lastResearched?: number;
};

export type ProviderLog = {
  provider: string;
  ok: boolean;
  status: "ok" | "empty" | "blocked" | "error" | "skipped" | "disabled";
  count: number;
  ms: number;
  detail?: string;
};

export type DiscoverTask =
  | { id: string; kind: "fsis"; states: string[]; label: string }
  | { id: string; kind: "tri"; state: string; label: string }
  | { id: string; kind: "rmp"; state: string; label: string }
  | { id: string; kind: "echo"; state: string; naics: string[]; label: string }
  | { id: string; kind: "osm"; state: string; label: string }
  | { id: string; kind: "web"; state: string; queries: string[]; label: string };

export type DiscoverRequest = {
  task: DiscoverTask;
  targets: string[];
  ammoniaOnly: boolean;
  providers: Record<string, boolean>;
};

export type DiscoverResponse = {
  records: Prospect[];
  rawHits: number;
  diagnostics: ProviderLog[];
  leadPages?: number;
};
