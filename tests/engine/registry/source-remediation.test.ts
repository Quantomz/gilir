import { describe, expect, it } from "vitest";
import { latestReleaseVersion, readRegistryRelease, releasedVersions } from "@/registry";

const reviewedVersion = "fao56-reviewed-2026-11-15";
const retiredVersions = [
  "fao56-2026-11-14",
  "fao56-temperature-2026-11-14",
  "fao56-vegetables-2026-11-15",
  "fao56-temperature-rules-2026-11-15",
];

describe("E1 source correction", () => {
  it("publishes a new identity without rebuilding the retired drafts", () => {
    expect(latestReleaseVersion).toBe(reviewedVersion);
    expect(releasedVersions).toEqual(["v1-empty", reviewedVersion]);
    expect(readRegistryRelease().identity).toEqual({
      catalogueVersion: reviewedVersion,
      ruleVersion: "no-rules-2026-11-14",
    });
  });

  it.each(retiredVersions)("rejects retired draft %s explicitly", version => {
    expect(() => readRegistryRelease(version)).toThrow(RangeError);
    expect(() => readRegistryRelease(version)).toThrow(/Retired catalogue release/);
  });

  it("does not publish unsupported operational temperature mappings", () => {
    expect(readRegistryRelease().profiles.flatMap(profile => profile.temperatureRules)).toEqual([]);
  });

  it.each([
    ["sorghum-grain-fao56-usa-pakistan-mediterranean-may-jun", 125, 130],
    ["mung-bean-dry-fao56-mediterranean-mar", 100, 110],
    ["cowpea-dry-fao56-mediterranean-mar", 100, 110],
    ["eggplant-fao56-mediterranean-may-jun", 140, 40],
  ])("keeps %s duration unavailable when source figures conflict", (id, derived, printed) => {
    const profile = readRegistryRelease().profiles.find(candidate => candidate.id === id);
    expect(profile).toBeDefined();
    expect(profile?.timing.publishedDurationDays).toEqual({
      kind: "unavailable",
      reason: `FAO-56 Table 11 prints a ${printed}-day total; the sourced stages sum to ${derived} days. The published duration is unresolved.`,
    });
  });
});
