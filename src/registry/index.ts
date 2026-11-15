import type { Catalogue, ReleasedRegistry } from "@/contracts/registry";
import { buildCatalogueEntries, buildProfiles } from "./profiles";
import { fao56Sources } from "./sources";
import { assertValidRelease } from "./validate";
import modelRelease from "./models/release-2026-11-15.json";

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

function fao56Release(catalogueVersion: string, profiles: ReturnType<typeof buildProfiles>) {
  return {
    kind: "released",
    identity: { catalogueVersion, ruleVersion: "no-rules-2026-11-14" },
    catalogue: { version: catalogueVersion, entries: buildCatalogueEntries(profiles) },
    sources: fao56Sources,
    profiles,
    rules: [],
  };
}

const reviewedRelease = fao56Release(
  "fao56-reviewed-2026-11-15",
  buildProfiles({ windowBasis: "recommendation", version: "reviewed-2026-11-15.1" }),
);
const hardWindowsRelease = fao56Release(
  "fao56-hard-windows-2026-11-15",
  buildProfiles({ windowBasis: "hard_constraint", version: "reviewed-2026-11-15.2" }),
);

const globalIds = new Set(modelRelease.models.map(model => model.cropPurposeId));
const globalBase = fao56Release("fao56-global-32-2026-11-15", hardWindowsRelease.profiles.filter(profile => globalIds.has(profile.cropPurposeId)));
const globalRelease = {
  ...globalBase,
  sources: [...fao56Sources, {
    id: "fao56-rev1-official", title: "FAO-56 revised edition, thermal development and calendar-stage crop coefficients",
    url: "https://openknowledge.fao.org/handle/20.500.14283/cd6621en",
    section: "Tables 6.10, 6.11, 6.12; Equations 6.20 and 6.23; sections 6.5.1, 6.8.1 and 6.8.2",
    publishedOn: { kind: "unavailable", reason: "The release records the source edition and document hash; no exact publication day was reviewed." }, extractedOn: "2026-11-15",
  }, { ...fao56Sources[1], id: "fao56-1998-table12", extractedOn: "2026-11-15" }],
  modelRelease,
};

const retiredVersions = new Set([
  "fao56-2026-11-14",
  "fao56-temperature-2026-11-14",
  "fao56-vegetables-2026-11-15",
  "fao56-temperature-rules-2026-11-15",
]);

const releases: ReadonlyMap<string, ReleasedRegistry> = new Map(
  [emptyV1, reviewedRelease, hardWindowsRelease, globalRelease].map(raw => {
    const release = deepFreeze(assertValidRelease(raw));
    return [release.identity.catalogueVersion, release] as const;
  }),
);

export const releasedVersions: readonly string[] = Object.freeze([...releases.keys()]);
export const latestReleaseVersion = globalRelease.identity.catalogueVersion;

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
