import { describe, expect, it } from "vitest";
import { latestReleaseVersion, readCatalogue, readRegistryRelease, releasedVersions, validateRelease } from "@/registry";

const release1 = "fao56-2026-11-14";
const release2 = "fao56-temperature-2026-11-14";

const release1Totals: Record<string, number> = {
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

const fao56Table11Stages: Record<string, readonly [number, number, number, number]> = {
  "maize-grain-fao56-idaho-apr": [30, 40, 50, 50],
  "maize-grain-fao56-nigeria-humid-jun": [20, 35, 40, 30],
  "maize-grain-fao56-spain-california-apr": [30, 40, 50, 30],
  "maize-grain-fao56-east-africa-highland-apr": [30, 50, 60, 40],
  "maize-grain-fao56-india-dry-cool-oct": [20, 35, 40, 30],
  "common-bean-dry-fao56-idaho-jun": [25, 25, 30, 20],
  "common-bean-dry-fao56-pakistan-california-jun": [15, 25, 35, 20],
  "wheat-grain-fao56-central-india-nov": [15, 25, 50, 30],
  "wheat-grain-fao56-california-winter-dec": [20, 60, 70, 30],
  "wheat-grain-fao56-east-africa-jul": [15, 30, 65, 40],
  "wheat-grain-fao56-mediterranean-winter-nov": [30, 140, 40, 30],
  "wheat-grain-fao56-lat35-45n-mar-apr": [20, 25, 60, 30],
  "rice-paddy-fao56-mediterranean-may": [30, 30, 60, 30],
  "rice-paddy-fao56-tropics-dec": [30, 30, 60, 30],
  "barley-grain-fao56-california-desert-dec": [20, 50, 60, 30],
  "barley-grain-fao56-central-india-nov": [15, 25, 50, 30],
  "barley-grain-fao56-east-africa-jul": [15, 30, 65, 40],
  "barley-grain-fao56-lat35-45n-mar-apr": [20, 25, 60, 30],
  "oats-grain-fao56-california-desert-dec": [20, 50, 60, 30],
  "oats-grain-fao56-central-india-nov": [15, 25, 50, 30],
  "oats-grain-fao56-east-africa-jul": [15, 30, 65, 40],
  "oats-grain-fao56-lat35-45n-mar-apr": [20, 25, 60, 30],
  "millet-grain-fao56-pakistan-jun": [15, 25, 40, 25],
  "millet-grain-fao56-central-usa-apr": [20, 30, 55, 35],
  "sorghum-grain-fao56-usa-pakistan-mediterranean-may-jun": [20, 35, 40, 30],
  "soybean-grain-fao56-japan-jun": [20, 25, 75, 30],
  "soybean-grain-fao56-central-usa-may": [20, 35, 60, 25],
  "soybean-grain-fao56-tropics-dec": [15, 15, 40, 15],
  "groundnut-fao56-mediterranean": [35, 45, 35, 25],
  "groundnut-fao56-west-africa-dry-season": [25, 35, 45, 25],
  "lentil-dry-fao56-europe-apr": [20, 30, 60, 40],
  "pea-dry-fao56-idaho-apr": [35, 25, 30, 20],
  "pea-dry-fao56-mediterranean-mar-apr": [20, 30, 35, 15],
  "pea-dry-fao56-europe-may": [15, 25, 35, 15],
  "faba-bean-dry-fao56-mediterranean-mar-apr": [20, 30, 35, 15],
  "faba-bean-dry-fao56-europe-may": [15, 25, 35, 15],
  "mung-bean-dry-fao56-mediterranean-mar": [20, 30, 30, 20],
  "cowpea-dry-fao56-mediterranean-mar": [20, 30, 30, 20],
  "sunflower-seed-fao56-mediterranean-california-apr-may": [25, 35, 45, 25],
  "safflower-seed-fao56-california-apr": [20, 35, 45, 25],
  "potato-fao56-california-desert-dec": [30, 35, 50, 25],
  "potato-fao56-idaho-apr-may": [45, 30, 70, 20],
  "potato-fao56-europe-apr": [30, 35, 50, 30],
  "sweet-potato-fao56-mediterranean-apr": [20, 30, 60, 40],
  "sweet-potato-fao56-tropics-rainy-season": [15, 30, 50, 30],
};

const fao56Table12Kc: Record<string, readonly [number, number, number]> = {
  "maize-grain": [0.3, 1.2, 0.35],
  "common-bean-dry": [0.4, 1.15, 0.35],
  "rice-paddy": [1.05, 1.2, 0.9],
  "barley-grain": [0.3, 1.15, 0.25],
  "oats-grain": [0.3, 1.15, 0.25],
  "millet-grain": [0.3, 1.0, 0.3],
  "sorghum-grain": [0.3, 1.1, 0.55],
  "soybean-grain": [0.4, 1.15, 0.5],
  "groundnut": [0.4, 1.15, 0.6],
  "lentil-dry": [0.4, 1.1, 0.3],
  "pea-dry": [0.4, 1.15, 0.3],
  "faba-bean-dry": [0.5, 1.15, 0.3],
  "mung-bean-dry": [0.4, 1.05, 0.35],
  "cowpea-dry": [0.4, 1.05, 0.35],
  "sunflower-seed": [0.35, 1.0, 0.35],
  "safflower-seed": [0.35, 1.0, 0.25],
  "potato": [0.5, 1.15, 0.75],
  "sweet-potato": [0.5, 1.15, 0.65],
};

const expectedTemperatureRules: Record<string, readonly string[]> = {
  "maize-grain": ["max_c above 35"],
  "wheat-grain": ["max_c above 34"],
  "common-bean-dry": ["max_c above 30", "min_c above 20"],
  "rice-paddy": ["max_c above 36"],
  "soybean-grain": ["max_c above 39"],
};

const stagesOf = (profile: ReturnType<typeof readRegistryRelease>["profiles"][number]) => {
  const stages = profile.timing.generatedStageDays;
  return [stages.initial, stages.development, stages.middle, stages.late];
};

describe("E1 registry releases", () => {
  it("serves the temperature-rules release by default and every release passes validation", () => {
    expect(readRegistryRelease().identity.catalogueVersion).toBe(latestReleaseVersion);
    expect(latestReleaseVersion).toBe("fao56-temperature-rules-2026-11-15");
    for (const version of releasedVersions) {
      const release = readRegistryRelease(version);
      expect(validateRelease(release)).toEqual({ ok: true, release });
    }
  });

  it("keeps earlier releases readable and unchanged for frozen-job retries", () => {
    expect(releasedVersions).toEqual(["v1-empty", release1, release2, "fao56-vegetables-2026-11-15", latestReleaseVersion]);
    expect(readCatalogue("v1-empty")).toEqual({ version: "v1-empty", entries: [] });
    const first = readRegistryRelease(release1);
    expect(first.catalogue.entries.map(entry => entry.id)).toEqual(["common-bean-dry", "maize-grain", "wheat-grain"]);
    expect(first.sources.map(source => source.id)).toEqual(["fao56-table11", "fao56-table12"]);
    expect(Object.fromEntries(first.profiles.map(profile => [profile.id, stagesOf(profile).reduce((a, b) => a + b, 0)]))).toEqual(release1Totals);
    for (const profile of first.profiles) {
      expect(profile.version).toBe("1");
      expect(profile.temperatureRules).toEqual([]);
    }
  });

  it("publishes 19 food crops, each backed by released profiles", () => {
    const release = readRegistryRelease(release2);
    expect(release.catalogue.entries.map(entry => entry.id)).toEqual([
      "barley-grain", "common-bean-dry", "cowpea-dry", "faba-bean-dry", "groundnut", "lentil-dry", "maize-grain",
      "millet-grain", "mung-bean-dry", "oats-grain", "pea-dry", "potato", "rice-paddy", "safflower-seed",
      "sorghum-grain", "soybean-grain", "sunflower-seed", "sweet-potato", "wheat-grain",
    ]);
    for (const entry of release.catalogue.entries) {
      expect(entry.purpose).toBe("food");
      expect(release.profiles.some(profile => profile.cropPurposeId === entry.id)).toBe(true);
    }
  });

  it("matches every generated stage allocation to its FAO-56 Table 11 row", () => {
    const profiles = readRegistryRelease(release2).profiles;
    expect(Object.fromEntries(profiles.map(profile => [profile.id, stagesOf(profile)]))).toEqual(fao56Table11Stages);
    const printedTotalsThatDisagree: Record<string, number> = {
      "sorghum-grain-fao56-usa-pakistan-mediterranean-may-jun": 130,
      "mung-bean-dry-fao56-mediterranean-mar": 110,
      "cowpea-dry-fao56-mediterranean-mar": 110,
    };
    for (const profile of profiles) {
      const total = stagesOf(profile).reduce((a, b) => a + b, 0);
      expect(profile.timing.publishedDurationDays).toEqual({ kind: "available", value: [total, total] });
      const printed = printedTotalsThatDisagree[profile.id];
      if (printed !== undefined) expect(profile.warnings.join(" ")).toContain(`prints a ${printed}-day total, which is not used`);
    }
  });

  it("matches every Kc to its FAO-56 Table 12 row and footnote choice", () => {
    for (const profile of readRegistryRelease(release2).profiles) {
      if (profile.cropPurposeId === "wheat-grain") continue;
      expect([profile.kc.initial, profile.kc.middle, profile.kc.end]).toEqual(fao56Table12Kc[profile.cropPurposeId]);
    }
    const wheat = Object.fromEntries(readRegistryRelease(release2).profiles
      .filter(profile => profile.cropPurposeId === "wheat-grain")
      .map(profile => [profile.id, [profile.kc.initial, profile.kc.middle, profile.kc.end]]));
    expect(wheat).toEqual({
      "wheat-grain-fao56-central-india-nov": [0.3, 1.15, 0.25],
      "wheat-grain-fao56-california-winter-dec": [0.7, 1.15, 0.25],
      "wheat-grain-fao56-east-africa-jul": [0.3, 1.15, 0.25],
      "wheat-grain-fao56-mediterranean-winter-nov": [0.7, 1.15, 0.25],
      "wheat-grain-fao56-lat35-45n-mar-apr": [0.3, 1.15, 0.25],
    });
  });

  it("adds the approved mid-season temperature rules and nothing else", () => {
    for (const profile of readRegistryRelease(release2).profiles) {
      const rules = profile.temperatureRules.map(rule => `${rule.variable} ${rule.predicate} ${rule.thresholdC}`);
      expect(rules).toEqual(expectedTemperatureRules[profile.cropPurposeId] ?? []);
      for (const rule of profile.temperatureRules) {
        expect(rule.scope).toEqual({ kind: "stage", stage: "middle" });
        expect(rule.period).toBe("daily");
        expect(rule.limitations.length).toBeGreaterThan(0);
        for (const sourceId of rule.sourceIds) expect(profile.sourceIds).toContain(sourceId);
      }
    }
  });

  it("cites only reviewed real sources and labels turnaround as a scheduling assumption", () => {
    const release = readRegistryRelease(release2);
    expect(release.sources.map(source => source.id)).toEqual(["fao56-table11", "fao56-table12", "gourdji2013", "teixeira2013", "vargas2021", "silva2020"]);
    for (const profile of release.profiles) {
      expect(profile.status).toBe("released");
      expect(profile.review.reviewer.length).toBeGreaterThan(0);
      expect(JSON.stringify(profile)).not.toMatch(/synthetic/i);
      expect(profile.timing.turnaround).toMatchObject({ basis: "scheduling_assumption", days: 7 });
      expect(profile.preparation).toEqual([]);
    }
    expect(release.rules).toEqual([]);
    expect(release.coverage).toEqual([]);
  });

  it("flags paddy rice water losses and omits unconfirmed groundnut planting months", () => {
    const profiles = readRegistryRelease(release2).profiles;
    for (const rice of profiles.filter(profile => profile.cropPurposeId === "rice-paddy")) {
      expect(rice.warnings.join(" ")).toMatch(/excludes ponding, seepage and percolation/);
    }
    for (const groundnut of profiles.filter(profile => profile.cropPurposeId === "groundnut")) {
      expect(groundnut.timing.plantingWindows).toEqual([]);
    }
  });

  it("rejects unknown versions", () => {
    expect(() => readRegistryRelease("v0-missing")).toThrow(RangeError);
  });

  it("returns deeply immutable release objects", () => {
    const release = readRegistryRelease(release2);
    const kc = release.profiles[0].kc as { middle: number };
    expect(() => { kc.middle = 9; }).toThrow(TypeError);
    expect(Object.isFrozen(release.profiles[0].temperatureRules)).toBe(true);
    expect(readRegistryRelease(release2)).toBe(release);
  });
});
