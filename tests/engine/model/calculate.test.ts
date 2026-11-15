import { describe, expect, it } from "vitest";
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
