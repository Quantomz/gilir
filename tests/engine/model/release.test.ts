import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import approved from "../../../docs/evidence/global-models/approved-published-32.json";
import payloads from "../../../docs/evidence/global-models/evidence-payloads.json";
import { readRegistryRelease, validateRelease } from "@/registry";
import { canonical } from "./fixtures";

const release = readRegistryRelease();
describe("reviewed 32-crop global release", () => {
  it("advertises exactly the independently approved crop purposes", () => {
    expect(release.identity.catalogueVersion).toBe("fao56-global-32-2026-11-15");
    expect(release.catalogue.entries.map(entry => entry.id).sort()).toEqual(approved.records.map(record => record.cropPurposeId).sort());
    expect(release.modelRelease?.models).toHaveLength(32);
    expect(validateRelease(release).ok).toBe(true);
  });
  it("preserves every reviewed parameter, purpose, scenario and management assumption", () => {
    for (const record of approved.records) {
      const model = release.modelRelease?.models.find(item => item.cropPurposeId === record.cropPurposeId);
      expect(model?.scientificName).toBe(record.scientificName);
      expect(model?.development).toMatchObject({ baseC: record.temperature.baseC, upperC: record.temperature.upperC, incrementalStageGdd: record.incrementalStageGdd, scenario: record.scenario });
      expect(model?.kc).toMatchObject({ ...record.kc1998, assumptions: record.kcAssumptions });
      expect(model?.transfer.assumptions).toEqual(expect.arrayContaining(record.requiredAssumptions));
      expect(model?.review.artifactHash).toBe(record.review.artifactHash);
      expect(model?.establishment).toBe("source_reference_field_start");
    }
  });
  it("binds numerical parameter reviews and the complete release to reproducible hashes", () => {
    const hashes = new Map(Object.entries(payloads));
    for (const model of release.modelRelease?.models ?? []) for (const evidence of [model.development.temperatureEvidence, model.development.stageEvidence, model.kc.evidence]) {
      const payload = hashes.get(evidence.review.artifactHash);
      expect(payload).toBeDefined();
      expect(createHash("sha256").update(canonical(payload)).digest("hex")).toBe(evidence.review.artifactHash);
    }
    const { contentHash, ...payload } = release.modelRelease!;
    expect(createHash("sha256").update(canonical(payload)).digest("hex")).toBe(contentHash);
  });
  it("keeps all eight deferred purposes in archived releases only", () => {
    const deferred = ["brussels-sprouts", "celery", "millet-grain", "mung-bean-dry", "onion-green", "pea-dry", "radish", "watermelon"];
    const old = readRegistryRelease("fao56-hard-windows-2026-11-15");
    expect(old.catalogue.entries).toHaveLength(40);
    expect(old.modelRelease).toBeUndefined();
    for (const id of deferred) {
      expect(old.catalogue.entries.some(entry => entry.id === id)).toBe(true);
      expect(release.catalogue.entries.some(entry => entry.id === id)).toBe(false);
    }
  });
});
