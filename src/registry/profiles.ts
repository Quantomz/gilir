import { fao56Table11, fao56Table12, gourdji2013, silva2020, teixeira2013, vargas2021 } from "./sources";
import { regionBoxNote, regions } from "./regions";
import type { RegionBounds } from "./regions";

export const reviewRecord = {
  reviewer: "Independent source check by a separate Claude agent against FAO-56 Tables 11-12 (docs/evidence/E1/review.md); human peer confirmation requested in the PR",
  reviewedOn: "2026-11-14",
} as const;

export const reviewRecordRelease2 = {
  reviewer: "Independent source check by a separate Claude agent against FAO-56 Tables 11-12 and the cited temperature papers (docs/evidence/E1/review.md, release 2); human peer confirmation pending",
  reviewedOn: "2026-11-15",
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
const sharedSmallGrainRow = "FAO-56 Table 11 gives this row jointly for barley, oats and wheat.";
const reproductiveWindow =
  "The source uses a 30-day reproductive window; this rule covers the whole FAO-56 mid-season stage, so it can count days outside that window and miss window days falling before mid-season.";
const airTemperature = "Uses screen air temperature from weather data, not canopy or plant tissue temperature.";
const gourdjiVariable =
  "Gourdji et al. 2013 count reproductive days over the critical temperature using interpolated daily minimum and maximum temperature; the paper does not state which of the two is compared, and notes the values also vary by crop variety.";

type TemperatureRule = {
  readonly id: string;
  readonly scope: { readonly kind: "stage"; readonly stage: "middle" };
  readonly period: "daily";
  readonly variable: "max_c" | "min_c";
  readonly predicate: "above";
  readonly thresholdC: number;
  readonly sourceIds: readonly string[];
  readonly limitations: readonly string[];
};

const midSeasonRule = (id: string, variable: "max_c" | "min_c", thresholdC: number, sourceIds: readonly string[], limitations: readonly string[]): TemperatureRule =>
  ({ id, scope: { kind: "stage", stage: "middle" }, period: "daily", variable, predicate: "above", thresholdC, sourceIds, limitations });

interface Crop {
  readonly cropPurposeId: string;
  readonly commonName: string;
  readonly scientificName: string;
  readonly family: string;
  readonly isLegume: boolean;
  readonly kc: { readonly initial: number; readonly middle: number; readonly end: number; readonly assumptions: readonly string[] };
  readonly temperatureRules: readonly TemperatureRule[];
  readonly warnings: readonly string[];
  readonly firstRelease: 1 | 2;
  readonly kcIniFromFlooding?: true;
}

const beanStageAssumption =
  "The quoted sources name no growth stage or window; applying the rule to the mid-season stage, which contains flowering and pod set, is a Gilir assumption.";
const beanTropics = "Silva et al. 2020 state the effect for bean yield in the tropics.";
const legumeGroupKcIni ="Kc ini 0.4 is the Table 12 legumes group value; the crop row leaves Kc ini blank.";
const cerealGroupKcIni = "Kc ini 0.3 is the Table 12 cereals group value; the crop row leaves Kc ini blank.";
const oilGroupKcIni = "Kc ini 0.35 is the Table 12 oil crops group value; the crop row leaves Kc ini blank.";
const tuberGroupKcIni = "Kc ini 0.5 is the Table 12 roots and tubers group value; the crop row leaves Kc ini blank.";
const machineHarvest = "Kc end 0.25 assumes machine harvest; footnote 10 gives the higher value 0.4 for hand-harvested crops.";
const rainfedLowerKcMid = "Kc mid 1.0 is the lower end of the Table 12 range 1.0-1.15; footnote 9: the lower values are for rainfed crops having less dense plant populations. Rainfed, less dense stands are assumed.";

const crops = {
  maize: {
    cropPurposeId: "maize-grain", commonName: "Maize (grain)", scientificName: "Zea mays", family: "Poaceae", isLegume: false, firstRelease: 1,
    kc: { initial: 0.3, middle: 1.2, end: 0.35, assumptions: [
      "Kc ini 0.3 is the Table 12 cereals group value, which applies to field maize.",
      "Kc end 0.35 is the Table 12 value for harvest after complete field drying of the grain (footnote 11); 0.60 applies to harvest at high grain moisture.",
    ] },
    temperatureRules: [midSeasonRule("maize-heat-mid-tmax-35", "max_c", 35, [gourdji2013.id, teixeira2013.id], [
      "Onset of heat damage around silking and pollination (Gourdji et al. 2013 critical temperature; Teixeira et al. 2013 Tcrit).",
      "Teixeira et al. 2013 apply 35 °C to daytime temperature, not daily maximum, and reach maximum damage at 45 °C; using daily maximum flags heat more often.",
      reproductiveWindow, gourdjiVariable, airTemperature,
    ])],
    warnings: [],
  },
  bean: {
    cropPurposeId: "common-bean-dry", commonName: "Common bean (dry grain)", scientificName: "Phaseolus vulgaris", family: "Fabaceae", isLegume: true, firstRelease: 1,
    kc: { initial: 0.4, middle: 1.15, end: 0.35, assumptions: [
      "Table 12 row 'Beans, dry and Pulses' is used for common bean grown for dry grain.",
      "Kc mid 1.15 assumes beans are not grown on tall stalks; footnote 2 gives 1.20 for dry beans grown on stalks reaching 1.5-2 m.",
    ] },
    temperatureRules: [
      midSeasonRule("common-bean-heat-mid-tmax-30", "max_c", 30, [vargas2021.id, silva2020.id], [
        "Day temperatures above 30 °C are reported to reduce seed yield; a rule of thumb quoted in two peer-reviewed papers that credit different original studies, which were not read.",
        beanStageAssumption, beanTropics, airTemperature,
      ]),
      midSeasonRule("common-bean-heat-mid-tmin-20", "min_c", 20, [vargas2021.id, silva2020.id], [
        "Night temperatures above 20 °C are reported to reduce seed yield; a rule of thumb quoted in two peer-reviewed papers that credit different original studies, which were not read.",
        beanStageAssumption, beanTropics, airTemperature,
      ]),
    ],
    warnings: [],
  },
  wheat: {
    cropPurposeId: "wheat-grain", commonName: "Wheat (grain)", scientificName: "Triticum spp.", family: "Poaceae", isLegume: false, firstRelease: 1,
    kc: { initial: 0.3, middle: 1.15, end: 0.25, assumptions: [] },
    temperatureRules: [midSeasonRule("wheat-heat-mid-tmax-34", "max_c", 34, [gourdji2013.id, teixeira2013.id], [
      "Critical temperature for wheat around heading (Gourdji et al. 2013, 30-day window centred about 5 days before heading).",
      "Conflicting value: Teixeira et al. 2013 use 27 °C (onset) to 40 °C (maximum damage) on daytime temperature.",
      reproductiveWindow, gourdjiVariable, airTemperature,
    ])],
    warnings: [],
  },
  rice: {
    cropPurposeId: "rice-paddy", commonName: "Rice (paddy)", scientificName: "Oryza sativa", family: "Poaceae", isLegume: false, firstRelease: 2, kcIniFromFlooding: true,
    kc: { initial: 1.05, middle: 1.2, end: 0.9, assumptions: [
      "Table 12 'Rice' row; Kc ini 1.05 assumes 0.10-0.20 m standing water in a sub-humid climate with light wind (Table 14 gives 1.00-1.20 by climate).",
      "Kc end 0.90 is the higher value of the Table 12 range 0.90-0.60, which has no footnote; the higher value gives the more cautious water-demand estimate.",
    ] },
    temperatureRules: [midSeasonRule("rice-heat-mid-tmax-36", "max_c", 36, [gourdji2013.id, teixeira2013.id], [
      "Critical temperature for rice around heading (Gourdji et al. 2013, 30-day window centred about 5 days before heading).",
      "Teixeira et al. 2013 use 35 °C (onset) to 45 °C (maximum damage) on daytime temperature for wetland rice.",
      reproductiveWindow, gourdjiVariable, airTemperature,
    ])],
    warnings: ["Paddy rice: the rainfall-demand screen excludes ponding, seepage and percolation water requirements, so it understates the water a flooded paddy needs."],
  },
  barley: {
    cropPurposeId: "barley-grain", commonName: "Barley (grain)", scientificName: "Hordeum vulgare", family: "Poaceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.3, middle: 1.15, end: 0.25, assumptions: [cerealGroupKcIni, "Table 12 'Barley' row: Kc mid 1.15, Kc end 0.25."] },
    temperatureRules: [], warnings: [sharedSmallGrainRow],
  },
  oats: {
    cropPurposeId: "oats-grain", commonName: "Oats (grain)", scientificName: "Avena sativa", family: "Poaceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.3, middle: 1.15, end: 0.25, assumptions: [cerealGroupKcIni, "Table 12 'Oats' row: Kc mid 1.15, Kc end 0.25."] },
    temperatureRules: [], warnings: [sharedSmallGrainRow],
  },
  millet: {
    cropPurposeId: "millet-grain", commonName: "Millet (grain)", scientificName: "Millet species not specified by FAO-56", family: "Poaceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.3, middle: 1.0, end: 0.3, assumptions: [cerealGroupKcIni, "Table 12 'Millet' row: Kc mid 1.00, Kc end 0.30."] },
    temperatureRules: [], warnings: ["FAO-56 does not name the millet species; pearl, proso and foxtail millet are not distinguished."],
  },
  sorghum: {
    cropPurposeId: "sorghum-grain", commonName: "Sorghum (grain)", scientificName: "Sorghum bicolor", family: "Poaceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.3, middle: 1.1, end: 0.55, assumptions: [
      cerealGroupKcIni,
      "Kc mid 1.10 is the higher value of the Table 12 'Sorghum - grain' range 1.00-1.10, which has no footnote; the higher value gives the more cautious water-demand estimate.",
      "Kc end 0.55 is the Table 12 'Sorghum - grain' value.",
    ] },
    temperatureRules: [], warnings: [],
  },
  soybean: {
    cropPurposeId: "soybean-grain", commonName: "Soybean (grain)", scientificName: "Glycine max", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.4, middle: 1.15, end: 0.5, assumptions: [legumeGroupKcIni, "Table 12 'Soybeans' row: Kc mid 1.15, Kc end 0.50."] },
    temperatureRules: [midSeasonRule("soybean-heat-mid-tmax-39", "max_c", 39, [gourdji2013.id, teixeira2013.id], [
      "Critical temperature for soybean (Gourdji et al. 2013, 30-day window centred about 5 days before pod setting).",
      "Conflicting value: Teixeira et al. 2013 use 35 °C (onset) to 40 °C (maximum damage) on daytime temperature.",
      reproductiveWindow, gourdjiVariable, airTemperature,
    ])],
    warnings: [],
  },
  groundnut: {
    cropPurposeId: "groundnut", commonName: "Groundnut (peanut)", scientificName: "Arachis hypogaea", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.4, middle: 1.15, end: 0.6, assumptions: [legumeGroupKcIni, "Table 12 'Groundnut (Peanut)' row: Kc mid 1.15, Kc end 0.60."] },
    temperatureRules: [], warnings: ["FAO-56 Table 11 planting-date cells for groundnut are misaligned in the published HTML, so no planting window is released."],
  },
  lentil: {
    cropPurposeId: "lentil-dry", commonName: "Lentil (dry grain)", scientificName: "Lens culinaris", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.4, middle: 1.1, end: 0.3, assumptions: [legumeGroupKcIni, "Table 12 'Lentil' row: Kc mid 1.10, Kc end 0.30."] },
    temperatureRules: [], warnings: [],
  },
  pea: {
    cropPurposeId: "pea-dry", commonName: "Pea (dry seed)", scientificName: "Pisum sativum", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.4, middle: 1.15, end: 0.3, assumptions: [
      "Kc ini 0.4 is the Table 12 legumes group value; the 'Peas - Dry/Seed' row leaves Kc ini blank (the 'Fresh' row lists 0.5).",
      "Table 12 'Peas - Dry/Seed' row: Kc mid 1.15, Kc end 0.30. Footnote 2 says 1.20 applies to peas grown on stalks reaching 1.5-2 m; tall stalks are not assumed.",
    ] },
    temperatureRules: [], warnings: [],
  },
  faba: {
    cropPurposeId: "faba-bean-dry", commonName: "Faba bean (dry seed)", scientificName: "Vicia faba", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.5, middle: 1.15, end: 0.3, assumptions: ["Table 12 'Fababean (broad bean) - Dry/Seed' row: Kc ini 0.5, Kc mid 1.15, Kc end 0.30."] },
    temperatureRules: [], warnings: [],
  },
  mungBean: {
    cropPurposeId: "mung-bean-dry", commonName: "Mung bean (dry grain)", scientificName: "Vigna radiata", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.4, middle: 1.05, end: 0.35, assumptions: [legumeGroupKcIni, "Table 12 'Green Gram and Cowpeas' row: Kc mid 1.05; Kc end 0.35 is the harvested-dry value (footnote 6)."] },
    temperatureRules: [], warnings: ["FAO-56 gives one shared row for green gram (mung bean) and cowpea; this profile does not distinguish them."],
  },
  cowpea: {
    cropPurposeId: "cowpea-dry", commonName: "Cowpea (dry grain)", scientificName: "Vigna unguiculata", family: "Fabaceae", isLegume: true, firstRelease: 2,
    kc: { initial: 0.4, middle: 1.05, end: 0.35, assumptions: [legumeGroupKcIni, "Table 12 'Green Gram and Cowpeas' row: Kc mid 1.05; Kc end 0.35 is the harvested-dry value (footnote 6)."] },
    temperatureRules: [], warnings: ["FAO-56 gives one shared row for green gram (mung bean) and cowpea; this profile does not distinguish them."],
  },
  sunflower: {
    cropPurposeId: "sunflower-seed", commonName: "Sunflower (seed)", scientificName: "Helianthus annuus", family: "Asteraceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.35, middle: 1.0, end: 0.35, assumptions: [oilGroupKcIni, rainfedLowerKcMid, "Table 12 'Sunflower' row: Kc end 0.35."] },
    temperatureRules: [], warnings: [],
  },
  safflower: {
    cropPurposeId: "safflower-seed", commonName: "Safflower (seed)", scientificName: "Carthamus tinctorius", family: "Asteraceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.35, middle: 1.0, end: 0.25, assumptions: [oilGroupKcIni, rainfedLowerKcMid, "Table 12 'Safflower' row: Kc end 0.25."] },
    temperatureRules: [], warnings: [],
  },
  potato: {
    cropPurposeId: "potato", commonName: "Potato", scientificName: "Solanum tuberosum", family: "Solanaceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.5, middle: 1.15, end: 0.75, assumptions: [tuberGroupKcIni, "Table 12 'Potato' row: Kc mid 1.15, Kc end 0.75. Footnote 4 gives about 0.40 for long-season potatoes with vine kill; vine kill is not assumed."] },
    temperatureRules: [], warnings: [],
  },
  sweetPotato: {
    cropPurposeId: "sweet-potato", commonName: "Sweet potato", scientificName: "Ipomoea batatas", family: "Convolvulaceae", isLegume: false, firstRelease: 2,
    kc: { initial: 0.5, middle: 1.15, end: 0.65, assumptions: [tuberGroupKcIni, "Table 12 'Sweet Potato' row: Kc mid 1.15, Kc end 0.65."] },
    temperatureRules: [], warnings: [],
  },
} as const satisfies Record<string, Crop>;

