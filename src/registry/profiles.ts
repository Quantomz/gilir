import type { ReleasedRegistry } from "@/contracts/registry";
import { fao56Table11, fao56Table12 } from "./sources";
import { regionBoxNote, regions } from "./regions";
import type { RegionBounds } from "./regions";

export const reviewRecord = {
  reviewer: "Codex source-remediation comparison against X1 FAO-56 evidence; review record: docs/evidence/E1/remediation.md",
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

interface Crop {
  readonly cropPurposeId: string;
  readonly commonName: string;
  readonly scientificName: string;
  readonly family: string;
  readonly isLegume: boolean;
  readonly kc: { readonly initial: number; readonly middle: number; readonly end: number; readonly assumptions: readonly string[] };
  readonly warnings: readonly string[];
  readonly kcIniFromFlooding?: true;
}

const legumeGroupKcIni = "Kc ini 0.4 is the Table 12 legumes group value; the crop row leaves Kc ini blank.";
const cerealGroupKcIni = "Kc ini 0.3 is the Table 12 cereals group value; the crop row leaves Kc ini blank.";
const oilGroupKcIni = "Kc ini 0.35 is the Table 12 oil crops group value; the crop row leaves Kc ini blank.";
const tuberGroupKcIni = "Kc ini 0.5 is the Table 12 roots and tubers group value; the crop row leaves Kc ini blank.";
const smallVegGroupKcIni = "Kc ini 0.7 is the Table 12 small vegetables group value; the crop row leaves Kc ini blank.";
const solanumGroupKcIni = "Kc ini 0.6 is the Table 12 Solanum family group value; the crop row leaves Kc ini blank.";
const cucurbitGroupKcIni = "Kc ini 0.5 is the Table 12 cucumber family group value; the crop row leaves Kc ini blank.";
const machineHarvest = "Kc end 0.25 assumes machine harvest; footnote 10 gives the higher value 0.4 for hand-harvested crops.";
const rainfedLowerKcMid = "Kc mid 1.0 is the lower end of the Table 12 range 1.0-1.15; footnote 9: the lower values are for rainfed crops having less dense plant populations. Rainfed, less dense stands are assumed.";

const crops = {
  maize: {
    cropPurposeId: "maize-grain", commonName: "Maize (grain)", scientificName: "Zea mays", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.2, end: 0.35, assumptions: [
      "Kc ini 0.3 is the Table 12 cereals group value, which applies to field maize.",
      "Kc end 0.35 is the Table 12 value for harvest after complete field drying of the grain (footnote 11); 0.60 applies to harvest at high grain moisture.",
    ] },
    warnings: [],
  },
  bean: {
    cropPurposeId: "common-bean-dry", commonName: "Common bean (dry grain)", scientificName: "Phaseolus vulgaris", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.15, end: 0.35, assumptions: [
      "Table 12 row 'Beans, dry and Pulses' is used for common bean grown for dry grain.",
      "Kc mid 1.15 assumes beans are not grown on tall stalks; footnote 2 gives 1.20 for dry beans grown on stalks reaching 1.5-2 m.",
    ] },
    warnings: [],
  },
  wheat: {
    cropPurposeId: "wheat-grain", commonName: "Wheat (grain)", scientificName: "Triticum spp.", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.15, end: 0.25, assumptions: [] },
    warnings: [],
  },
  rice: {
    cropPurposeId: "rice-paddy", commonName: "Rice (paddy)", scientificName: "Oryza sativa", family: "Poaceae", isLegume: false, kcIniFromFlooding: true,
    kc: { initial: 1.05, middle: 1.2, end: 0.9, assumptions: [
      "Table 12 'Rice' row; Kc ini 1.05 assumes 0.10-0.20 m standing water in a sub-humid climate with light wind (Table 14 gives 1.00-1.20 by climate).",
      "Kc end 0.90 is the higher value of the Table 12 range 0.90-0.60, which has no footnote; the higher value gives the more cautious water-demand estimate.",
    ] },
    warnings: ["Paddy rice: the rainfall-demand screen excludes ponding, seepage and percolation water requirements, so it understates the water a flooded paddy needs."],
  },
  barley: {
    cropPurposeId: "barley-grain", commonName: "Barley (grain)", scientificName: "Hordeum vulgare", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.15, end: 0.25, assumptions: [cerealGroupKcIni, "Table 12 'Barley' row: Kc mid 1.15, Kc end 0.25."] },
    warnings: [sharedSmallGrainRow],
  },
  oats: {
    cropPurposeId: "oats-grain", commonName: "Oats (grain)", scientificName: "Avena sativa", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.15, end: 0.25, assumptions: [cerealGroupKcIni, "Table 12 'Oats' row: Kc mid 1.15, Kc end 0.25."] },
    warnings: [sharedSmallGrainRow],
  },
  millet: {
    cropPurposeId: "millet-grain", commonName: "Millet (grain)", scientificName: "Millet species not specified by FAO-56", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.0, end: 0.3, assumptions: [cerealGroupKcIni, "Table 12 'Millet' row: Kc mid 1.00, Kc end 0.30."] },
    warnings: ["FAO-56 does not name the millet species; pearl, proso and foxtail millet are not distinguished."],
  },
  sorghum: {
    cropPurposeId: "sorghum-grain", commonName: "Sorghum (grain)", scientificName: "Sorghum bicolor", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.1, end: 0.55, assumptions: [
      cerealGroupKcIni,
      "Kc mid 1.10 is the higher value of the Table 12 'Sorghum - grain' range 1.00-1.10, which has no footnote; the higher value gives the more cautious water-demand estimate.",
      "Kc end 0.55 is the Table 12 'Sorghum - grain' value.",
    ] },
    warnings: [],
  },
  soybean: {
    cropPurposeId: "soybean-grain", commonName: "Soybean (grain)", scientificName: "Glycine max", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.15, end: 0.5, assumptions: [legumeGroupKcIni, "Table 12 'Soybeans' row: Kc mid 1.15, Kc end 0.50."] },

    warnings: [],
  },
  groundnut: {
    cropPurposeId: "groundnut", commonName: "Groundnut (peanut)", scientificName: "Arachis hypogaea", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.15, end: 0.6, assumptions: [legumeGroupKcIni, "Table 12 'Groundnut (Peanut)' row: Kc mid 1.15, Kc end 0.60."] },
    warnings: ["FAO-56 Table 11 planting-date cells for groundnut are misaligned in the published HTML, so no planting window is released."],
  },
  lentil: {
    cropPurposeId: "lentil-dry", commonName: "Lentil (dry grain)", scientificName: "Lens culinaris", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.1, end: 0.3, assumptions: [legumeGroupKcIni, "Table 12 'Lentil' row: Kc mid 1.10, Kc end 0.30."] },
    warnings: [],
  },
  pea: {
    cropPurposeId: "pea-dry", commonName: "Pea (dry seed)", scientificName: "Pisum sativum", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.15, end: 0.3, assumptions: [
      "Kc ini 0.4 is the Table 12 legumes group value; the 'Peas - Dry/Seed' row leaves Kc ini blank (the 'Fresh' row lists 0.5).",
      "Table 12 'Peas - Dry/Seed' row: Kc mid 1.15, Kc end 0.30. Footnote 2 says 1.20 applies to peas grown on stalks reaching 1.5-2 m; tall stalks are not assumed.",
    ] },
    warnings: [],
  },
  faba: {
    cropPurposeId: "faba-bean-dry", commonName: "Faba bean (dry seed)", scientificName: "Vicia faba", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.5, middle: 1.15, end: 0.3, assumptions: ["Table 12 'Fababean (broad bean) - Dry/Seed' row: Kc ini 0.5, Kc mid 1.15, Kc end 0.30. Footnote 2 gives Kc mid 1.20 on stalks reaching 1.5-2 m; 1.15 assumes no tall stalks."] },
    warnings: [],
  },
  mungBean: {
    cropPurposeId: "mung-bean-dry", commonName: "Mung bean (dry grain)", scientificName: "Vigna radiata", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.05, end: 0.35, assumptions: [legumeGroupKcIni, "Table 12 'Green Gram and Cowpeas' row: Kc mid 1.05; Kc end 0.35 is the harvested-dry value (footnote 6)."] },
    warnings: ["FAO-56 gives one shared row for green gram (mung bean) and cowpea; this profile does not distinguish them."],
  },
  cowpea: {
    cropPurposeId: "cowpea-dry", commonName: "Cowpea (dry grain)", scientificName: "Vigna unguiculata", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.4, middle: 1.05, end: 0.35, assumptions: [legumeGroupKcIni, "Table 12 'Green Gram and Cowpeas' row: Kc mid 1.05; Kc end 0.35 is the harvested-dry value (footnote 6)."] },
    warnings: ["FAO-56 gives one shared row for green gram (mung bean) and cowpea; this profile does not distinguish them."],
  },
  sunflower: {
    cropPurposeId: "sunflower-seed", commonName: "Sunflower (seed)", scientificName: "Helianthus annuus", family: "Asteraceae", isLegume: false,
    kc: { initial: 0.35, middle: 1.0, end: 0.35, assumptions: [oilGroupKcIni, rainfedLowerKcMid, "Table 12 'Sunflower' row: Kc end 0.35."] },
    warnings: [],
  },
  safflower: {
    cropPurposeId: "safflower-seed", commonName: "Safflower (seed)", scientificName: "Carthamus tinctorius", family: "Asteraceae", isLegume: false,
    kc: { initial: 0.35, middle: 1.0, end: 0.25, assumptions: [oilGroupKcIni, rainfedLowerKcMid, "Table 12 'Safflower' row: Kc end 0.25."] },
    warnings: [],
  },
  potato: {
    cropPurposeId: "potato", commonName: "Potato", scientificName: "Solanum tuberosum", family: "Solanaceae", isLegume: false,
    kc: { initial: 0.5, middle: 1.15, end: 0.75, assumptions: [tuberGroupKcIni, "Table 12 'Potato' row: Kc mid 1.15, Kc end 0.75. Footnote 4 gives about 0.40 for long-season potatoes with vine kill; vine kill is not assumed."] },
    warnings: [],
  },
  sweetPotato: {
    cropPurposeId: "sweet-potato", commonName: "Sweet potato", scientificName: "Ipomoea batatas", family: "Convolvulaceae", isLegume: false,
    kc: { initial: 0.5, middle: 1.15, end: 0.65, assumptions: [tuberGroupKcIni, "Table 12 'Sweet Potato' row: Kc mid 1.15, Kc end 0.65."] },
    warnings: [],
  },
  broccoli: {
    cropPurposeId: "broccoli", commonName: "Broccoli", scientificName: "Brassica oleracea var. italica", family: "Brassicaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Broccoli' row: Kc mid 1.05, Kc end 0.95."] },

    warnings: [],
  },
  brusselsSprouts: {
    cropPurposeId: "brussels-sprouts", commonName: "Brussels sprouts", scientificName: "Brassica oleracea var. gemmifera", family: "Brassicaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Brussel Sprouts' row: Kc mid 1.05, Kc end 0.95."] },
    warnings: [],
  },
  cabbage: {
    cropPurposeId: "cabbage", commonName: "Cabbage", scientificName: "Brassica oleracea var. capitata", family: "Brassicaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Cabbage' row: Kc mid 1.05, Kc end 0.95."] },
    warnings: [],
  },
  cauliflower: {
    cropPurposeId: "cauliflower", commonName: "Cauliflower", scientificName: "Brassica oleracea var. botrytis", family: "Brassicaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Cauliflower' row: Kc mid 1.05, Kc end 0.95."] },
    warnings: [],
  },
  carrot: {
    cropPurposeId: "carrot", commonName: "Carrot", scientificName: "Daucus carota", family: "Apiaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Carrots' row: Kc mid 1.05, Kc end 0.95."] },
    warnings: [],
  },
  celery: {
    cropPurposeId: "celery", commonName: "Celery", scientificName: "Apium graveolens", family: "Apiaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 1.0, assumptions: [smallVegGroupKcIni, "Table 12 'Celery' row: Kc mid 1.05, Kc end 1.00."] },
    warnings: [],
  },
  lettuce: {
    cropPurposeId: "lettuce", commonName: "Lettuce", scientificName: "Lactuca sativa", family: "Asteraceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.0, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Lettuce' row: Kc mid 1.00, Kc end 0.95."] },

    warnings: [],
  },
  onionDry: {
    cropPurposeId: "onion-dry", commonName: "Onion (dry bulb)", scientificName: "Allium cepa", family: "Amaryllidaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.05, end: 0.75, assumptions: [smallVegGroupKcIni, "Table 12 'Onions - dry' row: Kc mid 1.05, Kc end 0.75."] },
    warnings: [],
  },
  onionGreen: {
    cropPurposeId: "onion-green", commonName: "Onion (green)", scientificName: "Allium cepa", family: "Amaryllidaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.0, end: 1.0, assumptions: [smallVegGroupKcIni, "Table 12 'Onions - green' row: Kc mid 1.00, Kc end 1.00."] },
    warnings: [],
  },
  spinach: {
    cropPurposeId: "spinach", commonName: "Spinach", scientificName: "Spinacia oleracea", family: "Amaranthaceae", isLegume: false,
    kc: { initial: 0.7, middle: 1.0, end: 0.95, assumptions: [smallVegGroupKcIni, "Table 12 'Spinach' row: Kc mid 1.00, Kc end 0.95."] },
    warnings: [],
  },
  radish: {
    cropPurposeId: "radish", commonName: "Radish", scientificName: "Raphanus sativus", family: "Brassicaceae", isLegume: false,
    kc: { initial: 0.7, middle: 0.9, end: 0.85, assumptions: [smallVegGroupKcIni, "Table 12 'Radish' row: Kc mid 0.90, Kc end 0.85."] },
    warnings: [],
  },
  eggplant: {
    cropPurposeId: "eggplant", commonName: "Eggplant", scientificName: "Solanum melongena", family: "Solanaceae", isLegume: false,
    kc: { initial: 0.6, middle: 1.05, end: 0.9, assumptions: [solanumGroupKcIni, "Table 12 'Egg Plant' row: Kc mid 1.05, Kc end 0.90."] },
    warnings: [],
  },
  sweetPepper: {
    cropPurposeId: "sweet-pepper", commonName: "Sweet pepper (bell)", scientificName: "Capsicum annuum", family: "Solanaceae", isLegume: false,
    kc: { initial: 0.6, middle: 1.05, end: 0.9, assumptions: [solanumGroupKcIni, "Table 12 'Sweet Peppers (bell)' row: Kc mid 1.05, Kc end 0.90. Footnote 2 gives 1.15 for peppers grown on stalks reaching 1.5-2 m; tall stalks are not assumed."] },
    warnings: [],
  },
  tomato: {
    cropPurposeId: "tomato", commonName: "Tomato", scientificName: "Solanum lycopersicum", family: "Solanaceae", isLegume: false,
    kc: { initial: 0.6, middle: 1.15, end: 0.9, assumptions: [
      solanumGroupKcIni,
      "Table 12 'Tomato' row: Kc mid 1.15 (footnote 2 gives 1.20 for staked tomatoes on 1.5-2 m stalks; staking is not assumed).",
      "Kc end 0.90 is the higher value of the Table 12 range 0.70-0.90, which has no footnote; the higher value gives the more cautious water-demand estimate.",
    ] },
    warnings: [],
  },
  cantaloupe: {
    cropPurposeId: "cantaloupe", commonName: "Cantaloupe", scientificName: "Cucumis melo", family: "Cucurbitaceae", isLegume: false,
    kc: { initial: 0.5, middle: 0.85, end: 0.6, assumptions: ["Table 12 'Cantaloupe' row: Kc ini 0.5, Kc mid 0.85, Kc end 0.60."] },
    warnings: [],
  },
  pumpkin: {
    cropPurposeId: "pumpkin-winter-squash", commonName: "Pumpkin and winter squash", scientificName: "Cucurbita spp.", family: "Cucurbitaceae", isLegume: false,
    kc: { initial: 0.5, middle: 1.0, end: 0.8, assumptions: [cucurbitGroupKcIni, "Table 12 'Pumpkin, Winter Squash' row: Kc mid 1.00, Kc end 0.80."] },
    warnings: [],
  },
  zucchini: {
    cropPurposeId: "squash-zucchini", commonName: "Squash and zucchini", scientificName: "Cucurbita pepo", family: "Cucurbitaceae", isLegume: false,
    kc: { initial: 0.5, middle: 0.95, end: 0.75, assumptions: [cucurbitGroupKcIni, "Table 12 'Squash, Zucchini' row: Kc mid 0.95, Kc end 0.75."] },
    warnings: [],
  },
  sweetMelon: {
    cropPurposeId: "sweet-melon", commonName: "Sweet melon", scientificName: "Cucumis melo", family: "Cucurbitaceae", isLegume: false,
    kc: { initial: 0.5, middle: 1.05, end: 0.75, assumptions: [cucurbitGroupKcIni, "Table 12 'Sweet Melons' row: Kc mid 1.05, Kc end 0.75."] },
    warnings: [],
  },
  watermelon: {
    cropPurposeId: "watermelon", commonName: "Watermelon", scientificName: "Citrullus lanatus", family: "Cucurbitaceae", isLegume: false,
    kc: { initial: 0.4, middle: 1.0, end: 0.75, assumptions: ["Table 12 'Watermelon' row: Kc ini 0.4, Kc mid 1.00, Kc end 0.75."] },
    warnings: [],
  },
  tableBeet: {
    cropPurposeId: "beet-table", commonName: "Beet (table)", scientificName: "Beta vulgaris", family: "Amaranthaceae", isLegume: false,
    kc: { initial: 0.5, middle: 1.05, end: 0.95, assumptions: [tuberGroupKcIni, "Table 12 'Beets, table' row: Kc mid 1.05, Kc end 0.95."] },
    warnings: [],
  },
  greenBean: {
    cropPurposeId: "green-bean", commonName: "Green bean (fresh pods)", scientificName: "Phaseolus vulgaris", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.5, middle: 1.05, end: 0.9, assumptions: ["Table 12 'Beans, green' row: Kc ini 0.5, Kc mid 1.05, Kc end 0.90. Footnote 2 gives 1.15 for green beans grown on stalks reaching 1.5-2 m; tall stalks are not assumed."] },
    warnings: [],
  },
  peaFresh: {
    cropPurposeId: "pea-green", commonName: "Pea (fresh)", scientificName: "Pisum sativum", family: "Fabaceae", isLegume: true,
    kc: { initial: 0.5, middle: 1.15, end: 1.1, assumptions: ["Table 12 'Peas - Fresh' row: Kc ini 0.5, Kc mid 1.15, Kc end 1.10. Footnote 2 gives 1.20 for peas grown on stalks reaching 1.5-2 m; tall stalks are not assumed."] },
    warnings: ["FAO-56 Table 11 does not separate fresh and dry peas; the stage lengths are the same rows used for dry pea."],
  },
  sweetMaize: {
    cropPurposeId: "sweet-maize", commonName: "Sweet maize (sweet corn)", scientificName: "Zea mays", family: "Poaceae", isLegume: false,
    kc: { initial: 0.3, middle: 1.15, end: 1.05, assumptions: [cerealGroupKcIni, "Table 12 'Maize, Sweet' row: Kc mid 1.15; Kc end 1.05 applies when harvested fresh for human consumption (footnote 12)."] },
    warnings: [],
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
  readonly plantingWindow: Window | readonly Window[] | null;
  readonly plantingLabel: string;
  readonly precedence: number;
  readonly cultivarGroup: string;
  readonly kc?: Crop["kc"];
  readonly warnings?: readonly string[];
  readonly printedTotal: number;
  readonly publication: { readonly kind: "publish" } | { readonly kind: "withhold"; readonly reason: string };
}

