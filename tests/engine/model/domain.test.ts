import { describe, expect, it } from "vitest";
import { parseIsoDate } from "@/contracts/common";
import { defaultModelingPolicy } from "@/contracts/model";
import { prepareCropSeasons, ModelWorkLimit } from "@/engine/model/domain";
import { findModelCalendar } from "@/engine/model/search";
import { addDays } from "@/engine/metrics/dates";
import { setup } from "./fixtures";

function prepared(temperatures: readonly number[] = [20, 30], limit = 5_000_000) {
  const { run, registry, cohort } = setup(12, temperatures);
  const horizon = { start: run.input.planningStart, endExclusive: addDays(run.input.planningStart, 12) };
  const value = prepareCropSeasons({ run, release: registry.modelRelease, cohort, horizon, policy: { ...defaultModelingPolicy, scoringWorkLimit: limit } });
  if (value.kind !== "ready") throw new Error(JSON.stringify(value));
  return value.domain;
}

describe("one trajectory for reservations and rain demand", () => {
  it("reserves to the latest retained completion and scores each replay only until its own harvest", () => {
    const domain = prepared();
    const placement = domain.placement(0, 0);
    expect(placement).toMatchObject({ earliestEndOffset: 2, latestEndOffset: 4, availableOffset: 4 });
    if (!placement) return;
    const assessed = domain.assess([placement]);
    expect(assessed.assessment.occurrences[0].modeledTiming).toMatchObject({ earliestHarvest: "2026-07-02", latestHarvest: "2026-07-04" });
    expect(assessed.assessment.occurrences[0].modeledTiming?.replays.map(replay => replay.harvestOffset)).toEqual([3, 1]);
    expect(domain.diagnostics().scoredCropDays).toBe(6);
    expect(assessed.assessment.metrics.find(metric => metric.id === "unplanted_days")?.value).toEqual({ kind: "available", value: 8 });
  });
  it("retains cold noncompletion and proves no calendar only within the model", () => {
    const domain = prepared([20, 10]);
    expect(domain.placement(0, 0)).toBeNull();
    expect(domain.diagnostics().retainedReplayStarts).toHaveLength(2);
    expect(domain.diagnostics().crops[0].noncompletionByReplay[1].plantingDays).toBe(12);
    expect(findModelCalendar({ domain, rules: [], initialPredecessor: null, expansionLimit: 100 }).kind).toBe("proved_impossible");
  });
  it("keeps missing temperature distinct from observed cold weather", () => {
    const { run, registry, cohort } = setup(12);
    const broken = { ...cohort, usable: [{ ...cohort.usable[0], days: cohort.usable[0].days.map((day, index) => index ? day : { ...day, minC: { kind: "unavailable" as const, reason: "Missing test temperature" } }) }] };
    expect(prepareCropSeasons({ run, release: registry.modelRelease, cohort: broken, horizon: { start: run.input.planningStart, endExclusive: parseIsoDate("2026-07-13") }, policy: defaultModelingPolicy }).kind).toBe("insufficient_data");
  });
  it("stops scoring at its frozen work budget", () => {
    const domain = prepared([20], 0);
    const placement = domain.placement(0, 0);
    if (!placement) throw new Error("Expected test placement");
    expect(() => domain.assess([placement])).toThrow(ModelWorkLimit);
    expect(domain.diagnostics()).toMatchObject({ workLimitReached: true, scoredCropDays: 0 });
  });
  it("reuses trajectory scores across repeated candidate assessment", () => {
    const domain = prepared();
    const placement = domain.placement(0, 0);
    if (!placement) throw new Error("Expected test placement");
    expect(domain.assess([placement])).toEqual(domain.assess([placement]));
    expect(domain.diagnostics()).toMatchObject({ scoredCropDays: 6, aggregationVisits: 4 });
  });
});