type CropKey = keyof typeof crops;
type Stages = readonly [initial: number, development: number, middle: number, late: number];
type Window = { readonly startMonthDay: string; readonly endMonthDayInclusive: string };

interface Row {
  readonly crop: CropKey;
  readonly slug: string;
  readonly table11Row: string;
  readonly region: readonly RegionBounds[];
  readonly regionLabel: string;
  readonly stages: Stages;
  readonly plantingWindow: Window | null;
  readonly plantingLabel: string;
  readonly precedence: number;
  readonly cultivarGroup: string;
  readonly kc?: Crop["kc"];
  readonly warnings?: readonly string[];
  readonly printedTotal?: number;
}

const month = (start: string, end: string): Window => ({ startMonthDay: start, endMonthDayInclusive: end });
const springWheatKc = { initial: 0.3, middle: 1.15, end: 0.25, assumptions: ["Table 12 'Spring Wheat' row; Kc ini 0.3 is the cereals group value.", machineHarvest] };
const winterWheatKc = { initial: 0.7, middle: 1.15, end: 0.25, assumptions: ["Table 12 'Winter Wheat - with non-frozen soils' row (Kc ini 0.7), because the source region has mild winters.", machineHarvest] };

const californiaDesertBox =
  "The California desert rectangle also covers the neighbouring low desert around Yuma, Arizona and Mexicali, Baja California.";

