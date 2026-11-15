import { z } from "zod";
import { count, cropPurposeIdSchema, evidence, fraction, isoDateSchema, labels, positiveDays, sourceReferenceSchema } from "./common";
import { farmInputSchema } from "./input";
import { catalogueSchema } from "./registry";
import { modeledTimingSchema, modelDiagnosticsSchema, modelingPolicySchema, modelEngineVersion, sha256Schema } from "./model";

const dateInterval = z.strictObject({ start: isoDateSchema, endExclusive: isoDateSchema }).refine(
  interval => interval.start < interval.endExclusive, "Start must come before the exclusive end.",
).readonly();

const legacyRunManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  normalizedInputHash: labels,
  engineVersion: labels,
  configurationVersion: labels,
  catalogueVersion: labels,
  ruleVersion: labels,
  climateSnapshotIds: z.array(labels).readonly(),
  dataCutoff: isoDateSchema,
}).readonly();
export const modelRunManifestSchema = legacyRunManifestSchema.unwrap().extend({
  schemaVersion: z.literal(2),
  engineVersion: z.literal(modelEngineVersion),
  modelReleaseVersion: labels,
  modelReleaseHash: sha256Schema,
  configurationHash: sha256Schema,
  climateContentHashes: z.array(sha256Schema).readonly(),
  climateArtifactHashes: z.array(sha256Schema).readonly(),
  modelingPolicy: modelingPolicySchema,
}).readonly();
export const runManifestSchema = z.discriminatedUnion("schemaVersion", [legacyRunManifestSchema.unwrap(), modelRunManifestSchema.unwrap()]).readonly();
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
  modeledTiming: modeledTimingSchema.optional(),
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
  modeling: modelDiagnosticsSchema.optional(),
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

export const completedSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  id: labels,
  completedAt: z.iso.datetime(),
  input: farmInputSchema,
  result: planResultSchema,
}).superRefine(validateLegacySnapshot).readonly();
export type CompletedSnapshotV1 = z.infer<typeof completedSnapshotV1Schema>;

export const completedSnapshotSchemaVersion = 2 as const;
const completionFields = { result: planResultSchema, catalogue: catalogueSchema };
const completionSchema = z.strictObject(completionFields);

function validateCompletion(completion: z.infer<typeof completionSchema>, context: z.RefinementCtx): void {
  const manifest = completion.result.details.provenance.manifest;
  if (manifest.kind !== "available") {
    context.addIssue({ code: "custom", path: ["result", "details", "provenance", "manifest"], message: "Completion requires an available run manifest." });
  } else if (completion.catalogue.version !== manifest.value.catalogueVersion) {
    context.addIssue({ code: "custom", path: ["catalogue", "version"], message: "Catalogue must match the result's run manifest." });
  }
  const ids = new Set<string>();
  completion.catalogue.entries.forEach((entry, index) => {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", path: ["catalogue", "entries", index, "id"], message: "Catalogue entry IDs must be unique." });
    ids.add(entry.id);
  });
}

export const snapshotCompletionSchema = completionSchema.superRefine((completion, context) => {
  validateCompletion(completion, context);
  const details = completion.result.details;
  const manifest = details.provenance.manifest;
  if (manifest.kind !== "available" || manifest.value.schemaVersion === 1) {
    validateLegacySnapshot(completion, context);
    return;
  }
  if (!details.modeling || details.modeling.modelReleaseVersion !== manifest.value.modelReleaseVersion
    || details.modeling.modelReleaseHash !== manifest.value.modelReleaseHash
    || JSON.stringify(details.modeling.policy) !== JSON.stringify(manifest.value.modelingPolicy)
    || "plan" in completion.result && completion.result.plan.occurrences.some(occurrence => !occurrence.modeledTiming)) {
    context.addIssue({ code: "custom", message: "Modeled completion must retain its model identity, diagnostics and occurrence timing." });
  }
}).readonly();
export type SnapshotCompletion = z.infer<typeof snapshotCompletionSchema>;

export const completedSnapshotV2Schema = z.strictObject({
  schemaVersion: z.literal(completedSnapshotSchemaVersion),
  id: labels,
  completedAt: z.iso.datetime(),
  input: farmInputSchema,
  ...completionFields,
}).superRefine((snapshot, context) => {
  validateCompletion(snapshot, context);
  validateLegacySnapshot(snapshot, context);
  const ids = new Set(snapshot.catalogue.entries.map(entry => entry.id));
  snapshot.input.cropPurposeIds.forEach((id, index) => {
    if (!ids.has(id)) context.addIssue({ code: "custom", path: ["input", "cropPurposeIds", index], message: "Selected crop must have a saved catalogue entry." });
  });
}).readonly();
export type CompletedSnapshotV2 = z.infer<typeof completedSnapshotV2Schema>;

function validateLegacySnapshot(snapshot: { result: PlanResult }, context: z.RefinementCtx): void {
  const manifest = snapshot.result.details.provenance.manifest;
  if (snapshot.result.details.modeling || manifest.kind === "available" && manifest.value.schemaVersion !== 1
    || "plan" in snapshot.result && snapshot.result.plan.occurrences.some(item => item.modeledTiming)) {
    context.addIssue({ code: "custom", message: "Thermal model results require snapshot version 3." });
  }
}

