import { describe, expect, it } from "vitest";
import { draftRotationRuleSchema, farmInputSchema, planResultSchema, releasedRegistrySchema, syntheticRegistrySchema } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { resultFixtures } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";

const components = [
  { metricId: "mean_frequency", value: 0.2, unit: "fraction" },
  { metricId: "mean_mismatch", value: 0.1, unit: "fraction" },
  { metricId: "unplanted_days", value: 12, unit: "days" },
  { metricId: "longest_unplanted_gap", value: 7, unit: "days" },
];
const withTuple = (rankingTuple: unknown) => ({
  ...resultFixtures.plan,
  plan: { horizon: resultFixtures.plan.plan.horizon, occurrences: resultFixtures.plan.plan.occurrences, rankingTuple },
});
const rule = {
  id: "contract-test-successor-rule", version: "test-v1", target: "Physical successor restriction",
  applicability: { scope: { kind: "broad" }, exclusions: [], managementAssumptions: [] },
  category: "physical_or_regulatory",
  predicate: { kind: "prohibit_successor", predecessorCropPurposeIds: ["test-first"], successorCropPurposeIds: ["test-second"] },
  limitations: [], preparation: [], sourceIds: ["contract-test-source"],
};
const registry = {
  kind: "released", identity: { catalogueVersion: "contract-test", ruleVersion: "contract-test" },
  catalogue: { version: "contract-test", entries: [] }, profiles: [],
  sources: [{ id: "contract-test-source", title: "Contract test only", url: "https://example.org/contract-test", section: "Test",
    publishedOn: { kind: "unavailable", reason: "Contract test only." }, extractedOn: "2026-11-14" }],
  rules: [{ ...rule, status: "released", review: { reviewer: "Contract test", reviewedOn: "2026-11-14" } }],
};

describe("spec 1.1 shared contracts", () => {
  it("accepts input without priority", () => {
    const input = Object.fromEntries(Object.entries(inputFixture).filter(([key]) => key !== "priority"));
    expect(farmInputSchema.parse(input)).toEqual(input);
  });

  it.each(["water", "soil", "bad_year", "pests_weeds"])("rejects retired priority %s", priority => {
    expect(farmInputSchema.safeParse({ ...inputFixture, priority }).success).toBe(false);
  });

  it("round-trips exactly four fixed ranking components", () => {
    const result = withTuple({ components });
    expect(planResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it("rejects retired tuple fields and shapes", () => {
    expect(planResultSchema.safeParse(withTuple({ priority: "water", components })).success).toBe(false);
    expect(planResultSchema.safeParse({ ...resultFixtures.plan, plan: {
      horizon: resultFixtures.plan.plan.horizon, occurrences: resultFixtures.plan.plan.occurrences,
      priorityTuple: { priority: "water", components: components.slice(0, 2) },
    } }).success).toBe(false);
  });

  it.each([
    components.slice(0, 3), [...components, components[0]],
    [components[1], components[0], components[2], components[3]],
    components.map((component, i) => i === 0 ? { ...component, metricId: "q90_mismatch" } : component),
    components.map((component, i) => i === 0 ? { ...component, unit: "days" } : component),
    components.map((component, i) => i === 2 ? { ...component, unit: "fraction" } : component),
    ...[NaN, Infinity, -Infinity, -0.1, 1.1].map(value => components.map((component, i) => i === 0 ? { ...component, value } : component)),
    ...[-1, 0.5, Infinity, NaN].map(value => components.map((component, i) => i === 2 ? { ...component, value } : component)),
  ].map(invalid => ({ invalid })))("rejects malformed ranking components %#", ({ invalid }) => {
    expect(planResultSchema.safeParse(withTuple({ components: invalid })).success).toBe(false);
  });

  it("accepts sourced physical successor rules with review on released records", () => {
    expect(draftRotationRuleSchema.safeParse({ ...rule, status: "draft" }).success).toBe(true);
    expect(releasedRegistrySchema.safeParse(registry).success).toBe(true);
    expect(draftRotationRuleSchema.safeParse({ ...rule, status: "draft", sourceIds: [] }).success).toBe(false);
    expect(releasedRegistrySchema.safeParse({ ...registry, rules: [{ ...rule, status: "released" }] }).success).toBe(false);
  });

  it.each(["pest", "weed", "environment"])("rejects retired %s rules in drafts and registries", category => {
    expect(draftRotationRuleSchema.safeParse({ ...rule, status: "draft", category }).success).toBe(false);
    expect(releasedRegistrySchema.safeParse({ ...registry, rules: [{ ...registry.rules[0], category }] }).success).toBe(false);
    expect(syntheticRegistrySchema.safeParse({ ...syntheticRegistryFixture, rules: [{ ...rule, status: "synthetic", category }] }).success).toBe(false);
  });

  it("rejects host-free-break rules and coverage manifests", () => {
    const predicate = { kind: "minimum_host_free_break", hostCropPurposeIds: ["test-first"], nonHostCropPurposeIds: [], requiredBreakDays: 30 };
    expect(draftRotationRuleSchema.safeParse({ ...rule, status: "draft", predicate }).success).toBe(false);
    expect(releasedRegistrySchema.safeParse({ ...registry, rules: [{ ...registry.rules[0], predicate }] }).success).toBe(false);
    expect(syntheticRegistrySchema.safeParse({ ...syntheticRegistryFixture, rules: [{ ...rule, status: "synthetic", predicate }] }).success).toBe(false);
    expect(draftRotationRuleSchema.safeParse({ ...rule, status: "draft", coverage: [] }).success).toBe(false);
    expect(releasedRegistrySchema.safeParse({ ...registry, coverage: [] }).success).toBe(false);
    expect(syntheticRegistrySchema.safeParse({ ...syntheticRegistryFixture, coverage: [] }).success).toBe(false);
  });

  it("preserves supported temperature rules and profiles without temperature rules", () => {
    expect(syntheticRegistrySchema.parse(syntheticRegistryFixture)).toEqual(syntheticRegistryFixture);
    const profiles = syntheticRegistryFixture.profiles.map(profile => ({ ...profile, temperatureRules: [] }));
    expect(syntheticRegistrySchema.parse({ ...syntheticRegistryFixture, profiles }).profiles[0].temperatureRules).toEqual([]);
  });

  it("preserves temperature gaps, warnings, and available or unavailable Q90 indicators", () => {
    const metric = resultFixtures.plan.details.metrics[0];
    const q90 = { ...metric, id: "q90_mismatch", value: { kind: "available", value: 0.9 } };
    const temperature = { ...metric, id: "q90_temperature_exposure", value: { kind: "unavailable", reason: "No supported temperature rule." } };
    const gap = { code: "temperature_rule", reason: "No supported temperature rule.", cropPurposeIds: inputFixture.cropPurposeIds, sourceIds: [] };
    const result = { ...resultFixtures.plan_with_warnings, details: {
      ...resultFixtures.plan_with_warnings.details, metrics: [q90, temperature],
      seasonMetrics: [{ replayStart: "2000-07-01", metrics: [q90, temperature] }], unassessedChecks: [gap],
      warnings: [{ code: "temperature_exposure", message: "Contract test warning.", cropPurposeIds: inputFixture.cropPurposeIds, ruleIds: [], metricIds: [temperature.id] }],
    } };
    expect(planResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(planResultSchema.safeParse({ ...resultFixtures.insufficient_data, missing: [{ ...gap, code: "ranking_metric" }] }).success).toBe(true);
    expect(planResultSchema.safeParse({ ...resultFixtures.insufficient_data, missing: [{ ...gap, code: "priority_metric" }] }).success).toBe(false);
  });
});
