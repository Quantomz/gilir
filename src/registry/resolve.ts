import type { CropPurposeId } from "@/contracts/common";
import type { CropProfile, RegistryLookup, RegistryRelease, RegistryResolution, RotationRule } from "@/contracts/registry";
import type { EvidenceGap } from "@/contracts/result";
import { isApplicable, scopeLevel } from "./applicability";

function gap(cropPurposeId: CropPurposeId, reason: string): EvidenceGap {
  return { code: "crop_profile", reason, cropPurposeIds: [cropPurposeId], sourceIds: [] };
}

function rank(profile: CropProfile): [number, number] {
  return [scopeLevel(profile.applicability.scope), profile.precedence];
}

function selectProfile(cropPurposeId: CropPurposeId, lookup: RegistryLookup, registry: RegistryRelease): CropProfile | EvidenceGap {
  if (!registry.catalogue.entries.some(entry => entry.id === cropPurposeId)) {
    return gap(cropPurposeId, `${cropPurposeId} is not in catalogue ${registry.catalogue.version}.`);
  }
  const matches = registry.profiles
    .filter(profile => profile.cropPurposeId === cropPurposeId)
    .map(profile => ({ profile, match: isApplicable(profile.applicability, lookup) }));
  const applicable = matches.filter(({ match }) => match === "inside").map(({ profile }) => profile);
  if (applicable.length === 0) {
    const reason = matches.some(({ match }) => match === "unknown")
      ? `No released ${cropPurposeId} profile can be confirmed for this location because the climate data its applicability needs is unavailable.`
      : `No released ${cropPurposeId} profile applies at this location.`;
    return gap(cropPurposeId, reason);
  }
  const best = applicable.reduce((a, b) => {
    const [la, pa] = rank(a);
    const [lb, pb] = rank(b);
    return lb < la || (lb === la && pb < pa) ? b : a;
  });
  const [level, precedence] = rank(best);
  const tied = applicable.filter(profile => rank(profile)[0] === level && rank(profile)[1] === precedence);
  if (tied.length > 1) {
    return gap(cropPurposeId, `Ambiguous profile precedence for ${cropPurposeId}: ${tied.map(profile => profile.id).sort().join(", ")}.`);
  }
  return best;
}

function ruleCrops(rule: RotationRule): readonly string[] {
  return [...rule.predicate.predecessorCropPurposeIds, ...rule.predicate.successorCropPurposeIds];
}

export function resolveRegistry(lookup: RegistryLookup, registry: RegistryRelease): RegistryResolution {
  const selected = [...new Set(lookup.cropPurposeIds)];
  const profiles: CropProfile[] = [];
  const gaps: EvidenceGap[] = [];
  for (const cropPurposeId of selected) {
    const result = selectProfile(cropPurposeId, lookup, registry);
    if ("code" in result) gaps.push(result);
    else profiles.push(result);
  }
  const selectedIds = new Set<string>(selected);
  const rules = registry.rules
    .filter(rule => ruleCrops(rule).some(id => selectedIds.has(id)))
    .filter(rule => isApplicable(rule.applicability, lookup) === "inside")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { profiles, gaps, rules };
}
