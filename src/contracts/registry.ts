import { z } from "zod";
import { count, cropPurposeIdSchema, days, evidence, isoDateSchema, labels, positiveDays, sourceReferenceSchema } from "./common";
import type { CropPurposeId, EvidenceValue } from "./common";
import type { LngLat } from "./input";
import type { EvidenceGap } from "./result";

const catalogueEntry = z.strictObject({
  id: cropPurposeIdSchema,
  label: labels,
  purpose: z.enum(["food", "cover"]),
});
export const catalogueSchema = z.strictObject({ version: labels, entries: z.array(catalogueEntry).readonly() }).readonly();
export type Catalogue = z.infer<typeof catalogueSchema>;

const bounds = z.strictObject({
  westDeg: z.number().min(-180).max(180),
  eastDeg: z.number().min(-180).max(180),
  southDeg: z.number().min(-90).max(90),
  northDeg: z.number().min(-90).max(90),
});
const range = z.tuple([z.number(), z.number()]).readonly();
const scope = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("regional"), bounds: z.array(bounds).min(1).readonly() }),
  z.strictObject({
    kind: z.literal("climate"),
    variable: z.enum(["mean_annual_temperature_c", "mean_annual_precipitation_mm"]),
    inclusiveRange: range,
  }),
  z.strictObject({ kind: z.literal("broad") }),
]);
const applicability = z.strictObject({
  scope,
  exclusions: z.array(scope).readonly(),
  managementAssumptions: z.array(labels).readonly(),
});

const stage = z.enum(["initial", "development", "middle", "late"]);
const stageDays = z.strictObject({
  initial: positiveDays,
  development: positiveDays,
  middle: positiveDays,
  late: positiveDays,
});
const monthDay = z.string().regex(/^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/).refine(value => isoDateSchema.safeParse("2000-" + value).success);
const dateWindow = z.strictObject({ startMonthDay: monthDay, endMonthDayInclusive: monthDay });
const sourceIds = z.array(labels).min(1).readonly();
const reviewSchema = z.strictObject({ reviewer: labels, reviewedOn: isoDateSchema }).readonly();
const prep = z.strictObject({ id: labels, text: labels, sourceIds }).readonly();

const profile = z.strictObject({
  id: labels,
  version: labels,
  cropPurposeId: cropPurposeIdSchema,
  commonName: labels,
  scientificName: labels,
  family: labels,
  isLegume: z.boolean(),
  purpose: z.enum(["food", "cover"]),
  cultivarGroup: labels,
  productionSystem: labels,
  applicability,
  precedence: count,
  timing: z.strictObject({
    generatedStageDays: stageDays,
    historicalStageAllocations: z.array(stageDays).readonly(),
    publishedDurationDays: evidence(z.tuple([positiveDays, positiveDays]).readonly()),
    plantingWindows: z.array(z.strictObject({
      window: dateWindow,
      basis: z.enum(["hard_constraint", "recommendation"]),
      sourceIds,
    })).readonly(),
    turnaround: z.discriminatedUnion("basis", [
      z.strictObject({ basis: z.literal("published"), days, sourceIds }),
      z.strictObject({ basis: z.literal("scheduling_assumption"), days, assumption: labels }),
    ]),
  }),
  kc: z.strictObject({
    initial: z.number().nonnegative(),
    middle: z.number().nonnegative(),
    end: z.number().nonnegative(),
    stageInterpolation: z.literal("initial_middle_constant_development_late_linear_include_endpoints"),
    assumptions: z.array(labels).readonly(),
    sourceIds,
  }),
  temperatureRules: z.array(z.strictObject({
    id: labels,
    scope: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("whole_occurrence") }),
      z.strictObject({ kind: z.literal("stage"), stage }),
    ]),
    period: z.literal("daily"),
    variable: z.enum(["min_c", "mean_c", "max_c"]),
    predicate: z.enum(["above", "below", "at_or_above", "at_or_below"]),
    thresholdC: z.number(),
    sourceIds,
    limitations: z.array(labels).readonly(),
  })).readonly(),
  rotationRuleIds: z.array(labels).readonly(),
  preparation: z.array(prep).readonly(),
  warnings: z.array(labels).readonly(),
  sourceIds,
});

const regulation = z.strictObject({
  kind: z.literal("prohibit_successor"),
  predecessorCropPurposeIds: z.array(cropPurposeIdSchema).min(1).readonly(),
  successorCropPurposeIds: z.array(cropPurposeIdSchema).min(1).readonly(),
});
const rotationRule = z.strictObject({
  id: labels,
  version: labels,
  target: labels,
  applicability,
  category: z.literal("physical_or_regulatory"),
  predicate: regulation,
  limitations: z.array(labels).readonly(),
  preparation: z.array(prep).readonly(),
  sourceIds,
});

const reviewedProfile = profile.extend({ status: z.literal("released"), review: reviewSchema }).readonly();
const reviewedRule = rotationRule.extend({ status: z.literal("released"), review: reviewSchema }).readonly();
export const draftCropProfileSchema = profile.extend({ status: z.literal("draft") }).readonly();
export const draftRotationRuleSchema = rotationRule.extend({ status: z.literal("draft") }).readonly();
const syntheticProfile = profile.extend({ status: z.literal("synthetic") }).readonly();
const syntheticRule = rotationRule.extend({ status: z.literal("synthetic") }).readonly();

const releaseIdentitySchema = z.strictObject({ catalogueVersion: labels, ruleVersion: labels }).readonly();
export type RegistryIdentity = z.infer<typeof releaseIdentitySchema>;
const releaseShape = {
  identity: releaseIdentitySchema,
  catalogue: catalogueSchema,
};
export const releasedRegistrySchema = z.strictObject({
  ...releaseShape,
  kind: z.literal("released"),
  sources: z.array(sourceReferenceSchema).readonly(),
  profiles: z.array(reviewedProfile).readonly(),
  rules: z.array(reviewedRule).readonly(),
}).readonly();
export const syntheticRegistrySchema = z.strictObject({
  ...releaseShape,
  kind: z.literal("synthetic"),
  label: labels,
  sources: z.array(sourceReferenceSchema).length(0).readonly(),
  profiles: z.array(syntheticProfile).readonly(),
  rules: z.array(syntheticRule).readonly(),
}).readonly();

export type ReleasedRegistry = z.infer<typeof releasedRegistrySchema>;
export type SyntheticRegistry = z.infer<typeof syntheticRegistrySchema>;
export type RegistryRelease = ReleasedRegistry | SyntheticRegistry;
export type CropProfile = z.infer<typeof reviewedProfile | typeof syntheticProfile>;
export type RotationRule = z.infer<typeof reviewedRule | typeof syntheticRule>;
export type Rule = RotationRule;
export type DraftCropProfile = z.infer<typeof draftCropProfileSchema>;
export type DraftRotationRule = z.infer<typeof draftRotationRuleSchema>;

export interface RegistryLookup {
  readonly cropPurposeIds: readonly CropPurposeId[];
  readonly lookup: LngLat;
  readonly climate: {
    readonly meanAnnualTemperatureC: EvidenceValue<number>;
    readonly meanAnnualPrecipitationMm: EvidenceValue<number>;
  };
}

export interface RegistryResolution {
  readonly profiles: readonly CropProfile[];
  readonly gaps: readonly EvidenceGap[];
  readonly rules: readonly RotationRule[];
}
