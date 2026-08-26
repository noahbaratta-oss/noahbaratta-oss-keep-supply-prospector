export const TARGET_GROUPS: Record<string, string[]> = {
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

export const ALL_TARGET_FILTERS = Object.values(TARGET_GROUPS).flat();

export const INDUSTRY_SEARCH_ALIASES: Record<string, string[]> = {
  "Beef processing plants": ["beef processing", "beef packing", "slaughterhouse", "beef plant"],
  "Pork processing plants": ["pork processing", "pork plant", "hog processing"],
  "Poultry processing plants": ["poultry processing", "chicken processing", "turkey processing"],
  "Rendering facilities": ["rendering plant", "animal rendering", "rendering facility"],
  "Meat packing plants": ["meat packing", "meat packer", "packing plant"],
  "Sausage/processed meat manufacturers": ["sausage manufacturer", "processed meat", "ready to eat meat"],
  "Frozen meat processors": ["frozen meat", "frozen protein", "meat freezing"],
  "Further-processing facilities": ["further processing", "food further processing", "protein further processing"],
  "Distribution facilities attached to meat producers": ["meat distribution center", "protein distribution center", "meat logistics"],
  "Large butcher/processing operations": ["large butcher", "butcher processing", "custom meat processing"],
  "Cold storage warehouses": ["cold storage warehouse", "cold storage facility"],
  "Frozen food warehouses": ["frozen food warehouse", "frozen warehouse"],
  "Refrigerated distribution centers": ["refrigerated distribution center", "refrigerated DC"],
  "Temperature-controlled logistics": ["temperature controlled logistics", "temperature controlled warehouse", "cold chain logistics"],
  "3PL cold storage": ["3PL cold storage", "third party cold storage", "3pl refrigerated warehouse"],
  "Food distribution centers": ["food distribution center", "food DC", "food warehouse"],
  "Frozen storage facilities": ["frozen storage", "freezer storage facility"],
  "Produce cold storage": ["produce cold storage", "fruit cold storage", "vegetable cold storage"],
  "Meat cold storage": ["meat cold storage", "protein cold storage"],
  "Pharmaceutical cold storage": ["pharmaceutical cold storage", "pharma cold chain warehouse"],
  "Regional refrigerated warehouses": ["regional refrigerated warehouse", "refrigerated warehouse"],
  "Milk processors": ["milk processing plant", "milk processor"],
  "Cheese manufacturers": ["cheese manufacturing", "cheese plant"],
  "Yogurt manufacturers": ["yogurt manufacturing", "yogurt plant"],
  "Ice cream manufacturers": ["ice cream manufacturing", "ice cream plant"],
  "Butter producers": ["butter manufacturing", "butter plant"],
  "Powdered milk facilities": ["powdered milk", "milk powder plant", "dry dairy plant"],
  "Dairy ingredient processors": ["dairy ingredients", "dairy ingredient processing"],
  "Beverage manufacturers": ["beverage manufacturing", "beverage plant"],
  "Soft drink plants": ["soft drink plant", "carbonated beverage plant"],
  "Juice processors": ["juice processing", "juice plant"],
  "Bottling facilities": ["bottling plant", "bottling facility"],
  "Brewing companies": ["brewery", "brewing company"],
  "Large breweries": ["large brewery", "brewery production"],
  "Distilleries": ["distillery", "distilling plant"],
  "Beverage distribution": ["beverage distribution center", "drink distribution"],
  "Regional breweries": ["regional brewery", "brewery production facility"],
  "Craft breweries with significant production": ["large craft brewery", "production brewery", "high volume brewery"],
  "Spirits manufacturers": ["spirits manufacturer", "spirits production"],
  "Beverage plants": ["beverage plant", "drink manufacturing"],
  "Fermentation facilities": ["fermentation facility", "industrial fermentation"],
  "Beverage distribution centers": ["beverage distribution center", "beer distribution warehouse"],
  "Production facility": ["production facility", "manufacturing facility"],
  "Distribution center": ["distribution center", "distribution warehouse"],
  "Barrel aging": ["barrel aging", "barrel warehouse", "aging warehouse"],
  "Fermentation": ["fermentation", "fermentation plant"],
  "Packaging line": ["packaging line", "packaging plant"],
  "Cold storage": ["cold storage", "refrigerated warehouse"],
  "Industrial refrigeration": ["industrial refrigeration", "industrial refrigerating"],
  "Ammonia": ["ammonia refrigeration", "ammonia system", "anhydrous ammonia"],
  "CO₂ refrigeration": ["CO2 refrigeration", "carbon dioxide refrigeration", "transcritical CO2"],
  "Pharmaceutical manufacturing": ["pharmaceutical manufacturing", "pharma plant"],
  "Biotech manufacturing": ["biotech manufacturing", "biopharma manufacturing"],
  "Vaccine facilities": ["vaccine manufacturing", "vaccine facility"],
  "Life sciences manufacturing": ["life sciences manufacturing", "life science facility"],
  "Pharmaceutical distribution": ["pharmaceutical distribution", "pharma distribution center"],
  "Cold-chain pharmaceutical warehouses": ["pharmaceutical cold chain", "cold chain pharma warehouse"],
  "API manufacturing": ["API manufacturing", "active pharmaceutical ingredient plant"],
  "Medical product manufacturing": ["medical product manufacturing", "medical device manufacturing"],
  "Specialty chemical/pharmaceutical facilities": ["specialty chemical pharmaceutical", "specialty pharma facility"],
  "Chemical manufacturing": ["chemical manufacturing", "chemical plant"],
  "Plastics manufacturing": ["plastics manufacturing", "plastics plant"],
  "Rubber manufacturing": ["rubber manufacturing", "rubber plant"],
  "Industrial gases": ["industrial gases", "industrial gas plant"],
  "Chemical processing": ["chemical processing", "process chemical plant"],
  "Large-scale manufacturing": ["large scale manufacturing", "large manufacturing facility"],
  "Process cooling facilities": ["process cooling", "industrial process cooling"],
  "Industrial freezing": ["industrial freezing", "industrial freezer"],
  "Thermal processing": ["thermal processing", "thermal processing plant"],
  "Food ingredient manufacturing": ["food ingredient manufacturing", "food ingredients plant"],
  "Industrial production facilities": ["industrial production facility", "manufacturing facility"],
  "Industrial refrigeration contractors": ["industrial refrigeration contractor", "industrial refrigeration installer"],
  "Industrial refrigeration service companies": ["industrial refrigeration service", "refrigeration service company"],
  "Ammonia refrigeration contractors": ["ammonia refrigeration contractor", "ammonia refrigeration service"],
  "Commercial refrigeration contractors": ["commercial refrigeration contractor", "commercial refrigeration service"],
  "Refrigeration engineering firms": ["refrigeration engineering", "refrigeration engineer"],
  "HVAC/R contractors specializing in industrial systems": ["industrial HVACR contractor", "industrial HVAC refrigeration"],
  "Refrigeration maintenance companies": ["refrigeration maintenance", "industrial refrigeration maintenance"],
  "Refrigeration system integrators": ["refrigeration system integrator", "refrigeration controls integrator"],
  "Industrial mechanical contractors": ["industrial mechanical contractor", "mechanical contractor refrigeration"],
  "Refrigeration equipment installers": ["refrigeration equipment installer", "industrial refrigeration installer"]
};
