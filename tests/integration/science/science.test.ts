import { describe, expect, it } from "vitest";
import { defaultEngineSettings } from "@/contracts/climate";
import { parsePlanResult, rankingMetricIds } from "@/contracts/result";
import type { PlanResult } from "@/contracts/result";
import { recomputeFirstOccurrence, recordedSnapshots, registry, runCase, scienceCases, sha256, usableSeasons } from "./harness";
import type { ScienceCase } from "./harness";
import { daysFrom } from "./reference";

const forbiddenClaims = [
  /harvest (?:success )?probabilit/i, /probability of (?:harvest|crop|yield|success)/i, /chance of (?:harvest|success)/i,
  /soil[- ]test/i, /pest (?:count|pressure|population)/i, /\bpests? (?:were|was) (?:counted|found)/i,
  /worldwide[- ]validat/i, /validated (?:worldwide|globally)/i, /global(?:ly)? validat/i,
];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const anniversary = (start: string) => {
  const next = `${Number(start.slice(0, 4)) + 1}${start.slice(4)}`;
  return next.endsWith("-02-29") ? next.replace("-02-29", "-02-28") : next;
};

const results = new Map<string, PlanResult>();
const resultOf = (c: ScienceCase) => {
  const cached = results.get(c.id);
  if (cached) return cached;
  const result = runCase(c);
  results.set(c.id, result);
  return result;
};
const profileFor = (id: string, version: string) => {
  const profile = registry.profiles.find(p => p.id === id && p.version === version);
  if (!profile) throw new Error(`Registry has no profile ${id} v${version}.`);
  return profile;
};
const mandatoryDays = (result: PlanResult) => result.details.provenance.profiles.map(ref => {
  const p = profileFor(ref.id, ref.version);
  const s = p.timing.generatedStageDays;
  return s.initial + s.development + s.middle + s.late + p.timing.turnaround.days;
}).reduce((a, b) => a + b, 0);

