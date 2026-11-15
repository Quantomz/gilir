import { completeModelReleaseSchema } from "@/contracts/model";
import type { CompleteModelRelease } from "@/contracts/model";
import type { Catalogue } from "@/contracts/registry";

export function parseCompleteModelRelease(raw: unknown, catalogue: Catalogue, sourceIds: readonly string[]): CompleteModelRelease {
  const release = completeModelReleaseSchema.parse(raw);
  const expected = new Set(catalogue.entries.map(entry => entry.id));
  const actual = new Set(release.models.map(model => model.cropPurposeId));
  if (expected.size !== 40 || actual.size !== 40 || [...expected].some(id => !actual.has(id))) {
    throw new Error("Global activation requires one complete reviewed model for every one of the 40 advertised crop purposes.");
  }
  if (new Set(release.models.map(model => model.id)).size !== 40) throw new Error("Model identities must be unique.");
  for (const model of release.models) {
    for (const evidence of [model.development.temperatureEvidence, model.development.stageEvidence, model.kc.evidence]) {
      if (evidence.locators.some(locator => !sourceIds.includes(locator.sourceId))) throw new Error(`Unknown model source for ${model.cropPurposeId}.`);
    }
    if (/synthetic|pending|unreviewed/i.test(JSON.stringify(model))) throw new Error(`Unreleased evidence for ${model.cropPurposeId}.`);
  }
  return release;
}