const month = (start: string, end: string): Window => ({ startMonthDay: start, endMonthDayInclusive: end });
const springWheatKc = { initial: 0.3, middle: 1.15, end: 0.25, assumptions: ["Table 12 'Spring Wheat' row; Kc ini 0.3 is the cereals group value.", machineHarvest] };
const winterWheatKc = { initial: 0.7, middle: 1.15, end: 0.25, assumptions: ["Table 12 'Winter Wheat - with non-frozen soils' row (Kc ini 0.7), because the source region has mild winters.", machineHarvest] };

const californiaDesertBox =
  "The California desert rectangle also covers the neighbouring low desert around Yuma, Arizona and Mexicali, Baja California.";

const smallGrainRows = (crop: "barley" | "oats", name: string): Row[] => [
  {
    crop, slug: "california-desert-dec", table11Row: "Barley/Oats/Wheat | 20 | 50 | 60 | 30 | 160 | Dec | Calif. Desert, USA",
    printedTotal: 160, publication: { kind: "publish" },
    region: [regions.californiaDesert], regionLabel: "California desert, USA", stages: [20, 50, 60, 30],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 1, cultivarGroup: `${name}, California desert example (160-day season)`,
    warnings: [californiaDesertBox],
  },
  {
    crop, slug: "central-india-nov", table11Row: "Barley/Oats/Wheat | 15 | 25 | 50 | 30 | 120 | November | Central India",
    printedTotal: 120, publication: { kind: "publish" },
    region: [regions.centralIndia], regionLabel: "Central India", stages: [15, 25, 50, 30],
    plantingWindow: month("11-01", "11-30"), plantingLabel: "November", precedence: 2, cultivarGroup: `${name}, Central India example (120-day season)`,
  },
  {
    crop, slug: "east-africa-jul", table11Row: "Barley/Oats/Wheat | 15 | 30 | 65 | 40 | 150 | July | East Africa",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.eastAfrica], regionLabel: "East Africa", stages: [15, 30, 65, 40],
    plantingWindow: month("07-01", "07-31"), plantingLabel: "July", precedence: 3, cultivarGroup: `${name}, East Africa example (150-day season)`,
  },
  {
    crop, slug: "lat35-45n-mar-apr", table11Row: "Barley/Oats/Wheat | 20 | 25 | 60 | 30 | 135 | March/Apr | 35-45 °L",
    printedTotal: 135, publication: { kind: "publish" },
    region: [regions.latitude35To45North], regionLabel: "Latitudes 35-45 degrees north", stages: [20, 25, 60, 30],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 4, cultivarGroup: `${name}, 35-45 degree latitude example (135-day season)`,
    warnings: ["The source writes '35-45 °L'; this profile applies it to northern latitudes only."],
  },
];

