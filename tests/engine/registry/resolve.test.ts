import { describe, expect, it } from "vitest";
import { syntheticRegistrySchema } from "@/contracts/registry";
import { parseIsoDate } from "@/contracts/common";
import { findCalendar } from "@/engine";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { readRegistryRelease, resolveRegistry } from "@/registry";
import { lookupAt, places } from "./support";

const release = readRegistryRelease();
const resolveAt = (crops: readonly string[], place: readonly [number, number]) => resolveRegistry(lookupAt(crops, place), release);
const profileIds = (crops: readonly string[], place: readonly [number, number]) => resolveAt(crops, place).profiles.map(profile => profile.id);

describe("E1 registry resolution with the FAO-56 release", () => {
  it("selects the regional profile that covers the field", () => {
    expect(profileIds(["maize-grain"], places.boiseIdaho)).toEqual(["maize-grain-fao56-idaho-apr"]);
    expect(resolveAt(["maize-grain"], places.nakuruKenya).gaps[0].code).toBe("crop_profile");
    expect(profileIds(["wheat-grain"], places.bhopalIndia)).toEqual(["wheat-grain-fao56-central-india-nov"]);
  });

  it("uses stored precedence, not plan attractiveness, where regions overlap", () => {
    expect(profileIds(["wheat-grain"], places.madridSpain)).toEqual(["wheat-grain-fao56-lat35-45n-mar-apr"]);
    expect(profileIds(["wheat-grain"], places.fresnoCalifornia)).toEqual(["wheat-grain-fao56-lat35-45n-mar-apr"]);
    expect(profileIds(["wheat-grain"], places.boiseIdaho)).toEqual(["wheat-grain-fao56-lat35-45n-mar-apr"]);
  });

  it("keeps the farmer's crop order and drops duplicate selections", () => {
    expect(profileIds(["wheat-grain", "common-bean-dry", "maize-grain", "wheat-grain"], places.boiseIdaho)).toEqual([
      "wheat-grain-fao56-lat35-45n-mar-apr", "common-bean-dry-fao56-idaho-jun", "maize-grain-fao56-idaho-apr",
    ]);
  });

  it("reports a crop-profile gap instead of guessing where no profile applies", () => {
    const resolution = resolveAt(["common-bean-dry"], [100.5, 13.75]);
    expect(resolution.profiles).toEqual([]);
    expect(resolution.gaps).toEqual([{
      code: "crop_profile", reason: "No released common-bean-dry profile applies at this location.", cropPurposeIds: ["common-bean-dry"], sourceIds: [],
    }]);
  });

  it("does not apply the 35-45 degree wheat row in the southern hemisphere", () => {
    expect(resolveAt(["wheat-grain"], places.puertoMonttChile).gaps.map(gap => gap.cropPurposeIds)).toEqual([["wheat-grain"]]);
  });

  it("reports crops outside the released catalogue", () => {
    expect(resolveAt(["teff-grain"], places.ibadanNigeria).gaps[0].reason).toBe("teff-grain is not in catalogue fao56-hard-windows-2026-11-15.");
  });

  it("resolves the added crops by region", () => {
    expect(profileIds(["rice-paddy", "soybean-grain", "sweet-potato"], places.ibadanNigeria)).toEqual([
      "rice-paddy-fao56-tropics-dec", "soybean-grain-fao56-tropics-dec",
    ]);
    expect(profileIds(["rice-paddy", "groundnut", "cowpea-dry", "mung-bean-dry", "faba-bean-dry", "pea-dry"], places.madridSpain)).toEqual([
      "rice-paddy-fao56-mediterranean-may", "groundnut-fao56-mediterranean", "cowpea-dry-fao56-mediterranean-mar",
      "mung-bean-dry-fao56-mediterranean-mar", "pea-dry-fao56-mediterranean-mar-apr",
    ]);
    expect(profileIds(["potato", "pea-dry", "barley-grain"], places.boiseIdaho)).toEqual([
      "potato-fao56-idaho-apr-may", "pea-dry-fao56-idaho-apr", "barley-grain-fao56-lat35-45n-mar-apr",
    ]);
    expect(profileIds(["sorghum-grain", "safflower-seed", "sunflower-seed"], places.fresnoCalifornia)).toEqual([
      "sorghum-grain-fao56-usa-pakistan-mediterranean-may-jun", "safflower-seed-fao56-california-apr", "sunflower-seed-fao56-mediterranean-california-apr-may",
    ]);
    expect(profileIds(["barley-grain", "oats-grain"], places.bhopalIndia)).toEqual([
      "barley-grain-fao56-central-india-nov", "oats-grain-fao56-central-india-nov",
    ]);
  });

  it("returns empty temperature rules with the retained profiles", () => {
    for (const profile of resolveAt(["maize-grain", "common-bean-dry"], places.boiseIdaho).profiles) {
      expect(profile.temperatureRules).toEqual([]);
    }
  });

  it("releases no rotation rules", () => {
    expect(resolveAt(["maize-grain"], places.ibadanNigeria).rules).toEqual([]);
  });
});

