import { describe, expect, it } from "vitest";
import { completedSnapshotSchema, farmInputSchema, planResultSchema, releasedRegistrySchema } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, jobFixtures, resultFixtures } from "@/fixtures/results";
import { climateSnapshotFixture, syntheticRegistryFixture } from "@/fixtures/science";

describe("shared planner contracts", () => {
  it("round-trips all six result states and a completed snapshot through JSON", () => {
    expect(Object.keys(resultFixtures)).toHaveLength(6);
    for (const [state, fixture] of Object.entries(resultFixtures)) {
      expect(planResultSchema.parse(JSON.parse(JSON.stringify(fixture))).state).toBe(state);
      expect(fixture.details.provenance.kind).toBe("synthetic");
    }
    expect(completedSnapshotSchema.parse(JSON.parse(JSON.stringify(completedSnapshotFixture)))).toEqual(completedSnapshotFixture);
    expect(Object.keys(jobFixtures)).toHaveLength(5);
  });

  it("rejects a generated plan on a no-plan result", () => {
    expect(planResultSchema.safeParse({
      ...resultFixtures.insufficient_data,
      plan: resultFixtures.plan.plan,
    }).success).toBe(false);
  });

  it("rejects missing or duplicate selections and an impossible date", () => {
    for (const cropPurposeIds of [[], [inputFixture.cropPurposeIds[0], inputFixture.cropPurposeIds[0]]]) {
      expect(farmInputSchema.safeParse({ ...inputFixture, cropPurposeIds }).success).toBe(false);
    }
    expect(farmInputSchema.safeParse({ ...inputFixture, planningStart: "2025-02-29" }).success).toBe(false);
  });

  it("validates lookup containment across the dateline", () => {
    const field = { ...inputFixture.field, ring: [[179, -1], [-179, -1], [-179, 1], [179, 1], [179, -1]] };
    expect(farmInputSchema.safeParse({ ...inputFixture, field: { ...field, lookup: [-179.5, 0] } }).success).toBe(true);
    expect(farmInputSchema.safeParse({ ...inputFixture, field: { ...field, lookup: [0, 0] } }).success).toBe(false);
  });

  it("keeps missing precipitation distinct from measured zero and rejects synthetic registry data as a release", () => {
    expect(climateSnapshotFixture.days[0].rainMm).toEqual({ kind: "available", value: 0 });
    expect(climateSnapshotFixture.days.at(-1)?.rainMm.kind).toBe("unavailable");
    expect(releasedRegistrySchema.safeParse(syntheticRegistryFixture).success).toBe(false);
    expect(releasedRegistrySchema.safeParse({ ...syntheticRegistryFixture, kind: "released" }).success).toBe(false);
  });

});