describe(`released E1 registry ${registry.identity.catalogueVersion} on recorded NASA POWER climate`, () => {
  it("runs against the released reviewed registry, not a synthetic fixture", () => {
    expect(registry.kind).toBe("released");
    expect(registry.catalogue.entries.length).toBeGreaterThan(0);
  });

  describe.each(scienceCases)("$id", c => {
    it("returns the expected state as a valid strict result on a full real climate cohort", () => {
      const result = resultOf(c);
      expect(parsePlanResult(result)).toEqual(result);
      const accepted = c.expect.state === "plan" ? ["plan", "plan_with_warnings"] : [c.expect.state];
      expect(accepted, JSON.stringify("missing" in result ? result.missing : result.details.explanation)).toContain(result.state);
      expect(usableSeasons(result)).toBeGreaterThanOrEqual(defaultEngineSettings.minimumUsableSeasons);
    }, 60_000);

    it("carries released source and climate provenance", () => {
      const { provenance } = resultOf(c).details;
      expect(provenance.kind).toBe("run");
      if (provenance.manifest.kind !== "available") throw new Error("Manifest provenance is unavailable.");
      expect(provenance.manifest.value.climateSnapshotIds).toEqual(recordedSnapshots(c.recording).map(s => s.id));
      expect(provenance.climateProducts.map(p => p.provider)).toEqual(["NASA POWER", "NASA POWER", "NASA POWER"]);
      if (c.expect.state === "insufficient_data") return;
      expect(provenance.profiles.map(p => p.id).sort()).toEqual([...c.expect.profileIds].sort());
      for (const profile of provenance.profiles) {
        expect(profile.sourceIds.length).toBeGreaterThan(0);
        for (const id of profile.sourceIds) expect(provenance.sources.map(s => s.id)).toContain(id);
      }
    }, 60_000);

    it("reruns to a byte-identical result", () => {
      expect(sha256(runCase(c))).toBe(sha256(resultOf(c)));
    }, 60_000);

    if (c.expect.state === "plan") {
      const expectedProfiles = c.expect.profileIds;
      it("plans every selected crop inside one calendar year without overlap or skipped turnaround", () => {
        const result = resultOf(c);
        if (!("plan" in result)) throw new Error(`Expected a plan, got ${result.state}.`);
        const { plan } = result;
        expect(plan.horizon).toEqual({ start: c.planningStart, endExclusive: anniversary(c.planningStart) });
        expect(new Set(plan.occurrences.map(o => o.cropPurposeId))).toEqual(new Set(c.cropPurposeIds));
        expect(new Set(plan.occurrences.map(o => o.profileId))).toEqual(new Set(expectedProfiles));
        const ordered = [...plan.occurrences].sort((a, b) => a.planted.localeCompare(b.planted));
        ordered.forEach((o, i) => {
          const profile = profileFor(o.profileId, o.profileVersion);
          const stages = profile.timing.generatedStageDays;
          expect(o.planted >= plan.horizon.start && o.fieldAvailable <= plan.horizon.endExclusive).toBe(true);
          expect(daysFrom(o.planted, o.lastOccupied) + 1).toBe(stages.initial + stages.development + stages.middle + stages.late);
          expect(daysFrom(o.lastOccupied, o.fieldAvailable)).toBe(1 + profile.timing.turnaround.days);
          const next = ordered[i + 1];
          if (next) expect(next.planted >= o.fieldAvailable).toBe(true);
        });
        expect(plan.rankingTuple.components.map(component => component.metricId)).toEqual([...rankingMetricIds]);
      }, 60_000);

      it("plants every crop inside its released FAO-56 planting window", () => {
        const result = resultOf(c);
        if (!("plan" in result)) throw new Error(`Expected a plan, got ${result.state}.`);
        for (const o of result.plan.occurrences) {
          const windows = profileFor(o.profileId, o.profileVersion).timing.plantingWindows;
          expect(windows.length, o.profileId).toBeGreaterThan(0);
          expect(windows.every(w => w.basis === "hard_constraint"), o.profileId).toBe(true);
          const monthDay = o.planted.slice(5);
          expect(windows.some(({ window: w }) => w.startMonthDay <= w.endMonthDayInclusive
            ? monthDay >= w.startMonthDay && monthDay <= w.endMonthDayInclusive
            : monthDay >= w.startMonthDay || monthDay <= w.endMonthDayInclusive), `${o.profileId} planted ${o.planted}`).toBe(true);
        }
      }, 60_000);

      it("keeps the same plan when the farmer reports backup water", () => {
        const result = resultOf(c);
        const backup = runCase(c, "rain_plus_backup");
        expect(backup.state).toBe(result.state);
        expect("plan" in backup && backup.plan).toEqual("plan" in result && result.plan);
      }, 60_000);
    } else {
      it("returns no plan", () => {
        expect("plan" in resultOf(c)).toBe(false);
      }, 60_000);
    }

    if (c.expect.state === "insufficient_data") {
      const missingProfiles = c.expect.missingProfiles;
      it("names the missing crop profile instead of guessing one", () => {
        const result = resultOf(c);
        if (result.state !== "insufficient_data") throw new Error(`Expected insufficient_data, got ${result.state}.`);
        const covered = result.missing.filter(gap => gap.code === "crop_profile").flatMap(gap => gap.cropPurposeIds);
        expect(new Set(covered)).toEqual(new Set(missingProfiles));
        expect(result.details.provenance.profiles).toEqual([]);
      }, 60_000);
    }

    if (c.expect.state === "no_calendar_fit" && c.expect.proof === "duration_lower_bound") {
      it("proves impossibility from summed occupancy and turnaround exceeding the year", () => {
        const result = resultOf(c);
        if (result.state !== "no_calendar_fit") throw new Error(`Expected no_calendar_fit, got ${result.state}.`);
        if (result.proof.kind !== "duration_lower_bound") throw new Error(`Expected a duration proof, got ${result.proof.kind}.`);
        const minimum = mandatoryDays(result);
        expect(result.proof.mandatoryMinimumDays).toBe(minimum);
        expect(result.proof.horizonDays).toBe(daysFrom(c.planningStart, anniversary(c.planningStart)));
        expect(minimum).toBeGreaterThan(result.proof.horizonDays);
      }, 60_000);
    }

    if (c.expect.state === "no_calendar_fit" && c.expect.proof === "structural_exhaustion") {
      it("proves impossibility by exhausting the daily search although the durations alone fit", () => {
        const result = resultOf(c);
        if (result.state !== "no_calendar_fit") throw new Error(`Expected no_calendar_fit, got ${result.state}.`);
        if (result.proof.kind !== "structural_exhaustion") throw new Error(`Expected a structural proof, got ${result.proof.kind}.`);
        expect(result.proof.horizon).toEqual({ start: c.planningStart, endExclusive: anniversary(c.planningStart) });
        expect(result.details.search.structural).toBe("proved_impossible");
        expect(mandatoryDays(result)).toBeLessThanOrEqual(daysFrom(c.planningStart, anniversary(c.planningStart)));
      }, 60_000);
    }

    it("makes no harvest-probability, soil-test, pest-count or worldwide-validation claim", () => {
      const text = strings(resultOf(c).details).join("\n");
      for (const pattern of forbiddenClaims) expect(text).not.toMatch(pattern);
    }, 60_000);
  });

  it("independently recomputes the supported case's FAO-56 crop demand windows in the first replay season", () => {
    const check = recomputeFirstOccurrence(scienceCases[0], resultOf(scienceCases[0]));
    expect(check.engine.mismatch).toEqual({ kind: "available", value: expect.closeTo(check.reference.mismatch, 9) });
    expect(check.engine.frequency).toEqual({ kind: "available", value: expect.closeTo(check.reference.frequency, 12) });
    expect(check.engine.windows).toEqual({ kind: "available", value: { count: check.reference.windows.length, unit: "windows" } });
  }, 60_000);
});
