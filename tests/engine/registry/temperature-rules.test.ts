import { describe, expect, it } from "vitest";
import { assessClimate } from "@/engine/metrics";
import { readRegistryRelease, resolveRegistry } from "@/registry";
import { metricInput, occurrence, seasons, WET } from "../metrics/helpers";
import { lookupAt, places } from "./support";

describe("E1 temperature coverage after source correction", () => {
  it("releases no operational temperature rules or unused temperature sources", () => {
    const release = readRegistryRelease("fao56-hard-windows-2026-11-15");
    expect(new Set(release.profiles.map(profile => profile.cropPurposeId)).size).toBe(40);
    for (const profile of release.profiles) expect(profile.temperatureRules).toEqual([]);
    expect(release.sources.map(source => source.id)).toEqual(["fao56-table11", "fao56-table12"]);
  });

  it.each(["common-bean-dry", "maize-grain"])("keeps %s assessable with temperature explicitly unassessed using synthetic weather", id => {
    const resolution = resolveRegistry(lookupAt([id], places.boiseIdaho), readRegistryRelease("fao56-hard-windows-2026-11-15"));
    expect(resolution.gaps).toEqual([]);
    const [profile] = resolution.profiles;
    const assessment = assessClimate(metricInput({
      horizonDays: 365,
      profiles: resolution.profiles,
      occurrences: [occurrence(profile, "2026-07-01")],
      cohort: seasons(3, 365, () => WET),
    }));
    expect(assessment.kind).toBe("assessed");
    expect(assessment.unassessedChecks).toContainEqual({
      code: "temperature_rule",
      reason: "No released temperature rule; heat and cold exposure are unassessed, not safe.",
      cropPurposeIds: [id], sourceIds: [],
    });
    expect(assessment.metrics.find(metric => metric.id === "q90_temperature_exposure")?.value.kind).toBe("unavailable");
    expect(assessment.warnings.some(warning => warning.code === "temperature_exposure")).toBe(false);
  });
});
