import { releasedRegistrySchema } from "@/contracts/registry";
import type { ReleasedRegistry } from "@/contracts/registry";
import { scopeLevel, scopesMayOverlap } from "./applicability";

export type ReleaseValidation =
  | { readonly ok: true; readonly release: ReleasedRegistry }
  | { readonly ok: false; readonly issues: readonly string[] };

const kcRange = [0, 2] as const;
const temperatureRangeC = [-60, 60] as const;
const maxSeasonDays = 366;
const syntheticMarker = /synthetic/i;

export class InvalidReleaseError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid registry release:\n- ${issues.join("\n- ")}`);
    this.name = "InvalidReleaseError";
  }
}

export function validateRelease(raw: unknown): ReleaseValidation {
  const parsed = releasedRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map(issue => `schema ${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  }
  const release = parsed.data;
  const issues = [...checkSources(release), ...checkProfiles(release), ...checkCatalogue(release), ...checkRules(release), ...checkPrecedence(release)];
  return issues.length === 0 ? { ok: true, release } : { ok: false, issues };
}

export function assertValidRelease(raw: unknown): ReleasedRegistry {
  const result = validateRelease(raw);
  if (!result.ok) throw new InvalidReleaseError(result.issues);
  return result.release;
}

function checkSources(release: ReleasedRegistry): string[] {
  const issues: string[] = [];
  const known = new Set<string>();
  for (const source of release.sources) {
    if (known.has(source.id)) issues.push(`source ${source.id}: duplicate id`);
    if (syntheticMarker.test(source.id) || syntheticMarker.test(source.title)) issues.push(`source ${source.id}: synthetic provenance in a released registry`);
    known.add(source.id);
  }
  const requireSources = (owner: string, ids: readonly string[]) => {
    for (const id of ids) if (!known.has(id)) issues.push(`${owner}: unknown source reference ${id}`);
  };
  for (const profile of release.profiles) {
    const owner = `profile ${profile.id}`;
    requireSources(owner, profile.sourceIds);
    requireSources(`${owner} kc`, profile.kc.sourceIds);
    for (const window of profile.timing.plantingWindows) requireSources(`${owner} planting window`, window.sourceIds);
    if (profile.timing.turnaround.basis === "published") requireSources(`${owner} turnaround`, profile.timing.turnaround.sourceIds);
    for (const rule of profile.temperatureRules) requireSources(`${owner} temperature rule ${rule.id}`, rule.sourceIds);
    for (const step of profile.preparation) requireSources(`${owner} preparation ${step.id}`, step.sourceIds);
  }
  for (const rule of release.rules) {
    requireSources(`rule ${rule.id}`, rule.sourceIds);
    for (const step of rule.preparation) requireSources(`rule ${rule.id} preparation ${step.id}`, step.sourceIds);
  }
  return issues;
}

function checkProfiles(release: ReleasedRegistry): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const profile of release.profiles) {
    const owner = `profile ${profile.id}`;
    const key = `${profile.id}@${profile.version}`;
    if (seen.has(key)) issues.push(`${owner}: duplicate id and version`);
    seen.add(key);
    for (const [name, value] of Object.entries({ initial: profile.kc.initial, middle: profile.kc.middle, end: profile.kc.end })) {
      if (value < kcRange[0] || value > kcRange[1]) issues.push(`${owner}: Kc ${name} ${value} is outside the dimensionless range ${kcRange[0]}-${kcRange[1]}`);
    }
    for (const rule of profile.temperatureRules) {
      if (rule.thresholdC < temperatureRangeC[0] || rule.thresholdC > temperatureRangeC[1]) issues.push(`${owner}: temperature rule ${rule.id} threshold ${rule.thresholdC} is not a plausible degrees C value`);
    }
    const published = profile.timing.publishedDurationDays;
    const allocations = [profile.timing.generatedStageDays, ...profile.timing.historicalStageAllocations];
    for (const allocation of allocations) {
      const total = allocation.initial + allocation.development + allocation.middle + allocation.late;
      if (total > maxSeasonDays) issues.push(`${owner}: stage total ${total} days exceeds one year`);
      if (published.kind === "available" && (total < published.value[0] || total > published.value[1])) {
        issues.push(`${owner}: stage total ${total} days is outside the published duration ${published.value[0]}-${published.value[1]}`);
      }
    }
    if (published.kind === "available" && published.value[0] > published.value[1]) issues.push(`${owner}: published duration range is reversed`);
    if (profile.timing.turnaround.days > maxSeasonDays) issues.push(`${owner}: turnaround exceeds one year`);
    for (const scope of [profile.applicability.scope, ...profile.applicability.exclusions]) {
      if (scope.kind === "regional") {
        for (const bounds of scope.bounds) if (bounds.southDeg > bounds.northDeg) issues.push(`${owner}: region south ${bounds.southDeg} is north of ${bounds.northDeg}`);
      }
      if (scope.kind === "climate" && scope.inclusiveRange[0] > scope.inclusiveRange[1]) issues.push(`${owner}: climate range is reversed`);
    }
    for (const ruleId of profile.rotationRuleIds) {
      if (!release.rules.some(rule => rule.id === ruleId)) issues.push(`${owner}: unknown rotation rule ${ruleId}`);
    }
  }
  return issues;
}

function checkCatalogue(release: ReleasedRegistry): string[] {
  const issues: string[] = [];
  if (release.catalogue.version !== release.identity.catalogueVersion) issues.push("catalogue version does not match the release identity");
  const ids = new Set<string>();
  for (const entry of release.catalogue.entries) {
    if (ids.has(entry.id)) issues.push(`catalogue ${entry.id}: duplicate entry`);
    ids.add(entry.id);
    if (!release.profiles.some(profile => profile.cropPurposeId === entry.id && profile.purpose === entry.purpose)) {
      issues.push(`catalogue ${entry.id}: no released profile with this crop-purpose`);
    }
  }
  for (const profile of release.profiles) {
    if (!ids.has(profile.cropPurposeId)) issues.push(`profile ${profile.id}: crop-purpose ${profile.cropPurposeId} is not in the catalogue`);
  }
  return issues;
}

function checkRules(release: ReleasedRegistry): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const rule of release.rules) {
    if (seen.has(rule.id)) issues.push(`rule ${rule.id}: duplicate id`);
    seen.add(rule.id);
    if (rule.category === "pest" || rule.category === "weed") issues.push(`rule ${rule.id}: pest and weed rules are outside the MVP (spec 1.1, section 3.4)`);
  }
  if (release.coverage.length > 0) issues.push("coverage manifests are outside the MVP (spec 1.1, section 3.4)");
  return issues;
}

function checkPrecedence(release: ReleasedRegistry): string[] {
  const issues: string[] = [];
  const profiles = release.profiles;
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      if (a.cropPurposeId !== b.cropPurposeId || a.precedence !== b.precedence) continue;
      if (scopeLevel(a.applicability.scope) !== scopeLevel(b.applicability.scope)) continue;
      if (scopesMayOverlap(a.applicability.scope, b.applicability.scope)) {
        issues.push(`profiles ${a.id} and ${b.id}: ambiguous precedence ${a.precedence} for overlapping ${a.applicability.scope.kind} scopes`);
      }
    }
  }
  return issues;
}
