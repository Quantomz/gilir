import { createHash } from "node:crypto";
import { parseIsoDate } from "@/contracts/common";
import type { ClimateCohort, FrozenRun } from "@/contracts/engine";
import { cropModelSchema, defaultModelingPolicy } from "@/contracts/model";
import type { CompleteModelRelease, CropModel } from "@/contracts/model";
import type { ReleasedRegistry } from "@/contracts/registry";
import { frozenRunFixture } from "@/fixtures/science";
import { readRegistryRelease } from "@/registry";
import { season } from "../metrics/helpers";

export const hash = "a".repeat(64);
const review = { decision: "approved_model_estimate" as const, reviewer: "Component test fixture only", reviewedOn: "2026-11-15", artifactHash: hash };
const evidence = { basis: "published_parameter", locators: [{ sourceId: "test-reference", documentHash: hash, section: "Invented component test data only" }], rationale: "Invented component test value; not agricultural evidence.", inputArtifactHashes: [], review };
export function model(cropPurposeId = "maize-grain", stageGdd = 10): CropModel {
  return cropModelSchema.parse({ id: `model-${cropPurposeId}`, version: "test-v1", cropPurposeId, scientificName: "Test species",
    harvestPurpose: "Invented test harvest", cultivarAssumption: "Invented test cultivar", establishment: "source_reference_field_start",
    development: { method: "fao56-rev1-equation-6.23-v1", baseC: 10, upperC: 30,
      incrementalStageGdd: { initial: stageGdd, development: stageGdd, middle: stageGdd, late: stageGdd }, scenario: "Test scenario",
      temperatureEvidence: evidence, stageEvidence: evidence, dailyAllocation: "carry-threshold-overshoot-within-day-v1" },
    kc: { initial: 0.2, middle: 1, end: 0.4, interpolation: "calendar-linear-after-thermal-boundaries-v1", assumptions: ["Invented test Kc."], evidence },
    turnaround: { days: 0, assumption: "No test turnaround.", review },
    transfer: { scope: "global_model_estimate", planting: "all_days_then_model_development", localValidation: "not_established", assumptions: ["Test scope only."], review },
    limitations: ["Component test only. No agricultural interpretation."], review });
}
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
};
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export function release(): ReleasedRegistry & { readonly modelRelease: CompleteModelRelease } {
  const old = readRegistryRelease();
  const payload = { kind: "reviewed_global_models" as const, version: "test-model-v1", coveragePolicy: "every-advertised-crop-purpose-v1" as const,
    models: old.catalogue.entries.map(entry => model(entry.id)), review: { ...review, reviewedOn: parseIsoDate(review.reviewedOn) } };
  return { ...old, identity: { ...old.identity, catalogueVersion: "test-global-v1" }, catalogue: { ...old.catalogue, version: "test-global-v1" },
    sources: [...old.sources, { id: "test-reference", title: "Invented component fixture", url: "https://example.com/test-only", section: "Test only", publishedOn: { kind: "unavailable", reason: "Invented test source" }, extractedOn: parseIsoDate("2026-11-15") }],
    modelRelease: { ...payload, contentHash: digest(payload) } };
}
export function setup(length = 365, temperatures: readonly number[] = [20]) {
  const registry = release();
  const settings = { ...frozenRunFixture.settings, targetSeasons: temperatures.length, minimumUsableSeasons: temperatures.length, gridExpansionLimit: 0, scoredCandidateLimit: 0 };
  const run: FrozenRun = { ...frozenRunFixture, input: { ...frozenRunFixture.input, cropPurposeIds: [model().cropPurposeId], history: { kind: "skipped" } }, settings,
    climate: [], manifest: { schemaVersion: 2, engineVersion: "thermal-model-v1", normalizedInputHash: hash, configurationVersion: settings.version,
      configurationHash: digest(settings), catalogueVersion: registry.identity.catalogueVersion, ruleVersion: registry.identity.ruleVersion,
      modelReleaseVersion: registry.modelRelease.version, modelReleaseHash: registry.modelRelease.contentHash, climateSnapshotIds: [], climateContentHashes: [], climateArtifactHashes: [],
      dataCutoff: parseIsoDate("2026-01-01"), modelingPolicy: defaultModelingPolicy } };
  const usable = temperatures.map((temperature, index) => season(`${2020 + index}-07-01`, length, () => ({ minC: temperature, maxC: temperature, meanC: temperature, rainMm: 100 })));
  const cohort: ClimateCohort = { usable, gaps: [], insights: [], elevationM: { kind: "available", value: 10 },
    coverage: { kind: "available", value: { targetSeasons: usable.length, minimumUsableSeasons: usable.length, methodVersion: "test-only", seasons: usable.map(value => ({ status: "usable", interval: value.interval })) } },
    applicabilityClimate: { meanAnnualTemperatureC: { kind: "available", value: 20 }, meanAnnualPrecipitationMm: { kind: "available", value: 1000 } } };
  return { run, registry, cohort };
}