const rows: readonly Row[] = [
  {
    crop: "maize", slug: "idaho-apr", table11Row: "Maize (grain) | 30 | 40 | 50 | 50 | 170 | April | Idaho, USA",
    printedTotal: 170, publication: { kind: "publish" },
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [30, 40, 50, 50],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Grain maize, Idaho example (170-day season)",
  },
  {
    crop: "maize", slug: "nigeria-humid-jun", table11Row: "Maize (grain) | 20 | 35 | 40 | 30 | 125 | June | Nigeria (humid)",
    printedTotal: 125, publication: { kind: "withhold", reason: "Current lookup cannot establish the source qualifier: humid Nigeria." },
    region: [regions.nigeria], regionLabel: "Nigeria (humid)", stages: [20, 35, 40, 30],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 2, cultivarGroup: "Grain maize, humid Nigeria example (125-day season)",
    warnings: ["The FAO-56 row describes humid Nigeria; drier northern areas inside the region rectangle are not distinguished."],
  },
  {
    crop: "maize", slug: "spain-california-apr", table11Row: "Maize (grain) | 30 | 40 | 50 | 30 | 150 | April | Spain (spr, sum.); Calif.",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.spain, regions.california], regionLabel: "Spain (spring/summer) and California", stages: [30, 40, 50, 30],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 3, cultivarGroup: "Grain maize, Spain and California example (150-day season)",
  },
  {
    crop: "maize", slug: "east-africa-highland-apr", table11Row: "Maize (grain) | 30 | 50 | 60 | 40 | 180 | April | East Africa (alt.)",
    printedTotal: 180, publication: { kind: "withhold", reason: "Current lookup cannot establish the source qualifier: highland elevation." },
    region: [regions.eastAfrica], regionLabel: "East Africa (highland)", stages: [30, 50, 60, 40],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 4, cultivarGroup: "Grain maize, East African highland example (180-day season)",
    warnings: ["The FAO-56 row is for East African highland (altitude) maize; this profile does not check field elevation."],
  },
  {
    crop: "maize", slug: "india-dry-cool-oct", table11Row: "Maize (grain) | 20 | 35 | 40 | 30 | 125 | October | India (dry, cool)",
    printedTotal: 125, publication: { kind: "withhold", reason: "Current lookup cannot establish the source qualifier: dry, cool season." },
    region: [regions.india], regionLabel: "India (dry, cool season)", stages: [20, 35, 40, 30],
    plantingWindow: month("10-01", "10-31"), plantingLabel: "October", precedence: 5, cultivarGroup: "Grain maize, Indian dry cool-season example (125-day season)",
    warnings: ["The FAO-56 row describes the dry, cool season in India; other Indian seasons are not represented."],
  },
  {
    crop: "bean", slug: "idaho-jun", table11Row: "Beans (dry) | 25 | 25 | 30 | 20 | 100 | June | Idaho, USA",
    printedTotal: 100, publication: { kind: "publish" },
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [25, 25, 30, 20],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 1, cultivarGroup: "Dry bean, Idaho example (100-day season)",
  },
  {
    crop: "bean", slug: "pakistan-california-jun", table11Row: "Beans (dry) | 15 | 25 | 35 | 20 | 95 | June | Pakistan, Calif.",
    printedTotal: 95, publication: { kind: "publish" },
    region: [regions.pakistan, regions.california], regionLabel: "Pakistan and California", stages: [15, 25, 35, 20],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 2, cultivarGroup: "Dry bean, Pakistan and California example (95-day season)",
  },
  {
    crop: "wheat", slug: "central-india-nov", table11Row: "Barley/Oats/Wheat | 15 | 25 | 50 | 30 | 120 | November | Central India",
    printedTotal: 120, publication: { kind: "publish" },
    region: [regions.centralIndia], regionLabel: "Central India", stages: [15, 25, 50, 30],
    plantingWindow: month("11-01", "11-30"), plantingLabel: "November", precedence: 1, kc: springWheatKc,
    cultivarGroup: "Spring-type wheat, Central India example (120-day season)", warnings: [sharedSmallGrainRow],
  },
  {
    crop: "wheat", slug: "california-winter-dec", table11Row: "Winter Wheat | 20 | 60 | 70 | 30 | 180 | December | Calif., USA",
    printedTotal: 180, publication: { kind: "withhold", reason: "Current lookup cannot establish non-frozen soil for the selected winter-wheat coefficient." },
    region: [regions.california], regionLabel: "California, USA", stages: [20, 60, 70, 30],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 2, kc: winterWheatKc,
    cultivarGroup: "Winter wheat, California example (180-day season)",
  },
  {
    crop: "wheat", slug: "east-africa-jul", table11Row: "Barley/Oats/Wheat | 15 | 30 | 65 | 40 | 150 | July | East Africa",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.eastAfrica], regionLabel: "East Africa", stages: [15, 30, 65, 40],
    plantingWindow: month("07-01", "07-31"), plantingLabel: "July", precedence: 3, kc: springWheatKc,
    cultivarGroup: "Spring-type wheat, East Africa example (150-day season)", warnings: [sharedSmallGrainRow],
  },
  {
    crop: "wheat", slug: "mediterranean-winter-nov", table11Row: "Winter Wheat | 30 | 140 | 40 | 30 | 240 | November | Mediterranean",
    printedTotal: 240, publication: { kind: "withhold", reason: "Current lookup cannot establish non-frozen soil for the selected winter-wheat coefficient." },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 140, 40, 30],
    plantingWindow: month("11-01", "11-30"), plantingLabel: "November", precedence: 4, kc: winterWheatKc,
    cultivarGroup: "Winter wheat, Mediterranean example (240-day season)",
    warnings: ["The Mediterranean region rectangle also covers mountain and inland areas where winter soils can freeze; there FAO-56 gives Kc ini 0.4 instead of the non-frozen 0.7 used here."],
  },
  {
    crop: "wheat", slug: "lat35-45n-mar-apr", table11Row: "Barley/Oats/Wheat | 20 | 25 | 60 | 30 | 135 | March/Apr | 35-45 °L",
    printedTotal: 135, publication: { kind: "publish" },
    region: [regions.latitude35To45North], regionLabel: "Latitudes 35-45 degrees north", stages: [20, 25, 60, 30],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 5, kc: springWheatKc,
    cultivarGroup: "Spring-type wheat, 35-45 degree latitude example (135-day season)",
    warnings: [sharedSmallGrainRow, "The source writes '35-45 °L'; this profile applies it to northern latitudes only."],
  },
  {
    crop: "rice", slug: "mediterranean-may", table11Row: "Rice | 30 | 30 | 60 | 30 | 150 | Dec; May | Tropics; Mediterranean",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 30, 60, 30],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 1, cultivarGroup: "Paddy rice, Mediterranean example (150-day season)",
    warnings: ["The FAO-56 cell 'Dec; May' with region 'Tropics; Mediterranean' is read as May planting for the Mediterranean."],
  },
  {
    crop: "rice", slug: "tropics-dec", table11Row: "Rice | 30 | 30 | 60 | 30 | 150 | Dec; May | Tropics; Mediterranean",
    printedTotal: 150, publication: { kind: "publish" },
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
    printedTotal: 105, publication: { kind: "publish" },
    region: [regions.pakistan], regionLabel: "Pakistan", stages: [15, 25, 40, 25],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 1, cultivarGroup: "Millet, Pakistan example (105-day season)",
  },
  {
    crop: "millet", slug: "central-usa-apr", table11Row: "Millet | 20 | 30 | 55 | 35 | 140 | April | Central USA",
    printedTotal: 140, publication: { kind: "publish" },
    region: [regions.centralUsa], regionLabel: "Central USA", stages: [20, 30, 55, 35],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 2, cultivarGroup: "Millet, Central USA example (140-day season)",
  },
  {
    crop: "sorghum", slug: "usa-pakistan-mediterranean-may-jun", table11Row: "Sorghum | 20 | 35 | 40 | 30 | 130 | May/June | USA, Pakis., Med.",
    printedTotal: 130, publication: { kind: "publish" },
    region: [regions.contiguousUsa, regions.pakistan, regions.mediterranean], regionLabel: "USA, Pakistan and Mediterranean", stages: [20, 35, 40, 30],
    plantingWindow: month("05-01", "06-30"), plantingLabel: "May/June", precedence: 1, cultivarGroup: "Grain sorghum, USA/Pakistan/Mediterranean example (125 stage days; printed total unresolved)",
    warnings: ["The USA rectangle also covers northern Mexico and the southern edge of Canada; the source names only the USA."],
  },
  {
    crop: "soybean", slug: "japan-jun", table11Row: "Soybeans | 20 | 25 | 75 | 30 | 150 | June | Japan",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.japanHonshuKyushuShikoku, regions.japanHokkaido], regionLabel: "Japan", stages: [20, 25, 75, 30],
    plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 1, cultivarGroup: "Soybean, Japan example (150-day season)",
  },
  {
    crop: "soybean", slug: "central-usa-may", table11Row: "Soybeans | 20 | 30/35 | 60 | 25 | 140 | May | Central USA",
    printedTotal: 140, publication: { kind: "publish" },
    region: [regions.centralUsa], regionLabel: "Central USA", stages: [20, 35, 60, 25],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 2, cultivarGroup: "Soybean, Central USA example (140-day season)",
    warnings: ["The FAO-56 development cell reads '30/35'; 35 days is used because only it matches the row total of 140 days."],
  },
  {
    crop: "soybean", slug: "tropics-dec", table11Row: "Soybeans | 15 | 15 | 40 | 15 | 85 | Dec | Tropics",
    printedTotal: 85, publication: { kind: "publish" },
    region: [regions.tropics], regionLabel: "Tropics", stages: [15, 15, 40, 15],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 3, cultivarGroup: "Soybean, tropical example (85-day season)",
  },
  {
    crop: "groundnut", slug: "mediterranean", table11Row: "Groundnut | 35 | 45 | 35 | 25 | 140 | (May or May/June; cell misaligned) | Mediterranean",
    printedTotal: 140, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [35, 45, 35, 25],
    plantingWindow: null, plantingLabel: "unconfirmed-month", precedence: 1, cultivarGroup: "Groundnut, Mediterranean example (140-day season)",
  },
  {
    crop: "groundnut", slug: "west-africa-dry-season", table11Row: "Groundnut | 25 | 35 | 45 | 25 | 130 | Dry season | West Africa",
    printedTotal: 130, publication: { kind: "withhold", reason: "Current lookup cannot establish the source qualifier: dry season." },
    region: [regions.westAfrica], regionLabel: "West Africa (dry season)", stages: [25, 35, 45, 25],
    plantingWindow: null, plantingLabel: "dry season", precedence: 2, cultivarGroup: "Groundnut, West Africa dry-season example (130-day season)",
  },
  {
    crop: "lentil", slug: "europe-apr", table11Row: "Lentil | 20 | 30 | 60 | 40 | 150 | April | Europe",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.europe], regionLabel: "Europe", stages: [20, 30, 60, 40],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Lentil, Europe example (150-day season)",
  },
  {
    crop: "pea", slug: "idaho-apr", table11Row: "Peas | 35 | 25 | 30 | 20 | 110 | April | Idaho, USA",
    printedTotal: 110, publication: { kind: "publish" },
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [35, 25, 30, 20],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Dry pea, Idaho example (110-day season)",
  },
  {
    crop: "pea", slug: "mediterranean-mar-apr", table11Row: "Peas | 20 | 30 | 35 | 15 | 100 | Mar/Apr | Mediterranean",
    printedTotal: 100, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 35, 15],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 2, cultivarGroup: "Dry pea, Mediterranean example (100-day season)",
  },
  {
    crop: "pea", slug: "europe-may", table11Row: "Peas | 15 | 25 | 35 | 15 | 90 | May | Europe",
    printedTotal: 90, publication: { kind: "publish" },
    region: [regions.europe], regionLabel: "Europe", stages: [15, 25, 35, 15],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 3, cultivarGroup: "Dry pea, Europe example (90-day season)",
  },
  {
    crop: "faba", slug: "mediterranean-mar-apr", table11Row: "Faba bean, broad bean | 20 | 30 | 35 | 15 | 100 | Mar/Apr | Mediterranean",
    printedTotal: 100, publication: { kind: "withhold", reason: "The short source row does not establish dry-seed harvest. The separate 235-day dry row is not substituted; Kc mid 1.15 requires the tall-stalk qualification." },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 35, 15],
    plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 1, cultivarGroup: "Faba bean, Mediterranean example (100-day season)",
  },
  {
    crop: "faba", slug: "europe-may", table11Row: "Faba bean, broad bean | 15 | 25 | 35 | 15 | 90 | May | Europe",
    printedTotal: 90, publication: { kind: "withhold", reason: "The short source row does not establish dry-seed harvest. The separate 235-day dry row is not substituted; Kc mid 1.15 requires the tall-stalk qualification." },
    region: [regions.europe], regionLabel: "Europe", stages: [15, 25, 35, 15],
    plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 2, cultivarGroup: "Faba bean, Europe example (90-day season)",
  },
  {
    crop: "mungBean", slug: "mediterranean-mar", table11Row: "Green gram, cowpeas | 20 | 30 | 30 | 20 | 110 | March | Mediterranean",
    printedTotal: 110, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 30, 20],
    plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 1, cultivarGroup: "Mung bean, Mediterranean example (100 stage days; printed total unresolved)",
  },
  {
    crop: "cowpea", slug: "mediterranean-mar", table11Row: "Green gram, cowpeas | 20 | 30 | 30 | 20 | 110 | March | Mediterranean",
    printedTotal: 110, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 30, 20],
    plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 1, cultivarGroup: "Cowpea, Mediterranean example (100 stage days; printed total unresolved)",
  },
  {
    crop: "sunflower", slug: "mediterranean-california-apr-may", table11Row: "Sunflower | 25 | 35 | 45 | 25 | 130 | April/May | Medit.; California",
    printedTotal: 130, publication: { kind: "publish" },
    region: [regions.mediterranean, regions.california], regionLabel: "Mediterranean and California", stages: [25, 35, 45, 25],
    plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 1, cultivarGroup: "Sunflower, Mediterranean and California example (130-day season)",
  },
  {
    crop: "safflower", slug: "california-apr", table11Row: "Safflower | 20 | 35 | 45 | 25 | 125 | April | California, USA",
    printedTotal: 125, publication: { kind: "publish" },
    region: [regions.california], regionLabel: "California, USA", stages: [20, 35, 45, 25],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Safflower, California example (125-day season)",
  },
  {
    crop: "potato", slug: "california-desert-dec", table11Row: "Potato | 30 | 35 | 50 | 25 | 140 | Dec | Calif. Desert, USA",
    printedTotal: 140, publication: { kind: "publish" },
    region: [regions.californiaDesert], regionLabel: "California desert, USA", stages: [30, 35, 50, 25],
    plantingWindow: month("12-01", "12-31"), plantingLabel: "December", precedence: 1, cultivarGroup: "Potato, California desert example (140-day season)",
    warnings: [californiaDesertBox],
  },
  {
    crop: "potato", slug: "idaho-apr-may", table11Row: "Potato | 45 | 30 | 70 | 20 | 165 | Apr/May | Idaho, USA",
    printedTotal: 165, publication: { kind: "publish" },
    region: [regions.idaho], regionLabel: "Idaho, USA", stages: [45, 30, 70, 20],
    plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 2, cultivarGroup: "Potato, Idaho example (165-day season)",
  },
  {
    crop: "potato", slug: "europe-apr", table11Row: "Potato | 30 | 35 | 50 | 30 | 145 | April | Europe",
    printedTotal: 145, publication: { kind: "publish" },
    region: [regions.europe], regionLabel: "Europe", stages: [30, 35, 50, 30],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 3, cultivarGroup: "Potato, Europe example (145-day season)",
  },
  {
    crop: "sweetPotato", slug: "mediterranean-apr", table11Row: "Sweet potato | 20 | 30 | 60 | 40 | 150 | April | Mediterranean",
    printedTotal: 150, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 60, 40],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Sweet potato, Mediterranean example (150-day season)",
  },
  {
    crop: "sweetPotato", slug: "tropics-rainy-season", table11Row: "Sweet potato | 15 | 30 | 50 | 30 | 125 | Rainy seas. | Tropical regions",
    printedTotal: 125, publication: { kind: "withhold", reason: "Current lookup cannot establish the source qualifier: rainy season." },
    region: [regions.tropics], regionLabel: "Tropical regions (rainy season)", stages: [15, 30, 50, 30],
    plantingWindow: null, plantingLabel: "rainy season", precedence: 2, cultivarGroup: "Sweet potato, tropical rainy-season example (125-day season)",
  },
  ...vegetableRows(),
];

