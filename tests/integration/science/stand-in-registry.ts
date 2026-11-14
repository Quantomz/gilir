import type { CropProfile, RegistryLookup, RegistryRelease, RegistryResolution } from "@/contracts/registry";
import { syntheticRegistrySchema } from "@/contracts/registry";

export const standInLabel = "Synthetic I2 stand-in registry. Parameters copied from the unmerged E1 branch (FAO-56 Tables 11 and 12). Not published crop evidence.";

type Bounds = { westDeg: number; eastDeg: number; southDeg: number; northDeg: number };
type Stages = { initial: number; development: number; middle: number; late: number };
type Rule = CropProfile["temperatureRules"][number];

const box = (westDeg: number, eastDeg: number, southDeg: number, northDeg: number): Bounds => ({ westDeg, eastDeg, southDeg, northDeg });
const regions = {
  idaho: box(-117.3, -111.0, 42.0, 49.0),
  california: box(-124.5, -114.1, 32.5, 42.0),
  spain: box(-9.4, 3.4, 36.0, 43.8),
  nigeria: box(2.6, 14.7, 4.2, 13.9),
  mediterranean: box(-10.0, 37.0, 30.0, 46.0),
};

const table11 = ["fao56-table11"];
const table12 = ["fao56-table12"];
const crops = {
  maize: { cropPurposeId: "maize-grain", commonName: "Maize (grain)", scientificName: "Zea mays", family: "Poaceae", isLegume: false,
    version: "2", kc: { initial: 0.3, middle: 1.2, end: 0.35 } },
  bean: { cropPurposeId: "common-bean-dry", commonName: "Common bean (dry grain)", scientificName: "Phaseolus vulgaris", family: "Fabaceae", isLegume: true,
    version: "2", kc: { initial: 0.4, middle: 1.15, end: 0.35 } },
  wheat: { cropPurposeId: "wheat-grain", commonName: "Wheat (grain)", scientificName: "Triticum spp.", family: "Poaceae", isLegume: false,
    version: "3", kc: { initial: 0.7, middle: 1.15, end: 0.25 } },
};

const midRule = (id: string, variable: Rule["variable"], predicate: Rule["predicate"], thresholdC: number, sourceIds: string[]): Rule => ({
  id, scope: { kind: "stage", stage: "middle" }, period: "daily", variable, predicate, thresholdC, sourceIds, limitations: [standInLabel],
});
const rules = {
  maize: [midRule("maize-heat-mid-tmax-35", "max_c", "above", 35, ["gourdji2013", "teixeira2013"])],
  bean: [
    midRule("common-bean-heat-mid-tmax-30", "max_c", "above", 30, ["vargas2021", "silva2020"]),
    midRule("common-bean-heat-mid-tmin-20", "min_c", "above", 20, ["vargas2021", "silva2020"]),
  ],
  wheat: [
    midRule("wheat-heat-mid-tmax-34", "max_c", "above", 34, ["gourdji2013", "teixeira2013"]),
    midRule("wheat-frost-mid-tmin-minus3.5", "min_c", "at_or_below", -3.5, ["frederiks2015"]),
  ],
};

function profile(crop: keyof typeof crops, slug: string, bounds: Bounds[], stages: Stages, window: [string, string], precedence: number) {
  const c = crops[crop];
  const total = stages.initial + stages.development + stages.middle + stages.late;
  const temperatureRules = rules[crop];
  return {
    status: "synthetic", id: `${c.cropPurposeId}-fao56-${slug}`, version: c.version, cropPurposeId: c.cropPurposeId,
    commonName: c.commonName, scientificName: c.scientificName, family: c.family, isLegume: c.isLegume, purpose: "food",
    cultivarGroup: `${c.commonName}, FAO-56 Table 11 example (${total}-day season)`, productionSystem: "Field crop; FAO-56 standard conditions",
    applicability: { scope: { kind: "regional", bounds }, exclusions: [], managementAssumptions: [standInLabel] },
    precedence,
    timing: {
      generatedStageDays: stages, historicalStageAllocations: [stages],
      publishedDurationDays: { kind: "available", value: [total, total] },
      plantingWindows: [{ window: { startMonthDay: window[0], endMonthDayInclusive: window[1] }, basis: "recommendation", sourceIds: table11 }],
      turnaround: { basis: "scheduling_assumption", days: 7, assumption: "Gilir planning assumption: 7 days to clear and prepare the field after harvest." },
    },
    kc: { ...c.kc, stageInterpolation: "initial_middle_constant_development_late_linear_include_endpoints", assumptions: [standInLabel], sourceIds: table12 },
    temperatureRules, rotationRuleIds: [], preparation: [], warnings: [standInLabel],
    sourceIds: [...new Set([...table11, ...table12, ...temperatureRules.flatMap(rule => rule.sourceIds)])],
  };
}

const identity = { catalogueVersion: "i2-stand-in-fao56", ruleVersion: "i2-stand-in-no-rules" };
export const standInRegistry = syntheticRegistrySchema.parse({
  kind: "synthetic",
  label: standInLabel,
  identity,
  catalogue: { version: identity.catalogueVersion, entries: Object.values(crops).map(c => ({ id: c.cropPurposeId, label: c.commonName, purpose: "food" })) },
  sources: [],
  profiles: [
    profile("maize", "idaho-apr", [regions.idaho], { initial: 30, development: 40, middle: 50, late: 50 }, ["04-01", "04-30"], 1),
    profile("maize", "nigeria-humid-jun", [regions.nigeria], { initial: 20, development: 35, middle: 40, late: 30 }, ["06-01", "06-30"], 2),
    profile("maize", "spain-california-apr", [regions.spain, regions.california], { initial: 30, development: 40, middle: 50, late: 30 }, ["04-01", "04-30"], 3),
    profile("bean", "idaho-jun", [regions.idaho], { initial: 25, development: 25, middle: 30, late: 20 }, ["06-01", "06-30"], 1),
    profile("wheat", "mediterranean-winter-nov", [regions.mediterranean], { initial: 30, development: 140, middle: 40, late: 30 }, ["11-01", "11-30"], 4),
  ],
  rules: [],
});

const inside = ([lon, lat]: RegistryLookup["lookup"], b: Bounds) => lon >= b.westDeg && lon <= b.eastDeg && lat >= b.southDeg && lat <= b.northDeg;

export function resolveStandIn(input: RegistryLookup, registry: RegistryRelease): RegistryResolution {
  const profiles: CropProfile[] = [];
  const gaps: RegistryResolution["gaps"][number][] = [];
  for (const id of input.cropPurposeIds) {
    const best = registry.profiles
      .filter(p => p.cropPurposeId === id && p.applicability.scope.kind === "regional" && p.applicability.scope.bounds.some(b => inside(input.lookup, b)))
      .sort((a, b) => a.precedence - b.precedence)[0];
    if (best) profiles.push(best);
    else gaps.push({ code: "crop_profile", reason: `No stand-in ${id} profile applies at this location.`, cropPurposeIds: [id], sourceIds: [] });
  }
  return { profiles, gaps, rules: [] };
}
