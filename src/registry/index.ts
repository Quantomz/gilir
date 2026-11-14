import type { Catalogue, ReleasedRegistry } from "@/contracts/registry";
import { buildCatalogueEntries, buildProfiles } from "./profiles";
import { fao56Sources } from "./sources";
import { assertValidRelease } from "./validate";

export { resolveRegistry } from "./resolve";
export { validateRelease, assertValidRelease, InvalidReleaseError } from "./validate";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const emptyV1 = {
  kind: "released",
  identity: { catalogueVersion: "v1-empty", ruleVersion: "v1-empty" },
  catalogue: { version: "v1-empty", entries: [] },
  sources: [],
  profiles: [],
  rules: [],
};

const profiles = buildProfiles();
const reviewedRelease = {
  kind: "released",
  identity: { catalogueVersion: "fao56-reviewed-2026-11-15", ruleVersion: "no-rules-2026-11-14" },
  catalogue: { version: "fao56-reviewed-2026-11-15", entries: buildCatalogueEntries(profiles) },
  sources: fao56Sources,
  profiles,
  rules: [],
};

const retiredVersions = new Set([
  "fao56-2026-11-14",
  "fao56-temperature-2026-11-14",
  "fao56-vegetables-2026-11-15",
  "fao56-temperature-rules-2026-11-15",
]);

const releases: ReadonlyMap<string, ReleasedRegistry> = new Map(
  [emptyV1, reviewedRelease].map(raw => {
    const release = deepFreeze(assertValidRelease(raw));
    return [release.identity.catalogueVersion, release] as const;
  }),
);

export const releasedVersions: readonly string[] = Object.freeze([...releases.keys()]);
export const latestReleaseVersion = reviewedRelease.identity.catalogueVersion;

export function readRegistryRelease(version: string = latestReleaseVersion): ReleasedRegistry {
  if (retiredVersions.has(version)) {
    throw new RangeError(`Retired catalogue release ${version}. Draft jobs cannot resume through ${latestReleaseVersion}.`);
  }
  const release = releases.get(version);
  if (release === undefined) throw new RangeError(`Unknown catalogue release ${version}.`);
  return release;
}

export function readCatalogue(version?: string): Catalogue {
  return readRegistryRelease(version).catalogue;
}
