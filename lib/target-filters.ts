// Target Filters: the single source of truth for target categories.
//
// Each target type maps to:
//   aliases → public-web search terms
//   naics   → NAICS codes used for EPA ECHO / TRI facility discovery
//   osm     → OpenStreetMap tag clauses (Overpass) — optional
//   fsis    → include USDA FSIS inspected meat/poultry establishments
//
// To add a new target type later: add it to a group in TARGET_GROUPS and give it a
// TARGET_DEFS entry. Custom target types added in the UI work without a def — their
// label is used as the search term.

export type TargetDef = {
  aliases: string[];
  naics?: string[];
  osm?: string[];
  fsis?: "meat" | "poultry" | "any";
};

export const TARGET_GROUPS: Record<string, string[]> = {
  "Meat / Protein": [
    "Beef processing plants", "Pork processing plants", "Poultry processing plants", "Rendering facilities",
    "Meat packing plants", "Sausage/processed meat manufacturers", "Frozen meat processors",
    "Further-processing facilities", "Distribution facilities attached to meat producers",
    "Large butcher/processing operations",
  ],
  "Cold Storage / Distribution": [
    "Cold storage warehouses", "Frozen food warehouses", "Refrigerated distribution centers",
    "Temperature-controlled logistics", "3PL cold storage", "Food distribution centers", "Frozen storage facilities",
    "Produce cold storage", "Meat cold storage", "Pharmaceutical cold storage", "Regional refrigerated warehouses",
  ],
  Dairy: [
    "Milk processors", "Cheese manufacturers", "Yogurt manufacturers", "Ice cream manufacturers", "Butter producers",
    "Powdered milk facilities", "Dairy ingredient processors",
  ],
  Beverage: [
    "Beverage manufacturers", "Soft drink plants", "Juice processors", "Bottling facilities", "Brewing companies",
    "Large breweries", "Distilleries", "Beverage distribution",
  ],
  "Brewing / Distilling": [
    "Large breweries", "Regional breweries", "Craft breweries with significant production", "Distilleries",
    "Spirits manufacturers", "Beverage plants", "Fermentation facilities", "Beverage distribution centers",
  ],
  "Facility / System Signals": [
    "Production facility", "Distribution center", "Barrel aging", "Fermentation", "Packaging line", "Cold storage",
    "Industrial refrigeration", "Ammonia", "CO₂ refrigeration",
  ],
  "Pharma / Life Sciences": [
    "Pharmaceutical manufacturing", "Biotech manufacturing", "Vaccine facilities", "Life sciences manufacturing",
    "Pharmaceutical distribution", "Cold-chain pharmaceutical warehouses", "API manufacturing",
    "Medical product manufacturing", "Specialty chemical/pharmaceutical facilities",
  ],
  "Chemical / Industrial": [
    "Chemical manufacturing", "Plastics manufacturing", "Rubber manufacturing", "Industrial gases",
    "Chemical processing", "Large-scale manufacturing", "Process cooling facilities", "Industrial freezing",
    "Thermal processing", "Food ingredient manufacturing", "Industrial production facilities",
  ],
  "Refrigeration Contractors": [
    "Industrial refrigeration contractors", "Industrial refrigeration service companies",
    "Ammonia refrigeration contractors", "Commercial refrigeration contractors", "Refrigeration engineering firms",
    "HVAC/R contractors specializing in industrial systems", "Refrigeration maintenance companies",
    "Refrigeration system integrators", "Industrial mechanical contractors", "Refrigeration equipment installers",
  ],
  // Added: heavy industrial-refrigeration users that are common in the Western territory
  // (Idaho/Washington potato & fruit, Alaska/Pacific seafood) and in the Keep Supply seed list.
  "Seafood / Produce / Frozen Foods": [
    "Seafood processors", "Frozen food manufacturers", "Potato and vegetable processors", "Fruit packing and storage",
    "Ice manufacturing", "Wineries with production cellars",
  ],
};

// Exact tag matches first (indexed on Overpass), then a name filter — far faster than a value regex.
const OSM_COLD_NAMES = `nwr["building"="warehouse"]["name"~"cold storage|refrigerat|freez|frozen|cold chain",i]`;
const OSM_COLD_NAMES_IND = `nwr["building"="industrial"]["name"~"cold storage|refrigerat|freez|frozen",i]`;
const OSM_FOOD_PLANT_NAMES = `nwr["building"="industrial"]["name"~"packing|processing|foods|meats|creamery|dairy|cheese",i]`;

