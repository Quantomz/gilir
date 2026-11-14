import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import type { AssessedCandidate, CandidateCalendar, ClimateAssessment, FrozenRun, MetricInput } from "@/contracts/engine";
import type { CropProfile, RotationRule, SyntheticRegistry } from "@/contracts/registry";
import type { AssessmentMetric, CalendarOccurrence } from "@/contracts/result";
import { rankingMetricIds } from "@/contracts/result";
import { climateCohortFixture, frozenRunFixture, syntheticRegistryFixture } from "@/fixtures/science";
import type { CalculateOptions } from "@/engine";
import { dateAt, ordinal } from "@/engine/search/calendar";

export const date = parseIsoDate;
export const id = parseCropPurposeId;
export const allocation = (days: number) => ({ initial: 1, development: 1, middle: days - 3, late: 1 });

export function profile(name = "crop-a", days = 4, turnaround = 0): CropProfile {
  const base = syntheticRegistryFixture.profiles[0];
  return { ...base, cropPurposeId: id(name), id: `${name}-profile`, commonName: name,
    timing: { ...base.timing, generatedStageDays: allocation(days), historicalStageAllocations: [allocation(days)],
      turnaround: { basis: "scheduling_assumption", days: turnaround, assumption: "Synthetic turnaround for E3 behavior tests." } } };
}

export function prohibition(previous: string[], next: string[]): RotationRule {
  return { id: `rule-${previous.join("-")}-${next.join("-")}`, version: "synthetic-v1", status: "synthetic", target: "Synthetic physical restriction",
    applicability: profile().applicability, category: "physical_or_regulatory",
    predicate: { kind: "prohibit_successor", predecessorCropPurposeIds: previous.map(id), successorCropPurposeIds: next.map(id) },
    limitations: ["Synthetic restriction, not agricultural evidence."], preparation: [], sourceIds: ["synthetic:no-publication"] };
}

export function registry(profiles: readonly CropProfile[], rules: readonly RotationRule[] = []): SyntheticRegistry {
  return { ...syntheticRegistryFixture, profiles: profiles.map(item => ({ ...item, status: "synthetic" })),
    rules: rules.map(item => ({ ...item, status: "synthetic" })),
    catalogue: { ...syntheticRegistryFixture.catalogue,
      entries: profiles.map(item => ({ id: item.cropPurposeId, label: item.commonName, purpose: item.purpose })) } };
}

export function run(profiles: readonly CropProfile[] = [profile()], overrides: Partial<FrozenRun["settings"]> = {}): FrozenRun {
  return { ...frozenRunFixture, input: { ...frozenRunFixture.input, cropPurposeIds: profiles.map(item => item.cropPurposeId), history: { kind: "skipped" } },
    settings: { ...frozenRunFixture.settings, gridExpansionLimit: 0, scoredCandidateLimit: 0, ...overrides } };
}

export function metrics(values: readonly number[] = [0.2, 0.1, 20, 10]): AssessmentMetric[] {
  return rankingMetricIds.map((metricId, index) => ({ id: metricId, label: `Synthetic ${metricId}`,
    value: { kind: "available", value: values[index] }, unit: index < 2 ? "fraction" : "days", basis: "estimated",
    methodVersion: "synthetic-e3-metrics", sourceIds: ["synthetic:no-publication"],
    denominator: { kind: "available", value: { count: 1, unit: "seasons" } }, assumptions: ["Invented test values, not scientific calculations."] }));
}

export function assessment(calendar: CandidateCalendar, values?: readonly number[], flagged = false): Extract<ClimateAssessment, { kind: "assessed" }> {
  return { kind: "assessed", occurrences: calendar.occurrences.map(item => ({ ...item, seasonMetrics: [] })), metrics: metrics(values),
    seasonMetrics: [], warnings: [], unassessedChecks: [], flagged };
}

export function options(assess: (input: MetricInput) => ClimateAssessment = input => assessment(input.calendar)): CalculateOptions {
  return { buildCohort: () => climateCohortFixture,
    resolveRegistry: (lookup, release) => ({ profiles: release.profiles.filter(item => lookup.cropPurposeIds.includes(item.cropPurposeId)), rules: release.rules, gaps: [] }), assess };
}

export function occurrence(p: CropProfile, start = "2026-07-01", days = 4): CalendarOccurrence {
  const planted = date(start);
  return { cropPurposeId: p.cropPurposeId, profileId: p.id, profileVersion: p.version, planted,
    lastOccupied: dateAt(ordinal(planted) + days - 1), fieldAvailable: dateAt(ordinal(planted) + days + p.timing.turnaround.days) };
}

export function candidate(name = "crop-a", values?: readonly number[], flagged = false, origin: CandidateCalendar["origin"] = "generated"): AssessedCandidate {
  const calendar: CandidateCalendar = { origin, horizon: { start: date("2026-07-01"), endExclusive: date("2027-07-01") }, occurrences: [occurrence(profile(name))] };
  return { calendar, assessment: assessment(calendar, values, flagged) };
}

export function historyRun(p = profile(), approximate = false): FrozenRun {
  const base = run([p]);
  return { ...base, input: { ...base.input, history: { kind: "recorded", start: date("2025-07-01"), endExclusive: date("2026-07-01"), entries: [
    { kind: "crop", id: "previous-crop", crop: { kind: "catalogue", cropPurposeId: p.cropPurposeId }, planted: date("2025-07-01"), harvested: date("2025-07-04"),
      plantedPrecision: approximate ? "approximate" : "exact", harvestedPrecision: "exact" },
    { kind: "fallow", id: "known-fallow", start: date("2025-07-05"), endExclusive: date("2026-07-01") },
  ] } } };
}
