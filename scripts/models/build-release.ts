import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import approved from "../../docs/evidence/global-models/approved-published-32.json";
import policy from "../../docs/evidence/global-models/scheduling-policy.json";
import method from "../../docs/evidence/global-models/method-review.json";
import { completeModelReleaseSchema } from "../../src/contracts/model";
import { buildCatalogueEntries, buildProfiles } from "../../src/registry/profiles";

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
};
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const approvedBytes = readFileSync(new URL("../../docs/evidence/global-models/approved-published-32.json", import.meta.url));
if (createHash("sha256").update(approvedBytes).digest("hex") !== "d27e5fedd12789a2359c024755e318f678a99277809b39be52cb0523a5671090") throw new Error("Independent approval artifact changed; renewed review required.");
if (hash(method.reviewedPayload) !== method.reviewedPayloadHash || method.reviewedPayloadHash !== approved.methodReviewPayloadHash) throw new Error("Method review identity differs.");
const catalogue = buildCatalogueEntries(buildProfiles({ windowBasis: "hard_constraint", version: "reviewed-2026-11-15.2" }));
const reviewed = <T extends object>(value: T) => ({ ...value, decision: "approved_model_estimate" as const });
const policyReview = { decision: "approved_model_estimate", reviewer: policy.reviewer, reviewedOn: policy.reviewedOn, artifactHash: hash(policy) };
const models = approved.records.map(record => {
  if (record.status !== "APPROVED_AI_TECHNICAL_MODEL_ESTIMATE") throw new Error("Parameter set is not approved.");
  const entry = catalogue.find(item => item.id === record.cropPurposeId);
  if (!entry) throw new Error("Approved crop is absent from the original catalogue.");
  return {
    id: `global-${record.cropPurposeId}`, version: "2026-11-15.1", cropPurposeId: record.cropPurposeId,
    scientificName: record.scientificName, harvestPurpose: entry.label,
    cultivarAssumption: `${record.scientificName}; ${record.scenario} reference scenario`, establishment: "source_reference_field_start",
    development: { method: "fao56-rev1-equation-6.23-v1", baseC: record.temperature.baseC, upperC: record.temperature.upperC,
      incrementalStageGdd: record.incrementalStageGdd, scenario: record.scenario,
      temperatureEvidence: { ...record.temperatureEvidence, review: reviewed(record.temperatureEvidence.review) },
      stageEvidence: { ...record.stageEvidence, review: reviewed(record.stageEvidence.review) }, dailyAllocation: "carry-threshold-overshoot-within-day-v1" },
    kc: { ...record.kc1998, interpolation: "calendar-linear-after-thermal-boundaries-v1", assumptions: record.kcAssumptions,
      evidence: { ...record.kcEvidence, review: reviewed(record.kcEvidence.review) } },
    turnaround: { days: policy.turnaroundDays, assumption: policy.turnaroundAssumption, review: policyReview },
    transfer: { scope: "global_model_estimate", planting: "all_days_then_model_development", localValidation: "not_established",
      assumptions: [...record.requiredAssumptions, policy.establishment], review: reviewed(record.review) },
    limitations: [record.requiredAssumptions[0], record.requiredAssumptions[3]], review: reviewed(record.review),
  };
});
const payload = { kind: "reviewed_global_models", version: "fao56-global-models-2026-11-15.1", coveragePolicy: "every-advertised-crop-purpose-v1", models,
  review: { decision: "approved_model_estimate", reviewer: approved.reviewer, reviewedOn: approved.reviewedOn,
    artifactHash: createHash("sha256").update(approvedBytes).digest("hex") } };
const release = completeModelReleaseSchema.parse({ ...payload, contentHash: hash(payload) });
const output = new URL("../../src/registry/models/release-2026-11-15.json", import.meta.url);
const text = JSON.stringify(release, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== text) throw new Error("Model release differs from reviewed source transformation.");
} else writeFileSync(output, text);
process.stdout.write(`Verified ${release.models.length} reviewed model records. ${release.contentHash}\n`);
