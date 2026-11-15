// Snapshots the shared fixtures do not cover, for F3's tests only. Not a test file: Vitest includes only *.test.ts(x).
// Each variant is built from the shared fixtures (src/fixtures/results.ts) and parsed with completedSnapshotSchema, so
// a wrong shape fails here and not in a test. All but run_provenance keep provenance.kind "synthetic" and its label.
// The labels_ variants are version 2 snapshots with a frozen catalogue; every other variant is version 1.
// Engine-like texts in a variant are short and neutral, so the word tests can only find F3's own words. The one
// exception is insights' crop_profile reason, written as src/registry/resolve.ts writes it, raw crop id included.
// Evidence from any of these is fixture evidence and is named so: never crop evidence, never advice.
//
// Each plan's ranking tuple is worked out by hand from its dates: a day is unplanted unless a crop occupies it, so the
// days after a harvest count. calendar.test.ts checks every tuple against the year lines.
import { completedSnapshotSchema } from "@/contracts";
import type { CompletedSnapshot, PlanResult } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotsByState, resultFixtures } from "@/fixtures/results";
import { syntheticLabel, syntheticRegistryFixture } from "@/fixtures/science";

export const variantNames = [
  /** plan: baseline assessed and changed, all four change kinds in a known order, one unavailable delta, one descriptive delta. */
  "changed",
  /** plan: input history skipped, baseline not_recorded. */
  "skipped",
  /** plan: last year's rotation assessed but not eligible, as the engine emits it beside a plan: eligible false, recommendation changed. */
  "no_recommendation",
  /** plan: three crop ids like the released ones (maize-grain, common-bean-dry, rice-paddy), maize-grain twice. */
  "several_crops",
  /**
   * plan_with_warnings: a temperature_exposure warning, a temperature_rule gap, q90_mismatch and q90_temperature_exposure,
   * and each crop's own season numbers with the engine's ids and denominators.
   */
  "temperature",
  /** plan: water rain_plus_backup with water_context, approximate_history and profile_limitation notes, no flags. */
  "context",
  /**
   * insufficient_data: a crop_profile gap in the engine's words, monthly insights (rain median, p10, p90, mean
   * temperature), wet_day_frequency, search.ranking interrupted, and backup water with its water_context warning.
   */
  "insights",
  /** no_calendar_fit: a structural_exhaustion proof with constraints and expandedStates. */
  "structural",
  /** service_error: processing_failed, retryable false, with the explanation set to the error message, as the engine emits it. */
  "fatal",
  /** plan: provenance kind run with sources (one https, one javascript: address), rules and climate products. */
  "run_provenance",
  /** plan: preparation empty, as every released profile has it today. */
  "no_preparation",
  /** plan (not warnings): search.ranking limit_reached with a search_limit warning. */
  "limit_plan",
  /** no_calendar_fit: baseline assessed, not eligible, no_recommendation, as a search can prove no fit after assessing last year. */
  "no_fit_assessed",
  /** Version 2 of several_crops: the three crops carry their released labels, so the version 1 several_crops is its pair. */
  "labels_several",
  /** Version 2 of changed: synthetic-crop and synthetic-bean are labelled, and synthetic-old, known only from last year, is not in the catalogue. */
  "labels_changed",
  /** Version 2 of temperature: the warned crop and the crop with no heat and cold limits are both labelled. */
  "labels_warnings",
] as const;
export type VariantName = (typeof variantNames)[number];

const { plan: planFixture, plan_with_warnings: warningsFixture, insufficient_data: missingFixture } = resultFixtures;
const { no_calendar_fit: noFitFixture, service_error: errorFixture } = resultFixtures;
const [fixtureOccurrence] = planFixture.plan.occurrences;
const { seasonMetrics } = fixtureOccurrence;

function metric(id: string, label: string, value: number, unit: string, basis = "estimated") {
  return {
    id, label, value: { kind: "available", value }, unit, basis, methodVersion: "synthetic-v1", sourceIds: [],
    denominator: { kind: "available", value: { count: 1, unit: "seasons" } }, assumptions: [syntheticLabel],
  };
}

