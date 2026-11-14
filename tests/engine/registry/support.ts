import { parseCropPurposeId } from "@/contracts/common";
import type { LngLat } from "@/contracts/input";
import type { RegistryLookup } from "@/contracts/registry";
import { readRegistryRelease } from "@/registry";

export const unavailableClimate = {
  meanAnnualTemperatureC: { kind: "unavailable", reason: "Not supplied in this test." },
  meanAnnualPrecipitationMm: { kind: "unavailable", reason: "Not supplied in this test." },
} as const;

export function lookupAt(cropPurposeIds: readonly string[], lookup: LngLat, climate: RegistryLookup["climate"] = unavailableClimate): RegistryLookup {
  return { cropPurposeIds: cropPurposeIds.map(parseCropPurposeId), lookup, climate };
}

export type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

export function editableLatestRelease() {
  return structuredClone(readRegistryRelease()) as unknown as Mutable<ReturnType<typeof readRegistryRelease>>;
}

export const places = {
  ibadanNigeria: [3.9, 7.4],
  madridSpain: [-3.7, 40.4],
  fresnoCalifornia: [-119.8, 36.7],
  boiseIdaho: [-116.2, 43.6],
  nakuruKenya: [36.1, -0.3],
  bhopalIndia: [77.4, 23.3],
  puertoMonttChile: [-72.9, -41.5],
} as const satisfies Record<string, LngLat>;
