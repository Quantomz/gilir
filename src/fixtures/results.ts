import { parseIsoDate } from "@/contracts/common";
import type { JobState } from "@/contracts/jobs";
import { completedSnapshotSchema } from "@/contracts/result";
import type {
  AssessmentMetric, CompletedSnapshot, EvidenceGap, Plan, PlanOccurrence, PlanResult, ResultDetails, ServiceFailure,
} from "@/contracts/result";
import { inputFixture, unsupportedHistoryFixture } from "./input";
import { frozenRunFixture, replaySeasonFixture, syntheticLabel } from "./science";

const cropPurposeId = inputFixture.cropPurposeIds[0];
const horizon = { start: inputFixture.planningStart, endExclusive: parseIsoDate("2027-07-01") };
const metric = {
  id: "mean_frequency", label: "Synthetic historical rainfall mismatch frequency", value: { kind: "available", value: 0 },
  unit: "fraction", basis: "estimated", methodVersion: "synthetic-v1", sourceIds: [],
  denominator: { kind: "available", value: { count: 1, unit: "seasons" } }, assumptions: [syntheticLabel],
} satisfies AssessmentMetric;
const missingMetric = {
  ...metric, value: { kind: "unavailable", reason: "No usable windows in this example." },
  denominator: { kind: "unavailable", reason: "No usable windows in this example." },
} satisfies AssessmentMetric;
const metrics = [{ replayStart: replaySeasonFixture.interval.start, metrics: [metric] }];
const occurrence = {
  cropPurposeId,
  profileId: "synthetic-profile",
  profileVersion: "synthetic-v1",
  planted: horizon.start,
  lastOccupied: parseIsoDate("2026-07-04"),
  fieldAvailable: parseIsoDate("2026-07-06"),
  seasonMetrics: metrics,
} satisfies PlanOccurrence;
const plan = {
  horizon,
  occurrences: [occurrence],
  rankingTuple: {
    components: [
      { metricId: "mean_frequency", value: 0, unit: "fraction" },
      { metricId: "mean_mismatch", value: 0, unit: "fraction" },
      { metricId: "unplanted_days", value: 361, unit: "days" },
      { metricId: "longest_unplanted_gap", value: 361, unit: "days" },
    ],
  },
} satisfies Plan;
const gap = {
  code: "climate", reason: "No complete weather season in this example.", cropPurposeIds: [cropPurposeId], sourceIds: [],
} satisfies EvidenceGap;
const failure = {
  code: "retrieval_failed", message: "Example source did not respond.", retryable: true,
} satisfies ServiceFailure;
const details = {
  explanation: "Synthetic result: the existing rotation ranks first in this example.",
  insights: [{ metric, period: { kind: "available", value: replaySeasonFixture.interval }, month: 7 }],
  metrics: [metric],
  seasonMetrics: metrics,
  warnings: [],
  unassessedChecks: [],
  cohort: {
    kind: "available",
    value: {
      targetSeasons: 1, minimumUsableSeasons: 1, methodVersion: "synthetic-v1",
      seasons: [{ status: "usable", interval: replaySeasonFixture.interval }],
    },
  },
  baseline: {
    kind: "assessed", eligible: true, recommendation: "kept", approximateDates: true, occurrences: [occurrence], metrics: [metric],
    deltas: [{ metricId: metric.id, difference: { kind: "available", value: 0 }, unit: "fraction", direction: "lower_preferred" }],
    changes: [],
  },
  preparation: [{ templateId: "synthetic-preparation", text: "Example preparation text for layout tests.", sourceIds: [] }],
  search: {
    structural: "witness", ranking: "grid_complete", structuralExpandedStates: 1, scoredCandidates: 1,
    structuralExpansionLimit: 10, scoredCandidateLimit: 10, gridStepDays: 7,
  },
  provenance: {
    kind: "synthetic", label: syntheticLabel, manifest: { kind: "available", value: frozenRunFixture.manifest },
    sources: [], profiles: [{ id: "synthetic-profile", version: "synthetic-v1", cropPurposeId, sourceIds: [] }],
    rules: [], climateProducts: [],
  },
  assumptions: [syntheticLabel],
} satisfies ResultDetails;
const emptyDetails = {
  ...details, insights: [], metrics: [], seasonMetrics: [], preparation: [],
  cohort: { kind: "unavailable", reason: "A complete cohort was not assessed in this example." },
  baseline: { kind: "not_assessable", reasons: ["Baseline was not scored in this example."] },
  search: { ...details.search, structural: "not_started", ranking: "not_started", structuralExpandedStates: 0, scoredCandidates: 0 },
} satisfies ResultDetails;

