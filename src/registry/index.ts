import type { Catalogue, ReleasedRegistry } from "@/contracts/registry";
import { buildCatalogueEntries, buildProfiles } from "./profiles";
import { fao56Release1Sources, release3Sources, releasedSources } from "./sources";
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
  coverage: [],
};

const fao56Release1 = {
  kind: "released",
  identity: { catalogueVersion: "fao56-2026-11-14", ruleVersion: "no-rules-2026-11-14" },
  catalogue: { version: "fao56-2026-11-14", entries: buildCatalogueEntries(1) },
  sources: fao56Release1Sources,
  profiles: buildProfiles(1),
  rules: [],
  coverage: [],
};

const fao56Release2 = {
  kind: "released",
  identity: { catalogueVersion: "fao56-temperature-2026-11-14", ruleVersion: "no-rules-2026-11-14" },
  catalogue: { version: "fao56-temperature-2026-11-14", entries: buildCatalogueEntries(2) },
  sources: releasedSources,
  profiles: buildProfiles(2),
  rules: [],
  coverage: [],
};

const fao56Release3 = {
  kind: "released",
  identity: { catalogueVersion: "fao56-vegetables-2026-11-15", ruleVersion: "no-rules-2026-11-14" },
  catalogue: { version: "fao56-vegetables-2026-11-15", entries: buildCatalogueEntries(3) },
  sources: release3Sources,
  profiles: buildProfiles(3),
  rules: [],
  coverage: [],
};

const releases: ReadonlyMap<string, ReleasedRegistry> = new Map(
  [emptyV1, fao56Release1, fao56Release2, fao56Release3].map(raw => {
    const release = deepFreeze(assertValidRelease(raw));
    return [release.identity.catalogueVersion, release] as const;
  }),
);

export const releasedVersions: readonly string[] = Object.freeze([...releases.keys()]);
export const latestReleaseVersion = fao56Release3.identity.catalogueVersion;

export function readRegistryRelease(version: string = latestReleaseVersion): ReleasedRegistry {
  const release = releases.get(version);
  if (release === undefined) throw new RangeError(`Unknown catalogue release ${version}.`);
  return release;
}

export function readCatalogue(version?: string): Catalogue {
  return readRegistryRelease(version).catalogue;
}
