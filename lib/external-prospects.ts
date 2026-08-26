export type ExternalProspect = {
  accountId: number;
  name: string;
  state: string;
  industry: string;
  refrigeration: string;
  priorityScore?: number;
  estimatedPartsOpportunity?: string;
  equipmentBrands?: string[];
  buyerType?: string;
  coldCallPriority?: string;
  territoryAssignment?: string;
  salesApproach?: string;
  source: string;
};

const row = (accountId: number, name: string, state: string, industry: string, refrigeration: string, priorityScore: number, estimatedPartsOpportunity: string, equipmentBrands: string, buyerType: string, coldCallPriority: string, territoryAssignment: string, salesApproach: string): ExternalProspect => ({ accountId, name, state, industry, refrigeration, priorityScore, estimatedPartsOpportunity, equipmentBrands: equipmentBrands.split(";").map((x) => x.trim()).filter(Boolean), buyerType, coldCallPriority, territoryAssignment, salesApproach, source: "Keep Supply imported prospect list" });

export const EXTERNAL_PROSPECTS: ExternalProspect[] = [
  row(1,"Lineage Logistics","Arizona","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Mycom;BAC;Evapco;Danfoss","Refrigeration Manager / MRO Buyer","High","AZ","Lead with OEM replacement parts, valves, controls"),
  row(2,"Americold Logistics","Arizona","Cold Storage","NH3",5,"25000-100000","Frick;Vilter;GEA;Hansen;Parker","Chief Engineer / MRO","High","AZ","Target critical spare parts program"),
  row(3,"Preferred Freezer Services","Arizona","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Evapco;BAC","Engineering Manager","High","AZ","Position as emergency parts supplier"),
  row(4,"United States Cold Storage","Arizona","Cold Storage","NH3",5,"25000-75000","Vilter;Frick;Danfoss;Hansen","Maintenance Manager","High","AZ","Focus on uptime and obsolete parts"),
  row(5,"Yuma Cold Storage","Arizona","Cold Storage","NH3/HFC",4,"10000-50000","Frick;Vilter;Hansen","Refrigeration Supervisor","High","AZ","Agricultural cold storage opportunity"),
  row(6,"United Dairymen of Arizona","Arizona","Dairy","NH3",5,"25000-100000","GEA;Frick;Vilter;Alfa Laval","Plant Engineer","High","AZ","Target ammonia system components"),
  row(7,"Shamrock Farms","Arizona","Dairy","NH3",5,"25000-100000","Frick;Vilter;Evapco","Engineering Manager","High","AZ","Large dairy refrigeration user"),
  row(8,"FreshPoint Houston","Texas","Produce Distribution","NH3/HFC",4,"10000-50000","Frick;BAC;Evapco","Facilities Manager","Medium","TX","Cold chain parts program"),
  row(9,"Lineage Logistics","Texas","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Mycom;Danfoss","Chief Engineer","High","TX","National account approach"),
  row(10,"Americold Logistics","Texas","Cold Storage","NH3",5,"25000-100000","Frick;Vilter;Hansen","Refrigeration Manager","High","TX","Multi-site parts agreement"),
  row(11,"JBS USA","Texas","Protein Processing","NH3",5,"25000-100000","Frick;Vilter;GEA;BAC","Chief Engineer","High","TX","Protein processing ammonia systems"),
  row(12,"Tyson Foods","Texas","Protein Processing","NH3",5,"25000-100000","Frick;Vilter;GEA","Maintenance Manager","High","TX","National MRO opportunity"),
  row(13,"Pilgrim's Pride","Texas","Poultry Processing","NH3",5,"25000-100000","Frick;Vilter;Hansen","Refrigeration Manager","High","TX","High uptime requirements"),
  row(14,"Ruiz Foods","Texas","Frozen Foods","NH3/HFC",4,"10000-50000","Frick;Vilter;BAC","Plant Engineer","Medium","TX","Frozen food refrigeration"),
  row(15,"Blue Bell Creameries","Texas","Frozen Foods","NH3/HFC",4,"10000-50000","Frick;Evapco;Danfoss","Maintenance Manager","Medium","TX","Frozen product systems"),
  row(16,"Southwest Cheese","New Mexico","Dairy","NH3",5,"25000-100000","GEA;Frick;Vilter","Chief Engineer","High","NM","Large ammonia dairy system"),
  row(17,"Dairy Farmers of America","New Mexico","Dairy","NH3",5,"25000-100000","GEA;Vilter;Hansen","Engineering Manager","High","NM","Cooperative dairy target"),
  row(18,"Lamb Weston","Idaho","Frozen Foods","NH3",5,"25000-100000","Frick;Vilter;Evapco","Plant Engineer","High","ID","Potato processing refrigeration"),
  row(19,"J.R. Simplot","Idaho","Food Processing","NH3",5,"25000-100000","Frick;Vilter;GEA","Maintenance Manager","High","ID","Industrial refrigeration user"),
  row(20,"Pacific Seafood","Oregon","Seafood Processing","NH3",5,"25000-75000","Vilter;Mycom;Evapco","Refrigeration Manager","High","OR","Seafood freezing systems"),
  row(21,"McCain Foods","Idaho","Frozen Foods","NH3",5,"25000-100000","Frick;Vilter;Evapco;BAC","Plant Engineer / MRO Buyer","High","ID","Target ammonia compressor and valve replacements"),
  row(22,"Chobani","Idaho","Dairy","NH3",5,"25000-100000","GEA;Frick;Vilter;Alfa Laval","Engineering Manager","High","ID","Lead with critical spare inventory program"),
  row(23,"Glanbia Nutritionals","Idaho","Dairy/Nutrition","NH3",5,"25000-75000","GEA;Vilter;Frick","Maintenance Manager","High","ID","Focus on process refrigeration uptime"),
  row(24,"High Desert Milk","Idaho","Dairy","NH3",4,"10000-50000","Frick;Vilter;Hansen","Chief Engineer","Medium","ID","Offer ammonia valve and control replacements"),
  row(25,"Idaho Milk Products","Idaho","Dairy","NH3",5,"25000-75000","GEA;Frick;Vilter","Refrigeration Manager","High","ID","Target dairy refrigeration components"),
  row(26,"Lineage Logistics","Oregon","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Mycom;Danfoss","Regional Engineering Director","High","OR","Pursue multi-site parts agreement"),
  row(27,"Americold Logistics","Oregon","Cold Storage","NH3",5,"25000-100000","Frick;Vilter;Hansen","Refrigeration Manager","High","OR","Emergency replacement parts program"),
  row(28,"Pacific Seafood","Oregon","Seafood Processing","NH3",5,"25000-75000","Vilter;Mycom;BAC","Chief Engineer","High","OR","Target freezer system components"),
  row(29,"Ocean Beauty Seafoods","Oregon","Seafood Processing","NH3",4,"10000-50000","Vilter;Evapco;Hansen","Maintenance Manager","Medium","OR","Seafood refrigeration service support"),
  row(30,"Tillamook Creamery","Oregon","Dairy","NH3",5,"25000-100000","GEA;Frick;Alfa Laval","Plant Engineering","High","OR","Large dairy refrigeration opportunity"),
  row(31,"Columbia Basin Cold Storage","Washington","Cold Storage","NH3/HFC",4,"10000-50000","Frick;Vilter;BAC","Facility Manager","Medium","West Expansion","Cold storage parts supplier pitch"),
  row(32,"Washington Potato Processors","Washington","Frozen Foods","NH3",5,"25000-75000","Frick;Vilter;Evapco","Plant Engineer","High","West Expansion","Potato processing ammonia systems"),
  row(33,"Colorado Cold Storage Partners","Colorado","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Danfoss","Chief Engineer","High","CO","Target compressor and controls"),
  row(34,"Colorado Food Distribution","Colorado","Food Distribution","NH3/HFC",4,"10000-50000","Frick;BAC;Evapco","Facilities Director","Medium","CO","Distribution refrigeration support"),
  row(35,"Rocky Mountain Cold Storage","Colorado","Cold Storage","NH3",4,"10000-50000","Frick;Hansen;Parker","Maintenance Manager","Medium","CO","Regional account development"),
  row(36,"Lineage Logistics","Nevada","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Mycom","Chief Engineer","High","NV","National account penetration"),
  row(37,"Americold Logistics","Nevada","Cold Storage","NH3",5,"25000-100000","Frick;GEA;Hansen","Refrigeration Manager","High","NV","Multi-location opportunity"),
  row(38,"Arctic Glacier","Nevada","Ice Manufacturing","NH3/HFC",5,"25000-75000","Vilter;Frick;Evapco","Plant Engineer","High","NV","High-cycle equipment parts"),
  row(39,"Reddy Ice","Nevada","Ice Manufacturing","NH3/HFC",5,"25000-75000","Vilter;Frick;BAC","Maintenance Manager","High","NV","Target wear parts and controls"),
  row(40,"Golden West Food Group","Nevada","Food Distribution","NH3/HFC",4,"10000-50000","Frick;Danfoss;Evapco","Facilities Manager","Medium","NV","Cold distribution opportunity"),
  row(41,"Cargill Protein","Texas","Protein Processing","NH3",5,"50000-150000","Frick;Vilter;GEA","Engineering Director","High","TX","Strategic account target"),
  row(42,"JBS USA","Texas","Protein Processing","NH3",5,"50000-150000","Frick;Vilter;Hansen","MRO Purchasing Manager","High","TX","Large ammonia system opportunity"),
  row(43,"Tyson Foods","Texas","Protein Processing","NH3",5,"50000-150000","Frick;Vilter;GEA","Refrigeration Manager","High","TX","National parts supplier approach"),
  row(44,"Pilgrim's Pride","Texas","Poultry Processing","NH3",5,"50000-150000","Frick;Vilter;Evapco","Maintenance Director","High","TX","Critical uptime account"),
  row(45,"Hilmar Cheese","Texas","Dairy","NH3",5,"25000-100000","GEA;Frick;Vilter","Plant Engineer","High","TX","Large dairy refrigeration"),
  row(46,"Schreiber Foods","Texas","Dairy/NH3","NH3",5,"25000-100000","GEA;Frick;Alfa Laval","Engineering Manager","High","TX","Target controls and valves"),
  row(47,"Performance Food Group","Texas","Food Distribution","NH3/HFC",4,"10000-50000","Frick;BAC;Danfoss","Facilities Manager","Medium","TX","Distribution centers"),
  row(48,"US Foods","Texas","Food Distribution","NH3/HFC",4,"10000-50000","Frick;Vilter;BAC","Maintenance Manager","Medium","TX","Cold chain parts opportunity"),
  row(49,"Sysco","Texas","Food Distribution","NH3/HFC",4,"10000-50000","Frick;Evapco;Danfoss","Facilities Director","Medium","TX","Warehouse refrigeration"),
  row(50,"FreshPoint","Texas","Produce Distribution","NH3/HFC",4,"10000-50000","Frick;BAC;Evapco","Cooling Manager","Medium","TX","Produce cold storage"),
  row(51,"Southwest Cheese","New Mexico","Dairy","NH3",5,"25000-100000","GEA;Frick;Vilter","Chief Engineer","High","NM","Large ammonia dairy operation"),
  row(52,"Leprino Foods","New Mexico","Dairy","NH3",5,"25000-100000","GEA;Frick;Alfa Laval","Plant Engineering","High","NM","Cheese manufacturing target"),
  row(53,"Lineage Logistics","New Mexico","Cold Storage","NH3/CO2",4,"10000-50000","Frick;Vilter;Danfoss","Regional Engineering","Medium","NM","Cold storage expansion"),
  row(54,"Shamrock Foods","New Mexico","Food Distribution","NH3/HFC",4,"10000-50000","Frick;BAC;Evapco","Facilities Manager","Medium","NM","Foodservice distribution"),
  row(55,"Del Monte Fresh Produce","Arizona","Produce Processing","NH3/HFC",5,"25000-75000","Frick;Vilter;BAC","Plant Engineer","High","AZ","Produce refrigeration target"),
  row(56,"Taylor Farms","Arizona","Produce Processing","NH3/HFC",5,"25000-75000","Frick;Evapco;Danfoss","Maintenance Manager","High","AZ","Fresh processing refrigeration"),
  row(57,"Frito-Lay","Arizona","Food Manufacturing","NH3/HFC",4,"10000-50000","Frick;Vilter;Controls","Engineering Manager","Medium","AZ","Large manufacturing site"),
  row(58,"PepsiCo Beverages","Arizona","Beverage","HFC",4,"10000-50000","Carrier;Trane;Danfoss","Facilities Manager","Medium","AZ","Process cooling parts"),
  row(59,"United Dairymen of Arizona","Arizona","Dairy","NH3",5,"25000-100000","GEA;Frick;Vilter","Chief Engineer","High","AZ","Major ammonia user"),
  row(60,"Shamrock Farms","Arizona","Dairy","NH3",5,"25000-100000","Frick;Vilter;Evapco","Engineering Director","High","AZ","Large dairy refrigeration"),
  row(61,"Lineage Logistics","Texas","Cold Storage","NH3/CO2",5,"25000-100000","Frick;Vilter;Mycom;Danfoss","Regional Engineering Director","High","TX","National account approach; target parts standardization")
];
