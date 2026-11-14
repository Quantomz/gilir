import { z } from "zod";
import { count, cropPurposeIdSchema, evidence, fraction, isoDateSchema, labels, positiveDays, sourceReferenceSchema } from "./common";
import { farmInputSchema } from "./input";

const dateInterval = z.strictObject({ start: isoDateSchema, endExclusive: isoDateSchema }).refine(
  interval => interval.start < interval.endExclusive, "Start must come before the exclusive end.",
).readonly();

export const runManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  normalizedInputHash: labels,
  engineVersion: labels,
  configurationVersion: labels,
  catalogueVersion: labels,
  ruleVersion: labels,
  climateSnapshotIds: z.array(labels).readonly(),
  dataCutoff: isoDateSchema,
}).readonly();
export type RunManifest = z.infer<typeof runManifestSchema>;

const units = z.enum(["fraction", "days", "count", "mm", "mm/day", "degC", "degrees", "kPa", "%", "m/s", "MJ/m²/day"]);
const denominator = z.strictObject({ count: count.min(1), unit: z.enum(["days", "windows", "seasons", "occurrences", "rule_events"]) });
export const assessmentMetricSchema = z.strictObject({
  id: labels,
  label: labels,
  value: evidence(z.number()),
  unit: units,
  basis: z.enum(["measured", "estimated", "rule_derived"]),
  methodVersion: labels,
  sourceIds: z.array(labels).readonly(),
  denominator: evidence(denominator),
  assumptions: z.array(labels).readonly(),
}).readonly();
export type AssessmentMetric = z.infer<typeof assessmentMetricSchema>;

const gapSchema = z.strictObject({
  code: z.enum(["crop_profile", "climate", "temperature_rule", "rotation_rule", "history", "ranking_metric"]),
  reason: labels,
  cropPurposeIds: z.array(cropPurposeIdSchema).readonly(),
  sourceIds: z.array(labels).readonly(),
}).readonly();
export type EvidenceGap = z.infer<typeof gapSchema>;

const profileRef = z.strictObject({ id: labels, version: labels, cropPurposeId: cropPurposeIdSchema, sourceIds: z.array(labels).readonly() }).readonly();
const ruleRef = z.strictObject({ id: labels, version: labels, target: labels, sourceIds: z.array(labels).readonly() }).readonly();

const climateProductSummary = z.strictObject({
  provider: labels,
  product: labels,
  version: evidence(labels),
  stream: evidence(labels),
  cellId: labels,
  gridDegrees: z.tuple([z.number().positive(), z.number().positive()]).readonly(),
  timeStandard: z.literal("UTC"),
  sourceUrl: z.url(),
  unitsByField: z.array(z.strictObject({ field: labels, canonicalUnit: units, originalUnit: labels })).readonly(),
  missingDayCounts: z.array(z.strictObject({ field: labels, missingDays: count })).readonly(),
}).readonly();

const provenanceShape = {
  manifest: evidence(runManifestSchema),
  profiles: z.array(profileRef).readonly(),
  rules: z.array(ruleRef).readonly(),
  sources: z.array(sourceReferenceSchema).readonly(),
  climateProducts: z.array(climateProductSummary).readonly(),
};
const provenance = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("run"), ...provenanceShape }),
  z.strictObject({ kind: z.literal("synthetic"), label: labels, ...provenanceShape }),
]);

export const rankingMetricIds = Object.freeze([
  "mean_frequency", "mean_mismatch", "unplanted_days", "longest_unplanted_gap",
] as const);

const rankingTuple = z.strictObject({
  components: z.tuple([
    z.strictObject({ metricId: z.literal(rankingMetricIds[0]), value: fraction, unit: z.literal("fraction") }).readonly(),
    z.strictObject({ metricId: z.literal(rankingMetricIds[1]), value: fraction, unit: z.literal("fraction") }).readonly(),
    z.strictObject({ metricId: z.literal(rankingMetricIds[2]), value: count, unit: z.literal("days") }).readonly(),
    z.strictObject({ metricId: z.literal(rankingMetricIds[3]), value: count, unit: z.literal("days") }).readonly(),
  ]).readonly(),
}).readonly();
export type RankingTuple = z.infer<typeof rankingTuple>;
export type RankingComponent = RankingTuple["components"][number];

const seasonMetrics = z.strictObject({
  replayStart: isoDateSchema,
  metrics: z.array(assessmentMetricSchema).readonly(),
}).readonly();
export const calendarOccurrenceSchema = z.strictObject({
  cropPurposeId: cropPurposeIdSchema,
  profileId: labels,
  profileVersion: labels,
  planted: isoDateSchema,
  lastOccupied: isoDateSchema,
  fieldAvailable: isoDateSchema,
}).readonly();
export type CalendarOccurrence = z.infer<typeof calendarOccurrenceSchema>;
const planOccurrence = calendarOccurrenceSchema.unwrap().extend({
  seasonMetrics: z.array(seasonMetrics).readonly(),
}).refine(o => o.planted <= o.lastOccupied && o.lastOccupied < o.fieldAvailable, "Occurrence dates must be in order.").readonly();
export type PlanOccurrence = z.infer<typeof planOccurrence>;
const plan = z.strictObject({
  horizon: dateInterval,
  occurrences: z.array(planOccurrence).min(1).readonly(),
  rankingTuple,
}).readonly();
export type Plan = z.infer<typeof plan>;

