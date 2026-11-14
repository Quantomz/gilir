import { describe, expect, it } from "vitest";
import { defaultEngineSettings } from "@/contracts/climate";
import { parsePlanResult, rankingMetricIds } from "@/contracts/result";
import type { PlanResult } from "@/contracts/result";
import { e1Released, recomputeFirstOccurrence, recordedSnapshots, registrySource, runCase, scienceCases, sha256, usableSeasons } from "./harness";
import type { RegistrySource, ScienceCase } from "./harness";
import { daysFrom } from "./reference";
import { standInLabel } from "./stand-in-registry";

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

const sources: readonly { readonly kind: RegistrySource["kind"]; readonly skip: boolean; readonly title: string }[] = [
  { kind: "stand-in", skip: false, title: "stand-in synthetic registry on recorded NASA POWER climate" },
  { kind: "released", skip: !e1Released,
    title: e1Released ? "released E1 registry on recorded NASA POWER climate"
      : "released E1 registry on recorded NASA POWER climate (skipped: E1 crop registry is not merged, readCatalogue() is empty)" },
];

for (const { kind, skip, title } of sources) {
  describe.skipIf(skip)(title, () => {
    const source = registrySource(kind);
    const results = new Map<string, PlanResult>();
    const resultOf = (c: ScienceCase) => {
      const cached = results.get(c.id);
      if (cached) return cached;
      const result = runCase(c, source);
      results.set(c.id, result);
      return result;
    };
    const profileFor = (id: string, version: string) => {
      const profile = source.registry.profiles.find(p => p.id === id && p.version === version);
      if (!profile) throw new Error(`Registry has no profile ${id} v${version}.`);
      return profile;
    };

    describe.each(scienceCases)("$id", c => {
      it("returns the expected state as a valid strict result on a full real climate cohort", () => {
        const result = resultOf(c);
        expect(parsePlanResult(result)).toEqual(result);
        const accepted = c.expect.state === "plan" ? ["plan", "plan_with_warnings"] : [c.expect.state];
        expect(accepted, JSON.stringify("missing" in result ? result.missing : result.details.explanation)).toContain(result.state);
        expect(usableSeasons(result)).toBeGreaterThanOrEqual(defaultEngineSettings.minimumUsableSeasons);
      }, 60_000);

      it("carries profile provenance labeled by registry kind", () => {
        const { provenance } = resultOf(c).details;
        if (source.registry.kind === "synthetic") expect(provenance).toMatchObject({ kind: "synthetic", label: standInLabel });
        else expect(provenance.kind).toBe("run");
        if (provenance.manifest.kind !== "available") throw new Error("Manifest provenance is unavailable.");
        expect(provenance.manifest.value.climateSnapshotIds).toEqual(recordedSnapshots(c.recording).map(s => s.id));
        expect(provenance.climateProducts.map(p => p.provider)).toEqual(["NASA POWER", "NASA POWER", "NASA POWER"]);
        if (c.expect.state === "insufficient_data") return;
        expect(provenance.profiles.map(p => p.id).sort()).toEqual([...c.expect.profileIds].sort());
        for (const profile of provenance.profiles) {
          expect(profile.sourceIds.length).toBeGreaterThan(0);
          if (source.registry.kind === "released") {
            for (const id of profile.sourceIds) expect(provenance.sources.map(s => s.id)).toContain(id);
          }
        }
      }, 60_000);

      it("reruns to a byte-identical result", () => {
        expect(sha256(runCase(c, source))).toBe(sha256(resultOf(c)));
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

        it("keeps the same plan when the farmer reports backup water", () => {
          const result = resultOf(c);
          const backup = runCase(c, source, "rain_plus_backup");
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

      if (c.expect.state === "no_calendar_fit") {
        it("proves impossibility from summed occupancy and turnaround exceeding the year", () => {
          const result = resultOf(c);
          if (result.state !== "no_calendar_fit") throw new Error(`Expected no_calendar_fit, got ${result.state}.`);
          if (result.proof.kind !== "duration_lower_bound") throw new Error(`Expected a duration proof, got ${result.proof.kind}.`);
          const minimum = result.details.provenance.profiles.map(ref => {
            const p = profileFor(ref.id, ref.version);
            const s = p.timing.generatedStageDays;
            return s.initial + s.development + s.middle + s.late + p.timing.turnaround.days;
          }).reduce((a, b) => a + b, 0);
          expect(result.proof.mandatoryMinimumDays).toBe(minimum);
          expect(result.proof.horizonDays).toBe(daysFrom(c.planningStart, anniversary(c.planningStart)));
          expect(minimum).toBeGreaterThan(result.proof.horizonDays);
        }, 60_000);
      }

      it("makes no harvest-probability, soil-test, pest-count or worldwide-validation claim", () => {
        const text = strings(resultOf(c).details).join("\n");
        for (const pattern of forbiddenClaims) expect(text).not.toMatch(pattern);
      }, 60_000);
    });

    it("independently recomputes one maize occurrence's FAO-56 crop demand windows in the first replay season", () => {
      const check = recomputeFirstOccurrence(scienceCases[0], resultOf(scienceCases[0]), source.registry);
      expect(check.engine.mismatch).toEqual({ kind: "available", value: expect.closeTo(check.reference.mismatch, 9) });
      expect(check.engine.frequency).toEqual({ kind: "available", value: expect.closeTo(check.reference.frequency, 12) });
      expect(check.engine.windows).toEqual({ kind: "available", value: { count: check.reference.windows.length, unit: "windows" } });
    }, 60_000);
  });
}
