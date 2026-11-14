import { fao56Table11, fao56Table12 } from "./sources";
import { regionBoxNote, regions } from "./regions";
import type { RegionBounds } from "./regions";

export const reviewRecord = {
  reviewer: "Independent source check by a separate Claude agent against FAO-56 Tables 11-12 (docs/evidence/E1/review.md); human peer confirmation requested in the PR",
  reviewedOn: "2026-11-14",
} as const;

export const turnaroundAssumption = {
  basis: "scheduling_assumption",
  days: 7,
  assumption: "Gilir planning assumption: 7 days to clear and prepare the field after harvest. FAO-56 gives no turnaround; this is not a published agronomic value.",
} as const;

const table11 = [fao56Table11.id];
const table12 = [fao56Table12.id];
const kcStandardConditions =
  "FAO-56 Table 12 values for a sub-humid climate (RHmin about 45%, u2 about 2 m/s) under standard non-stressed conditions; no climatic adjustment is applied.";
const kcIniApproximation =
  "Kc ini is the FAO-56 Table 12 general value (footnote 1); frequent wetting by rain can raise the actual value toward 1.0-1.2.";
const stageExample =
  "Stage lengths are FAO-56 Table 11 average examples for the stated region and planting period, not local observations.";

type Stages = readonly [initial: number, development: number, middle: number, late: number];
type Crop = "maize" | "bean" | "wheat";

interface Row {
  readonly crop: Crop;
  readonly slug: string;
  readonly table11Row: string;
  readonly region: readonly RegionBounds[];
  readonly regionLabel: string;
  readonly stages: Stages;
  readonly plantingWindow: { readonly startMonthDay: string; readonly endMonthDayInclusive: string };
  readonly plantingLabel: string;
  readonly precedence: number;
  readonly kc: { readonly initial: number; readonly middle: number; readonly end: number; readonly assumptions: readonly string[] };
  readonly cultivarGroup: string;
  readonly warnings?: readonly string[];
}

const crops = {
  maize: {
    cropPurposeId: "maize-grain", commonName: "Maize (grain)", scientificName: "Zea mays",
    family: "Poaceae", isLegume: false, table11Crop: "Maize (grain)",
  },
  bean: {
    cropPurposeId: "common-bean-dry", commonName: "Common bean (dry grain)", scientificName: "Phaseolus vulgaris",
    family: "Fabaceae", isLegume: true, table11Crop: "Beans (dry)",
  },
  wheat: {
    cropPurposeId: "wheat-grain", commonName: "Wheat (grain)", scientificName: "Triticum spp.",
    family: "Poaceae", isLegume: false, table11Crop: "Barley/Oats/Wheat or Winter Wheat",
  },
} as const;

const maizeKc = {
  initial: 0.3, middle: 1.2, end: 0.35,
  assumptions: [
    "Kc ini 0.3 is the Table 12 cereals group value, which applies to field maize.",
    "Kc end 0.35 is the Table 12 value for harvest after complete field drying of the grain (footnote 11); 0.60 applies to harvest at high grain moisture.",
  ],
};
const beanKc = {
  initial: 0.4, middle: 1.15, end: 0.35,
  assumptions: [
    "Table 12 row 'Beans, dry and Pulses' is used for common bean grown for dry grain.",
    "Kc mid 1.15 assumes beans are not grown on tall stalks; footnote 2 gives 1.20 for dry beans grown on stalks reaching 1.5-2 m.",
  ],
};
const springWheatKc = {
  initial: 0.3, middle: 1.15, end: 0.25,
  assumptions: [
    "Table 12 'Spring Wheat' row; Kc ini 0.3 is the cereals group value.",
    "Kc end 0.25 assumes machine harvest; footnote 10 gives the higher value 0.4 for hand-harvested crops.",
  ],
};
const winterWheatKc = {
  initial: 0.7, middle: 1.15, end: 0.25,
  assumptions: [
    "Table 12 'Winter Wheat - with non-frozen soils' row (Kc ini 0.7), because the source region has mild winters.",
    "Kc end 0.25 assumes machine harvest; footnote 10 gives the higher value 0.4 for hand-harvested crops.",
  ],
};

