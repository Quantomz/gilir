import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { defaultEngineSettings } from "@/contracts/climate";
import type { ClimateSnapshot } from "@/contracts/climate";
import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import type { FrozenRun } from "@/contracts/engine";
import { parseFarmInput } from "@/contracts/input";
import type { FarmInput, LngLat, WaterAnswer } from "@/contracts/input";
import type { RegistryRelease } from "@/contracts/registry";
import type { PlanResult } from "@/contracts/result";
import { calculate } from "@/engine";
import type { CalculateOptions } from "@/engine";
import { readCatalogue, readRegistryRelease, resolveRegistry } from "@/registry";
import { providerSnapshotSchema } from "@/server/cache/schema";
import { addDays, daysFrom, occurrenceWindows } from "./reference";
import { resolveStandIn, standInRegistry } from "./stand-in-registry";

export type Recording = "ibadan" | "madrid" | "boise";

export type Expectation =
  | { readonly state: "plan"; readonly profileIds: readonly string[] }
  | { readonly state: "no_calendar_fit"; readonly profileIds: readonly string[] }
  | { readonly state: "insufficient_data"; readonly missingProfiles: readonly string[] };

export interface ScienceCase {
  readonly id: string;
  readonly lookup: LngLat;
  readonly cropPurposeIds: readonly string[];
  readonly planningStart: string;
  readonly recording: Recording;
  readonly expect: Expectation;
}

export const scienceCases: readonly ScienceCase[] = [
  { id: "ibadan-maize-plan", lookup: [3.9, 7.4], cropPurposeIds: ["maize-grain"], planningStart: "2027-06-01", recording: "ibadan",
    expect: { state: "plan", profileIds: ["maize-grain-fao56-nigeria-humid-jun"] } },
  { id: "madrid-wheat-maize-no-fit", lookup: [-3.7, 40.4], cropPurposeIds: ["wheat-grain", "maize-grain"], planningStart: "2027-06-01", recording: "madrid",
    expect: { state: "no_calendar_fit", profileIds: ["wheat-grain-fao56-mediterranean-winter-nov", "maize-grain-fao56-spain-california-apr"] } },
  { id: "ibadan-bean-insufficient", lookup: [3.9, 7.4], cropPurposeIds: ["common-bean-dry"], planningStart: "2027-06-01", recording: "ibadan",
    expect: { state: "insufficient_data", missingProfiles: ["common-bean-dry"] } },
  { id: "boise-maize-bean-plan", lookup: [-116.2, 43.6], cropPurposeIds: ["maize-grain", "common-bean-dry"], planningStart: "2027-04-01", recording: "boise",
    expect: { state: "plan", profileIds: ["maize-grain-fao56-idaho-apr", "common-bean-dry-fao56-idaho-jun"] } },
];

export type RegistrySource =
  | { readonly kind: "stand-in"; readonly registry: RegistryRelease; readonly options: CalculateOptions }
  | { readonly kind: "released"; readonly registry: RegistryRelease; readonly options: CalculateOptions };

export const e1Released = readCatalogue().entries.length > 0;

export function registrySource(kind: RegistrySource["kind"]): RegistrySource {
  return kind === "stand-in"
    ? { kind, registry: standInRegistry, options: { resolveRegistry: resolveStandIn } }
    : { kind, registry: readRegistryRelease(), options: { resolveRegistry } };
}

const snapshotList = providerSnapshotSchema.array();
const recordings = new Map<Recording, readonly ClimateSnapshot[]>();
export function recordedSnapshots(name: Recording): readonly ClimateSnapshot[] {
  const cached = recordings.get(name);
  if (cached) return cached;
  const raw: unknown = JSON.parse(gunzipSync(readFileSync(new URL(`./recorded/${name}/snapshots.json.gz`, import.meta.url))).toString("utf8"));
  const parsed = snapshotList.parse(raw);
  recordings.set(name, parsed);
  return parsed;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => JSON.stringify(key) + ":" + canonicalJson(child)).join(",") + "}";
  }
  return JSON.stringify(value);
}

export const sha256 = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

export function farmInput(c: ScienceCase, water: WaterAnswer = "rain_only"): FarmInput {
  const [lon, lat] = c.lookup;
  const d = 0.005;
  return parseFarmInput({
    schemaVersion: 1,
    field: { ring: [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]], lookup: c.lookup, label: c.id },
    cropPurposeIds: c.cropPurposeIds.map(id => parseCropPurposeId(id)),
    water,
    planningStart: parseIsoDate(c.planningStart),
    history: { kind: "skipped" },
  });
}

export function frozenRun(c: ScienceCase, registry: RegistryRelease, water: WaterAnswer = "rain_only"): FrozenRun {
  const input = farmInput(c, water);
  const climate = recordedSnapshots(c.recording);
  const cutoff = climate[0]?.cutoff;
  if (!cutoff || climate.some(s => s.cutoff !== cutoff)) throw new Error(`Recording ${c.recording} has no single data cutoff.`);
  return structuredClone({
    input,
    manifest: {
      schemaVersion: 1,
      normalizedInputHash: sha256(input),
      engineVersion: "v1",
      configurationVersion: defaultEngineSettings.version,
      catalogueVersion: registry.identity.catalogueVersion,
      ruleVersion: registry.identity.ruleVersion,
      climateSnapshotIds: climate.map(s => s.id),
      dataCutoff: cutoff,
    },
    climate,
    settings: defaultEngineSettings,
  });
}

export function runCase(c: ScienceCase, source: RegistrySource, water: WaterAnswer = "rain_only"): PlanResult {
  return calculate(frozenRun(c, source.registry, water), source.registry, source.options);
}

export const usableSeasons = (result: PlanResult): number | null =>
  result.details.cohort.kind === "available" ? result.details.cohort.value.seasons.filter(s => s.status === "usable").length : null;

export function recomputeFirstOccurrence(c: ScienceCase, result: PlanResult, registry: RegistryRelease) {
  if (!("plan" in result)) throw new Error(`Expected a plan, got ${result.state}.`);
  if (result.details.cohort.kind !== "available") throw new Error("Cohort coverage is unavailable.");
  const occurrence = result.plan.occurrences[0];
  const profile = registry.profiles.find(p => p.id === occurrence.profileId && p.version === occurrence.profileVersion);
  if (!profile) throw new Error(`Registry has no profile ${occurrence.profileId}.`);
  const replayStart = result.details.cohort.value.seasons.filter(s => s.status === "usable").map(s => s.interval.start).sort()[0];
  const snapshots = recordedSnapshots(c.recording);
  const meteorology = snapshots.find(s => s.products.some(p => p.fields.some(f => f.field === "meanC")));
  if (!meteorology || meteorology.elevationM.kind !== "available") throw new Error("Meteorology elevation is unavailable.");
  const firstDate = addDays(replayStart, daysFrom(result.plan.horizon.start, occurrence.planted));
  const reference = occurrenceWindows({
    snapshots, firstDate, curve: { stages: profile.timing.generatedStageDays, kc: profile.kc },
    latitudeDeg: c.lookup[1], elevationM: meteorology.elevationM.value, windowDays: defaultEngineSettings.mismatchWindowDays,
  });
  const metric = (id: string) => occurrence.seasonMetrics.find(s => s.replayStart === replayStart)?.metrics.find(m => m.id === id);
  return {
    occurrence: { cropPurposeId: occurrence.cropPurposeId, profileId: occurrence.profileId, planted: occurrence.planted },
    replayStart, firstDate, reference,
    engine: { mismatch: metric("mismatch")?.value, frequency: metric("frequency")?.value, windows: metric("mismatch")?.denominator },
  };
}