/** One season's numbers for one crop, as the engine writes them: F and M over rain windows, X over checked days. */
function cropSeason(replayStart: string, windows: number, frequency: number, mismatch: number, exposure: number | string, days: number) {
  const measured = (id: string, value: number | string, count: number, unit: string) => ({
    ...metric(id, `Synthetic ${id}`, 0, "fraction"),
    value: typeof value === "number" ? { kind: "available", value } : { kind: "unavailable", reason: value },
    denominator: count > 0 ? { kind: "available", value: { count, unit } } : { kind: "unavailable", reason: "Nothing to count in this example." },
  });
  return {
    replayStart,
    metrics: [measured("frequency", frequency, windows, "windows"), measured("mismatch", mismatch, windows, "windows"), measured("temperature_exposure", exposure, days, "days")],
  };
}

function occurrence(cropPurposeId: string, planted: string, lastOccupied: string, fieldAvailable: string) {
  return { cropPurposeId, profileId: `${cropPurposeId}-profile`, profileVersion: "synthetic-v1", planted, lastOccupied, fieldAvailable };
}

function inPlan(calendar: ReturnType<typeof occurrence>) {
  return { ...calendar, seasonMetrics };
}

function profilesFor(...cropPurposeIds: string[]) {
  return cropPurposeIds.map(cropPurposeId => ({ id: `${cropPurposeId}-profile`, version: "synthetic-v1", cropPurposeId, sourceIds: [] }));
}

function tuple(meanFrequency: number, meanMismatch: number, unplantedDays: number, longestGap: number) {
  return {
    components: [
      { metricId: "mean_frequency", value: meanFrequency, unit: "fraction" },
      { metricId: "mean_mismatch", value: meanMismatch, unit: "fraction" },
      { metricId: "unplanted_days", value: unplantedDays, unit: "days" },
      { metricId: "longest_unplanted_gap", value: longestGap, unit: "days" },
    ],
  };
}

function warning(code: string, message: string, cropPurposeIds: readonly string[] = [], metricIds: readonly string[] = []) {
  return { code, message, cropPurposeIds, ruleIds: [], metricIds };
}

const syntheticProvenance = planFixture.details.provenance;
const noProfile = { code: "crop_profile", reason: "No released synthetic-crop profile applies at this location.", cropPurposeIds: ["synthetic-crop"], sourceIds: [] };
const skippedInput = { ...inputFixture, history: { kind: "skipped" } };
const twoCropInput = { ...skippedInput, cropPurposeIds: ["synthetic-crop", "synthetic-bean"] };

// Last year as the farmer gave it, and as the engine moved it onto this year. synthetic-old starts before the plan's
// year, so its bar is cut at the year's first day.
const changedHistory = {
  kind: "recorded",
  start: "2025-06-15",
  endExclusive: "2026-07-01",
  entries: [
    { kind: "crop", id: "old", crop: { kind: "catalogue", cropPurposeId: "synthetic-old" }, planted: "2025-06-20", harvested: "2025-08-15", plantedPrecision: "exact", harvestedPrecision: "exact" },
    { kind: "crop", id: "bean", crop: { kind: "catalogue", cropPurposeId: "synthetic-bean" }, planted: "2025-09-01", harvested: "2025-11-30", plantedPrecision: "exact", harvestedPrecision: "exact" },
    { kind: "crop", id: "crop", crop: { kind: "catalogue", cropPurposeId: "synthetic-crop" }, planted: "2026-01-10", harvested: "2026-04-30", plantedPrecision: "exact", harvestedPrecision: "exact" },
  ],
};
const lastYear = {
  old: occurrence("synthetic-old", "2026-06-20", "2026-08-15", "2026-08-17"),
  bean: occurrence("synthetic-bean", "2026-09-01", "2026-11-30", "2026-12-02"),
  crop: occurrence("synthetic-crop", "2027-01-10", "2027-04-30", "2027-05-02"),
};
const thisYear = {
  crop: occurrence("synthetic-crop", "2026-07-01", "2026-10-28", "2026-10-30"),
  bean: occurrence("synthetic-bean", "2026-11-15", "2027-02-12", "2027-02-14"),
  cropAgain: occurrence("synthetic-crop", "2027-03-01", "2027-06-20", "2027-06-22"),
};

const temperatureMetrics = [
  metric("mean_frequency", "Synthetic historical rainfall mismatch frequency", 0.3, "fraction"),
  metric("q90_mismatch", "Synthetic bad-year rainfall mismatch", 0.18, "fraction"),
  metric("q90_temperature_exposure", "Synthetic bad-year temperature exposure", 0.08, "fraction"),
];

