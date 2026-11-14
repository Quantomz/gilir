import { NotImplementedError } from "@/contracts/common";
import { releasedRegistrySchema } from "@/contracts/registry";
import type { Catalogue, RegistryLookup, RegistryRelease, RegistryResolution, ReleasedRegistry } from "@/contracts/registry";

const identity = { catalogueVersion: "v1-empty", ruleVersion: "v1-empty" };
const release = releasedRegistrySchema.parse({
  kind: "released",
  identity,
  catalogue: { version: identity.catalogueVersion, entries: [] },
  sources: [],
  profiles: [],
  rules: [],
  coverage: [],
});

export function readRegistryRelease(version = identity.catalogueVersion): ReleasedRegistry {
  if (version !== identity.catalogueVersion) throw new RangeError("Unknown catalogue release.");
  return release;
}

export function readCatalogue(version?: string): Catalogue {
  return readRegistryRelease(version).catalogue;
}

type ResolveRegistry = (input: RegistryLookup, registry: RegistryRelease) => RegistryResolution;
export const resolveRegistry: ResolveRegistry = () => { throw new NotImplementedError("Registry applicability"); };
