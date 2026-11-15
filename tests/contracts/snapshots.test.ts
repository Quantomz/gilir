import { describe, expect, it } from "vitest";
import {
  catalogueSchema, completedSnapshotSchema, completedSnapshotSchemaVersion, farmInputSchemaVersion,
  jobCapabilitySchema, parseCompletedSnapshot, parseFarmInput, snapshotCompletionSchema,
} from "@/contracts";
import { makeFixtureClient } from "@/fixtures/client";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotsByState, completedSnapshotsV2ByState, completedSnapshotV2Fixture } from "@/fixtures/results";
import { readCatalogue } from "@/registry";

const capability = { jobId: "00000000-0000-4000-8000-000000000001", token: "fixture-token" };
const current = completedSnapshotV2Fixture;
if (current.schemaVersion !== 2) throw new Error("Expected current fixture.");
const { result, catalogue } = current;
const manifest = result.details.provenance.manifest;
if (manifest.kind !== "available") throw new Error("Expected fixture manifest.");

function historicalInput() {
  return parseFarmInput({
    ...inputFixture,
    history: {
      kind: "recorded", start: "2025-07-01", endExclusive: "2026-07-01",
      entries: [
        { kind: "crop", id: "absent-history", crop: { kind: "catalogue", cropPurposeId: "absent-historical-crop" }, planted: "2025-07-01", harvested: "2025-07-04", plantedPrecision: "exact", harvestedPrecision: "exact" },
        { kind: "crop", id: "unsupported-history", crop: { kind: "unsupported", label: "Farmer's own crop label" }, planted: "2025-07-05", harvested: "2025-07-08", plantedPrecision: "exact", harvestedPrecision: "exact" },
      ],
    },
  });
}

describe("authoritative job capabilities", () => {
  it("preserves UUID IDs and untrimmed tokens of one through 512 characters", async () => {
    for (const token of ["x", " ", " x ", "x".repeat(512)]) {
      expect(jobCapabilitySchema.parse({ ...capability, token })).toEqual({ ...capability, token });
    }
    const submitted = await makeFixtureClient().submit(inputFixture);
    expect(submitted.kind).toBe("accepted");
    if (submitted.kind !== "accepted") throw new Error("Expected fixture submission.");
    expect(jobCapabilitySchema.parse(submitted.capability)).toEqual(submitted.capability);
  });

  it.each([
    { ...capability, jobId: "synthetic-job" }, { ...capability, jobId: "" },
    { ...capability, token: "" }, { ...capability, token: "x".repeat(513) },
    { jobId: capability.jobId }, { token: capability.token }, { ...capability, extra: true },
  ])("rejects an invalid capability %#", raw => {
    expect(jobCapabilitySchema.safeParse(raw).success).toBe(false);
  });
});

describe("versioned completed snapshots", () => {
  it("exports independent current input and snapshot versions", () => {
    expect(farmInputSchemaVersion).toBe(1);
    expect(completedSnapshotSchemaVersion).toBe(2);
  });

  for (const [version, fixtures] of [[1, completedSnapshotsByState], [2, completedSnapshotsV2ByState]] as const) {
    it(`round-trips every result state in snapshot version ${version}`, () => {
      expect(Object.keys(fixtures)).toHaveLength(6);
      for (const snapshot of Object.values(fixtures)) {
        const raw = JSON.parse(JSON.stringify(snapshot));
        expect(parseCompletedSnapshot(raw)).toEqual(raw);
        expect(parseCompletedSnapshot(raw).schemaVersion).toBe(version);
      }
    });
  }

  it("keeps full official labels instead of reconstructing them from IDs", () => {
    const official = readCatalogue();
    const input = parseFarmInput({ ...inputFixture, cropPurposeIds: ["common-bean-dry", "green-bean"] });
    const parsed = parseCompletedSnapshot({
      ...current, input, catalogue: official,
      result: { ...result, details: { ...result.details, provenance: {
        ...result.details.provenance,
        manifest: { kind: "available", value: { ...manifest.value, catalogueVersion: official.version } },
      } } },
    });
    expect(parsed.schemaVersion).toBe(2);
    if (parsed.schemaVersion !== 2) throw new Error("Expected saved catalogue.");
    expect(parsed.catalogue).toEqual(official);
    expect(parsed.catalogue.entries.find(entry => entry.id === "common-bean-dry")?.label).toBe("Common bean (dry grain)");
    expect(parsed.catalogue.entries.find(entry => entry.id === "green-bean")?.label).toBe("Green bean (fresh pods)");
  });

  it("accepts absent historical IDs and preserves unsupported labels and input", () => {
    const input = historicalInput();
    const parsed = parseCompletedSnapshot({ ...current, input });
    expect(parsed.input).toEqual(input);
    expect(parsed.result).toEqual(current.result);
  });

  it("retains strict version 1 parsing without fabricating a catalogue", () => {
    const legacy = completedSnapshotsByState.plan;
    expect(parseCompletedSnapshot(legacy)).toEqual(legacy);
    expect(parseCompletedSnapshot(legacy)).not.toHaveProperty("catalogue");
    expect(completedSnapshotSchema.safeParse({ ...legacy, catalogue }).success).toBe(false);
    expect(completedSnapshotSchema.safeParse({ ...legacy, input: { ...legacy.input, priority: "water" } }).success).toBe(false);
  });

  it.each([
    { ...current, catalogue: undefined },
    { ...current, unknown: true },
    { ...current, catalogue: { ...catalogue, unknown: true } },
    { ...current, catalogue: { ...catalogue, entries: [{ ...catalogue.entries[0], unknown: true }] } },
    { ...current, catalogue: { ...catalogue, entries: [{ ...catalogue.entries[0], label: undefined }] } },
    { ...current, catalogue: { ...catalogue, version: "different" } },
    { ...current, catalogue: { ...catalogue, entries: [...catalogue.entries, ...catalogue.entries] } },
    { ...current, catalogue: { ...catalogue, entries: [] } },
    { ...current, result: { ...result, details: { ...result.details, provenance: { ...result.details.provenance, manifest: { kind: "unavailable", reason: "Missing manifest." } } } } },
  ])("rejects incomplete or inconsistent version 2 metadata %#", raw => {
    expect(completedSnapshotSchema.safeParse(raw).success).toBe(false);
  });

  it("validates completion identity and uniqueness before persistence without duplicating input", () => {
    expect(snapshotCompletionSchema.parse({ result, catalogue })).toEqual({ result, catalogue });
    expect(snapshotCompletionSchema.safeParse({ result, catalogue, input: inputFixture }).success).toBe(false);
    expect(snapshotCompletionSchema.safeParse({ result, catalogue: { ...catalogue, version: "different" } }).success).toBe(false);
    expect(snapshotCompletionSchema.safeParse({ result, catalogue: { ...catalogue, entries: [...catalogue.entries, ...catalogue.entries] } }).success).toBe(false);
    expect(snapshotCompletionSchema.safeParse({ result: { ...result, details: { ...result.details, provenance: { ...result.details.provenance, manifest: { kind: "unavailable", reason: "Missing manifest." } } } }, catalogue }).success).toBe(false);
    expect(catalogueSchema.parse(catalogue)).toEqual(catalogue);
  });
});