const rows: readonly Row[] = [
  {
    crop: "maize", slug: "idaho-apr", table11Row: "Maize (grain) | 30 | 40 | 50 | 50 | 170 | April | Idaho, USA",
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [30, 40, 50, 50],
    plantingWindow: { startMonthDay: "04-01", endMonthDayInclusive: "04-30" }, plantingLabel: "April", precedence: 1,
    kc: maizeKc, cultivarGroup: "Grain maize, Idaho example (170-day season)",
  },
  {
    crop: "maize", slug: "nigeria-humid-jun", table11Row: "Maize (grain) | 20 | 35 | 40 | 30 | 125 | June | Nigeria (humid)",
    region: [regions.nigeria], regionLabel: "Nigeria (humid)", stages: [20, 35, 40, 30],
    plantingWindow: { startMonthDay: "06-01", endMonthDayInclusive: "06-30" }, plantingLabel: "June", precedence: 2,
    kc: maizeKc, cultivarGroup: "Grain maize, humid Nigeria example (125-day season)",
    warnings: ["The FAO-56 row describes humid Nigeria; drier northern areas inside the region rectangle are not distinguished."],
  },
  {
    crop: "maize", slug: "spain-california-apr", table11Row: "Maize (grain) | 30 | 40 | 50 | 30 | 150 | April | Spain (spr, sum.); Calif.",
    region: [regions.spain, regions.california], regionLabel: "Spain (spring/summer) and California", stages: [30, 40, 50, 30],
    plantingWindow: { startMonthDay: "04-01", endMonthDayInclusive: "04-30" }, plantingLabel: "April", precedence: 3,
    kc: maizeKc, cultivarGroup: "Grain maize, Spain and California example (150-day season)",
  },
  {
    crop: "maize", slug: "east-africa-highland-apr", table11Row: "Maize (grain) | 30 | 50 | 60 | 40 | 180 | April | East Africa (alt.)",
    region: [regions.eastAfrica], regionLabel: "East Africa (highland)", stages: [30, 50, 60, 40],
    plantingWindow: { startMonthDay: "04-01", endMonthDayInclusive: "04-30" }, plantingLabel: "April", precedence: 4,
    kc: maizeKc, cultivarGroup: "Grain maize, East African highland example (180-day season)",
    warnings: ["The FAO-56 row is for East African highland (altitude) maize; this profile does not check field elevation."],
  },
  {
    crop: "maize", slug: "india-dry-cool-oct", table11Row: "Maize (grain) | 20 | 35 | 40 | 30 | 125 | October | India (dry, cool)",
    region: [regions.india], regionLabel: "India (dry, cool season)", stages: [20, 35, 40, 30],
    plantingWindow: { startMonthDay: "10-01", endMonthDayInclusive: "10-31" }, plantingLabel: "October", precedence: 5,
    kc: maizeKc, cultivarGroup: "Grain maize, Indian dry cool-season example (125-day season)",
    warnings: ["The FAO-56 row describes the dry, cool season in India; other Indian seasons are not represented."],
  },
  {
    crop: "bean", slug: "idaho-jun", table11Row: "Beans (dry) | 25 | 25 | 30 | 20 | 100 | June | Idaho, USA",
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [25, 25, 30, 20],
    plantingWindow: { startMonthDay: "06-01", endMonthDayInclusive: "06-30" }, plantingLabel: "June", precedence: 1,
    kc: beanKc, cultivarGroup: "Dry bean, Idaho example (100-day season)",
  },
  {
    crop: "bean", slug: "pakistan-california-jun", table11Row: "Beans (dry) | 15 | 25 | 35 | 20 | 95 | June | Pakistan, Calif.",
    region: [regions.pakistan, regions.california], regionLabel: "Pakistan and California", stages: [15, 25, 35, 20],
    plantingWindow: { startMonthDay: "06-01", endMonthDayInclusive: "06-30" }, plantingLabel: "June", precedence: 2,
    kc: beanKc, cultivarGroup: "Dry bean, Pakistan and California example (95-day season)",
  },
  {
    crop: "wheat", slug: "central-india-nov", table11Row: "Barley/Oats/Wheat | 15 | 25 | 50 | 30 | 120 | November | Central India",
    region: [regions.centralIndia], regionLabel: "Central India", stages: [15, 25, 50, 30],
    plantingWindow: { startMonthDay: "11-01", endMonthDayInclusive: "11-30" }, plantingLabel: "November", precedence: 1,
    kc: springWheatKc, cultivarGroup: "Spring-type wheat, Central India example (120-day season)",
    warnings: ["FAO-56 Table 11 gives this row jointly for barley, oats and wheat."],
  },
  {
    crop: "wheat", slug: "california-winter-dec", table11Row: "Winter Wheat | 20 | 60 | 70 | 30 | 180 | December | Calif., USA",
    region: [regions.california], regionLabel: "California, USA", stages: [20, 60, 70, 30],
    plantingWindow: { startMonthDay: "12-01", endMonthDayInclusive: "12-31" }, plantingLabel: "December", precedence: 2,
    kc: winterWheatKc, cultivarGroup: "Winter wheat, California example (180-day season)",
  },
  {
    crop: "wheat", slug: "east-africa-jul", table11Row: "Barley/Oats/Wheat | 15 | 30 | 65 | 40 | 150 | July | East Africa",
    region: [regions.eastAfrica], regionLabel: "East Africa", stages: [15, 30, 65, 40],
    plantingWindow: { startMonthDay: "07-01", endMonthDayInclusive: "07-31" }, plantingLabel: "July", precedence: 3,
    kc: springWheatKc, cultivarGroup: "Spring-type wheat, East Africa example (150-day season)",
    warnings: ["FAO-56 Table 11 gives this row jointly for barley, oats and wheat."],
  },
  {
    crop: "wheat", slug: "mediterranean-winter-nov", table11Row: "Winter Wheat | 30 | 140 | 40 | 30 | 240 | November | Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 140, 40, 30],
    plantingWindow: { startMonthDay: "11-01", endMonthDayInclusive: "11-30" }, plantingLabel: "November", precedence: 4,
    kc: winterWheatKc, cultivarGroup: "Winter wheat, Mediterranean example (240-day season)",
    warnings: ["The Mediterranean region rectangle also covers mountain and inland areas where winter soils can freeze; there FAO-56 gives Kc ini 0.4 instead of the non-frozen 0.7 used here."],
  },
  {
    crop: "wheat", slug: "lat35-45n-mar-apr", table11Row: "Barley/Oats/Wheat | 20 | 25 | 60 | 30 | 135 | March/Apr | 35-45 °L",
    region: [regions.latitude35To45North], regionLabel: "Latitudes 35-45 degrees north", stages: [20, 25, 60, 30],
    plantingWindow: { startMonthDay: "03-01", endMonthDayInclusive: "04-30" }, plantingLabel: "March/April", precedence: 5,
    kc: springWheatKc, cultivarGroup: "Spring-type wheat, 35-45 degree latitude example (135-day season)",
    warnings: [
      "FAO-56 Table 11 gives this row jointly for barley, oats and wheat.",
      "The source writes '35-45 °L'; this profile applies it to northern latitudes only.",
    ],
  },
];

