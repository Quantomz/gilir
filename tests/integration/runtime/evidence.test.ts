import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { defaultEngineSettings } from "@/contracts";
import type { ClimateSnapshot } from "@/contracts";
import { climateSnapshotFixture } from "@/fixtures/science";
import { createMemoryClimateCache, historicalPeriod } from "@/server/climate";
import { products } from "@/server/climate/products";
import type { FrozenEvidence } from "./acceptance";
import { assertRequiredClimate, cutoff, frozenEvidence, frozenRun, input, providerEvidence, savedPreparation } from "./support";

function controlledProviderSnapshots() {
  return products.map(product => ({
    ...climateSnapshotFixture,
    kind: "provider", cutoff, id: "controlled-" + product.id,
    products: [{
      provider: "Controlled metadata test", product: product.id, cellId: product.id + ":native-cell",
      version: { kind: "unavailable", reason: "Provider omitted release." },
      stream: { kind: "unavailable", reason: "Provider omitted stream." },
      gridDegrees: product.grid, timeStandard: "UTC",
      sourceUrl: "https://test-user:test-password@power.larc.nasa.gov/api/temporal/daily/point?latitude=13.75&longitude=100.55&token=private-token#private-fragment",
      fields: product.fields.map(field => ({ field: field.field, providerField: field.parameter, originalUnit: field.unit, canonicalUnit: field.unit, conversionVersion: "controlled-v1" })),
      missingDatesByField: [],
    }],
  } satisfies Extract<ClimateSnapshot, { kind: "provider" }>));
}

function controlledEvidence(): FrozenEvidence {
  const run = frozenRun([], "controlled-input-hash");
  const snapshots = controlledProviderSnapshots().map(providerEvidence);
  return {
    manifest: { ...run.manifest, climateSnapshotIds: snapshots.map(snapshot => snapshot.id) }, digest: "controlled-frozen-digest", providerSnapshots: 3, syntheticSnapshots: 0,
    firstDate: "2000-07-01", lastDate: "2000-07-05", snapshots,
    settings: run.settings,
    requiredSourcePeriod: historicalPeriod(run.input.planningStart, run.manifest.dataCutoff, run.settings),
  };
}

const controlledPeriod = { start: "2000-07-01", endExclusive: "2000-07-06" };

async function normalizedProviderEvidence(): Promise<FrozenEvidence> {
  const controlled = controlledEvidence();
  const prepare = await savedPreparation();
  const climate = await prepare({ input, cutoff, settings: defaultEngineSettings, cache: createMemoryClimateCache() });
  expect(climate.kind).toBe("ready");
  const snapshots = climate.snapshots.filter(snapshot => snapshot.kind === "provider").map(providerEvidence);
  expect(snapshots).toHaveLength(products.length);
  return {
    ...controlled, snapshots,
    manifest: { ...controlled.manifest, climateSnapshotIds: snapshots.map(snapshot => snapshot.id) },
    firstDate: climate.snapshots[0].days[0].date,
    lastDate: climate.snapshots[0].days.at(-1)?.date ?? "",
  };
}

it("accepts the descriptive product labels normalized from saved real NASA responses", async () => {
  const evidence = await normalizedProviderEvidence();
  expect(evidence.snapshots.flatMap(snapshot => snapshot.products.map(product => product.product))).toEqual([
    "POWER_METEOROLOGY [MERRA2,POWER] via POWER Daily API v2.10.3",
    "POWER_SOLAR [SRB,SYN1DEG] via POWER Daily API v2.10.3",
    "POWER_IMERG [IMERG] via POWER Daily API v2.10.3",
  ]);
  expect(() => assertRequiredClimate(evidence, evidence.requiredSourcePeriod)).not.toThrow();
});

it("rejects normalized product labels that disagree with their native cell identity", async () => {
  const evidence = await normalizedProviderEvidence();
  const [meteorology, solar, imerg] = evidence.snapshots;
  const snapshots = [
    { ...meteorology, products: [{ ...meteorology.products[0], product: solar.products[0].product }] },
    { ...solar, products: [{ ...solar.products[0], product: meteorology.products[0].product }] },
    imerg,
  ];
  expect(() => assertRequiredClimate({ ...evidence, snapshots }, evidence.requiredSourcePeriod)).toThrow("A frozen product label must match its native cell identity");
});

it("rejects a duplicated normalized native product in place of a required product", async () => {
  const evidence = await normalizedProviderEvidence();
  const snapshots = [evidence.snapshots[0], evidence.snapshots[0], evidence.snapshots[2]];
  expect(() => assertRequiredClimate({ ...evidence, manifest: { ...evidence.manifest, climateSnapshotIds: snapshots.map(snapshot => snapshot.id) }, snapshots }, evidence.requiredSourcePeriod)).toThrow("Every required NASA product must appear exactly once");
});

it("records the actual synthetic snapshot count before strict acceptance rejects it", async () => {
  const pool = new Pool();
  const run = frozenRun([climateSnapshotFixture], "controlled-input-hash");
  vi.spyOn(pool, "query").mockImplementation(() => Promise.resolve({ rows: [{ frozen_run: run }], fields: [], command: "SELECT", rowCount: 1, oid: 0 }));
  try {
    const evidence = await frozenEvidence(pool, { jobId: "controlled-job", token: "controlled-token" });
    expect(evidence.syntheticSnapshots).toBe(1);
    expect(evidence.providerSnapshots).toBe(0);
  } finally { await pool.end(); }
});

it("retains product metadata and removes credential, coordinate, and token URL data", () => {
  const evidence = controlledEvidence();
  expect(() => assertRequiredClimate(evidence, controlledPeriod)).not.toThrow();
  for (const snapshot of evidence.snapshots) {
    const product = snapshot.products[0];
    expect(product.sourceUrl).toBe("https://power.larc.nasa.gov/api/temporal/daily/point");
    expect(product.version).toEqual({ kind: "unavailable", reason: "Provider omitted release." });
    expect(product.stream).toEqual({ kind: "unavailable", reason: "Provider omitted stream." });
    expect(product.cellId).toContain(":native-cell");
    expect(product.fields.length).toBeGreaterThan(0);
  }
});

it("rejects a truncated individual product even when aggregate endpoints cover the period", () => {
  const evidence = controlledEvidence();
  const snapshots = controlledProviderSnapshots();
  snapshots[0] = { ...snapshots[0], days: snapshots[0].days.slice(1) };
  expect(() => assertRequiredClimate({ ...evidence, snapshots: snapshots.map(providerEvidence) }, controlledPeriod)).toThrow("Each frozen product must cover the full derived source period");
});

it("rejects duplicate or missing daily records with unchanged product count and endpoints", () => {
  const evidence = controlledEvidence();
  const snapshots = controlledProviderSnapshots();
  snapshots[0] = { ...snapshots[0], days: [snapshots[0].days[0], snapshots[0].days[0], ...snapshots[0].days.slice(2)] };
  expect(() => assertRequiredClimate({ ...evidence, snapshots: snapshots.map(providerEvidence) }, controlledPeriod)).toThrow("consecutive unique daily records");
});

it("rejects a duplicated product in place of another required product", () => {
  const evidence = controlledEvidence();
  const snapshots = [evidence.snapshots[0], evidence.snapshots[0], evidence.snapshots[2]];
  expect(() => assertRequiredClimate({ ...evidence, manifest: { ...evidence.manifest, climateSnapshotIds: snapshots.map(snapshot => snapshot.id) }, snapshots }, controlledPeriod)).toThrow("Every required NASA product must appear exactly once");
});