const calendarProof = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("duration_lower_bound"),
    horizonDays: positiveDays,
    mandatoryMinimumDays: positiveDays,
    minimumByCrop: z.array(z.strictObject({ cropPurposeId: cropPurposeIdSchema, minimumDays: positiveDays })).min(1).readonly(),
  }),
  z.strictObject({
    kind: z.literal("structural_exhaustion"),
    horizon: dateInterval,
    expandedStates: count,
    constraints: z.array(labels).min(1).readonly(),
  }),
]).readonly();
export type CalendarProof = z.infer<typeof calendarProof>;

const warning = z.strictObject({
  code: z.enum(["rainfall_mismatch", "temperature_exposure", "environmental_rule", "rotation_rule", "profile_limitation", "search_limit", "water_context", "approximate_history"]),
  message: labels,
  cropPurposeIds: z.array(cropPurposeIdSchema).readonly(),
  ruleIds: z.array(labels).readonly(),
  metricIds: z.array(labels).readonly(),
}).readonly();
export type ResultWarning = z.infer<typeof warning>;

const cohort = z.strictObject({
  targetSeasons: count,
  minimumUsableSeasons: count,
  methodVersion: labels,
  seasons: z.array(z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("usable"), interval: dateInterval }),
    z.strictObject({ status: z.literal("excluded"), interval: dateInterval, reason: labels }),
  ])).readonly(),
}).readonly();

const delta = z.strictObject({
  metricId: labels,
  difference: evidence(z.number()),
  unit: units,
  direction: z.enum(["lower_preferred", "higher_preferred", "descriptive"]),
}).readonly();
const transition = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("added"), occurrence: calendarOccurrenceSchema }),
  z.strictObject({ kind: z.literal("removed"), occurrence: calendarOccurrenceSchema }),
  z.strictObject({ kind: z.literal("date_shift"), before: calendarOccurrenceSchema, after: calendarOccurrenceSchema }),
  z.strictObject({ kind: z.literal("order_change"), cropPurposeId: cropPurposeIdSchema, beforeIndex: count, afterIndex: count }),
]);
const baseline = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not_recorded") }),
  z.strictObject({ kind: z.literal("not_assessable"), reasons: z.array(labels).min(1).readonly() }),
  z.strictObject({
    kind: z.literal("assessed"),
    recommendation: z.enum(["kept", "changed", "no_recommendation"]),
    eligible: z.boolean(),
    approximateDates: z.boolean(),
    occurrences: z.array(planOccurrence).readonly(),
    metrics: z.array(assessmentMetricSchema).readonly(),
    deltas: z.array(delta).readonly(),
    changes: z.array(transition).readonly(),
  }),
]).readonly();
export type BaselineComparison = z.infer<typeof baseline>;

const search = z.strictObject({
  structural: z.enum(["not_started", "witness", "proved_impossible", "limit_reached"]),
  ranking: z.enum(["not_started", "grid_complete", "limit_reached", "interrupted"]),
  structuralExpandedStates: count,
  gridExpandedStates: count,
  scoredCandidates: count,
  structuralExpansionLimit: count,
  gridExpansionLimit: count,
  scoredCandidateLimit: count,
  gridStepDays: positiveDays,
}).readonly();
export type SearchCoverage = z.infer<typeof search>;

export const resultDetailsSchema = z.strictObject({
  explanation: labels,
  insights: z.array(z.strictObject({
    metric: assessmentMetricSchema,
    period: evidence(dateInterval),
    month: z.number().int().min(1).max(12).nullable(),
  })).readonly(),
  metrics: z.array(assessmentMetricSchema).readonly(),
  seasonMetrics: z.array(seasonMetrics).readonly(),
  warnings: z.array(warning).readonly(),
  unassessedChecks: z.array(gapSchema).readonly(),
  cohort: evidence(cohort),
  baseline,
  preparation: z.array(z.strictObject({ templateId: labels, text: labels, sourceIds: z.array(labels).readonly() })).readonly(),
  search,
  provenance,
  assumptions: z.array(labels).readonly(),
}).readonly();
export type ResultDetails = z.infer<typeof resultDetailsSchema>;

export const serviceFailureSchema = z.strictObject({
  code: z.enum(["not_configured", "not_implemented", "temporarily_unavailable", "retrieval_failed", "processing_failed", "not_found", "rate_limited", "payload_too_large"]),
  message: labels,
  retryable: z.boolean(),
}).readonly();
export type ServiceFailure = z.infer<typeof serviceFailureSchema>;

export const planResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("plan"), plan, details: resultDetailsSchema }),
  z.strictObject({ state: z.literal("plan_with_warnings"), plan, details: resultDetailsSchema }),
  z.strictObject({ state: z.literal("insufficient_data"), missing: z.array(gapSchema).min(1).readonly(), details: resultDetailsSchema }),
  z.strictObject({ state: z.literal("no_calendar_fit"), proof: calendarProof, details: resultDetailsSchema }),
  z.strictObject({ state: z.literal("search_incomplete"), details: resultDetailsSchema }),
  z.strictObject({ state: z.literal("service_error"), error: serviceFailureSchema, details: resultDetailsSchema }),
]).readonly();
export type PlanResult = z.infer<typeof planResultSchema>;

export const completedSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: labels,
  completedAt: z.iso.datetime(),
  input: farmInputSchema,
  result: planResultSchema,
}).readonly();
export type CompletedSnapshot = z.infer<typeof completedSnapshotSchema>;

export const parsePlanResult = (raw: unknown): PlanResult => planResultSchema.parse(raw);
export const parseCompletedSnapshot = (raw: unknown): CompletedSnapshot => completedSnapshotSchema.parse(raw);
