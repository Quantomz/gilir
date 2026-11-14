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

export const withheldProfileIds: readonly string[] = [
  "maize-grain-fao56-nigeria-humid-jun",
  "maize-grain-fao56-east-africa-highland-apr",
  "maize-grain-fao56-india-dry-cool-oct",
  "wheat-grain-fao56-california-winter-dec",
  "wheat-grain-fao56-mediterranean-winter-nov",
  "groundnut-fao56-west-africa-dry-season",
  "sweet-potato-fao56-tropics-rainy-season",
  "faba-bean-dry-fao56-mediterranean-mar-apr",
  "faba-bean-dry-fao56-europe-may",
  "sweet-pepper-fao56-europe-mediterranean-apr-jun",
  "sweet-maize-fao56-idaho-apr",
];
