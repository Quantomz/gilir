import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { releasedRegistrySchema } from "../../../src/contracts/registry";
import type { ReleasedRegistry } from "../../../src/contracts/registry";
import { auditRegistry } from "./audit";
import { loadEvidence, validateEvidence } from "./evidence";

const evidence = loadEvidence();
const first = evidence.releases[0];
const latest = evidence.releases[1];

function syntheticRelease(version: string): ReleasedRegistry {
  const release = evidence.releases.find(item => item.catalogueVersion === version);
  if (!release) throw new RangeError("Unknown synthetic version");
  const members = release === first ? evidence.core : evidence.profiles;
  const profiles = members.map((member, index) => {
    const row = evidence.core.find(core => core.profileId === member.profileId) ?? evidence.core[0];
    return {
      id: member.profileId, cropPurposeId: member.cropPurposeId,
      version: release.profileVersions[member.cropPurposeId] ?? "1",
      status: "released", review: { reviewer: "Synthetic test only", reviewedOn: "2026-11-15" },
      commonName: "Synthetic", scientificName: "Synthetic", family: "Synthetic", isLegume: false,
      purpose: "food", cultivarGroup: "Synthetic", productionSystem: "Synthetic",
      applicability: { scope: { kind: "broad" }, exclusions: [], managementAssumptions: [] }, precedence: 0,
      timing: {
        generatedStageDays: row.stages,
        historicalStageAllocations: [row.stages],
        publishedDurationDays: { kind: "available", value: [row.durationDays, row.durationDays] },
        plantingWindows: row.months.map(month => ({
          window: { startMonthDay: `${String(month).padStart(2, "0")}-01`, endMonthDayInclusive: `${String(month).padStart(2, "0")}-${new Date(Date.UTC(2000, month, 0)).getUTCDate()}` },
          basis: "recommendation", sourceIds: ["fao56-table11"],
        })),
        turnaround: { basis: "scheduling_assumption", days: 7, assumption: "Synthetic scheduling assumption" },
      },
      kc: { ...row.kc, stageInterpolation: "initial_middle_constant_development_late_linear_include_endpoints", assumptions: [], sourceIds: ["fao56-table12"] },
      temperatureRules: release === latest && index === 0 ? evidence.temperature.map(rule => ({
        id: rule.ruleId, scope: { kind: "whole_occurrence" }, period: "daily", variable: "max_c", predicate: "above", thresholdC: 30, sourceIds: ["synthetic"], limitations: [],
      })) : [],
      rotationRuleIds: [], preparation: [], warnings: [], sourceIds: ["fao56-table11", "fao56-table12"],
    };
  });
  return releasedRegistrySchema.parse({
    kind: "released", identity: { catalogueVersion: version, ruleVersion: release.ruleVersion },
    catalogue: { version, entries: [...new Set(members.map(row => row.cropPurposeId))].map(id => ({ id, label: "Synthetic", purpose: "food" })) },
    profiles, rules: [], sources: [],
  });
}

function run(change: (release: ReleasedRegistry) => unknown = release => release) {
  return auditRegistry(version => change(syntheticRelease(version)), evidence);
}

function discrepancy(report: ReturnType<typeof run>, field: string) {
  expect(report.checks.some(check => check.field === field && check.outcome === "discrepancy")).toBe(true);
  expect(report.exitCode).toBe(1);
}