function vegetableRows(): Row[] {
  const firstListed = (others: string) =>
    `FAO-56 Table 11 also lists ${others} for this region; the planner selects profiles by location only, so Gilir releases the first-listed row.`;
  const crucifers = "FAO-56 Table 11 gives this row for 'Crucifers', which footnote 1 says include cabbage, cauliflower, broccoli and Brussels sprouts.";
  const cruciferRow = (crop: "broccoli" | "brusselsSprouts" | "cabbage" | "cauliflower", name: string, precedence: number): Row => ({
    crop, slug: "crucifers-mediterranean-apr", table11Row: "Crucifers | 20 | 30 | 20 | 10 | 80 | April | Mediterranean",
    printedTotal: 80, publication: { kind: "publish" },
    region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 20, 10],
    plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence, cultivarGroup: `${name}, Mediterranean crucifer example (80-day season)`,
    warnings: [crucifers, firstListed("Crucifers rows of 95 days (February) and 195 days (Oct/Nov)")],
  });
  const desert = (crop: CropKey, slug: string, cells: string, stages: Stages, window: Window, label: string, name: string, printedTotal: number): Row => ({
    crop, slug, table11Row: cells, printedTotal, publication: { kind: "publish" }, region: [regions.californiaDesert], regionLabel: "California desert, USA", stages,
    plantingWindow: window, plantingLabel: label, precedence: 1, cultivarGroup: `${name}, California desert example (${printedTotal}-day season)`,
    warnings: [californiaDesertBox],
  });
  return [
    desert("broccoli", "california-desert-sep", "Broccoli | 35 | 45 | 40 | 15 | 135 | Sept | Calif. Desert, USA", [35, 45, 40, 15], month("09-01", "09-30"), "September", "Broccoli", 135),
    cruciferRow("broccoli", "Broccoli", 2),
    cruciferRow("brusselsSprouts", "Brussels sprouts", 1),
    desert("cabbage", "california-desert-sep", "Cabbage | 40 | 60 | 50 | 15 | 165 | Sept | Calif. Desert, USA", [40, 60, 50, 15], month("09-01", "09-30"), "September", "Cabbage", 165),
    cruciferRow("cabbage", "Cabbage", 2),
    desert("cauliflower", "california-desert-sep", "Cauliflower | 35 | 50 | 40 | 15 | 140 | Sept | Calif. Desert, USA", [35, 50, 40, 15], month("09-01", "09-30"), "September", "Cauliflower", 140),
    cruciferRow("cauliflower", "Cauliflower", 2),
    desert("carrot", "california-desert-oct", "Carrots | 30 | 50 | 90 | 30 | 200 | Oct | Calif. Desert, USA", [30, 50, 90, 30], month("10-01", "10-31"), "October", "Carrot", 200),
    {
      crop: "carrot", slug: "mediterranean-feb-mar", table11Row: "Carrots | 30 | 40 | 60 | 20 | 150 | Feb/Mar | Mediterranean",
      printedTotal: 150, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 40, 60, 20],
      plantingWindow: month("02-01", "03-31"), plantingLabel: "February/March", precedence: 2, cultivarGroup: "Carrot, Mediterranean example (150-day season)",
    },
    {
      crop: "celery", slug: "mediterranean-apr", table11Row: "Celery | 25 | 40 | 45 | 15 | 125 | April | Mediterranean",
      printedTotal: 125, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [25, 40, 45, 15],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Celery, Mediterranean example (125-day season)",
    },
    {
      crop: "lettuce", slug: "mediterranean-apr", table11Row: "Lettuce | 20 | 30 | 15 | 10 | 75 | April | Mediterranean",
      printedTotal: 75, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 15, 10],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Lettuce, Mediterranean example (75-day season)",
     warnings: [firstListed("lettuce rows of 105 days (Nov/Jan) and 140 days (February)")],
    },
    {
      crop: "onionDry", slug: "california-jan", table11Row: "Onion (dry) | 20 | 35 | 110 | 45 | 210 | Oct; Jan. | Arid Region; Calif.",
      printedTotal: 210, publication: { kind: "publish" },
      region: [regions.california], regionLabel: "California", stages: [20, 35, 110, 45],
      plantingWindow: month("01-01", "01-31"), plantingLabel: "January", precedence: 1, cultivarGroup: "Dry onion, California example (210-day season)",
     warnings: ["The FAO-56 cell 'Oct; Jan.' with region 'Arid Region; Calif.' is read as January planting for California."],
    },
    {
      crop: "onionDry", slug: "mediterranean-apr", table11Row: "Onion (dry) | 15 | 25 | 70 | 40 | 150 | April | Mediterranean",
      printedTotal: 150, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [15, 25, 70, 40],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 2, cultivarGroup: "Dry onion, Mediterranean example (150-day season)",
    },
    {
      crop: "onionGreen", slug: "california-mar", table11Row: "Onion (green) | 30 | 55 | 55 | 40 | 180 | March | Calif., USA",
      printedTotal: 180, publication: { kind: "publish" },
      region: [regions.california], regionLabel: "California, USA", stages: [30, 55, 55, 40],
      plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 1, cultivarGroup: "Green onion, California example (180-day season)",
    },
    {
      crop: "onionGreen", slug: "mediterranean-apr-may", table11Row: "Onion (green) | 25 | 30 | 10 | 5 | 70 | April/May | Mediterranean",
      printedTotal: 70, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [25, 30, 10, 5],
      plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 2, cultivarGroup: "Green onion, Mediterranean example (70-day season)",
    },
    {
      crop: "spinach", slug: "mediterranean-apr", table11Row: "Spinach | 20 | 20 | 15/25 | 5 | 60/70 | Apr; Sep/Oct | Mediterranean",
      printedTotal: 60, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 20, 15, 5],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Spinach, Mediterranean April example (60-day season)",
     warnings: [
        "The FAO-56 row packs two seasons ('15/25' mid-season, '60/70' total, 'Apr; Sep/Oct'); the first values (April, 60 days) are used.",
        firstListed("the Sep/Oct variant of the same row (70 days)"),
      ],
    },
    {
      crop: "radish", slug: "mediterranean-europe-mar-apr", table11Row: "Radish | 5 | 10 | 15 | 5 | 35 | Mar/Apr | Medit.; Europe",
      printedTotal: 35, publication: { kind: "publish" },
      region: [regions.mediterranean, regions.europe], regionLabel: "Mediterranean and Europe", stages: [5, 10, 15, 5],
      plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 1, cultivarGroup: "Radish, Mediterranean and Europe example (35-day season)",
    },
    {
      crop: "eggplant", slug: "mediterranean-may-jun", table11Row: "Egg plant | 30 | 45 | 40 | 25 | 40 | May/June | Mediterranean",
      printedTotal: 40, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 45, 40, 25],
      plantingWindow: month("05-01", "06-30"), plantingLabel: "May/June", precedence: 1, cultivarGroup: "Eggplant, Mediterranean example (140-day season)",
    },
    {
      crop: "sweetPepper", slug: "europe-mediterranean-apr-jun", table11Row: "Sweet peppers (bell) | 25/30 | 35 | 40 | 20 | 125 | April/June | Europe and Medit.",
      printedTotal: 125, publication: { kind: "withhold", reason: "The initial-stage 25/30 and April/June pairing remain unresolved; May is not a sourced planting month." },
      region: [regions.europe, regions.mediterranean], regionLabel: "Europe and Mediterranean", stages: [30, 35, 40, 20],
      plantingWindow: month("04-01", "06-30"), plantingLabel: "April/June", precedence: 1, cultivarGroup: "Sweet pepper, Europe and Mediterranean example (125-day season)",
     warnings: ["The FAO-56 initial-stage cell reads '25/30'; 30 days is used because only it matches the row total of 125 days."],
    },
    desert("tomato", "california-desert-jan", "Tomato | 25 | 40 | 60 | 30 | 155 | Jan | Calif. Desert, USA", [25, 40, 60, 30], month("01-01", "01-31"), "January", "Tomato", 155),
    {
      crop: "tomato", slug: "california-apr-may", table11Row: "Tomato | 35 | 40 | 50 | 30 | 155 | Apr/May | Calif., USA",
      printedTotal: 155, publication: { kind: "publish" },
      region: [regions.california], regionLabel: "California, USA", stages: [35, 40, 50, 30],
      plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 2, cultivarGroup: "Tomato, California example (155-day season)",
    },
    {
      crop: "tomato", slug: "mediterranean-apr-may", table11Row: "Tomato | 30 | 40 | 45 | 30 | 145 | April/May | Mediterranean",
      printedTotal: 145, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [30, 40, 45, 30],
      plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 3, cultivarGroup: "Tomato, Mediterranean example (145-day season)",
    },
    {
      crop: "cantaloupe", slug: "california-jan", table11Row: "Cantaloupe | 30 | 45 | 35 | 10 | 120 | Jan | Calif., USA",
      printedTotal: 120, publication: { kind: "publish" },
      region: [regions.california], regionLabel: "California, USA", stages: [30, 45, 35, 10],
      plantingWindow: month("01-01", "01-31"), plantingLabel: "January", precedence: 1, cultivarGroup: "Cantaloupe, California example (120-day season)",
     warnings: [firstListed("a 120-day cantaloupe row planted in August (10/60/25/25)")],
    },
    {
      crop: "pumpkin", slug: "mediterranean-mar-aug", table11Row: "Pumpkin, Winter squash | 20 | 30 | 30 | 20 | 100 | Mar, Aug | Mediterranean",
      printedTotal: 100, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 30, 20],
      plantingWindow: [month("03-01", "03-31"), month("08-01", "08-31")], plantingLabel: "March or August", precedence: 1,
      cultivarGroup: "Pumpkin and winter squash, Mediterranean example (100-day season)",
    },
    {
      crop: "pumpkin", slug: "europe-jun", table11Row: "Pumpkin, Winter squash | 25 | 35 | 35 | 25 | 120 | June | Europe",
      printedTotal: 120, publication: { kind: "publish" },
      region: [regions.europe], regionLabel: "Europe", stages: [25, 35, 35, 25],
      plantingWindow: month("06-01", "06-30"), plantingLabel: "June", precedence: 2, cultivarGroup: "Pumpkin and winter squash, Europe example (120-day season)",
    },
    {
      crop: "zucchini", slug: "mediterranean-apr", table11Row: "Squash, Zucchini | 25 | 35 | 25 | 15 | 100 | Apr; Dec. | Medit.; Arid Reg.",
      printedTotal: 100, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [25, 35, 25, 15],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Squash and zucchini, Mediterranean example (100-day season)",
     warnings: [
        "The FAO-56 cell 'Apr; Dec.' with region 'Medit.; Arid Reg.' is read as April planting for the Mediterranean.",
        firstListed("a 90-day row (May/June, 'Medit.; Europe')"),
      ],
    },
    {
      crop: "zucchini", slug: "europe-may-jun", table11Row: "Squash, Zucchini | 20 | 30 | 25 | 15 | 90 | May/June | Medit.; Europe",
      printedTotal: 90, publication: { kind: "publish" },
      region: [regions.europe], regionLabel: "Europe", stages: [20, 30, 25, 15],
      plantingWindow: month("05-01", "06-30"), plantingLabel: "May/June", precedence: 2, cultivarGroup: "Squash and zucchini, Europe example (90-day season)",
     warnings: ["This FAO-56 row names 'Medit.; Europe'; the Mediterranean uses the first-listed row, so this profile covers Europe only."],
    },
    desert("sweetMelon", "california-desert-aug", "Sweet melons | 15 | 40 | 65 | 15 | 135 | Aug | Calif. Desert, USA", [15, 40, 65, 15], month("08-01", "08-31"), "August", "Sweet melon", 135),
    {
      crop: "sweetMelon", slug: "california-mar", table11Row: "Sweet melons | 30 | 30 | 50 | 30 | 140 | March | Calif., USA",
      printedTotal: 140, publication: { kind: "publish" },
      region: [regions.california], regionLabel: "California, USA", stages: [30, 30, 50, 30],
      plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 2, cultivarGroup: "Sweet melon, California example (140-day season)",
    },
    {
      crop: "sweetMelon", slug: "mediterranean-may", table11Row: "Sweet melons | 25 | 35 | 40 | 20 | 120 | May | Mediterranean",
      printedTotal: 120, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [25, 35, 40, 20],
      plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 3, cultivarGroup: "Sweet melon, Mediterranean example (120-day season)",
    },
    {
      crop: "watermelon", slug: "italy-apr", table11Row: "Water melons | 20 | 30 | 30 | 30 | 110 | April | Italy",
      printedTotal: 110, publication: { kind: "publish" },
      region: [regions.italy], regionLabel: "Italy", stages: [20, 30, 30, 30],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Watermelon, Italy example (110-day season)",
    },
    {
      crop: "tableBeet", slug: "mediterranean-apr-may", table11Row: "Beets, table | 15 | 25 | 20 | 10 | 70 | Apr/May | Mediterranean",
      printedTotal: 70, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [15, 25, 20, 10],
      plantingWindow: month("04-01", "05-31"), plantingLabel: "April/May", precedence: 1, cultivarGroup: "Table beet, Mediterranean example (70-day season)",
     warnings: [firstListed("a 90-day row (Feb/Mar, 'Mediterranean & Arid')")],
    },
    {
      crop: "greenBean", slug: "egypt-lebanon-aug-sep", table11Row: "Beans (green) | 15 | 25 | 25 | 10 | 75 | Aug/Sep | Calif., Egypt, Lebanon",
      printedTotal: 75, publication: { kind: "publish" },
      region: [regions.egypt, regions.lebanon], regionLabel: "Egypt and Lebanon", stages: [15, 25, 25, 10],
      plantingWindow: month("08-01", "09-30"), plantingLabel: "August/September", precedence: 1, cultivarGroup: "Green bean, Egypt and Lebanon example (75-day season)",
     warnings: [
        "This FAO-56 row also names California, which uses the first-listed green bean row; this profile covers Egypt and Lebanon only.",
        "Egypt and Lebanon are named in this row, so they get it ahead of the broader Mediterranean row; the Egypt rectangle also reaches Israel, Palestine, western Jordan and north-west Saudi Arabia.",
      ],
    },
    {
      crop: "greenBean", slug: "california-mediterranean-feb-mar", table11Row: "Beans (green) | 20 | 30 | 30 | 10 | 90 | Feb/Mar | Calif., Mediterranean",
      printedTotal: 90, publication: { kind: "publish" },
      region: [regions.california, regions.mediterranean], regionLabel: "California and Mediterranean", stages: [20, 30, 30, 10],
      plantingWindow: month("02-01", "03-31"), plantingLabel: "February/March", precedence: 2, cultivarGroup: "Green bean, California and Mediterranean example (90-day season)",
     warnings: ["For California, FAO-56 Table 11 also lists a 75-day green bean row (Aug/Sep); the planner selects profiles by location only, so Gilir releases the first-listed row."],
    },
    {
      crop: "peaFresh", slug: "idaho-apr", table11Row: "Peas | 35 | 25 | 30 | 20 | 110 | April | Idaho, USA",
      printedTotal: 110, publication: { kind: "publish" },
      region: [regions.idaho], regionLabel: "Idaho, USA", stages: [35, 25, 30, 20],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 1, cultivarGroup: "Fresh pea, Idaho example (110-day season)",
    },
    {
      crop: "peaFresh", slug: "mediterranean-mar-apr", table11Row: "Peas | 20 | 30 | 35 | 15 | 100 | Mar/Apr | Mediterranean",
      printedTotal: 100, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 30, 35, 15],
      plantingWindow: month("03-01", "04-30"), plantingLabel: "March/April", precedence: 2, cultivarGroup: "Fresh pea, Mediterranean example (100-day season)",
    },
    {
      crop: "peaFresh", slug: "europe-may", table11Row: "Peas | 15 | 25 | 35 | 15 | 90 | May | Europe",
      printedTotal: 90, publication: { kind: "publish" },
      region: [regions.europe], regionLabel: "Europe", stages: [15, 25, 35, 15],
      plantingWindow: month("05-01", "05-31"), plantingLabel: "May", precedence: 3, cultivarGroup: "Fresh pea, Europe example (90-day season)",
    },
    desert("sweetMaize", "california-desert-jan", "Maize (sweet) | 20 | 40 | 70 | 10 | 140 | Jan | Calif. Desert, USA", [20, 40, 70, 10], month("01-01", "01-31"), "January", "Sweet maize", 140),
    {
      crop: "sweetMaize", slug: "idaho-apr", table11Row: "Maize (sweet) | 30 | 30 | 30 | 10 (printed 103, footnote 3) | 110 | April | Idaho, USA",
      printedTotal: 110, publication: { kind: "withhold", reason: "The printed late-stage 103 interpretation and 110-day total remain unresolved." },
      region: [regions.idaho], regionLabel: "Idaho, USA", stages: [30, 30, 30, 10],
      plantingWindow: month("04-01", "04-30"), plantingLabel: "April", precedence: 2, cultivarGroup: "Sweet maize, Idaho example (100-day season)",
     warnings: ["The FAO-56 late-stage cell prints '103', read as 10 days with footnote 3 (late season about 35 days if the grain is allowed to mature and dry)."],
    },
    {
      crop: "sweetMaize", slug: "philippines-mar", table11Row: "Maize (sweet) | 20 | 20 | 30 | 10 | 80 | March | Philippines",
      printedTotal: 80, publication: { kind: "publish" },
      region: [regions.philippines], regionLabel: "Philippines", stages: [20, 20, 30, 10],
      plantingWindow: month("03-01", "03-31"), plantingLabel: "March", precedence: 3, cultivarGroup: "Sweet maize, Philippines example (80-day season)",
    },
    {
      crop: "sweetMaize", slug: "mediterranean-may-jun", table11Row: "Maize (sweet) | 20 | 25 | 25 | 10 | 80 | May/June | Mediterranean",
      printedTotal: 80, publication: { kind: "publish" },
      region: [regions.mediterranean], regionLabel: "Mediterranean", stages: [20, 25, 25, 10],
      plantingWindow: month("05-01", "06-30"), plantingLabel: "May/June", precedence: 4, cultivarGroup: "Sweet maize, Mediterranean example (80-day season)",
    },
  ];
}