describe("I2 hand-off cases (docs/evidence/E1/i2-handoff.md)", () => {
  it("supported case: Boise dry bean resolves to the reviewed 100-day Idaho row", () => {
    const resolution = resolveAt(["common-bean-dry"], places.boiseIdaho);
    expect(resolution.gaps).toEqual([]);
    expect(resolution.profiles).toHaveLength(1);
    expect(resolution.profiles[0]).toMatchObject({
      status: "released", id: "common-bean-dry-fao56-idaho-jun", version: "reviewed-2026-11-15.2",
      timing: { generatedStageDays: { initial: 25, development: 25, middle: 30, late: 20 }, turnaround: { days: 7 } },
      kc: { initial: 0.4, middle: 1.15, end: 0.35 },
    });
  });

  it.each([
    ["2027-06-01", "2028-06-01", "witness"],
    ["2027-07-01", "2028-06-01", "proved_impossible"],
  ] as const)("Boise dry bean planted from %s before %s is %s under the June hard window", (start, endExclusive, kind) => {
    const lookup = lookupAt(["common-bean-dry"], places.boiseIdaho);
    const result = findCalendar({
      horizon: { start: parseIsoDate(start), endExclusive: parseIsoDate(endExclusive) },
      cropPurposeIds: lookup.cropPurposeIds, profiles: resolveRegistry(lookup, release).profiles,
      hardConstraints: [], initialPredecessor: null, eligibleBaseline: null, expansionLimit: 100_000,
    });
    expect(result.kind).toBe(kind);
    if (result.kind === "witness") {
      expect(result.calendar.occurrences.map(occurrence => occurrence.planted.slice(5, 7))).toEqual(["06"]);
    }
  });

  it.each([
    ["maize-grain", places.boiseIdaho, "maize-grain-fao56-idaho-apr", 170],
    ["wheat-grain", places.bhopalIndia, "wheat-grain-fao56-central-india-nov", 120],
  ] as const)("retains supported %s stage totals", (crop, place, id, days) => {
    const resolution = resolveAt([crop], place);
    expect(resolution.gaps).toEqual([]);
    expect(resolution.profiles).toHaveLength(1);
    const profile = resolution.profiles[0];
    expect(profile.id).toBe(id);
    expect(Object.values(profile.timing.generatedStageDays).reduce((sum, days) => sum + days, 0)).toBe(days);
  });

  it("documents the broader supported wheat fallback after withholding winter wheat", () => {
    const resolution = resolveAt(["wheat-grain", "maize-grain"], places.madridSpain);
    expect(resolution.gaps).toEqual([]);
    expect(resolution.profiles.map(profile => profile.id)).toEqual([
      "wheat-grain-fao56-lat35-45n-mar-apr", "maize-grain-fao56-spain-california-apr",
    ]);
    const required = resolution.profiles.reduce((sum, profile) =>
      sum + Object.values(profile.timing.generatedStageDays).reduce((a, b) => a + b, 0) + profile.timing.turnaround.days, 0);
    expect(required).toBe(299);
  });

  it("insufficient-data case: Bangkok dry bean returns a crop_profile gap", () => {
    const resolution = resolveAt(["common-bean-dry"], [100.5, 13.75]);
    expect(resolution.profiles).toEqual([]);
    expect(resolution.gaps).toMatchObject([{ code: "crop_profile", cropPurposeIds: ["common-bean-dry"] }]);
  });
});