const smallGrainRows = (crop: "barley" | "oats", name: string): Row[] => [
  {
    crop, slug: "california-desert-dec", table11Row: "Barley/Oats/Wheat | 20 | 50 | 60 | 30 | 160 | Dec | Calif. Desert, USA",
    region: [regions.californiaDesert], regionLabel: "California desert, USA", stages: [20, 50, 60, 30],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 1, cultivarGroup: `${name}, California desert example (160-day season)`,
    warnings: [californiaDesertBox],
  },
  {
    crop, slug: "central-india-nov", table11Row: "Barley/Oats/Wheat | 15 | 25 | 50 | 30 | 120 | November | Central India",
    region: [regions.centralIndia], regionLabel: "Central India", stages: [15, 25, 50, 30],
    plantingWindow: month("11-01", "11-30"), plantingLabel: "November", precedence: 2, cultivarGroup: `${name}, Central India example (120-day season)`,
  },
  {
    crop, slug: "east-africa-jul", table11Row: "Barley/Oats/Wheat | 15 | 30 | 65 | 40 | 150 | July | East Africa",
    region: [regions.eastAfrica], regionLabel: "East Africa", stages: [15, 30, 65, 40],
    plantingWindow: month("07-01", "07-31"), plantingLabel: "July", precedence: 3, cultivarGroup: `${name}, East Africa example (150-day season)`,
  },
  {
    crop, slug: "lat35-45n-mar-apr", table11Row: "Barley/Oats/Wheat | 20 | 25 | 60 | 30 | 135 | March/Apr | 35-45 °L",
    region: [regions.latitude35To45North], regionLabel: "Latitudes 35-45 degrees north", stages: [20, 25, 60, 30],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 4, cultivarGroup: `${name}, 35-45 degree latitude example (135-day season)`,
    warnings: ["The source writes '35-45 °L'; this profile applies it to northern latitudes only."],
  },
];