const warningMetric = { ...metric, value: { kind: "available", value: 0.5 } } satisfies AssessmentMetric;
const warningPlan = {
  ...plan,
  occurrences: [{ ...occurrence, seasonMetrics: [{ replayStart: replaySeasonFixture.interval.start, metrics: [warningMetric] }] }],
  rankingTuple: {
    components: [
      { ...plan.rankingTuple.components[0], value: 0.5 }, { ...plan.rankingTuple.components[1], value: 0.25 },
      plan.rankingTuple.components[2], plan.rankingTuple.components[3],
    ],
  },
} satisfies Plan;
export const resultFixtures = {
  plan: { state: "plan", plan, details },
  plan_with_warnings: {
    state: "plan_with_warnings",
    plan: warningPlan,
    details: {
      ...details,
      explanation: "Synthetic result: rainfall falls below estimated demand in this example.",
      metrics: [warningMetric],
      seasonMetrics: warningPlan.occurrences[0].seasonMetrics,
      warnings: [
        { code: "rainfall_mismatch", message: "Example rainfall warning.", cropPurposeIds: [cropPurposeId], ruleIds: [], metricIds: [metric.id] },
        { code: "search_limit", message: "Example search stopped at its scoring budget.", cropPurposeIds: [], ruleIds: [], metricIds: [] },
      ],
      baseline: { kind: "not_assessable", reasons: ["The reported crop has no supported example profile."] },
      search: { ...details.search, ranking: "limit_reached", scoredCandidates: details.search.scoredCandidateLimit },
    },
  },
  insufficient_data: {
    state: "insufficient_data", missing: [gap],
    details: {
      ...emptyDetails, explanation: "Synthetic result: this example is missing required climate data.",
      metrics: [missingMetric], unassessedChecks: [gap],
    },
  },
  no_calendar_fit: {
    state: "no_calendar_fit",
    proof: { kind: "duration_lower_bound", mandatoryMinimumDays: 366, horizonDays: 365, minimumByCrop: [{ cropPurposeId, minimumDays: 366 }] },
    details: {
      ...emptyDetails, explanation: "Synthetic result: this example crop needs more days than the planning window allows.",
      search: { ...emptyDetails.search, structural: "proved_impossible" },
    },
  },
  search_incomplete: {
    state: "search_incomplete",
    details: {
      ...emptyDetails, explanation: "Synthetic result: the search limit was reached before finding a usable plan.",
      search: { ...emptyDetails.search, structural: "limit_reached", structuralExpandedStates: details.search.structuralExpansionLimit },
    },
  },
  service_error: {
    state: "service_error", error: failure,
    details: { ...emptyDetails, explanation: "Synthetic result: the calculation service failed in this example." },
  },
} satisfies { [S in PlanResult["state"]]: Extract<PlanResult, { state: S }> };

const states = Object.values(resultFixtures);
export const completedSnapshotsByState = Object.fromEntries(states.map(result => {
  const snapshot = completedSnapshotSchema.parse({
    schemaVersion: 1,
    id: "synthetic-" + result.state,
    completedAt: "2026-07-01T00:00:00Z",
    input: result.state === "plan_with_warnings" ? unsupportedHistoryFixture : inputFixture,
    result,
  });
  return [result.state, snapshot];
}));

export const completedSnapshotFixture: CompletedSnapshot = completedSnapshotSchema.parse({
  schemaVersion: 1, id: "synthetic-plan", completedAt: "2026-07-01T00:00:00Z", input: inputFixture, result: resultFixtures.plan,
});

export const jobFixtures = {
  queued: { state: "queued" },
  fetching: { state: "fetching" },
  calculating: { state: "calculating" },
  completed: { state: "completed", snapshot: completedSnapshotFixture },
  failed: { state: "failed", failure },
} satisfies { [S in JobState["state"]]: JobState & { state: S } };
