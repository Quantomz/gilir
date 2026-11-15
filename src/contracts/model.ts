import { z } from "zod";
import { count, cropPurposeIdSchema, isoDateSchema, labels } from "./common";

export const modelEngineVersion = "thermal-model-v1";
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const prose = z.string().trim().min(1).max(2000);
const review = z.strictObject({ decision: z.literal("approved_model_estimate"), reviewer: labels, reviewedOn: isoDateSchema, artifactHash: sha256Schema });
const locator = z.strictObject({ sourceId: labels, documentHash: sha256Schema, section: prose });
const parameterEvidence = z.strictObject({
  basis: z.enum(["published_parameter", "derived_estimate", "analogue_estimate"]),
  locators: z.array(locator).min(1),
  rationale: prose,
  inputArtifactHashes: z.array(sha256Schema),
  review,
}).superRefine((value, context) => {
  if (value.basis === "derived_estimate" && value.inputArtifactHashes.length === 0) {
    context.addIssue({ code: "custom", path: ["inputArtifactHashes"], message: "A derivation must identify its frozen input artifacts." });
  }
});
export const thermalStages = ["initial", "development", "middle", "late"] as const;
export const stageGddSchema = z.strictObject({
  initial: z.number().positive(), development: z.number().positive(), middle: z.number().positive(), late: z.number().positive(),
});
export const cropModelSchema = z.strictObject({
  id: labels,
  version: labels,
  cropPurposeId: cropPurposeIdSchema,
  scientificName: labels,
  harvestPurpose: prose,
  cultivarAssumption: prose,
  establishment: z.enum(["seeded", "transplanted", "source_reference_field_start"]),
  development: z.strictObject({
    method: z.literal("fao56-rev1-equation-6.23-v1"),
    baseC: z.number().min(-30).max(50),
    upperC: z.number().min(0).max(60),
    incrementalStageGdd: stageGddSchema,
    scenario: labels,
    temperatureEvidence: parameterEvidence,
    stageEvidence: parameterEvidence,
    dailyAllocation: z.literal("carry-threshold-overshoot-within-day-v1"),
  }).refine(value => value.upperC > value.baseC, "Upper accumulation temperature must exceed the base."),
  kc: z.strictObject({
    initial: z.number().min(0).max(2), middle: z.number().min(0).max(2), end: z.number().min(0).max(2),
    interpolation: z.literal("calendar-linear-after-thermal-boundaries-v1"),
    assumptions: z.array(prose).min(1), evidence: parameterEvidence,
  }),
  turnaround: z.strictObject({ days: count.max(366), assumption: prose, review }),
  transfer: z.strictObject({
    scope: z.literal("global_model_estimate"),
    planting: z.literal("all_days_then_model_development"),
    localValidation: z.literal("not_established"),
    assumptions: z.array(prose).min(1),
    review,
  }),
  limitations: z.array(prose).min(1),
  review,
}).readonly();
export type CropModel = z.infer<typeof cropModelSchema>;
export const completeModelReleaseSchema = z.strictObject({
  kind: z.literal("reviewed_global_models"),
  version: labels,
  contentHash: sha256Schema,
  coveragePolicy: z.literal("every-advertised-crop-purpose-v1"),
  models: z.array(cropModelSchema).min(1).readonly(),
  review,
}).readonly();
export type CompleteModelRelease = z.infer<typeof completeModelReleaseSchema>;

export const modelingPolicySchema = z.strictObject({
  version: z.literal("thermal-reservation-v1"),
  reservation: z.literal("latest-completion-all-retained-seasons-v1"),
  occupancy: z.literal("planned-slot-through-latest-harvest-v1"),
  noncompletion: z.literal("retain-all-replays-no-reservation-v1"),
  scoringWorkLimit: count,
}).readonly();
export type ModelingPolicy = z.infer<typeof modelingPolicySchema>;
export const defaultModelingPolicy: ModelingPolicy = {
  version: "thermal-reservation-v1",
  reservation: "latest-completion-all-retained-seasons-v1",
  occupancy: "planned-slot-through-latest-harvest-v1",
  noncompletion: "retain-all-replays-no-reservation-v1",
  scoringWorkLimit: 5_000_000,
};

export const modeledTimingSchema = z.strictObject({
  kind: z.literal("historical-replay-potential-development"),
  modelId: labels,
  modelVersion: labels,
  earliestHarvest: isoDateSchema,
  latestHarvest: isoDateSchema,
  reservationPolicy: z.literal("latest-completion-all-retained-seasons-v1"),
  replays: z.array(z.strictObject({
    replayStart: isoDateSchema,
    harvestOffset: count,
    stageCompletionOffsets: z.tuple([count, count, count, count]).readonly(),
  })).min(1).readonly(),
}).refine(value => value.earliestHarvest <= value.latestHarvest, "Harvest range must be ordered.").readonly();
export type ModeledTiming = z.infer<typeof modeledTimingSchema>;

export const modelDiagnosticsSchema = z.strictObject({
  modelReleaseVersion: labels,
  modelReleaseHash: sha256Schema,
  policy: modelingPolicySchema,
  retainedReplayStarts: z.array(isoDateSchema).readonly(),
  crops: z.array(z.strictObject({
    cropPurposeId: cropPurposeIdSchema,
    modelId: labels,
    modelVersion: labels,
    scientificName: labels,
    harvestPurpose: prose,
    cultivarAssumption: prose,
    evidenceBasis: z.enum(["published_parameter", "derived_estimate", "analogue_estimate"]),
    sourceIds: z.array(labels).readonly(),
    assumptions: z.array(prose).readonly(),
    limitations: z.array(prose).readonly(),
    turnaroundDays: count,
    validPlantingDays: count,
    noncompletionByReplay: z.array(z.strictObject({ replayStart: isoDateSchema, plantingDays: count })).readonly(),
  })).readonly(),
  preparedTrajectories: count,
  scoredCropDays: count,
  aggregationVisits: count,
  workLimitReached: z.boolean(),
}).readonly();
export type ModelDiagnostics = z.infer<typeof modelDiagnosticsSchema>;