const monthlyInsights = [
  { id: "monthly_rain_median", label: "Synthetic monthly median rainfall", unit: "mm", values: [180, 210, 240] },
  { id: "monthly_rain_p10", label: "Synthetic monthly dry-year rainfall", unit: "mm", values: [90, 120, 150] },
  { id: "monthly_rain_p90", label: "Synthetic monthly wet-year rainfall", unit: "mm", values: [260, 300, 330] },
  { id: "monthly_mean_temperature", label: "Synthetic monthly mean temperature", unit: "degC", values: [28.5, 28.1, 27.9] },
].flatMap(({ id, label, unit, values }) => values.map((value, index) => ({
  metric: metric(id, label, value, unit, "measured"),
  period: { kind: "available", value: { start: "2000-07-01", endExclusive: "2024-07-01" } },
  month: 7 + index,
})));

/** Each label differs from its readable id ("Synthetic crop"), so a test can tell which one named the crop. */
export const frozenLabels: Readonly<Record<string, string>> = {
  "synthetic-crop": "Example grain (dry)",
  "synthetic-bean": "Example bean (green)",
  "maize-grain": "Maize (grain)",
  "rice-paddy": "Rice (paddy)",
  "common-bean-dry": "Common bean (dry grain)",
};

interface Built {
  readonly input: unknown;
  readonly result: unknown;
  /** Present for a version 2 snapshot: the ids its frozen catalogue lists, each with its frozen label. */
  readonly listed?: readonly string[];
}

