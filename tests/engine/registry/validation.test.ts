import { describe, expect, it } from "vitest";
import { parseCropPurposeId } from "@/contracts/common";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { assertValidRelease, InvalidReleaseError, validateRelease } from "@/registry";
import { editableLatestRelease } from "./support";

function issuesOf(raw: unknown): readonly string[] {
  const result = validateRelease(raw);
  return result.ok ? [] : result.issues;
}

const profileId = (id: string) => (release: ReturnType<typeof editableLatestRelease>) => {
  const profile = release.profiles.find(candidate => candidate.id === id);
  if (profile === undefined) throw new Error(`missing ${id}`);
  return profile;
};
const idahoMaize = profileId("maize-grain-fao56-idaho-apr");

describe("E1 release validation", () => {
  it("accepts an unmodified copy of the current release", () => {
    expect(issuesOf(editableLatestRelease())).toEqual([]);
  });

  it("rejects Kc values outside the dimensionless range", () => {
    const release = editableLatestRelease();
    idahoMaize(release).kc.middle = 12;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/Kc middle 12 is outside/));
  });

  it("rejects a temperature threshold that is not plausible in degrees C", () => {
    const release = editableLatestRelease();
    idahoMaize(release).temperatureRules.push({
      id: "heat-in-kelvin", scope: { kind: "whole_occurrence" }, period: "daily", variable: "max_c",
      predicate: "above", thresholdC: 308, sourceIds: ["fao56-table12"], limitations: ["test"],
    });
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/threshold 308 is not a plausible degrees C/));
  });

  it("rejects reversed region bounds", () => {
    const release = editableLatestRelease();
    const scope = idahoMaize(release).applicability.scope;
    if (scope.kind !== "regional") throw new Error("expected regional scope");
    scope.bounds[0].southDeg = 50;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/region south 50 is north of 49/));
  });

  it("rejects stage totals that disagree with the published duration", () => {
    const release = editableLatestRelease();
    idahoMaize(release).timing.generatedStageDays.late += 5;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/stage total 175 days is outside the published duration 170-170/));
  });

  it("rejects missing source references", () => {
    const release = editableLatestRelease();
    idahoMaize(release).kc.sourceIds = ["fao56-table99"];
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/kc: unknown source reference fao56-table99/));
  });

  it("rejects synthetic registries, synthetic records and synthetic sources", () => {
    expect(issuesOf(syntheticRegistryFixture).length).toBeGreaterThan(0);

    const syntheticStatus = editableLatestRelease();
    (idahoMaize(syntheticStatus) as { status: string }).status = "synthetic";
    expect(issuesOf(syntheticStatus)).toContainEqual(expect.stringMatching(/^schema profiles\.\d+\.status/));

    const syntheticSource = editableLatestRelease();
    syntheticSource.sources.push({ ...syntheticSource.sources[0], id: "synthetic:no-publication" });
    expect(issuesOf(syntheticSource)).toContainEqual(expect.stringMatching(/synthetic provenance in a released registry/));
  });

  it("rejects released profiles without a review record", () => {
    const release = editableLatestRelease();
    delete (idahoMaize(release) as { review?: unknown }).review;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/^schema profiles\.\d+\.review/));
  });

  it("rejects ambiguous precedence between overlapping regions for the same crop", () => {
    const release = editableLatestRelease();
    idahoMaize(release).precedence = 3;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(
      /maize-grain-fao56-idaho-apr and maize-grain-fao56-spain-california-apr: ambiguous precedence 3/,
    ));
  });

  it("rejects catalogue entries without profiles and profiles outside the catalogue", () => {
    const release = editableLatestRelease();
    release.catalogue.entries.push({ id: parseCropPurposeId("teff-grain"), label: "Teff (grain)", purpose: "food" });
    idahoMaize(release).cropPurposeId = parseCropPurposeId("maize-silage");
    const issues = issuesOf(release);
    expect(issues).toContainEqual("catalogue teff-grain: no released profile with this crop-purpose");
    expect(issues).toContainEqual(expect.stringMatching(/crop-purpose maize-silage is not in the catalogue/));
  });

  it("rejects coverage manifests and pest rules, which the spec 1.1 contract removed", () => {
    const withCoverage = { ...editableLatestRelease(), coverage: [] };
    expect(issuesOf(withCoverage)).toContainEqual(expect.stringMatching(/^schema \(root\)/));

    const withPestRule = editableLatestRelease();
    (withPestRule.rules as unknown[]).push({
      status: "released", review: { reviewer: "test", reviewedOn: "2026-11-14" },
      id: "pest-break", version: "1", target: "Example pest", category: "pest",
      applicability: { scope: { kind: "broad" }, exclusions: [], managementAssumptions: [] },
      predicate: { kind: "prohibit_successor", predecessorCropPurposeIds: ["maize-grain"], successorCropPurposeIds: ["maize-grain"] },
      limitations: [], preparation: [], sourceIds: ["fao56-table11"],
    });
    expect(issuesOf(withPestRule)).toContainEqual(expect.stringMatching(/^schema rules\.0\.category/));
  });

  it("throws a named error listing every issue", () => {
    const release = editableLatestRelease();
    idahoMaize(release).kc.middle = 12;
    idahoMaize(release).kc.sourceIds = ["missing"];
    expect(() => assertValidRelease(release)).toThrow(InvalidReleaseError);
    try {
      assertValidRelease(release);
    } catch (error) {
      expect((error as InvalidReleaseError).issues).toHaveLength(2);
    }
  });
});