const rows: readonly Row[] = [
  {
    crop: "maize", slug: "idaho-apr", table11Row: "Maize (grain) | 30 | 40 | 50 | 50 | 170 | April | Idaho, USA",
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [30, 40, 50, 50],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Grain maize, Idaho example (170-day season)",
  },
  {
    crop: "maize", slug: "nigeria-humid-jun", table11Row: "Maize (grain) | 20 | 35 | 40 | 30 | 125 | June | Nigeria (humid)",
    region: [regions.nigeria], regionLabel: "Nigeria (humid)", stages: [20, 35, 40, 30],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 2, cultivarGroup: "Grain maize, humid Nigeria example (125-day season)",
    warnings: ["The FAO-56 row describes humid Nigeria; drier northern areas inside the region rectangle are not distinguished."],
  },
  {
    crop: "maize", slug: "spain-california-apr", table11Row: "Maize (grain) | 30 | 40 | 50 | 30 | 150 | April | Spain (spr, sum.); Calif.",
    region: [regions.spain, regions.california], regionLabel: "Spain (spring/summer) and California", stages: [30, 40, 50, 30],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 3, cultivarGroup: "Grain maize, Spain and California example (150-day season)",
  },
  {
    crop: "maize", slug: "east-africa-highland-apr", table11Row: "Maize (grain) | 30 | 50 | 60 | 40 | 180 | April | East Africa (alt.)",
    region: [regions.eastAfrica], regionLabel: "East Africa (highland)", stages: [30, 50, 60, 40],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 4, cultivarGroup: "Grain maize, East African highland example (180-day season)",
    warnings: ["The FAO-56 row is for East African highland (altitude) maize; this profile does not check field elevation."],
  },
  {
    crop: "maize", slug: "india-dry-cool-oct", table11Row: "Maize (grain) | 20 | 35 | 40 | 30 | 125 | October | India (dry, cool)",
    region: [regions.india], regionLabel: "India (dry, cool season)", stages: [20, 35, 40, 30],
    plantingWindow: month("10-01", "10-31"), plantingLabel: "October", precedence: 5, cultivarGroup: "Grain maize, Indian dry cool-season example (125-day season)",
    warnings: ["The FAO-56 row describes the dry, cool season in India; other Indian seasons are not represented."],
  },
  {
    crop: "bean", slug: "idaho-jun", table11Row: "Beans (dry) | 25 | 25 | 30 | 20 | 100 | June | Idaho, USA",
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [25, 25, 30, 20],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 1, cultivarGroup: "Dry bean, Idaho example (100-day season)",
  },
  {
    crop: "bean", slug: "pakistan-california-jun", table11Row: "Beans (dry) | 15 | 25 | 35 | 20 | 95 | June | Pakistan, Calif.",
    region: [regions.pakistan, regions.california], regionLabel: "Pakistan and California", stages: [15, 25, 35, 20],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 2, cultivarGroup: "Dry bean, Pakistan and California example (95-day season)",
  },
  {
    crop: "wheat", slug: "central-india-nov", table11Row: "Barley/Oats/Wheat | 15 | 25 | 50 | 30 | 120 | November | Central India",
    region: [regions.centralIndia], regionLabel: "Central India", stages: [15, 25, 50, 30],
    plantingWindow: month("11-01", "11-30"), plantingLabel: "November", precedence: 1, kc: springWheatKc,
    cultivarGroup: "Spring-type wheat, Central India example (120-day season)", warnings: [sharedSmallGrainRow],
  },
  {
    crop: "wheat", slug: "california-winter-dec", table11Row: "Winter Wheat | 20 | 60 | 70 | 30 | 180 | December | Calif., USA",
    region: [regions.california], regionLabel: "California, USA", stages: [20, 60, 70, 30],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 2, kc: winterWheatKc,
    cultivarGroup: "Winter wheat, California example (180-day season)",
  },
  {
    crop: "wheat", slug: "east-africa-jul", table11Row: "Barley/Oats/Wheat | 15 | 30 | 65 | 40 | 150 | July | East Africa",
    region: [regions.eastAfrica], regionLabel: "East Africa", stages: [15, 30, 65, 40],
    plantingWindow: month("07-01", "07-31"), plantingLabel: "July", precedence: 3, kc: springWheatKc,
    cultivarGroup: "Spring-type wheat, East Africa example (150-day season)", warnings: [sharedSmallGrainRow],
  },
  {
    crop: "wheat", slug: "mediterranean-winter-nov", table11Row: "Winter Wheat | 30 | 140 | 40 | 30 | 240 | November | Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 140, 40, 30],
    plantingWindow: month("11-01", "11-30"), plantingLabel: "November", precedence: 4, kc: winterWheatKc,
    cultivarGroup: "Winter wheat, Mediterranean example (240-day season)",
    warnings: ["The Mediterranean region rectangle also covers mountain and inland areas where winter soils can freeze; there FAO-56 gives Kc ini 0.4 instead of the non-frozen 0.7 used here."],
  },
  {
    crop: "wheat", slug: "lat35-45n-mar-apr", table11Row: "Barley/Oats/Wheat | 20 | 25 | 60 | 30 | 135 | March/Apr | 35-45 °L",
    region: [regions.latitude35To45North], regionLabel: "Latitudes 35-45 degrees north", stages: [20, 25, 60, 30],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 5, kc: springWheatKc,
    cultivarGroup: "Spring-type wheat, 35-45 degree latitude example (135-day season)",
    warnings: [sharedSmallGrainRow, "The source writes '35-45 °L'; this profile applies it to northern latitudes only."],
  },
  {
    crop: "rice", slug: "mediterranean-may", table11Row: "Rice | 30 | 30 | 60 | 30 | 150 | Dec; May | Tropics; Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 30, 60, 30],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 1, cultivarGroup: "Paddy rice, Mediterranean example (150-day season)",
    warnings: ["The FAO-56 cell 'Dec; May' with region 'Tropics; Mediterranean' is read as May planting for the Mediterranean."],
  },
  {
    crop: "rice", slug: "tropics-dec", table11Row: "Rice | 30 | 30 | 60 | 30 | 150 | Dec; May | Tropics; Mediterranean",
    region: [regions.tropics], regionLabel: "Tropics", stages: [30, 30, 60, 30],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 2, cultivarGroup: "Paddy rice, tropical example (150-day season)",
    warnings: [
      "The FAO-56 cell 'Dec; May' with region 'Tropics; Mediterranean' is read as December planting for the tropics.",
      "FAO-56 also lists a 180-day tropical rice row (May planting); it is not released because there is no stored rule for choosing between the two tropical rows.",
    ],
  },
  ...smallGrainRows("barley", "Barley"),
  ...smallGrainRows("oats", "Oats"),
  {
    crop: "millet", slug: "pakistan-jun", table11Row: "Millet | 15 | 25 | 40 | 25 | 105 | June | Pakistan",
    region: [regions.pakistan], regionLabel: "Pakistan", stages: [15, 25, 40, 25],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 1, cultivarGroup: "Millet, Pakistan example (105-day season)",
  },
  {
    crop: "millet", slug: "central-usa-apr", table11Row: "Millet | 20 | 30 | 55 | 35 | 140 | April | Central USA",
    region: [regions.centralUsa], regionLabel: "Central USA", stages: [20, 30, 55, 35],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 2, cultivarGroup: "Millet, Central USA example (140-day season)",
  },
  {
    crop: "sorghum", slug: "usa-pakistan-mediterranean-may-jun", table11Row: "Sorghum | 20 | 35 | 40 | 30 | 130 | May/June | USA, Pakis., Med.", printedTotal: 130,
    region: [regions.contiguousUsa, regions.pakistan, regions.mediterranean], regionLabel: "USA, Pakistan and Mediterranean", stages: [20, 35, 40, 30],
    plantingWindow: month("05-01", "06-30"), plantingLabel: "May/June", precedence: 1, cultivarGroup: "Grain sorghum, USA/Pakistan/Mediterranean example (130-day season)",
    warnings: ["The USA rectangle also covers northern Mexico and the southern edge of Canada; the source names only the USA."],
  },
  {
    crop: "soybean", slug: "japan-jun", table11Row: "Soybeans | 20 | 25 | 75 | 30 | 150 | June | Japan",
    region: [regions.japanHonshuKyushuShikoku, regions.japanHokkaido], regionLabel: "Japan", stages: [20, 25, 75, 30],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 1, cultivarGroup: "Soybean, Japan example (150-day season)",
  },
  {
    crop: "soybean", slug: "central-usa-may", table11Row: "Soybeans | 20 | 30/35 | 60 | 25 | 140 | May | Central USA",
    region: [regions.centralUsa], regionLabel: "Central USA", stages: [20, 35, 60, 25],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 2, cultivarGroup: "Soybean, Central USA example (140-day season)",
    warnings: ["The FAO-56 development cell reads '30/35'; 35 days is used because only it matches the row total of 140 days."],
  },
  {
    crop: "soybean", slug: "tropics-dec", table11Row: "Soybeans | 15 | 15 | 40 | 15 | 85 | Dec | Tropics",
    region: [regions.tropics], regionLabel: "Tropics", stages: [15, 15, 40, 15],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 3, cultivarGroup: "Soybean, tropical example (85-day season)",
  },
  {
    crop: "groundnut", slug: "mediterranean", table11Row: "Groundnut | 35 | 45 | 35 | 25 | 140 | (May or May/June; cell misaligned) | Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [35, 45, 35, 25],
    plantingWindow: null, plantingLabel: "unconfirmed-month", precedence: 1, cultivarGroup: "Groundnut, Mediterranean example (140-day season)",
  },
  {
    crop: "groundnut", slug: "west-africa-dry-season", table11Row: "Groundnut | 25 | 35 | 45 | 25 | 130 | Dry season | West Africa",
    region: [regions.westAfrica], regionLabel: "West Africa (dry season)", stages: [25, 35, 45, 25],
    plantingWindow: null, plantingLabel: "dry season", precedence: 2, cultivarGroup: "Groundnut, West Africa dry-season example (130-day season)",
  },
  {
    crop: "lentil", slug: "europe-apr", table11Row: "Lentil | 20 | 30 | 60 | 40 | 150 | April | Europe",
    region: [regions.europe], regionLabel: "Europe", stages: [20, 30, 60, 40],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Lentil, Europe example (150-day season)",
  },
  {
    crop: "pea", slug: "idaho-apr", table11Row: "Peas | 35 | 25 | 30 | 20 | 110 | April | Idaho, USA",
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [35, 25, 30, 20],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Dry pea, Idaho example (110-day season)",
  },
  {
    crop: "pea", slug: "mediterranean-mar-apr", table11Row: "Peas | 20 | 30 | 35 | 15 | 100 | Mar/Apr | Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 35, 15],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 2, cultivarGroup: "Dry pea, Mediterranean example (100-day season)",
  },
  {
    crop: "pea", slug: "europe-may", table11Row: "Peas | 15 | 25 | 35 | 15 | 90 | May | Europe",
    region: [regions.europe], regionLabel: "Europe", stages: [15, 25, 35, 15],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 3, cultivarGroup: "Dry pea, Europe example (90-day season)",
  },
  {
    crop: "faba", slug: "mediterranean-mar-apr", table11Row: "Faba bean, broad bean | 20 | 30 | 35 | 15 | 100 | Mar/Apr | Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 35, 15],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 1, cultivarGroup: "Faba bean, Mediterranean example (100-day season)",
  },
  {
    crop: "faba", slug: "europe-may", table11Row: "Faba bean, broad bean | 15 | 25 | 35 | 15 | 90 | May | Europe",
    region: [regions.europe], regionLabel: "Europe", stages: [15, 25, 35, 15],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 2, cultivarGroup: "Faba bean, Europe example (90-day season)",
  },
  {
    crop: "mungBean", slug: "mediterranean-mar", table11Row: "Green gram, cowpeas | 20 | 30 | 30 | 20 | 110 | March | Mediterranean", printedTotal: 110,
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 30, 20],
    plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 1, cultivarGroup: "Mung bean, Mediterranean example (110-day season)",
  },
  {
    crop: "cowpea", slug: "mediterranean-mar", table11Row: "Green gram, cowpeas | 20 | 30 | 30 | 20 | 110 | March | Mediterranean", printedTotal: 110,
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 30, 20],
    plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 1, cultivarGroup: "Cowpea, Mediterranean example (110-day season)",
  },
  {
    crop: "sunflower", slug: "mediterranean-california-apr-may", table11Row: "Sunflower | 25 | 35 | 45 | 25 | 130 | April/May | Medit.; California",
    region: [regions.mediterranean, regions.california], regionLabel: "Mediterranean and California", stages: [25, 35, 45, 25],
    plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 1, cultivarGroup: "Sunflower, Mediterranean and California example (130-day season)",
  },
  {
    crop: "safflower", slug: "california-apr", table11Row: "Safflower | 20 | 35 | 45 | 25 | 125 | April | California, USA",
    region: [regions.california], regionLabel: "California, USA", stages: [20, 35, 45, 25],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Safflower, California example (125-day season)",
  },
  {
    crop: "potato", slug: "california-desert-dec", table11Row: "Potato | 30 | 35 | 50 | 25 | 140 | Dec | Calif. Desert, USA",
    region: [regions.californiaDesert], regionLabel: "California desert, USA", stages: [30, 35, 50, 25],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 1, cultivarGroup: "Potato, California desert example (140-day season)",
    warnings: [californiaDesertBox],
  },
  {
    crop: "potato", slug: "idaho-apr-may", table11Row: "Potato | 45 | 30 | 70 | 20 | 165 | Apr/May | Idaho, USA",
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [45, 30, 70, 20],
    plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 2, cultivarGroup: "Potato, Idaho example (165-day season)",
  },
  {
    crop: "potato", slug: "europe-apr", table11Row: "Potato | 30 | 35 | 50 | 30 | 145 | April | Europe",
    region: [regions.europe], regionLabel: "Europe", stages: [30, 35, 50, 30],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 3, cultivarGroup: "Potato, Europe example (145-day season)",
  },
  {
    crop: "sweetPotato", slug: "mediterranean-apr", table11Row: "Sweet potato | 20 | 30 | 60 | 40 | 150 | April | Mediterranean",
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 60, 40],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Sweet potato, Mediterranean example (150-day season)",
  },
  {
    crop: "sweetPotato", slug: "tropics-rainy-season", table11Row: "Sweet potato | 15 | 30 | 50 | 30 | 125 | Rainy seas. | Tropical regions",
    region: [regions.tropics], regionLabel: "Tropical regions (rainy season)", stages: [15, 30, 50, 30],
    plantingWindow: null, plantingLabel: "rainy season", precedence: 2, cultivarGroup: "Sweet potato, tropical rainy-season example (125-day season)",
  },
];