function profileOf(row: Row) {
  const crop: Crop = crops[row.crop];
  const kc = row.kc ?? crop.kc;
  const [initial, development, middle, late] = row.stages;
  const total = initial + development + middle + late;
  const stageDays = { initial, development, middle, late };
  const publishedDurationDays: ReleasedRegistry["profiles"][number]["timing"]["publishedDurationDays"] =
    row.printedTotal === total
      ? { kind: "available", value: [row.printedTotal, row.printedTotal] }
      : { kind: "unavailable", reason: `FAO-56 Table 11 prints a ${row.printedTotal}-day total; the sourced stages sum to ${total} days. The published duration is unresolved.` };
  return {
    status: "released",
    review: reviewRecord,
    id: `${crop.cropPurposeId}-fao56-${row.slug}`,
    version: "reviewed-2026-11-15.1",
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
      publishedDurationDays,
      plantingWindows: (row.plantingWindow === null ? [] : Array.isArray(row.plantingWindow) ? row.plantingWindow : [row.plantingWindow])
        .map(window => ({ window, basis: "recommendation", sourceIds: table11 }) as const),
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
    temperatureRules: [],
    rotationRuleIds: [],
    preparation: [],
    warnings: [
      ...crop.warnings,
      ...(row.warnings ?? []),
      ...(publishedDurationDays.kind === "unavailable" ? [publishedDurationDays.reason] : []),
    ],
    sourceIds: [...table11, ...table12],
  } as const;
}

export function buildProfiles() {
  return rows.filter(row => row.publication.kind === "publish").map(profileOf);
}

export function buildCatalogueEntries(profiles: ReturnType<typeof buildProfiles>) {
  const entries = new Map(profiles.map(profile => [
    profile.cropPurposeId,
    { id: profile.cropPurposeId, label: profile.commonName, purpose: profile.purpose },
  ] as const));
  return [...entries.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}