export const TARGET_DEFS: Record<string, TargetDef> = {
  // Meat / Protein
  "Beef processing plants": { aliases: ["beef processing plant", "beef packing plant", "cattle slaughter plant"], naics: ["311611", "311612"], osm: [`nwr["industrial"="slaughterhouse"]`], fsis: "meat" },
  "Pork processing plants": { aliases: ["pork processing plant", "hog processing", "pork packing"], naics: ["311611", "311612"], osm: [`nwr["industrial"="slaughterhouse"]`], fsis: "meat" },
  "Poultry processing plants": { aliases: ["poultry processing plant", "chicken processing plant", "turkey processing"], naics: ["311615"], fsis: "poultry" },
  "Rendering facilities": { aliases: ["rendering plant", "animal rendering facility"], naics: ["311613"] },
  "Meat packing plants": { aliases: ["meat packing plant", "meat packer", "meat processing plant"], naics: ["311611", "311612"], osm: [`nwr["industrial"="slaughterhouse"]`], fsis: "meat" },
  "Sausage/processed meat manufacturers": { aliases: ["sausage manufacturer", "processed meat manufacturer", "ready-to-eat meat plant"], naics: ["311612"], fsis: "meat" },
  "Frozen meat processors": { aliases: ["frozen meat processor", "frozen protein processing"], naics: ["311612", "311615"], fsis: "any" },
  "Further-processing facilities": { aliases: ["further processing plant", "protein further processing"], naics: ["311612", "311615", "311991"], fsis: "any" },
  "Distribution facilities attached to meat producers": { aliases: ["meat distribution center", "protein distribution center"], naics: ["424470", "424440"], fsis: "any" },
  "Large butcher/processing operations": { aliases: ["meat processing company", "custom meat processing plant"], naics: ["311612"], fsis: "meat" },

  // Cold storage / distribution
  "Cold storage warehouses": { aliases: ["cold storage warehouse", "cold storage facility"], naics: ["493120"], osm: [OSM_COLD_NAMES, OSM_COLD_NAMES_IND] },
  "Frozen food warehouses": { aliases: ["frozen food warehouse", "freezer warehouse"], naics: ["493120", "424420"], osm: [OSM_COLD_NAMES, OSM_COLD_NAMES_IND] },
  "Refrigerated distribution centers": { aliases: ["refrigerated distribution center", "refrigerated warehouse"], naics: ["493120"], osm: [OSM_COLD_NAMES, OSM_COLD_NAMES_IND] },
  "Temperature-controlled logistics": { aliases: ["temperature controlled warehouse", "cold chain logistics"], naics: ["493120"] },
  "3PL cold storage": { aliases: ["3PL cold storage", "third party cold storage"], naics: ["493120"] },
  "Food distribution centers": { aliases: ["food distribution center", "foodservice distribution center"], naics: ["424410", "424420", "424430", "424480"] },
  "Frozen storage facilities": { aliases: ["frozen storage facility", "freezer storage"], naics: ["493120"], osm: [OSM_COLD_NAMES, OSM_COLD_NAMES_IND] },
  "Produce cold storage": { aliases: ["produce cold storage", "fruit cold storage", "controlled atmosphere storage"], naics: ["493120", "424480", "115114"] },
  "Meat cold storage": { aliases: ["meat cold storage", "protein cold storage"], naics: ["493120", "424470"] },
  "Pharmaceutical cold storage": { aliases: ["pharmaceutical cold storage", "pharma cold chain warehouse"], naics: ["493120", "424210"] },
  "Regional refrigerated warehouses": { aliases: ["refrigerated warehouse", "public refrigerated warehouse"], naics: ["493120"], osm: [OSM_COLD_NAMES, OSM_COLD_NAMES_IND] },

  // Dairy
  "Milk processors": { aliases: ["milk processing plant", "fluid milk plant"], naics: ["311511"], osm: [`nwr["industrial"="dairy"]`] },
  "Cheese manufacturers": { aliases: ["cheese plant", "cheese manufacturing"], naics: ["311513"], osm: [`nwr["industrial"="dairy"]`] },
  "Yogurt manufacturers": { aliases: ["yogurt plant", "yogurt manufacturing"], naics: ["311511"] },
  "Ice cream manufacturers": { aliases: ["ice cream plant", "ice cream manufacturing"], naics: ["311520"] },
  "Butter producers": { aliases: ["butter plant", "creamery butter"], naics: ["311512"] },
  "Powdered milk facilities": { aliases: ["milk powder plant", "dry dairy plant"], naics: ["311514"] },
  "Dairy ingredient processors": { aliases: ["dairy ingredients plant", "whey processing plant"], naics: ["311514", "311511"] },

  // Beverage
  "Beverage manufacturers": { aliases: ["beverage manufacturing plant", "beverage plant"], naics: ["312111", "312112"] },
  "Soft drink plants": { aliases: ["soft drink bottling plant", "carbonated beverage plant"], naics: ["312111"] },
  "Juice processors": { aliases: ["juice processing plant", "juice plant"], naics: ["311411", "311421"] },
  "Bottling facilities": { aliases: ["bottling plant", "bottling facility"], naics: ["312111", "312112"] },
  "Brewing companies": { aliases: ["brewery", "brewing company"], naics: ["312120"], osm: [`nwr["industrial"="brewery"]`] },
  "Large breweries": { aliases: ["large brewery", "production brewery"], naics: ["312120"], osm: [`nwr["industrial"="brewery"]`] },
  Distilleries: { aliases: ["distillery", "distilling company"], naics: ["312140"], osm: [`nwr["craft"="distillery"]`, `nwr["industrial"="distillery"]`] },
  "Beverage distribution": { aliases: ["beverage distribution center", "beer distributor warehouse"], naics: ["424810", "424820"] },

  // Brewing / distilling
  "Regional breweries": { aliases: ["regional brewery", "brewery production facility"], naics: ["312120"], osm: [`nwr["craft"="brewery"]`] },
  "Craft breweries with significant production": { aliases: ["craft brewery production facility", "packaging brewery"], naics: ["312120"], osm: [`nwr["craft"="brewery"]`] },
  "Spirits manufacturers": { aliases: ["spirits manufacturer", "spirits production facility"], naics: ["312140"] },
  "Beverage plants": { aliases: ["beverage plant", "drink manufacturing plant"], naics: ["312111", "312112", "312120"] },
  "Fermentation facilities": { aliases: ["fermentation facility", "industrial fermentation"], naics: ["312120", "312130", "325414"] },
  "Beverage distribution centers": { aliases: ["beverage distribution center", "beer distribution warehouse"], naics: ["424810", "424820"] },

  // Facility / system signals (used as search terms; ECHO/TRI via related NAICS)
  "Production facility": { aliases: ["food production facility", "production plant"] },
  "Distribution center": { aliases: ["refrigerated distribution center", "food distribution center"], naics: ["493120"] },
  "Barrel aging": { aliases: ["barrel aging warehouse", "barrel house"], naics: ["312140"] },
  Fermentation: { aliases: ["fermentation plant", "fermentation cellar"], naics: ["312120", "312130"] },
  "Packaging line": { aliases: ["food packaging plant", "packaging line refrigeration"] },
  "Cold storage": { aliases: ["cold storage", "refrigerated warehouse"], naics: ["493120"], osm: [OSM_COLD_NAMES, OSM_COLD_NAMES_IND] },
  "Industrial refrigeration": { aliases: ["industrial refrigeration", "industrial refrigeration system"] },
  Ammonia: { aliases: ["ammonia refrigeration", "anhydrous ammonia refrigeration system", "ammonia RMP"] },
  "CO₂ refrigeration": { aliases: ["CO2 refrigeration", "transcritical CO2 refrigeration", "carbon dioxide refrigeration"] },

  // Pharma / life sciences
  "Pharmaceutical manufacturing": { aliases: ["pharmaceutical manufacturing facility", "pharmaceutical plant"], naics: ["325412", "325411"] },
  "Biotech manufacturing": { aliases: ["biotech manufacturing facility", "biologics manufacturing"], naics: ["325414"] },
  "Vaccine facilities": { aliases: ["vaccine manufacturing facility"], naics: ["325414"] },
  "Life sciences manufacturing": { aliases: ["life sciences manufacturing facility"], naics: ["325413", "325414"] },
  "Pharmaceutical distribution": { aliases: ["pharmaceutical distribution center"], naics: ["424210"] },
  "Cold-chain pharmaceutical warehouses": { aliases: ["pharmaceutical cold chain warehouse"], naics: ["424210", "493120"] },
  "API manufacturing": { aliases: ["active pharmaceutical ingredient manufacturing"], naics: ["325411"] },
  "Medical product manufacturing": { aliases: ["medical product manufacturing facility"], naics: ["339112", "339113"] },
  "Specialty chemical/pharmaceutical facilities": { aliases: ["specialty chemical plant", "specialty pharmaceutical facility"], naics: ["325199", "325412"] },

  // Chemical / industrial
  "Chemical manufacturing": { aliases: ["chemical manufacturing plant", "chemical plant"], naics: ["325199", "325188", "325180"], osm: [`nwr["industrial"="chemical"]`] },
  "Plastics manufacturing": { aliases: ["plastics manufacturing plant"], naics: ["325211", "326199"] },
  "Rubber manufacturing": { aliases: ["rubber manufacturing plant"], naics: ["326299", "325212"] },
  "Industrial gases": { aliases: ["industrial gas plant", "air separation plant", "CO2 plant"], naics: ["325120"] },
  "Chemical processing": { aliases: ["chemical processing plant"], naics: ["325199", "325998"] },
  "Large-scale manufacturing": { aliases: ["large manufacturing plant", "manufacturing facility process cooling"] },
  "Process cooling facilities": { aliases: ["process cooling", "process chiller plant"] },
  "Industrial freezing": { aliases: ["industrial freezing", "blast freezer", "IQF freezing"], naics: ["311411", "311412"] },
  "Thermal processing": { aliases: ["thermal processing plant", "food canning plant"], naics: ["311421", "311422"] },
  "Food ingredient manufacturing": { aliases: ["food ingredient manufacturing", "flavor manufacturing plant"], naics: ["311942", "311930", "311999"] },
  "Industrial production facilities": { aliases: ["industrial production facility"] },

  // Refrigeration contractors (mostly discovered through web + OSM)
  "Industrial refrigeration contractors": { aliases: ["industrial refrigeration contractor"], osm: [`nwr["craft"="hvac"]["name"~"refrigerat",i]`, `nwr["name"~"refrigeration",i]["office"]`] },
  "Industrial refrigeration service companies": { aliases: ["industrial refrigeration service company"] },
  "Ammonia refrigeration contractors": { aliases: ["ammonia refrigeration contractor", "ammonia refrigeration service"] },
  "Commercial refrigeration contractors": { aliases: ["commercial refrigeration contractor"], osm: [`nwr["craft"="hvac"]["name"~"refrigerat",i]`] },
  "Refrigeration engineering firms": { aliases: ["refrigeration engineering firm", "ammonia refrigeration engineering"] },
  "HVAC/R contractors specializing in industrial systems": { aliases: ["industrial HVACR contractor"] },
  "Refrigeration maintenance companies": { aliases: ["refrigeration maintenance company"] },
  "Refrigeration system integrators": { aliases: ["refrigeration controls integrator", "refrigeration system integrator"] },
  "Industrial mechanical contractors": { aliases: ["industrial mechanical contractor refrigeration"] },
  "Refrigeration equipment installers": { aliases: ["refrigeration equipment installer"] },

  // Seafood / produce / frozen foods
  "Seafood processors": { aliases: ["seafood processing plant", "fish processing plant"], naics: ["311710"], osm: [OSM_FOOD_PLANT_NAMES] },
  "Frozen food manufacturers": { aliases: ["frozen food manufacturer", "frozen food plant"], naics: ["311411", "311412"] },
  "Potato and vegetable processors": { aliases: ["potato processing plant", "vegetable processing plant"], naics: ["311411", "311423", "311991"] },
  "Fruit packing and storage": { aliases: ["fruit packing house", "fruit storage warehouse", "apple storage"], naics: ["115114", "424480"], osm: [OSM_FOOD_PLANT_NAMES] },
  "Ice manufacturing": { aliases: ["ice manufacturing plant", "packaged ice plant"], naics: ["312113"] },
  "Wineries with production cellars": { aliases: ["winery production facility", "wine production cellar"], naics: ["312130"], osm: [`nwr["craft"="winery"]`] },
};