export const completedSnapshotV3Schema = z.strictObject({
  schemaVersion: z.literal(3), id: labels, completedAt: z.iso.datetime(), input: farmInputSchema, ...completionFields,
}).superRefine((snapshot, context) => {
  validateCompletion(snapshot, context);
  const details = snapshot.result.details;
  const manifest = details.provenance.manifest;
  if (!details.modeling || manifest.kind !== "available" || manifest.value.schemaVersion !== 2) {
    context.addIssue({ code: "custom", message: "Snapshot 3 requires complete modeled-run identity and diagnostics." });
    return;
  }
  if (details.modeling.modelReleaseVersion !== manifest.value.modelReleaseVersion || details.modeling.modelReleaseHash !== manifest.value.modelReleaseHash
    || JSON.stringify(details.modeling.policy) !== JSON.stringify(manifest.value.modelingPolicy)) {
    context.addIssue({ code: "custom", message: "Modeled result identity must match the frozen run." });
  }
  const ids = new Set(snapshot.catalogue.entries.map(entry => entry.id));
  if (snapshot.input.cropPurposeIds.some(id => !ids.has(id))) context.addIssue({ code: "custom", message: "Selected crop labels must be saved." });
  if ("plan" in snapshot.result) {
    const plan = snapshot.result.plan;
    const ordinal = (date: string) => Date.parse(date + "T00:00:00Z") / 86_400_000;
    const start = ordinal(plan.horizon.start);
    const horizonDays = ordinal(plan.horizon.endExclusive) - start;
    const starts = details.modeling.retainedReplayStarts;
    const cohort = details.cohort;
    const retained = cohort.kind === "available" ? cohort.value.seasons.filter(season => season.status === "usable").map(season => season.interval.start) : [];
    if (!starts.length || new Set(starts).size !== starts.length || JSON.stringify(starts) !== JSON.stringify(retained)
      || plan.horizon.start !== snapshot.input.planningStart || horizonDays < 365 || horizonDays > 366
      || snapshot.input.cropPurposeIds.some(id => !plan.occurrences.some(item => item.cropPurposeId === id))) {
      context.addIssue({ code: "custom", message: "Modeled plan must retain the common cohort, all selected crops and the planning horizon." });
    }
    let previousAvailable = start;
    for (const occurrence of plan.occurrences) {
      const timing = occurrence.modeledTiming;
      const model = details.modeling.crops.find(item => item.cropPurposeId === occurrence.cropPurposeId);
      const planted = ordinal(occurrence.planted) - start;
      const ends = timing?.replays.map(replay => replay.harvestOffset) ?? [];
      const invalidReplay = timing?.replays.some(replay => replay.harvestOffset !== replay.stageCompletionOffsets[3] - 1
        || replay.stageCompletionOffsets.some((end, index, list) => end <= planted || end > horizonDays || index > 0 && end < list[index - 1]));
      if (!timing || !model || !snapshot.input.cropPurposeIds.includes(occurrence.cropPurposeId)
        || timing.modelId !== occurrence.profileId || timing.modelVersion !== occurrence.profileVersion
        || model.modelId !== timing.modelId || model.modelVersion !== timing.modelVersion
        || timing.latestHarvest !== occurrence.lastOccupied || timing.earliestHarvest < occurrence.planted
        || ordinal(timing.earliestHarvest) - start !== Math.min(...ends) || ordinal(timing.latestHarvest) - start !== Math.max(...ends)
        || ordinal(occurrence.fieldAvailable) !== ordinal(timing.latestHarvest) + 1 + model.turnaroundDays
        || ordinal(occurrence.planted) < previousAvailable || ordinal(occurrence.fieldAvailable) - start > horizonDays
        || invalidReplay || timing.replays.length !== starts.length
        || timing.replays.some((replay, index) => replay.replayStart !== starts[index])) {
        context.addIssue({ code: "custom", message: "Every modeled occurrence requires consistent model identity, stage boundaries, harvest range and field reservation." });
      }
      previousAvailable = ordinal(occurrence.fieldAvailable);
    }
  }
}).readonly();
export type CompletedSnapshotV3 = z.infer<typeof completedSnapshotV3Schema>;
export const completedSnapshotVersionFor = (result: PlanResult): 2 | 3 =>
  result.details.provenance.manifest.kind === "available" && result.details.provenance.manifest.value.schemaVersion === 2 ? 3 : 2;

export const completedSnapshotSchema = z.discriminatedUnion("schemaVersion", [
  completedSnapshotV1Schema.unwrap(), completedSnapshotV2Schema.unwrap(), completedSnapshotV3Schema.unwrap(),
]).readonly();
export type CompletedSnapshot = z.infer<typeof completedSnapshotSchema>;

export const parsePlanResult = (raw: unknown): PlanResult => planResultSchema.parse(raw);
export const parseCompletedSnapshot = (raw: unknown): CompletedSnapshot => completedSnapshotSchema.parse(raw);