const builders: Record<VariantName, () => Built> = {
  changed: () => ({
    input: { ...inputFixture, cropPurposeIds: ["synthetic-crop", "synthetic-bean"], history: changedHistory },
    result: {
      ...planFixture,
      // Unplanted: 29 Oct to 14 Nov (17), 13 Feb to 28 Feb (16), 21 Jun to 30 Jun (10).
      plan: { ...planFixture.plan, occurrences: Object.values(thisYear).map(inPlan), rankingTuple: tuple(0, 0, 43, 17) },
      details: {
        ...planFixture.details,
        explanation: "Synthetic result: a new order ranks first in this example.",
        baseline: {
          kind: "assessed",
          recommendation: "changed",
          eligible: true,
          approximateDates: false,
          occurrences: Object.values(lastYear).map(inPlan),
          metrics: planFixture.details.baseline.metrics,
          deltas: [
            { metricId: "unplanted_days", difference: { kind: "available", value: -74 }, unit: "days", direction: "lower_preferred" },
            { metricId: "mean_frequency", difference: { kind: "unavailable", reason: "No usable rain windows for last year in this example." }, unit: "fraction", direction: "lower_preferred" },
            { metricId: "crop_family_count", difference: { kind: "available", value: -1 }, unit: "count", direction: "descriptive" },
          ],
          changes: [
            { kind: "added", occurrence: thisYear.cropAgain },
            { kind: "removed", occurrence: lastYear.old },
            { kind: "date_shift", before: lastYear.bean, after: thisYear.bean },
            { kind: "order_change", cropPurposeId: "synthetic-crop", beforeIndex: 2, afterIndex: 0 },
          ],
        },
        provenance: { ...syntheticProvenance, profiles: profilesFor("synthetic-crop", "synthetic-bean", "synthetic-old") },
      },
    },
  }),
  skipped: () => ({
    input: skippedInput,
    result: {
      ...planFixture,
      details: { ...planFixture.details, explanation: "Synthetic result: one order ranks first in this example.", baseline: { kind: "not_recorded" } },
    },
  }),
  no_recommendation: () => ({
    input: inputFixture,
    result: {
      ...planFixture,
      details: { ...planFixture.details, baseline: { ...planFixture.details.baseline, eligible: false, recommendation: "changed" } },
    },
  }),
  several_crops: () => ({
    input: { ...skippedInput, cropPurposeIds: ["maize-grain", "rice-paddy", "common-bean-dry"] },
    result: {
      ...planFixture,
      // Unplanted: 1 Jul to 7 Jul (7), 16 Oct to 19 Oct (4), 11 Jan to 19 Jan (9), 1 May to 2 May (2), 26 Jun to 30 Jun (5).
      plan: {
        ...planFixture.plan,
        occurrences: [
          occurrence("maize-grain", "2026-07-08", "2026-10-15", "2026-10-20"),
          occurrence("common-bean-dry", "2026-10-20", "2027-01-10", "2027-01-12"),
          occurrence("rice-paddy", "2027-01-20", "2027-04-30", "2027-05-03"),
          occurrence("maize-grain", "2027-05-03", "2027-06-25", "2027-06-28"),
        ].map(inPlan),
        rankingTuple: tuple(0, 0, 27, 9),
      },
      details: {
        ...planFixture.details,
        explanation: "Synthetic result: one order ranks first in this example.",
        baseline: { kind: "not_recorded" },
        provenance: { ...syntheticProvenance, profiles: profilesFor("maize-grain", "common-bean-dry", "rice-paddy") },
      },
    },
  }),
  temperature: () => ({
    input: twoCropInput,
    result: {
      ...warningsFixture,
      // Unplanted: 5 Jul to 31 Jul (27), 30 Oct to 30 Jun (244).
      plan: {
        ...warningsFixture.plan,
        occurrences: [
          { ...fixtureOccurrence, seasonMetrics: [cropSeason("2000-07-01", 1, 0, 0, 0.25, 4)] },
          {
            ...occurrence("synthetic-bean", "2026-08-01", "2026-10-29", "2026-11-01"),
            seasonMetrics: [cropSeason("2000-07-01", 84, 0.3, 0.1, "No temperature limits for this crop in this example.", 0)],
          },
        ],
        rankingTuple: tuple(0.3, 0.1, 271, 244),
      },
      details: {
        ...warningsFixture.details,
        explanation: "Synthetic result: rain and temperature checks flagged this example.",
        metrics: temperatureMetrics,
        warnings: [
          warning("rainfall_mismatch", "Example rainfall warning.", ["synthetic-crop"], ["mean_frequency"]),
          warning("temperature_exposure", "Example temperature warning.", ["synthetic-crop"], ["q90_temperature_exposure"]),
        ],
        unassessedChecks: [
          { code: "temperature_rule", reason: "No temperature limits for this crop in this example.", cropPurposeIds: ["synthetic-bean"], sourceIds: [] },
        ],
        baseline: { kind: "not_recorded" },
        search: planFixture.details.search,
        provenance: { ...syntheticProvenance, profiles: [...syntheticProvenance.profiles, ...profilesFor("synthetic-bean")] },
      },
    },
  }),
  context: () => ({
    input: { ...inputFixture, water: "rain_plus_backup" },
    result: {
      ...planFixture,
      details: {
        ...planFixture.details,
        warnings: [
          warning("water_context", "Example backup water note."),
          warning("approximate_history", "Example approximate dates note."),
          warning("profile_limitation", "Example water check note.", ["synthetic-crop"]),
        ],
      },
    },
  }),
  insights: () => ({
    input: { ...inputFixture, water: "rain_plus_backup" },
    result: {
      ...missingFixture,
      missing: [noProfile],
      details: {
        ...missingFixture.details,
        explanation: "Synthetic result: this example is missing a crop profile.",
        insights: [
          ...monthlyInsights,
          { metric: metric("wet_day_frequency", "Synthetic wet day frequency", 0.55, "fraction", "measured"), period: monthlyInsights[0].period, month: null },
        ],
        warnings: [warning("water_context", "Example backup water note.")],
        unassessedChecks: [noProfile],
        search: { ...missingFixture.details.search, structural: "witness", ranking: "interrupted", structuralExpandedStates: 1, gridExpandedStates: 3 },
      },
    },
  }),
  structural: () => ({
    input: inputFixture,
    result: {
      ...noFitFixture,
      proof: {
        kind: "structural_exhaustion",
        horizon: planFixture.plan.horizon,
        expandedStates: 1234,
        constraints: ["Example constraint about the first crop.", "Example constraint about the second crop."],
      },
      details: {
        ...noFitFixture.details,
        explanation: "Synthetic result: no order of these crops fits in this example.",
        search: { ...noFitFixture.details.search, structural: "proved_impossible", structuralExpandedStates: 1234, structuralExpansionLimit: 2_000_000 },
      },
    },
  }),
  fatal: () => ({
    input: inputFixture,
    result: {
      ...errorFixture,
      error: { code: "processing_failed", message: "Example processing failure.", retryable: false },
      details: { ...errorFixture.details, explanation: "Example processing failure." },
    },
  }),
  run_provenance: () => ({
    input: inputFixture,
    result: {
      ...planFixture,
      details: {
        ...planFixture.details,
        provenance: {
          kind: "run",
          manifest: syntheticProvenance.manifest,
          profiles: [{ ...syntheticProvenance.profiles[0], sourceIds: ["example-guide"] }],
          rules: [{ id: "example-rule", version: "v1", target: "synthetic-crop", sourceIds: ["example-guide"] }],
          sources: [
            {
              id: "example-guide", title: "Example crop water guide", url: "https://example.org/guide", section: "Table 2",
              publishedOn: { kind: "available", value: "2020-05-01" }, extractedOn: "2026-01-15",
            },
            {
              id: "example-script", title: "Example unsafe address", url: "javascript:alert(1)", section: "Section 1",
              publishedOn: { kind: "unavailable", reason: "No publication date in this example." }, extractedOn: "2026-01-15",
            },
          ],
          climateProducts: [{
            provider: "Example provider", product: "Example daily weather", version: { kind: "available", value: "v1" },
            stream: { kind: "unavailable", reason: "No stream name in this example." }, cellId: "example-cell",
            gridDegrees: [0.5, 0.625], timeStandard: "UTC", sourceUrl: "https://example.org/weather",
            unitsByField: [{ field: "precipitation", canonicalUnit: "mm", originalUnit: "mm/day" }],
            missingDayCounts: [{ field: "precipitation", missingDays: 3 }],
          }],
        },
      },
    },
  }),
  no_preparation: () => ({ input: inputFixture, result: { ...planFixture, details: { ...planFixture.details, preparation: [] } } }),
  limit_plan: () => ({
    input: inputFixture,
    result: {
      ...planFixture,
      details: {
        ...planFixture.details,
        warnings: [warning("search_limit", "Example search stopped at its scoring budget.")],
        search: { ...planFixture.details.search, ranking: "limit_reached", scoredCandidates: planFixture.details.search.scoredCandidateLimit },
      },
    },
  }),
  no_fit_assessed: () => ({
    input: inputFixture,
    result: {
      ...noFitFixture,
      details: {
        ...noFitFixture.details,
        baseline: { ...planFixture.details.baseline, recommendation: "no_recommendation", eligible: false, deltas: [], changes: [] },
      },
    },
  }),
  labels_several: () => ({ ...builders.several_crops(), listed: ["maize-grain", "rice-paddy", "common-bean-dry"] }),
  labels_changed: () => ({ ...builders.changed(), listed: ["synthetic-crop", "synthetic-bean"] }),
  labels_warnings: () => ({ ...builders.temperature(), listed: ["synthetic-crop", "synthetic-bean"] }),
};