export const ALL_TARGET_FILTERS = [...new Set(Object.values(TARGET_GROUPS).flat())];

// Backwards-compatible export (earlier routes import this).
export const INDUSTRY_SEARCH_ALIASES: Record<string, string[]> = Object.fromEntries(
  Object.entries(TARGET_DEFS).map(([k, v]) => [k, v.aliases]),
);

// Defaults used when no target filter is selected: the core industrial-refrigeration markets.
export const DEFAULT_TARGETS = [
  "Cold storage warehouses", "Refrigerated distribution centers", "Beef processing plants", "Poultry processing plants",
  "Meat packing plants", "Milk processors", "Cheese manufacturers", "Ice cream manufacturers", "Large breweries",
  "Beverage manufacturers", "Frozen food manufacturers", "Potato and vegetable processors", "Seafood processors",
  "Produce cold storage", "Food distribution centers", "Industrial refrigeration contractors", "Distilleries",
  "Pharmaceutical cold storage", "Industrial gases", "Rendering facilities",
];

export function defFor(target: string): TargetDef {
  return TARGET_DEFS[target] || { aliases: [target.toLowerCase()] };
}

export function aliasesFor(targets: string[]): string[] {
  return [...new Set(targets.flatMap((t) => defFor(t).aliases))];
}

export function naicsFor(targets: string[]): string[] {
  return [...new Set(targets.flatMap((t) => defFor(t).naics || []))];
}

export function osmClausesFor(targets: string[]): string[] {
  return [...new Set(targets.flatMap((t) => defFor(t).osm || []))];
}

export function fsisModeFor(targets: string[]): "all" | "meat" | "poultry" | "none" {
  const modes = new Set(targets.map((t) => defFor(t).fsis).filter(Boolean));
  if (!modes.size) return "none";
  if (modes.has("any") || (modes.has("meat") && modes.has("poultry"))) return "all";
  return modes.has("meat") ? "meat" : "poultry";
}