export type ReleaseNumber = 1 | 2;

function profileOf(row: Row, release: ReleaseNumber) {
  const crop: Crop = crops[row.crop];
  const kc = row.kc ?? crop.kc;
  const [initial, development, middle, late] = row.stages;
  const total = initial + development + middle + late;
  const stageDays = { initial, development, middle, late };
  const temperatureRules = release === 2 ? crop.temperatureRules : [];
  const temperatureSources = [...new Set(temperatureRules.flatMap(rule => rule.sourceIds))];
  return {
    status: "released",
    review: release === 1 ? reviewRecord : reviewRecordRelease2,
    id: `${crop.cropPurposeId}-fao56-${row.slug}`,
    version: release === 2 && crop.firstRelease === 1 ? "2" : "1",
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
      plantingWindows: row.plantingWindow === null ? [] : [{ window: row.plantingWindow, basis: "recommendation", sourceIds: table11 }],
      turnaround: turnaroundAssumption,
    },
    kc: {
      initial: kc.initial,
      middle: kc.middle,
      end: kc.end,
      stageInterpolation: "initial_middle_constant_development_late_linear_include_endpoints",
      assumptions: [kcStandardConditions, ...(crop.kcIniFromFlooding ? [] : [kcIniApproximation]), ...kc.assumptions],
      sourceIds: table12,
    },
    temperatureRules,
    rotationRuleIds: [],
    preparation: [],
    warnings: [
      ...crop.warnings,
      ...(row.warnings ?? []),
      ...(row.printedTotal === undefined || row.printedTotal === total ? [] :
        [`Season length is the sum of the FAO-56 Table 11 stage lengths (${total} days); the same row prints a ${row.printedTotal}-day total, which is not used.`]),
    ],
    sourceIds: [...table11, ...table12, ...temperatureSources],
  } as const;
}

export function buildProfiles(release: ReleaseNumber) {
  return rows.filter(row => crops[row.crop].firstRelease <= release).map(row => profileOf(row, release));
}

export function buildCatalogueEntries(release: ReleaseNumber) {
  return Object.values(crops)
    .filter(crop => crop.firstRelease <= release)
    .map(crop => ({ id: crop.cropPurposeId, label: crop.commonName, purpose: "food" }) as const)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}
