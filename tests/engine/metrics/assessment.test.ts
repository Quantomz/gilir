import { describe, expect, it } from "vitest";
import type { MetricInput } from "@/contracts/engine";
import { assessmentMetricSchema, resultDetailsSchema } from "@/contracts/result";
import { assessClimate } from "@/engine/metrics";
import { metricInputFixture } from "@/fixtures/science";
import {
  DRY, WET, assessed, metric, metricInput, missing, occurrence, profile, season, seasons, value,
} from "./helpers";

const RANKING = [
  ["mean_frequency", "fraction"], ["mean_mismatch", "fraction"],
  ["unplanted_days", "days"], ["longest_unplanted_gap", "days"],
] as const;

const crop = profile({ id: "crop-a", stageDays: { initial: 2, development: 2, middle: 2, late: 1 } }); // 7 days, Kc 1
const plan = (cohort: MetricInput["cohort"], extra: Partial<Parameters<typeof metricInput>[0]> = {}) =>
  metricInput({ horizonDays: 365, profiles: [crop], occurrences: [occurrence(crop, "2026-07-01")], cohort, ...extra });

describe("shared synthetic fixture", () => {
  it("metricInputFixture is assessed: no shortfall, no heat, 361 days without a planned crop", () => {
    const a = assessed(assessClimate(metricInputFixture));
    expect(a.occurrences).toHaveLength(1);
    expect(value(a.metrics, "mean_frequency")).toBe(0);
    expect(value(a.metrics, "mean_mismatch")).toBe(0);
    expect(value(a.metrics, "unplanted_days")).toBe(361);
    expect(value(a.metrics, "longest_unplanted_gap")).toBe(361);
    expect(a.flagged).toBe(false);
  });
});

describe("result packaging", () => {
  it("returns the four fixed ranking components with their units", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, () => WET))));
    for (const [id, unit] of RANKING) {
      expect(metric(a.metrics, id).unit).toBe(unit);
      expect(metric(a.metrics, id).value.kind).toBe("available");
    }
  });

  it("rounds ranking metrics to 6 decimal places (1 dry season of 3 -> 0.333333)", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)))));
    expect(value(a.metrics, "mean_frequency")).toBe(0.333333);
    expect(value(a.metrics, "mean_mismatch")).toBe(0.333333);
  });

  it("q90_mismatch is the nearest-rank 90th percentile of season mismatch", () => {
    const nineDry = assessed(assessClimate(plan(seasons(10, 7, year => (year > 2016 ? DRY : WET)))));
    const oneDry = assessed(assessClimate(plan(seasons(10, 7, year => (year === 2025 ? DRY : WET)))));
    expect(value(nineDry.metrics, "q90_mismatch")).toBe(1); // sorted [0, 1 x9] -> 9th = 1
    expect(value(oneDry.metrics, "q90_mismatch")).toBe(0); //  sorted [0 x9, 1] -> 9th = 0
    expect(value(oneDry.metrics, "mean_mismatch")).toBe(0.1);
  });

  it("returns one season record per replay season, keyed by replay start, at both plan and crop level", () => {
    const cohort = seasons(3, 7, () => WET);
    const a = assessed(assessClimate(plan(cohort)));
    expect(a.seasonMetrics.map(s => s.replayStart)).toEqual(cohort.map(s => s.interval.start));
    expect(a.occurrences[0].seasonMetrics).toHaveLength(3);
    for (const s of a.seasonMetrics) {
      expect(s.metrics.some(m => m.id === "frequency")).toBe(true);
      expect(s.metrics.some(m => m.id === "mismatch")).toBe(true);
    }
  });

  it("occurrences echo the calendar's crop, profile and dates", () => {
    const input = plan(seasons(1, 7, () => WET));
    const a = assessed(assessClimate(input));
    const { seasonMetrics: _ignored, ...echo } = a.occurrences[0];
    expect(echo).toEqual(input.calendar.occurrences[0]);
  });

  it("every metric, warning and unassessed check matches the published result contract", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)))));
    const details = resultDetailsSchema.unwrap().shape;
    for (const m of [...a.metrics, ...a.seasonMetrics.flatMap(s => s.metrics), ...a.occurrences.flatMap(o => o.seasonMetrics.flatMap(s => s.metrics))]) {
      expect(() => assessmentMetricSchema.parse(m)).not.toThrow();
    }
    expect(() => details.warnings.parse(a.warnings)).not.toThrow();
    expect(() => details.unassessedChecks.parse(a.unassessedChecks)).not.toThrow();
  });
});

