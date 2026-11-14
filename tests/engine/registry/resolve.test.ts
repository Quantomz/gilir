import { describe, expect, it } from "vitest";
import { syntheticRegistrySchema } from "@/contracts/registry";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { readRegistryRelease, resolveRegistry } from "@/registry";
import { lookupAt, places } from "./support";

const release = readRegistryRelease();
const resolveAt = (crops: readonly string[], place: readonly [number, number]) => resolveRegistry(lookupAt(crops, place), release);
const profileIds = (crops: readonly string[], place: readonly [number, number]) => resolveAt(crops, place).profiles.map(profile => profile.id);

describe("E1 registry resolution with the FAO-56 release", () => {
  it("selects the regional profile that covers the field", () => {
    expect(profileIds(["maize-grain"], places.ibadanNigeria)).toEqual(["maize-grain-fao56-nigeria-humid-jun"]);
    expect(profileIds(["maize-grain"], places.nakuruKenya)).toEqual(["maize-grain-fao56-east-africa-highland-apr"]);
    expect(profileIds(["wheat-grain"], places.bhopalIndia)).toEqual(["wheat-grain-fao56-central-india-nov"]);
  });

  it("uses stored precedence, not plan attractiveness, where regions overlap", () => {
    expect(profileIds(["wheat-grain"], places.madridSpain)).toEqual(["wheat-grain-fao56-mediterranean-winter-nov"]);
    expect(profileIds(["wheat-grain"], places.fresnoCalifornia)).toEqual(["wheat-grain-fao56-california-winter-dec"]);
    expect(profileIds(["wheat-grain"], places.boiseIdaho)).toEqual(["wheat-grain-fao56-lat35-45n-mar-apr"]);
  });

  it("keeps the farmer's crop order and drops duplicate selections", () => {
    expect(profileIds(["wheat-grain", "common-bean-dry", "maize-grain", "wheat-grain"], places.boiseIdaho)).toEqual([
      "wheat-grain-fao56-lat35-45n-mar-apr", "common-bean-dry-fao56-idaho-jun", "maize-grain-fao56-idaho-apr",
    ]);
  });

  it("reports a crop-profile gap instead of guessing where no profile applies", () => {
    const resolution = resolveAt(["maize-grain", "common-bean-dry"], places.ibadanNigeria);
    expect(resolution.profiles.map(profile => profile.cropPurposeId)).toEqual(["maize-grain"]);
    expect(resolution.gaps).toEqual([{
      code: "crop_profile", reason: "No released common-bean-dry profile applies at this location.", cropPurposeIds: ["common-bean-dry"], sourceIds: [],
    }]);
  });

  it("does not apply the 35-45 degree wheat row in the southern hemisphere", () => {
    expect(resolveAt(["wheat-grain"], places.puertoMonttChile).gaps.map(gap => gap.cropPurposeIds)).toEqual([["wheat-grain"]]);
  });

  it("reports crops outside the released catalogue", () => {
    expect(resolveAt(["rice-paddy"], places.ibadanNigeria).gaps[0].reason).toBe("rice-paddy is not in catalogue fao56-2026-11-14.");
  });

  it("always reports pest coverage as unavailable and releases no rotation rules", () => {
    const resolution = resolveAt(["maize-grain"], places.ibadanNigeria);
    expect(resolution.pestCoverage.kind).toBe("unavailable");
    expect(resolution.rules).toEqual([]);
  });
});

describe("I2 hand-off cases (docs/evidence/E1/i2-handoff.md)", () => {
  it("supported case: maize at Ibadan, Nigeria resolves to one complete reviewed profile", () => {
    const resolution = resolveAt(["maize-grain"], places.ibadanNigeria);
    expect(resolution.gaps).toEqual([]);
    const [profile] = resolution.profiles;
    expect(profile).toMatchObject({
      status: "released",
      timing: { generatedStageDays: { initial: 20, development: 35, middle: 40, late: 30 }, turnaround: { days: 7 } },
      kc: { initial: 0.3, middle: 1.2, end: 0.35 },
    });
  });

  it("no-calendar-fit case: Mediterranean winter wheat plus Spanish maize need more than one year", () => {
    const resolution = resolveAt(["wheat-grain", "maize-grain"], places.madridSpain);
    expect(resolution.gaps).toEqual([]);
    const required = resolution.profiles.reduce((sum, profile) => {
      const stages = profile.timing.generatedStageDays;
      return sum + stages.initial + stages.development + stages.middle + stages.late + profile.timing.turnaround.days;
    }, 0);
    expect(required).toBe(404);
    expect(required).toBeGreaterThan(366);
  });

  it("insufficient-data case: dry bean at Ibadan has no applicable profile", () => {
    expect(resolveAt(["common-bean-dry"], places.ibadanNigeria).profiles).toEqual([]);
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