function profileOf(row: Row) {
  const crop = crops[row.crop];
  const [initial, development, middle, late] = row.stages;
  const total = initial + development + middle + late;
  const stageDays = { initial, development, middle, late };
  return {
    status: "released",
    review: reviewRecord,
    id: `${crop.cropPurposeId}-fao56-${row.slug}`,
    version: "1",
    cropPurposeId: crop.cropPurposeId,
    commonName: crop.commonName,
    scientificName: crop.scientificName,
    family: crop.family,
    isLegume: crop.isLegume,
    purpose: "food",
    cultivarGroup: row.cultivarGroup,
    productionSystem: "Field crop; FAO-56 standard (non-stressed, well-managed) conditions",
    applicability: {
      scope: { kind: "regional", bounds: row.region },
      exclusions: [],
      managementAssumptions: [
        stageExample,
        `FAO-56 Table 11 row used: ${row.table11Row} (${row.regionLabel}, ${row.plantingLabel} planting).`,
        regionBoxNote,
      ],
    },
    precedence: row.precedence,
    timing: {
      generatedStageDays: stageDays,
      historicalStageAllocations: [stageDays],
      publishedDurationDays: { kind: "available", value: [total, total] },
      plantingWindows: [{ window: row.plantingWindow, basis: "recommendation", sourceIds: table11 }],
      turnaround: turnaroundAssumption,
    },
    kc: {
      initial: row.kc.initial,
      middle: row.kc.middle,
      end: row.kc.end,
      stageInterpolation: "initial_middle_constant_development_late_linear_include_endpoints",
      assumptions: [kcStandardConditions, kcIniApproximation, ...row.kc.assumptions],
      sourceIds: table12,
    },
    temperatureRules: [],
    rotationRuleIds: [],
    preparation: [],
    warnings: row.warnings ?? [],
    sourceIds: [...table11, ...table12],
  } as const;
}

export const releasedProfiles = rows.map(profileOf);

export const releasedCatalogueEntries = [
  { id: crops.bean.cropPurposeId, label: crops.bean.commonName, purpose: "food" },
  { id: crops.maize.cropPurposeId, label: crops.maize.commonName, purpose: "food" },
  { id: crops.wheat.cropPurposeId, label: crops.wheat.commonName, purpose: "food" },
] as const;
