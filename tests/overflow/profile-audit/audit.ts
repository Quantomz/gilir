import { isDeepStrictEqual } from "node:util";
import { releasedRegistrySchema } from "../../../src/contracts/registry";
import type { CropProfile } from "../../../src/contracts/registry";
import type { Evidence } from "./evidence";

interface Check {
  release: string;
  subjectId: string;
  field: string;
  outcome: "agreement" | "discrepancy";
  expected: unknown;
  observed: unknown;
  sourceRecordIds: readonly string[];
}

function plantingMeaning(windows: CropProfile["timing"]["plantingWindows"]) {
  const days = new Set<string>();
  for (const { window } of windows) {
    const date = new Date(`2000-${window.startMonthDay}T00:00:00Z`);
    for (let index = 0; index < 366; index++) {
      const day = date.toISOString().slice(5, 10);
      days.add(day);
      if (day === window.endMonthDayInclusive) break;
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  const months = [...new Set([...days].map(day => Number(day.slice(0, 2))))].sort((a, b) => a - b);
  return {
    months,
    partialMonths: months.filter(month => [...days].filter(day => Number(day.slice(0, 2)) === month).length !== new Date(Date.UTC(2000, month, 0)).getUTCDate()),
    bases: [...new Set(windows.map(window => window.basis))].sort(),
    sourceIds: [...new Set(windows.flatMap(window => window.sourceIds))].sort(),
  };
}

export function auditRegistry(read: (version: string) => unknown, evidence: Evidence) {
  const checks: Check[] = [];
  const errors: string[] = [];
  let completedCoreProfileComparisons = 0;
  let validatedReleases = 0;
  const inventory = (values: readonly string[]) => [...values].sort();
  for (const [releaseIndex, wanted] of evidence.releases.entries()) {
    const version = wanted.catalogueVersion;
    let raw: unknown;
    try {
      raw = read(version);
    } catch {
      errors.push(`Public registry could not read ${version}`);
      continue;
    }
    const parsed = releasedRegistrySchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Invalid public release ${version}: ${parsed.error.issues.map(issue => issue.path.join(".")).sort().join(", ")}`);
      continue;
    }
    const release = parsed.data;
    if (release.profiles.length === 0) {
      errors.push(`Empty or stub public release ${version}`);
      continue;
    }
    validatedReleases++;
    function check(subjectId: string, field: string, expected: unknown, observed: unknown, sourceRecordIds: readonly string[] = []) {
      checks.push({ release: version, subjectId, field, expected, observed, sourceRecordIds, outcome: isDeepStrictEqual(expected, observed) ? "agreement" : "discrepancy" });
    }
    check(version, "identity", { catalogueVersion: version, ruleVersion: wanted.ruleVersion }, release.identity);
    check(version, "catalogue.version", version, release.catalogue.version);
    const members = releaseIndex === 0 ? evidence.core : evidence.profiles;
    check(version, "profileMembership", inventory(members.map(row => row.profileId)), inventory(release.profiles.map(row => row.id)));
    check(version, "profileCropPurposeIds", inventory(members.map(row => `${row.profileId}:${row.cropPurposeId}`)), inventory(release.profiles.map(row => `${row.id}:${row.cropPurposeId}`)));
    check(version, "catalogueMembership", inventory([...new Set(members.map(row => row.cropPurposeId))]), inventory(release.catalogue.entries.map(row => row.id)));
    check(version, "rotationRules", [], release.rules.map(rule => rule.id));

    const rules = release.profiles.flatMap(profile => profile.temperatureRules);
    check(version, "temperatureRuleMembership", releaseIndex === 0 ? [] : inventory(evidence.temperature.map(rule => rule.ruleId)), inventory([...new Set(rules.map(rule => rule.id))]));
    const seen = new Map<string, CropProfile["temperatureRules"][number]>();
    for (const rule of rules) {
      const previous = seen.get(rule.id);
      if (previous && !isDeepStrictEqual(previous, rule)) check(rule.id, "temperatureRuleConsistency", previous, rule);
      seen.set(rule.id, rule);
    }
    for (const row of evidence.core) {
      const matches = release.profiles.filter(profile => profile.id === row.profileId);
      if (matches.length !== 1) continue;
      const profile = matches[0];
      const timing = profile.timing;
      const rowCheck = (field: string, expected: unknown, observed: unknown) => check(row.profileId, field, expected, observed, [row.table11RowId, row.table12RowId]);
      rowCheck("profile.version", wanted.profileVersions[row.cropPurposeId], profile.version);
      for (const stage of ["initial", "development", "middle", "late"] as const) rowCheck(`timing.generatedStageDays.${stage}`, row.stages[stage], timing.generatedStageDays[stage]);
      rowCheck("timing.historicalStageAllocations", [row.stages], timing.historicalStageAllocations);
      rowCheck("timing.publishedDurationDays", { kind: "available", value: [row.durationDays, row.durationDays] }, timing.publishedDurationDays);
      for (const coefficient of ["initial", "middle", "end"] as const) rowCheck(`kc.${coefficient}`, row.kc[coefficient], profile.kc[coefficient]);
      rowCheck("timing.plantingWindows", { months: row.months, partialMonths: [], bases: ["recommendation"], sourceIds: ["fao56-table11"] }, plantingMeaning(timing.plantingWindows));
      rowCheck("timing.turnaround", { basis: "scheduling_assumption", days: 7 }, { basis: timing.turnaround.basis, days: timing.turnaround.days });
      completedCoreProfileComparisons++;
    }
  }
  const sourceReviews = {
    subjectSha: evidence.subjectSha,
    sourceUrl: evidence.sourceUrl, sourceRecordFile: evidence.sourceRecordFile, units: evidence.units,
    method: "Source review outcomes are carried from exact-subject evidence. Numeric agreement does not certify management, geography, field suitability, or temperature mappings.",
    profiles: evidence.profiles,
    temperature: evidence.temperature,
    faoFindings: evidence.faoFindings,
    qualifications: evidence.core.map(row => ({ profileId: row.profileId, sourceRecordIds: [row.table11RowId, row.table12RowId], footnotes: row.footnotes, qualifications: row.qualifications })),
    interpretation: evidence.interpretation,
  };
  const hasFindings = evidence.temperature.length > 0 || evidence.faoFindings.length > 0 || evidence.profiles.some(row => row.support !== "supported") || checks.some(check => check.outcome === "discrepancy");
  return {
    execution: errors.length ? "incomplete" : "complete",
    exitCode: errors.length ? 2 : hasFindings ? 1 : 0,
    errors,
    coverage: {
      expectedReleases: 2, validatedReleases, expectedCoreProfileComparisons: 24, completedCoreProfileComparisons,
      coreProfiles: evidence.core.length, expandedProfileSourceReviews: evidence.profiles.length, temperatureSourceReviews: evidence.temperature.length,
      automatedSourceComparisonScope: "Only the twelve core profiles in the first and latest named releases. Other releases and 74 additional profile numbers are not compared by this runner.",
    },
    checks, sourceReviews,
  };
}