describe("X1 worksheet and synthetic mechanics; zero real-subject comparisons", () => {
  it("anchors twelve independent rows to literal source cells and exact review inventories", () => {
    expect(() => validateEvidence(evidence)).not.toThrow();
    expect(evidence.core).toHaveLength(12);
    expect(evidence.profiles).toHaveLength(86);
    expect(evidence.temperature).toHaveLength(32);
    expect(evidence.core.every(row => Object.values(row.stages).reduce((a, b) => a + b, 0) === row.durationDays)).toBe(true);
  });

  it("rejects a corrupted source worksheet rather than treating it as a new oracle", () => {
    const core = evidence.core.map((row, index) => index ? row : { ...row, stages: { ...row.stages, initial: row.stages.initial + 1 } });
    expect(() => validateEvidence({ ...evidence, core })).toThrow();
  });

  it("keeps all source findings when every synthetic core value agrees", () => {
    const report = run();
    expect(report.execution).toBe("complete");
    expect(report.coverage.completedCoreProfileComparisons).toBe(24);
    expect(report.checks.filter(check => check.outcome === "discrepancy")).toEqual([]);
    expect(report.sourceReviews.temperature.filter(row => row.outcome === "unsupported")).toHaveLength(28);
    expect(report.sourceReviews.temperature.filter(row => row.outcome === "unverified")).toHaveLength(4);
    expect(report.sourceReviews.faoFindings).toEqual(evidence.faoFindings);
    expect(report.exitCode).toBe(1);
  });

  it.each(["initial", "development", "middle", "late"] as const)("detects a changed %s stage", stage => {
    discrepancy(run(release => ({ ...release, profiles: release.profiles.map((profile, index) => index ? profile : {
      ...profile, timing: { ...profile.timing, generatedStageDays: { ...profile.timing.generatedStageDays, [stage]: profile.timing.generatedStageDays[stage] + 1 } },
    }) })), `timing.generatedStageDays.${stage}`);
  });

  it.each(["initial", "middle", "end"] as const)("detects a changed %s Kc", coefficient => {
    discrepancy(run(release => ({ ...release, profiles: release.profiles.map((profile, index) => index ? profile : { ...profile, kc: { ...profile.kc, [coefficient]: profile.kc[coefficient] + 0.01 } }) })), `kc.${coefficient}`);
  });

  it("detects changed historical allocation, duration, month extent, and turnaround basis", () => {
    const report = run(release => ({ ...release, profiles: release.profiles.map((profile, index) => index ? profile : {
      ...profile, timing: { ...profile.timing, historicalStageAllocations: [], publishedDurationDays: { kind: "available", value: [100, 100] },
        plantingWindows: [{ window: { startMonthDay: "04-02", endMonthDayInclusive: "04-30" }, basis: "hard_constraint", sourceIds: ["fao56-table11"] }],
        turnaround: { basis: "published", days: 7, sourceIds: ["fao56-table11"] },
      },
    }) }));
    for (const field of ["timing.historicalStageAllocations", "timing.publishedDurationDays", "timing.plantingWindows", "timing.turnaround"]) discrepancy(report, field);
  });

  it.each(["missing", "extra", "duplicate"])("detects %s profiles", mutation => {
    discrepancy(run(release => ({ ...release, profiles: mutation === "missing" ? release.profiles.slice(1) : [...release.profiles, { ...release.profiles[0], id: mutation === "extra" ? "unexpected-profile" : release.profiles[0].id }] })), "profileMembership");
  });

  it("detects changed profile and release versions", () => {
    const report = run(release => ({ ...release, identity: { ...release.identity, catalogueVersion: "changed-version" }, profiles: release.profiles.map(profile => ({ ...profile, version: "999" })) }));
    discrepancy(report, "identity");
    discrepancy(report, "profile.version");
  });

  it("detects an unexpected temperature rule ID", () => {
    discrepancy(run(release => ({ ...release, profiles: release.profiles.map((profile, index) => index ? profile : { ...profile, temperatureRules: profile.temperatureRules.map((rule, ruleIndex) => ruleIndex ? rule : { ...rule, id: "unexpected-rule" }) }) })), "temperatureRuleMembership");
  });

  it("detects inconsistent bodies for duplicate temperature IDs", () => {
    discrepancy(run(release => ({ ...release, profiles: release.profiles.map((profile, index) => index === 1 && release.profiles[0].temperatureRules.length ? {
      ...profile, temperatureRules: [{ ...release.profiles[0].temperatureRules[0], thresholdC: 999 }],
    } : profile) })), "temperatureRuleConsistency");
  });

  it("rejects missing required public fields and retains findings", () => {
    const report = run(release => ({ ...release, profiles: release.profiles.map(profile => {
      const { kc, ...missingKc } = profile;
      void kc;
      return missingKc;
    }) }));
    expect(report.execution).toBe("incomplete");
    expect(report.exitCode).toBe(2);
    expect(report.coverage.completedCoreProfileComparisons).toBe(0);
    expect(report.sourceReviews.temperature).toHaveLength(32);
  });

  it("rejects empty stub releases instead of claiming a completed comparison", () => {
    const report = run(release => ({ ...release, profiles: [] }));
    expect(report.execution).toBe("incomplete");
    expect(report.exitCode).toBe(2);
    expect(report.coverage.completedCoreProfileComparisons).toBe(0);
  });

  it("rejects a wrong CLI SHA without reading any real E1 release", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const require = createRequire(import.meta.url);
    const result = spawnSync(process.execPath, ["--import", require.resolve("tsx"), "tests/overflow/profile-audit/run.ts", "--subject", root, "--expect-sha", "0".repeat(40)], { cwd: root, encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, TSX_DISABLE_CACHE: "1" } });
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain('"completedCoreProfileComparisons": 0');
    expect(result.stdout).toContain("matching the checked-in evidence manifest");
    expect(result.stdout).toContain("FAO-TOTAL-SORGHUM");
  });

  it("rejects unavailable versions and a stub instead of skipping", () => {
    const report = auditRegistry(() => { throw new RangeError("Unknown release"); }, evidence);
    expect(report.exitCode).toBe(2);
    expect(report.errors).toHaveLength(2);
    expect(report.coverage.completedCoreProfileComparisons).toBe(0);
    expect(report.sourceReviews.faoFindings).toEqual(evidence.faoFindings);
  });
});