describe("E1 resolution rules with synthetic registries", () => {
  const base = syntheticRegistryFixture.profiles[0];
  const withProfiles = (profiles: readonly unknown[]) => syntheticRegistrySchema.parse({ ...syntheticRegistryFixture, profiles });

  it("resolves the synthetic fixture through the same function", () => {
    const resolution = resolveRegistry(lookupAt(["synthetic-crop"], [0, 0]), syntheticRegistryFixture);
    expect(resolution.profiles.map(profile => profile.id)).toEqual(["synthetic-profile"]);
  });

  it("returns a gap rather than picking one of two equally ranked profiles", () => {
    const registry = withProfiles([base, { ...base, id: "synthetic-profile-b" }]);
    expect(resolveRegistry(lookupAt(["synthetic-crop"], [0, 0]), registry).gaps[0].reason)
      .toBe("Ambiguous profile precedence for synthetic-crop: synthetic-profile, synthetic-profile-b.");
  });

  it("prefers regional over climate over broad scopes", () => {
    const climate = { ...base, id: "climate", applicability: { ...base.applicability, scope: { kind: "climate", variable: "mean_annual_temperature_c", inclusiveRange: [10, 30] } } };
    const regional = { ...base, id: "regional", precedence: 9, applicability: { ...base.applicability, scope: { kind: "regional", bounds: [{ westDeg: -5, eastDeg: 5, southDeg: -5, northDeg: 5 }] } } };
    const registry = withProfiles([base, climate, regional]);
    const warm = { meanAnnualTemperatureC: { kind: "available", value: 20 }, meanAnnualPrecipitationMm: { kind: "unavailable", reason: "n/a" } } as const;
    expect(resolveRegistry(lookupAt(["synthetic-crop"], [0, 0], warm), registry).profiles[0].id).toBe("regional");
    expect(resolveRegistry(lookupAt(["synthetic-crop"], [50, 0], warm), registry).profiles[0].id).toBe("climate");
    expect(resolveRegistry(lookupAt(["synthetic-crop"], [50, 0]), registry).profiles[0].id).toBe("synthetic-profile");
  });

  it("does not treat unavailable climate data as a match", () => {
    const registry = withProfiles([{ ...base, applicability: { ...base.applicability, scope: { kind: "climate", variable: "mean_annual_precipitation_mm", inclusiveRange: [500, 1500] } } }]);
    expect(resolveRegistry(lookupAt(["synthetic-crop"], [0, 0]), registry).gaps[0].reason).toMatch(/climate data its applicability needs is unavailable/);
  });

  it("handles regions that cross the antimeridian and honours exclusions", () => {
    const registry = withProfiles([{
      ...base,
      applicability: {
        ...base.applicability,
        scope: { kind: "regional", bounds: [{ westDeg: 170, eastDeg: -170, southDeg: -10, northDeg: 10 }] },
        exclusions: [{ kind: "regional", bounds: [{ westDeg: 179, eastDeg: 180, southDeg: -10, northDeg: 10 }] }],
      },
    }]);
    const at = (lng: number) => resolveRegistry(lookupAt(["synthetic-crop"], [lng, 0]), registry).profiles.length;
    expect([at(175), at(-175), at(0), at(179.5)]).toEqual([1, 1, 0, 0]);
  });
});