export function variant(name: VariantName): CompletedSnapshot {
  const { input, result, listed } = builders[name]();
  const made = { id: `synthetic-${name}`, completedAt: "2026-07-01T00:00:00Z", input, result };
  return completedSnapshotSchema.parse(listed === undefined ? { schemaVersion: 1, ...made } : { schemaVersion: 2, ...made, catalogue: catalogueOf(listed) });
}

/** The same snapshot as version 2, with every id in frozenLabels in its frozen catalogue. */
export function withLabels(snapshot: CompletedSnapshot): CompletedSnapshot {
  const { id, completedAt, input, result } = snapshot;
  return completedSnapshotSchema.parse({ schemaVersion: 2, id, completedAt, input, result, catalogue: catalogueOf(Object.keys(frozenLabels)) });
}

function catalogueOf(ids: readonly string[]) {
  return {
    version: syntheticRegistryFixture.identity.catalogueVersion,
    entries: ids.map(id => ({ id, label: frozenLabels[id], purpose: "food" })),
  };
}

type State = PlanResult["state"];

/** One of the six shared snapshots, narrowed by state (completedSnapshotsByState is a string-keyed record). */
export function shared<S extends State>(state: S): CompletedSnapshot & { readonly result: Extract<PlanResult, { readonly state: S }> } {
  const snapshot = completedSnapshotsByState[state];
  if (snapshot === undefined || !hasState(snapshot, state)) throw new Error(`No shared snapshot for ${state}.`);
  return snapshot;
}

function hasState<S extends State>(
  snapshot: CompletedSnapshot,
  state: S,
): snapshot is CompletedSnapshot & { readonly result: Extract<PlanResult, { readonly state: S }> } {
  return snapshot.result.state === state;
}

/** The six shared snapshots by state, then every variant: the matrix every reader, word and browser test runs over. */
export function everySnapshot(): readonly { readonly name: string; readonly snapshot: CompletedSnapshot }[] {
  return [
    ...Object.entries(completedSnapshotsByState).map(([name, snapshot]) => ({ name, snapshot })),
    ...variantNames.map(name => ({ name, snapshot: variant(name) })),
  ];
}