describe("flags and warnings", () => {
  it("a rain shortfall sets flagged and adds a rainfall_mismatch warning naming the crop", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)))));
    expect(a.flagged).toBe(true);
    expect(a.warnings.some(w => w.code === "rainfall_mismatch" && w.cropPurposeIds.includes(crop.cropPurposeId))).toBe(true);
  });

  it("no shortfall and no temperature exposure leaves the plan unflagged", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, () => WET))));
    expect(a.flagged).toBe(false);
    expect(a.warnings.some(w => w.code === "rainfall_mismatch")).toBe(false);
  });
});

describe("fail closed: missing water evidence gives insufficient_data", () => {
  const insufficient = (input: MetricInput) => {
    const result = assessClimate(input);
    expect(result.kind).toBe("insufficient_data");
    if (result.kind === "insufficient_data") expect(result.missing.length).toBeGreaterThan(0);
    return result;
  };

  it("zero crop demand everywhere (Kc 0) is not a perfect score", () => {
    const zero = profile({ id: "zero-kc", kc: { initial: 0, middle: 0, end: 0 } });
    insufficient(metricInput({ horizonDays: 365, profiles: [zero], occurrences: [occurrence(zero, "2026-07-01")], cohort: seasons(3, 4, () => DRY) }));
  });

  it("missing rain across a crop's only window is not read as 0 mm", () => {
    insufficient(plan([season("2025-07-01", 7, (_d, i) => (i === 3 ? { rainMm: missing() } : {}))]));
  });

  it("one crop without valid windows in one season blocks the assessment even if others are fine", () => {
    const cohort = [season("2025-07-01", 7, () => WET()), season("2024-07-01", 7, (_d, i) => (i === 3 ? { rainMm: missing() } : {}))];
    insufficient(plan(cohort));
  });

  it("an empty cohort", () => {
    insufficient(plan([]));
  });

  it("unavailable site elevation (ET0 cannot be computed)", () => {
    insufficient(plan(seasons(3, 7, () => WET), { elevationM: missing("No elevation.") }));
  });

  it("an occurrence whose profile is not supplied reports a crop_profile gap", () => {
    const result = insufficient(metricInput({ horizonDays: 365, profiles: [], occurrences: [occurrence(crop, "2026-07-01")], cohort: seasons(3, 7, () => WET) }));
    if (result.kind === "insufficient_data") expect(result.missing.some(g => g.code === "crop_profile")).toBe(true);
  });

  it("a missing temperature rule alone does not block the plan", () => {
    expect(assessClimate(plan(seasons(3, 7, () => WET))).kind).toBe("assessed");
  });
});

describe("rain-only invariance", () => {
  const baseline = plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)));

  it("the farmer's backup-water answer changes nothing (rain only)", () => {
    const withBackup = { ...baseline, water: "rain_plus_backup" } as MetricInput;
    expect(assessClimate(withBackup)).toEqual(assessClimate(baseline));
  });

  it.each(["water", "soil", "bad_year", "pests_weeds"] as const)("the retired priority field (%s) changes nothing", priority => {
    expect(assessClimate({ ...baseline, priority })).toEqual(assessClimate(baseline));
  });

  it("recorded vs skipped field history does not change any metric", () => {
    const skipped = assessed(assessClimate({ ...baseline, history: { kind: "skipped" } }));
    const recorded = assessed(assessClimate(baseline));
    expect(skipped.metrics).toEqual(recorded.metrics);
    expect(skipped.seasonMetrics).toEqual(recorded.seasonMetrics);
  });
});

describe("determinism", () => {
  it("the same input gives a deep-equal result and the input is not mutated", () => {
    const input = plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)));
    const before = structuredClone(input);
    const first = assessClimate(input);
    const second = assessClimate(input);
    expect(second).toEqual(first);
    expect(input).toEqual(before);
  });
});
