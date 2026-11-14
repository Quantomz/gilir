import { describe, expect, it, vi } from "vitest";
import { calculate, rankCandidates } from "@/engine";
import type { FrozenRun, MetricInput } from "@/contracts/engine";
import type { CropProfile } from "@/contracts/registry";
import { syntheticRegistrySchema } from "@/contracts/registry";
import { parseFarmInput } from "@/contracts/input";
import { parsePlanResult } from "@/contracts/result";
import { calendarKey } from "@/engine/search/calendar";
import { assessment, candidate, date, historyRun, occurrence, options, profile, registry } from "./fixtures";

function sameDateModels() {
  const base = profile("crop-a", 8);
  const p: CropProfile = { ...base, timing: { ...base.timing,
    generatedStageDays: { initial: 5, development: 1, middle: 1, late: 1 },
    historicalStageAllocations: [{ initial: 1, development: 1, middle: 5, late: 1 }],
    plantingWindows: [{ basis: "hard_constraint", sourceIds: base.sourceIds,
      window: { startMonthDay: "07-01", endMonthDayInclusive: "07-01" } }],
  } };
  const previous = historyRun(p);
  const value: FrozenRun = { ...previous, settings: { ...previous.settings, gridExpansionLimit: 2, scoredCandidateLimit: 1 },
    input: { ...previous.input, history: { kind: "recorded", start: date("2025-07-01"), endExclusive: date("2026-07-01"), entries: [
      { kind: "crop", id: "previous-crop", crop: { kind: "catalogue", cropPurposeId: p.cropPurposeId },
        planted: date("2025-07-01"), harvested: date("2025-07-08"), plantedPrecision: "exact", harvestedPrecision: "exact" },
      { kind: "fallow", id: "known-fallow", start: date("2025-07-09"), endExclusive: date("2026-07-01") },
    ] } } };
  const release = registry([p]);
  parseFarmInput(value.input);
  syntheticRegistrySchema.parse(release);
  return { p, value, release };
}

const modelAssessment = (input: MetricInput) => assessment(input.calendar,
  input.calendar.origin === "baseline" ? [0.5, 0.2, 357, 357] : [0.1, 0.1, 357, 357]);

describe("origin-sensitive assessment identity", () => {
  it("assesses and selects a better generated stage model with unchanged dates", () => {
    const { p, value, release } = sameDateModels();
    const before = structuredClone({ value, release });
    const assess = vi.fn(modelAssessment);
    const result = calculate(value, release, options(assess));
    expect(result.state).toBe("plan");
    expect(result.details.search).toMatchObject({ structural: "witness", structuralExpandedStates: 0,
      ranking: "grid_complete", gridExpandedStates: 2, scoredCandidates: 1 });
    expect(assess.mock.calls.map(([input]) => input.calendar.origin)).toEqual(["baseline", "generated"]);
    expect(result.details.explanation).toContain("mean_frequency: 0.1 versus 0.5 fraction");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", eligible: true, recommendation: "changed", changes: [],
      deltas: [
        { metricId: "mean_frequency", difference: { kind: "available", value: -0.4 } },
        { metricId: "mean_mismatch", difference: { kind: "available", value: -0.1 } },
        { metricId: "unplanted_days", difference: { kind: "available", value: 0 } },
        { metricId: "longest_unplanted_gap", difference: { kind: "available", value: 0 } },
      ] });
    if (result.state !== "plan") return;
    expect(result.plan.occurrences).toEqual([{ ...occurrence(p, "2026-07-01", 8), seasonMetrics: [] }]);
    expect(result.plan.rankingTuple.components[0].value).toBe(0.1);
    expect(parsePlanResult(result)).toEqual(result);
    expect({ value, release }).toEqual(before);
  });

  it.each([
    { structuralExpansionLimit: 0, gridExpansionLimit: 0, scoredCandidateLimit: 0 },
    { structuralExpansionLimit: 0, gridExpansionLimit: 0, scoredCandidateLimit: 1 },
    { structuralExpansionLimit: 0, gridExpansionLimit: 2, scoredCandidateLimit: 0 },
  ])("preserves an eligible baseline seed under zero budgets %#", settings => {
    const { value, release } = sameDateModels();
    const assess = vi.fn(modelAssessment);
    const result = calculate({ ...value, settings: { ...value.settings, ...settings } }, release, options(assess));
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", eligible: true, recommendation: "kept" });
    expect(result.details.search).toMatchObject({ structural: "witness", structuralExpandedStates: 0,
      ranking: "limit_reached", scoredCandidates: 0 });
    expect(assess.mock.calls.map(([input]) => input.calendar.origin)).toEqual(["baseline"]);
    expect(parsePlanResult(result)).toEqual(result);
  });

  it.each([false, true])("retains the same-date baseline runner-up with environmental flags %s", flagged => {
    const generated = candidate("crop-a", [0.1, 0.1, 20, 10]);
    const baseline = candidate("crop-a", [0.5, 0.2, 20, 10], flagged, "baseline");
    const key = '[["crop-a","crop-a-profile","synthetic-v1","2026-07-01","2026-07-04","2026-07-05"]]';
    expect(calendarKey(generated.calendar)).toBe(key);
    expect(calendarKey(baseline.calendar)).toBe(key);
    for (const candidates of [[baseline, generated], [generated, baseline]]) {
      const ranked = rankCandidates({ candidates, rankingDecimalPlaces: 6 });
      expect(ranked.kind).toBe("selected");
      if (ranked.kind !== "selected") return;
      expect(ranked.candidate).toBe(generated);
      expect(ranked.decision).toEqual(flagged
        ? { kind: "environmental_pool", comparedCalendarKey: key, selectedFlagged: false, otherFlagged: true }
        : { kind: "metric", comparedCalendarKey: key, metricId: "mean_frequency", unit: "fraction", selectedValue: 0.1, otherValue: 0.5 });
    }
  });

  it("collapses same-origin duplicate assessments without losing the other model", () => {
    const generated = candidate("crop-a", [0.1, 0.1, 20, 10]);
    const baseline = candidate("crop-a", [0.5, 0.2, 20, 10], false, "baseline");
    const ranked = rankCandidates({ candidates: [generated, baseline, generated, baseline], rankingDecimalPlaces: 6 });
    expect(ranked).toMatchObject({ kind: "selected", candidate: generated,
      decision: { kind: "metric", comparedCalendarKey: calendarKey(baseline.calendar), selectedValue: 0.1, otherValue: 0.5 } });
    for (const duplicate of [generated, baseline]) {
      expect(rankCandidates({ candidates: [duplicate, duplicate], rankingDecimalPlaces: 6 }))
        .toMatchObject({ kind: "selected", candidate: duplicate, decision: { kind: "only_candidate" } });
    }
  });

  it("keeps an equal-metric baseline after assessing the generated model", () => {
    const { value, release } = sameDateModels();
    const assess = vi.fn((input: MetricInput) => assessment(input.calendar));
    const result = calculate(value, release, options(assess));
    expect(result.details.baseline).toMatchObject({ kind: "assessed", recommendation: "kept", changes: [] });
    expect(result.details.explanation).toContain("baseline tie rule");
    expect(result.details.search).toMatchObject({ ranking: "grid_complete", gridExpandedStates: 2, scoredCandidates: 1 });
    expect(assess.mock.calls.map(([input]) => input.calendar.origin)).toEqual(["baseline", "generated"]);
  });
});
