import { z } from "zod";
import type { CandidateCalendar, ClimateAssessment, ClimateCohort } from "@/contracts/engine";
import type { CropPurposeId } from "@/contracts/common";
import { evidence } from "@/contracts/common";
import type { RegistryRelease, RegistryResolution } from "@/contracts/registry";
import { calendarOccurrenceSchema, resultDetailsSchema } from "@/contracts/result";
import type { ResultDetails } from "@/contracts/result";
import type { FrozenRun } from "@/contracts/engine";
import { calendarKey } from "./calendar";

const shared = {
  metrics: resultDetailsSchema.unwrap().shape.metrics,
  seasonMetrics: resultDetailsSchema.unwrap().shape.seasonMetrics,
  warnings: resultDetailsSchema.unwrap().shape.warnings,
  unassessedChecks: resultDetailsSchema.unwrap().shape.unassessedChecks,
};
const assessmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("assessed"), ...shared, flagged: z.boolean(),
    occurrences: z.array(calendarOccurrenceSchema.unwrap().extend({ seasonMetrics: resultDetailsSchema.unwrap().shape.seasonMetrics })) }),
  z.strictObject({ kind: z.literal("insufficient_data"), ...shared, missing: resultDetailsSchema.unwrap().shape.unassessedChecks.unwrap().min(1) }),
]);
const numberEvidenceSchema = evidence(z.number());

export function validateAssessment(raw: ClimateAssessment, calendar: CandidateCalendar): ClimateAssessment {
  const assessment = assessmentSchema.parse(raw);
  if (assessment.kind === "assessed" && calendarKey({ ...calendar, occurrences: assessment.occurrences }) !== calendarKey(calendar)) {
    throw new Error("The assessor changed the candidate calendar.");
  }
  return assessment;
}

export function validateAssessmentSeasons(assessment: ClimateAssessment, seasons: ClimateCohort["usable"]): void {
  const allowed = new Set(seasons.map(season => season.interval.start));
  const lists = [assessment.seasonMetrics, ...(assessment.kind === "assessed" ? assessment.occurrences.map(occurrence => occurrence.seasonMetrics) : [])];
  for (const list of lists) {
    const starts = list.map(season => season.replayStart);
    if (new Set(starts).size !== starts.length || starts.some(start => !allowed.has(start))) {
      throw new Error("Assessment seasons differ from the common climate cohort.");
    }
  }
}

export function validateCohort(cohort: ClimateCohort): void {
  resultDetailsSchema.unwrap().shape.cohort.parse(cohort.coverage);
  resultDetailsSchema.unwrap().shape.insights.parse(cohort.insights);
  resultDetailsSchema.unwrap().shape.unassessedChecks.parse(cohort.gaps);
  numberEvidenceSchema.parse(cohort.elevationM);
  numberEvidenceSchema.parse(cohort.applicabilityClimate.meanAnnualTemperatureC);
  numberEvidenceSchema.parse(cohort.applicabilityClimate.meanAnnualPrecipitationMm);
  if (cohort.coverage.kind === "available") {
    const reported = cohort.coverage.value.seasons.filter(season => season.status === "usable")
      .map(season => JSON.stringify([season.interval.start, season.interval.endExclusive])).sort();
    const actual = cohort.usable.map(season => JSON.stringify([season.interval.start, season.interval.endExclusive])).sort();
    if (JSON.stringify(reported) !== JSON.stringify(actual) || new Set(actual).size !== actual.length) throw new Error("Cohort coverage contradicts its replay seasons.");
  } else if (cohort.usable.length) throw new Error("Unavailable cohort contains usable replay seasons.");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function validateResolution(resolution: RegistryResolution, requested: readonly CropPurposeId[], registry: RegistryRelease): void {
  resultDetailsSchema.unwrap().shape.unassessedChecks.parse(resolution.gaps);
  const ids = resolution.profiles.map(profile => profile.cropPurposeId);
  if (new Set(ids).size !== ids.length || ids.some(id => !requested.includes(id))) throw new Error("Resolver returned conflicting profile membership.");
  for (const profile of resolution.profiles) {
    const frozen = registry.profiles.find(item => item.id === profile.id && item.version === profile.version);
    if (!frozen || stable(frozen) !== stable(profile)) throw new Error("Resolved profile differs from its frozen release.");
  }
  if (new Set(resolution.rules.map(rule => rule.id)).size !== resolution.rules.length) throw new Error("Resolver returned duplicate rules.");
  for (const rule of resolution.rules) {
    const frozen = registry.rules.find(item => item.id === rule.id && item.version === rule.version);
    if (!frozen || stable(frozen) !== stable(rule)) throw new Error("Resolved rule differs from its frozen release.");
  }
}

export function provenanceFor(run: FrozenRun, registry: RegistryRelease,
  profiles: RegistryResolution["profiles"], rules: RegistryResolution["rules"]): ResultDetails["provenance"] {
  const shared = {
    manifest: { kind: "available", value: run.manifest } as const,
    sources: registry.sources,
    profiles: profiles.map(profile => ({ id: profile.id, version: profile.version, cropPurposeId: profile.cropPurposeId, sourceIds: profile.sourceIds })),
    rules: rules.map(rule => ({ id: rule.id, version: rule.version, target: rule.target, sourceIds: rule.sourceIds })),
    climateProducts: run.climate.flatMap(snapshot => snapshot.products.map(product => ({
      provider: product.provider, product: product.product, version: product.version, stream: product.stream,
      cellId: product.cellId, gridDegrees: product.gridDegrees, timeStandard: product.timeStandard, sourceUrl: product.sourceUrl,
      unitsByField: product.fields.map(field => ({ field: field.field, canonicalUnit: field.canonicalUnit, originalUnit: field.originalUnit })),
      missingDayCounts: product.missingDatesByField.map(field => ({ field: field.field, missingDays: field.dates.length })),
    }))),
  };
  const labels = [registry.kind === "synthetic" ? registry.label : null,
    ...run.climate.map(snapshot => snapshot.kind === "synthetic" ? snapshot.label : null)].filter(value => value !== null);
  return labels.length ? { kind: "synthetic", label: labels[0], ...shared } : { kind: "run", ...shared };
}

export function validateSources(registry: RegistryRelease): void {
  if (registry.kind === "synthetic") return;
  const known = new Set(registry.sources.map(source => source.id));
  if (known.size !== registry.sources.length) throw new Error("Duplicate released source identities.");
  const references = registry.profiles.flatMap(profile => [
    ...profile.sourceIds, ...profile.kc.sourceIds, ...profile.temperatureRules.flatMap(rule => rule.sourceIds),
    ...profile.preparation.flatMap(template => template.sourceIds), ...profile.timing.plantingWindows.flatMap(window => window.sourceIds),
    ...(profile.timing.turnaround.basis === "published" ? profile.timing.turnaround.sourceIds : []),
  ]).concat(registry.rules.flatMap(rule => [...rule.sourceIds, ...rule.preparation.flatMap(template => template.sourceIds)]));
  if (references.some(id => !known.has(id))) throw new Error("Released evidence references an unknown source.");
}
