import { describe, expect, it } from "vitest";
import { latestReleaseVersion, readCatalogue, readRegistryRelease, releasedVersions, validateRelease } from "@/registry";

const table11Totals: Record<string, number> = {
  "maize-grain-fao56-idaho-apr": 170,
  "maize-grain-fao56-nigeria-humid-jun": 125,
  "maize-grain-fao56-spain-california-apr": 150,
  "maize-grain-fao56-east-africa-highland-apr": 180,
  "maize-grain-fao56-india-dry-cool-oct": 125,
  "common-bean-dry-fao56-idaho-jun": 100,
  "common-bean-dry-fao56-pakistan-california-jun": 95,
  "wheat-grain-fao56-central-india-nov": 120,
  "wheat-grain-fao56-california-winter-dec": 180,
  "wheat-grain-fao56-east-africa-jul": 150,
  "wheat-grain-fao56-mediterranean-winter-nov": 240,
  "wheat-grain-fao56-lat35-45n-mar-apr": 135,
};

describe("E1 registry releases", () => {
  it("serves the FAO-56 release by default and it passes release validation", () => {
    const release = readRegistryRelease();
    expect(release.identity.catalogueVersion).toBe(latestReleaseVersion);
    expect(validateRelease(release)).toEqual({ ok: true, release });
  });

  it("publishes only maize, dry common bean and wheat, each backed by released profiles", () => {
    const catalogue = readCatalogue();
    expect(catalogue.entries.map(entry => entry.id)).toEqual(["common-bean-dry", "maize-grain", "wheat-grain"]);
    for (const entry of catalogue.entries) {
      expect(readRegistryRelease().profiles.some(profile => profile.cropPurposeId === entry.id)).toBe(true);
    }
  });

  it("records every profile as reviewed, released, FAO-sourced and free of synthetic provenance", () => {
    const release = readRegistryRelease();
    expect(release.sources.map(source => source.id)).toEqual(["fao56-table11", "fao56-table12"]);
    for (const profile of release.profiles) {
      expect(profile.status).toBe("released");
      expect(profile.review.reviewer.length).toBeGreaterThan(0);
      expect(profile.sourceIds).toEqual(["fao56-table11", "fao56-table12"]);
      expect(JSON.stringify(profile)).not.toMatch(/synthetic/i);
    }
  });

  it("matches each generated season length to its FAO-56 Table 11 row total", () => {
    const profiles = readRegistryRelease().profiles;
    expect(Object.fromEntries(profiles.map(profile => {
      const stages = profile.timing.generatedStageDays;
      return [profile.id, stages.initial + stages.development + stages.middle + stages.late];
    }))).toEqual(table11Totals);
  });

  it("labels turnaround as a 7-day scheduling assumption and leaves temperature rules, preparation and pest coverage unpublished", () => {
    const release = readRegistryRelease();
    for (const profile of release.profiles) {
      expect(profile.timing.turnaround).toMatchObject({ basis: "scheduling_assumption", days: 7 });
      expect(profile.temperatureRules).toEqual([]);
      expect(profile.preparation).toEqual([]);
    }
    expect(release.rules).toEqual([]);
    expect(release.coverage).toEqual([]);
  });

  it("keeps the earlier empty release readable for frozen-job retries", () => {
    expect(releasedVersions).toEqual(["v1-empty", latestReleaseVersion]);
    expect(readCatalogue("v1-empty")).toEqual({ version: "v1-empty", entries: [] });
  });

  it("rejects unknown versions", () => {
    expect(() => readRegistryRelease("v0-missing")).toThrow(RangeError);
  });

  it("returns deeply immutable release objects", () => {
    const release = readRegistryRelease();
    const kc = release.profiles[0].kc as { middle: number };
    expect(() => { kc.middle = 9; }).toThrow(TypeError);
    expect(Object.isFrozen(release.catalogue.entries)).toBe(true);
    expect(readRegistryRelease()).toBe(release);
  });
});
