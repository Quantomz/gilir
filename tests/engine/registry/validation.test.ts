import { describe, expect, it } from "vitest";
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
const nigeriaMaize = profileId("maize-grain-fao56-nigeria-humid-jun");
const idahoMaize = profileId("maize-grain-fao56-idaho-apr");

describe("E1 release validation", () => {
  it("accepts an unmodified copy of the current release", () => {
    expect(issuesOf(editableLatestRelease())).toEqual([]);
  });

  it("rejects Kc values outside the dimensionless range", () => {
    const release = editableLatestRelease();
    nigeriaMaize(release).kc.middle = 12;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/Kc middle 12 is outside/));
  });

  it("rejects a temperature threshold that is not plausible in degrees C", () => {
    const release = editableLatestRelease();
    nigeriaMaize(release).temperatureRules.push({
      id: "heat-in-kelvin", scope: { kind: "whole_occurrence" }, period: "daily", variable: "max_c",
      predicate: "above", thresholdC: 308, sourceIds: ["fao56-table12"], limitations: ["test"],
    });
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/threshold 308 is not a plausible degrees C/));
  });

  it("rejects reversed region bounds", () => {
    const release = editableLatestRelease();
    const scope = nigeriaMaize(release).applicability.scope;
    if (scope.kind !== "regional") throw new Error("expected regional scope");
    scope.bounds[0].southDeg = 20;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/region south 20 is north of 13.9/));
  });

  it("rejects stage totals that disagree with the published duration", () => {
    const release = editableLatestRelease();
    nigeriaMaize(release).timing.generatedStageDays.late += 5;
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/stage total 130 days is outside the published duration 125-125/));
  });

  it("rejects missing source references", () => {
    const release = editableLatestRelease();
    nigeriaMaize(release).kc.sourceIds = ["fao56-table99"];
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/kc: unknown source reference fao56-table99/));
  });

  it("rejects synthetic registries, synthetic records and synthetic sources", () => {
    expect(issuesOf(syntheticRegistryFixture).length).toBeGreaterThan(0);

    const syntheticStatus = editableLatestRelease();
    (nigeriaMaize(syntheticStatus) as { status: string }).status = "synthetic";
    expect(issuesOf(syntheticStatus)).toContainEqual(expect.stringMatching(/^schema profiles\.\d+\.status/));

    const syntheticSource = editableLatestRelease();
    syntheticSource.sources.push({ ...syntheticSource.sources[0], id: "synthetic:no-publication" });
    expect(issuesOf(syntheticSource)).toContainEqual(expect.stringMatching(/synthetic provenance in a released registry/));
  });

  it("rejects released profiles without a review record", () => {
    const release = editableLatestRelease();
    delete (nigeriaMaize(release) as { review?: unknown }).review;
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
    release.catalogue.entries.push({ id: "rice-paddy" as never, label: "Rice (paddy)", purpose: "food" });
    nigeriaMaize(release).cropPurposeId = "maize-silage" as never;
    const issues = issuesOf(release);
    expect(issues).toContainEqual("catalogue rice-paddy: no released profile with this crop-purpose");
    expect(issues).toContainEqual(expect.stringMatching(/crop-purpose maize-silage is not in the catalogue/));
  });

  it("rejects pest and weed rules and coverage manifests, which spec 1.1 removed", () => {
    const release = editableLatestRelease();
    release.rules.push({
      status: "released", review: { reviewer: "test", reviewedOn: "2026-11-14" as never },
      id: "pest-break", version: "1", target: "Example pest", category: "pest",
      applicability: { scope: { kind: "broad" }, exclusions: [], managementAssumptions: [] },
      predicate: { kind: "minimum_host_free_break", hostCropPurposeIds: ["maize-grain" as never], nonHostCropPurposeIds: [], requiredBreakDays: 30 },
      limitations: [], preparation: [], sourceIds: ["fao56-table11"],
    });
    expect(issuesOf(release)).toContainEqual(expect.stringMatching(/rule pest-break: pest and weed rules are outside the MVP/));
  });

  it("throws a named error listing every issue", () => {
    const release = editableLatestRelease();
    nigeriaMaize(release).kc.middle = 12;
    nigeriaMaize(release).kc.sourceIds = ["missing"];
    expect(() => assertValidRelease(release)).toThrow(InvalidReleaseError);
    try {
      assertValidRelease(release);
    } catch (error) {
      expect((error as InvalidReleaseError).issues).toHaveLength(2);
    }
  });
});
