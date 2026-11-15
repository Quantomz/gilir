import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import x1 from "../../../docs/evidence/X1/fao-source-comparison.json";
import { latestReleaseVersion, readCatalogue, readRegistryRelease, releasedVersions, validateRelease } from "@/registry";
import { withheldProfileIds } from "./support";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const release = readRegistryRelease();
const reviewed = readRegistryRelease("fao56-reviewed-2026-11-15");

// These are X1's source observations at 090626a, not a passing audit of this release.
const table11 = new Map(x1.table11Rows.map(row => [row.id, row]));
const originalProfiles = new Map(x1.profiles.map(profile => [profile.profileId, profile]));

describe("E1 reviewed release", () => {
  it("validates every supported immutable release identity", () => {
    expect(latestReleaseVersion).toBe("fao56-hard-windows-2026-11-15");
    expect(releasedVersions).toEqual(["v1-empty", "fao56-reviewed-2026-11-15", latestReleaseVersion]);
    expect(readRegistryRelease(latestReleaseVersion)).toBe(release);
    expect(readCatalogue()).toBe(release.catalogue);
    for (const version of releasedVersions) {
      const registry = readRegistryRelease(version);
      expect(validateRelease(registry)).toEqual({ ok: true, release: registry });
    }
  });

  it("preserves the exact v1-empty artifact", () => {
    const empty = readRegistryRelease("v1-empty");
    expect(empty).toEqual({
      kind: "released",
      identity: { catalogueVersion: "v1-empty", ruleVersion: "v1-empty" },
      catalogue: { version: "v1-empty", entries: [] },
      sources: [], profiles: [], rules: [],
    });
    expect(createHash("sha256").update(JSON.stringify(empty)).digest("hex"))
      .toBe("df4d902631463c5ca8a48dc877698f00eef5c29c7e598f028f6b56256e953892");
  });

  it("keeps the recommendation-window release byte-identical for frozen retries", () => {
    expect(reviewed.identity).toEqual({ catalogueVersion: "fao56-reviewed-2026-11-15", ruleVersion: "no-rules-2026-11-14" });
    expect(digest(reviewed)).toBe("608644417618b2b7d4fa5757d49b90fb4cafcb801ed8488f5fd07c3ffdee811b");
    expect(digest(structuredClone(reviewed))).toBe(digest(reviewed));
    for (const profile of reviewed.profiles) {
      expect(profile.version).toBe("reviewed-2026-11-15.1");
      expect(profile.timing.plantingWindows.every(window => window.basis === "recommendation")).toBe(true);
    }
  });

  it("pins the hard-window release's canonical bytes to its identity", () => {
    expect(digest(release)).toBe("4e593ae30151d31ea6b68b347740becfdf595cc183cad4ee885591d817067ffe");
    expect(digest(structuredClone(release))).toBe(digest(release));
    expect(digest(readRegistryRelease(latestReleaseVersion))).toBe(digest(release));
  });

  it("differs from the reviewed release only in window basis and profile version", () => {
    expect(release.identity).toEqual({ catalogueVersion: "fao56-hard-windows-2026-11-15", ruleVersion: "no-rules-2026-11-14" });
    expect(release.catalogue.entries).toEqual(reviewed.catalogue.entries);
    expect(release.sources).toEqual(reviewed.sources);
    expect(release.profiles.flatMap(profile => profile.timing.plantingWindows).length).toBeGreaterThan(0);
    const hardened = reviewed.profiles.map(profile => ({
      ...profile,
      version: "reviewed-2026-11-15.2",
      timing: { ...profile.timing, plantingWindows: profile.timing.plantingWindows.map(window => ({ ...window, basis: "hard_constraint" })) },
    }));
    expect(release.profiles).toEqual(hardened);
  });

  it("publishes exactly the 75 retained rows from 86 mappings to 71 source rows", () => {
    expect(x1.table11Rows).toHaveLength(71);
    expect(x1.profiles).toHaveLength(86);
    expect(withheldProfileIds).toHaveLength(11);
    const retained = x1.profiles.map(profile => profile.profileId).filter(id => !withheldProfileIds.includes(id));
    expect(release.profiles.map(profile => profile.id)).toEqual(retained);
    expect(release.profiles).toHaveLength(75);
    for (const id of withheldProfileIds) expect(release.profiles.some(profile => profile.id === id)).toBe(false);
  });

  it("derives exactly 40 food purposes from retained profiles", () => {
    expect(release.catalogue.entries).toHaveLength(40);
    const profilePurposes = [...new Set(release.profiles.map(profile => profile.cropPurposeId))].sort();
    expect(release.catalogue.entries.map(entry => entry.id)).toEqual(profilePurposes);
    expect(profilePurposes).not.toContain("faba-bean-dry");
    expect(profilePurposes).not.toContain("sweet-pepper");
    expect(profilePurposes).toContain("sweet-maize");
    for (const entry of release.catalogue.entries) {
      expect(entry.purpose).toBe("food");
      expect(release.profiles.some(profile => profile.cropPurposeId === entry.id && profile.commonName === entry.label)).toBe(true);
    }
  });

  it("preserves every retained source stage, Kc, and planting window as a hard limit", () => {
    const conflictIds = new Set([
      "sorghum-grain-fao56-usa-pakistan-mediterranean-may-jun",
      "mung-bean-dry-fao56-mediterranean-mar",
      "cowpea-dry-fao56-mediterranean-mar",
      "eggplant-fao56-mediterranean-may-jun",
    ]);
    for (const profile of release.profiles) {
      const original = originalProfiles.get(profile.id);
      expect(original, profile.id).toBeDefined();
      if (original === undefined) throw new Error(`No X1 mapping for ${profile.id}`);
      const selected = original.selectedImplementation;
      expect(profile.timing.generatedStageDays, profile.id).toEqual(selected.stageDays);
      expect(profile.timing.historicalStageAllocations, profile.id).toEqual([selected.stageDays]);
      expect([profile.kc.initial, profile.kc.middle, profile.kc.end], profile.id)
        .toEqual([selected.kc.initial, selected.kc.middle, selected.kc.end]);
      expect(profile.timing.plantingWindows, profile.id)
        .toEqual(selected.plantingWindows.map(window => ({ ...window, basis: "hard_constraint" })));
      const sourceRow = table11.get(original.table11RowId);
      expect(sourceRow, profile.id).toBeDefined();
      if (sourceRow === undefined) throw new Error(`No Table 11 source row for ${profile.id}`);
      const published = profile.timing.publishedDurationDays;
      if (conflictIds.has(profile.id)) {
        expect(published.kind, profile.id).toBe("unavailable");
      } else {
        expect(published.kind, profile.id).toBe("available");
        if (published.kind !== "available") throw new Error(`Missing literal duration for ${profile.id}`);
        const literalTotals = sourceRow.totalDaysLiteral.split("/").map(Number);
        expect(literalTotals, profile.id).toContain(published.value[0]);
        expect(published.value[1], profile.id).toBe(published.value[0]);
      }
    }
  });

  it("cites only used FAO sources and records the current comparison honestly", () => {
    expect(release.sources.map(source => source.id)).toEqual(["fao56-table11", "fao56-table12"]);
    for (const profile of release.profiles) {
      expect(profile.status).toBe("released");
      expect(profile.version).toBe("reviewed-2026-11-15.2");
      expect(profile.review.reviewedOn).toBe("2026-11-15");
      expect(profile.review.reviewer).toContain("source-remediation comparison");
      expect(profile.review.reviewer).not.toMatch(/Claude/);
      expect(profile.sourceIds).toEqual(["fao56-table11", "fao56-table12"]);
      expect(JSON.stringify(profile)).not.toMatch(/synthetic/i);
      expect(profile.timing.turnaround).toMatchObject({ basis: "scheduling_assumption", days: 7 });
      expect(profile.preparation).toEqual([]);
      expect(profile.applicability.managementAssumptions.join(" ")).toContain("not a published boundary");
      expect(profile.kc.assumptions.join(" ")).toContain("no climatic adjustment");
      expect(profile.timing.plantingWindows.every(window => window.basis === "hard_constraint")).toBe(true);
    }
    expect(release.rules).toEqual([]);
  });

  it("preserves paddy water limitations and unavailable groundnut planting months", () => {
    for (const rice of release.profiles.filter(profile => profile.cropPurposeId === "rice-paddy")) {
      expect(rice.warnings.join(" ")).toMatch(/excludes ponding, seepage and percolation/);
    }
    for (const groundnut of release.profiles.filter(profile => profile.cropPurposeId === "groundnut")) {
      expect(groundnut.timing.plantingWindows).toEqual([]);
    }
  });

  it("rejects unknown versions without an alias", () => {
    expect(() => readRegistryRelease("v0-missing")).toThrow("Unknown catalogue release v0-missing.");
    expect(() => readCatalogue("fao56-temperature-rules-2026-11-15")).toThrow(/Retired catalogue release/);
  });

  it("prevents nested mutation and retains the same canonical digest after an attempt", () => {
    const before = digest(release);
    expect(() => Object.defineProperty(release.profiles[0].kc, "middle", { value: 9 })).toThrow(TypeError);
    expect(Object.isFrozen(release.profiles[0].temperatureRules)).toBe(true);
    expect(Object.isFrozen(release.profiles[0].timing.generatedStageDays)).toBe(true);
    expect(Object.isFrozen(release.catalogue.entries)).toBe(true);
    expect(digest(readRegistryRelease())).toBe(before);
  });
});
