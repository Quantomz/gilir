import { describe, expect, it } from "vitest";
import { validateResolution, validateSources } from "@/engine/search/evidence";
import { readRegistryRelease, releasedVersions, resolveRegistry } from "@/registry";
import { lookupAt, places } from "./support";

describe("E3 accepts E1 registry output", () => {
  it.each(releasedVersions)("accepts the sources of release %s", version => {
    expect(() => validateSources(readRegistryRelease(version))).not.toThrow();
  });

  it.each([
    [["maize-grain"], places.ibadanNigeria],
    [["wheat-grain", "maize-grain"], places.madridSpain],
    [["tomato", "lettuce", "broccoli"], places.madridSpain],
    [["potato", "pea-dry", "barley-grain"], places.boiseIdaho],
    [["teff-grain"], places.madridSpain],
  ] as const)("accepts the latest resolution of %j", (crops, place) => {
    const release = readRegistryRelease("fao56-hard-windows-2026-11-15");
    const lookup = lookupAt(crops, place);
    const resolution = resolveRegistry(lookup, release);
    expect(resolution.profiles.length + resolution.gaps.length).toBe(crops.length);
    expect(() => validateResolution(resolution, lookup.cropPurposeIds, release)).not.toThrow();
  });
});
