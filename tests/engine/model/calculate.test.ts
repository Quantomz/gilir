import { describe, expect, it } from "vitest";
import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import { readRegistryRelease } from "@/registry";
import { calculate, calculateV1 } from "@/engine";
import { parseCompletedSnapshot, parsePlanResult } from "@/contracts/result";
import { parseCompleteModelRelease } from "@/registry/models/validate";
import { frozenRunFixture, syntheticRegistryFixture } from "@/fixtures/science";
import { setup } from "./fixtures";

describe("versioned global model engine", () => {
  it("returns a saved modeled plan with source assumptions and all selected crop IDs", () => {
    const { run, registry, cohort } = setup();
    const result = calculate(run, registry, { buildCohort: () => cohort });
    expect(result.state).toBe("plan");
    expect(parsePlanResult(result)).toEqual(result);
    if (!("plan" in result)) return;
    expect(result.plan.occurrences.map(item => item.cropPurposeId)).toEqual(run.input.cropPurposeIds);
    const snapshot = { schemaVersion: 3, id: "test", completedAt: "2026-11-15T00:00:00Z", input: run.input, catalogue: registry.catalogue, result };
    expect(parseCompletedSnapshot(snapshot)).toEqual(snapshot);
    expect(() => parseCompletedSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow();
    expect(() => parseCompletedSnapshot({ ...snapshot, result: { ...result, details: { ...result.details, modeling: undefined } } })).toThrow();
  });
  it("keeps known noncompletion, missing climate and scoring limits as separate outcomes", () => {
    const cold = setup(365, [10]);
    expect(calculate(cold.run, cold.registry, { buildCohort: () => cold.cohort }).state).toBe("no_calendar_fit");
    const warm = setup();
    expect(calculate(warm.run, warm.registry, { buildCohort: () => ({ ...warm.cohort, usable: [], coverage: { kind: "unavailable", reason: "No test climate" } }) }).state).toBe("insufficient_data");
    if (warm.run.manifest.schemaVersion !== 2) return;
    const limited = { ...warm.run, manifest: { ...warm.run.manifest, modelingPolicy: { ...warm.run.manifest.modelingPolicy, scoringWorkLimit: 0 } } };
    const result = calculate(limited, warm.registry, { buildCohort: () => warm.cohort });
    expect(result.state).toBe("search_incomplete");
    expect(result.details.search.ranking).toBe("limit_reached");
    expect(result.details.modeling?.workLimitReached).toBe(true);
  });
  it("requires complete reviewed catalogue coverage and known sources", () => {
    const { registry } = setup();
    const validate = (raw: unknown) => parseCompleteModelRelease(raw, registry.catalogue, registry.sources.map(source => source.id));
    expect(validate(registry.modelRelease).models).toHaveLength(32);
    expect(() => validate({ ...registry.modelRelease, models: registry.modelRelease.models.slice(1) })).toThrow();
    expect(() => validate({ ...registry.modelRelease, models: registry.modelRelease.models.map((model, index) => index ? model : registry.modelRelease.models[1]) })).toThrow();
    expect(() => parseCompleteModelRelease(registry.modelRelease, registry.catalogue, [])).toThrow();
  });
  it("preserves the legacy engine result exactly", () => {
    expect(calculate(frozenRunFixture, syntheticRegistryFixture)).toEqual(calculateV1(frozenRunFixture, syntheticRegistryFixture));
  });
});

describe("strict modeled calendar horizon", () => {
  it.each([
    ["2026-07-01", "2027-07-01", "2027-07-02", 365],
    ["2027-07-01", "2028-07-01", "2028-06-30", 366],
    ["2028-02-29", "2029-02-28", "2029-03-01", 365],
  ] as const)("preserves the exact anniversary for %s", (start, end, wrongEnd, days) => {
    const { run, registry, cohort } = setup(days);
    const input = { ...run.input, planningStart: parseIsoDate(start) };
    const result = calculate({ ...run, input }, registry, { buildCohort: () => cohort });
    if (!("plan" in result)) throw new Error(`Expected plan, got ${result.state}`);
    expect(result.plan.horizon.endExclusive).toBe(end);
    const snapshot = { schemaVersion: 3, id: "anniversary-test", completedAt: "2026-11-15T00:00:00Z", input, catalogue: registry.catalogue, result };
    expect(parseCompletedSnapshot(snapshot)).toEqual(snapshot);
    expect(() => parseCompletedSnapshot({ ...snapshot, result: { ...result, plan: { ...result.plan, horizon: { ...result.plan.horizon, endExclusive: wrongEnd } } } })).toThrow();
  });
});

describe("released barley roundoff regression", () => {
  it("reserves the field through day 250 plus turnaround instead of proving no fit", () => {
    const { run, cohort } = setup(365, [9.3]);
    const registry = readRegistryRelease();
    if (!registry.modelRelease || run.manifest.schemaVersion !== 2) throw new Error("Expected released modeled registry.");
    const replay = cohort.usable[0];
    const climate = { ...cohort, usable: [{ ...replay, days: replay.days.map((day, index) => index < 250 ? day : {
      ...day, minC: { kind: "available" as const, value: 0 }, maxC: { kind: "available" as const, value: 0 }, meanC: { kind: "available" as const, value: 0 },
    }) }] };
    const frozen = { ...run, input: { ...run.input, cropPurposeIds: [parseCropPurposeId("barley-grain")] }, manifest: { ...run.manifest,
      catalogueVersion: registry.identity.catalogueVersion, ruleVersion: registry.identity.ruleVersion,
      modelReleaseVersion: registry.modelRelease.version, modelReleaseHash: registry.modelRelease.contentHash,
    } };
    const result = calculate(frozen, registry, { buildCohort: () => climate });
    expect(result.state).toBe("plan");
    if (!("plan" in result)) return;
    expect(result.plan.occurrences[0].modeledTiming?.replays[0]).toMatchObject({ harvestOffset: 249, stageCompletionOffsets: [33, 105, 180, 250] });
    expect(result.plan.occurrences[0].fieldAvailable).toBe("2027-03-15");
  });
});
