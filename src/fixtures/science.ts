import { defaultEngineSettings } from "@/contracts/climate";
import type { ClimateSnapshot, DailyWeather } from "@/contracts/climate";
import { parseIsoDate } from "@/contracts/common";
import type { EvidenceValue } from "@/contracts/common";
import type { FrozenRun, MetricInput, ReplaySeason } from "@/contracts/engine";
import { syntheticRegistrySchema } from "@/contracts/registry";
import { inputFixture } from "./input";

export const syntheticLabel = "Synthetic test data only. Values are invented and are not farm advice.";

const allocation = { initial: 1, development: 1, middle: 1, late: 1 };
const syntheticSourceIds = ["synthetic:no-publication"];
const applicability = { scope: { kind: "broad" }, exclusions: [], managementAssumptions: [syntheticLabel] };

export const syntheticRegistryFixture = syntheticRegistrySchema.parse({
  kind: "synthetic",
  label: syntheticLabel,
  identity: { catalogueVersion: "synthetic-catalogue", ruleVersion: "synthetic-rules" },
  catalogue: { version: "synthetic-catalogue", entries: [{ id: "synthetic-crop", label: "Synthetic crop", purpose: "food" }] },
  sources: [],
  profiles: [{
    status: "synthetic",
    id: "synthetic-profile",
    version: "synthetic-v1",
    cropPurposeId: "synthetic-crop",
    commonName: "Synthetic crop",
    scientificName: "No species assigned",
    family: "Synthetic family",
    isLegume: false,
    purpose: "food",
    cultivarGroup: "Synthetic cultivar group",
    productionSystem: "Synthetic production system",
    applicability,
    precedence: 1,
    timing: {
      generatedStageDays: allocation,
      historicalStageAllocations: [allocation],
      publishedDurationDays: { kind: "unavailable", reason: "No publication for this test fixture." },
      plantingWindows: [],
      turnaround: { basis: "scheduling_assumption", days: 1, assumption: syntheticLabel },
    },
    kc: {
      initial: 0.5, middle: 0.8, end: 0.6,
      stageInterpolation: "initial_middle_constant_development_late_linear_include_endpoints",
      assumptions: [syntheticLabel],
      sourceIds: syntheticSourceIds,
    },
    temperatureRules: [{
      id: "synthetic-heat",
      scope: { kind: "stage", stage: "middle" },
      period: "daily",
      variable: "max_c",
      predicate: "above",
      thresholdC: 35,
      sourceIds: syntheticSourceIds,
      limitations: [syntheticLabel],
    }],
    rotationRuleIds: [],
    preparation: [{ id: "synthetic-preparation", text: "Example preparation text for layout tests.", sourceIds: syntheticSourceIds }],
    warnings: [],
    sourceIds: syntheticSourceIds,
  }],
  rules: [],
  coverage: [],
});

function available(value: number): EvidenceValue<number> { return { kind: "available", value }; }

const weatherTemplate = {
  meanC: available(24), minC: available(18), maxC: available(30), humidityPct: available(60),
  wind2mMs: available(2), solarMjM2Day: available(18), pressureKpa: available(101.3),
};
const weather = (date: string, rainMm: EvidenceValue<number>): DailyWeather => ({
  date: parseIsoDate(date), rainMm, ...weatherTemplate,
});
const weatherDays = [
  weather("2000-07-01", available(0)),
  weather("2000-07-02", available(1)),
  weather("2000-07-03", available(10)),
  weather("2000-07-04", available(6)),
  weather("2000-07-05", { kind: "unavailable", reason: "Synthetic missing precipitation marker." }),
];

export const climateSnapshotFixture = {
  kind: "synthetic",
  label: syntheticLabel,
  id: "synthetic-weather",
  contentHash: "synthetic-no-content-hash",
  cutoff: parseIsoDate("2026-01-01"),
  retrievedAt: "2026-01-01T00:00:00Z",
  latitudeDeg: 15.005,
  elevationM: available(30),
  products: [],
  days: weatherDays,
} satisfies ClimateSnapshot;

export const replaySeasonFixture = {
  interval: { start: parseIsoDate("2000-07-01"), endExclusive: parseIsoDate("2000-07-05") },
  lookbackDays: [],
  days: weatherDays.slice(0, 4),
} satisfies ReplaySeason;

export const frozenRunFixture = {
  input: inputFixture,
  manifest: {
    schemaVersion: 1,
    normalizedInputHash: "synthetic-no-input-hash",
    engineVersion: "synthetic-engine",
    configurationVersion: "synthetic-settings",
    catalogueVersion: syntheticRegistryFixture.identity.catalogueVersion,
    ruleVersion: syntheticRegistryFixture.identity.ruleVersion,
    climateSnapshotIds: [climateSnapshotFixture.id],
    dataCutoff: climateSnapshotFixture.cutoff,
  },
  climate: [climateSnapshotFixture],
  settings: { ...defaultEngineSettings, targetSeasons: 1, minimumUsableSeasons: 1, version: "synthetic-settings" },
} satisfies FrozenRun;

export const metricInputFixture = {
  history: inputFixture.history,
  pestCoverage: { kind: "unavailable", reason: "No synthetic pest-host coverage is asserted." },
  calendar: {
    origin: "generated",
    horizon: { start: inputFixture.planningStart, endExclusive: parseIsoDate("2027-07-01") },
    occurrences: [{
      cropPurposeId: inputFixture.cropPurposeIds[0], profileId: "synthetic-profile", profileVersion: "synthetic-v1",
      planted: parseIsoDate("2026-07-01"), lastOccupied: parseIsoDate("2026-07-04"), fieldAvailable: parseIsoDate("2026-07-06"),
    }],
  },
  profiles: syntheticRegistryFixture.profiles,
  rules: syntheticRegistryFixture.rules,
  cohort: [replaySeasonFixture],
  settings: frozenRunFixture.settings,
  latitudeDeg: climateSnapshotFixture.latitudeDeg,
  elevationM: climateSnapshotFixture.elevationM,
  priority: inputFixture.priority,
} satisfies MetricInput;

export const registryResolutionFixture = {
  profiles: syntheticRegistryFixture.profiles,
  rules: syntheticRegistryFixture.rules,
  gaps: [],
  pestCoverage: { kind: "unavailable", reason: "No synthetic pest-host coverage is asserted." },
} satisfies import("@/contracts").RegistryResolution;
