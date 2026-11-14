import { describe, expect, it } from "vitest";
import type { EvidenceValue } from "@/contracts/common";
import { assessClimate } from "@/engine/metrics";
import { rollingMismatch } from "@/engine/metrics/water";
import {
  DRY, WET, assessed, av, metricInput, missing, occurrence, profile, season, seasons, value,
} from "./helpers";

const series = (values: readonly (number | null)[]): EvidenceValue<number>[] =>
  values.map(v => (v === null ? missing() : av(v)));
const ok = (result: ReturnType<typeof rollingMismatch>) => {
  if (result.kind !== "available") throw new Error(`unavailable: ${result.reason}`);
  return result.value;
};

describe("rolling 7-day rain-demand mismatch (hand-calculated)", () => {
  it("9 days, demand 4 mm/day, rain [0,0,10,0,0,0,0,30,0]: F = 1/3, M = 0.214286", () => {
    // w0 days 0-6: D 28, P 10 -> r = 18/28 = 0.642857. w1 days 1-7: P 40 -> r 0. w2 days 2-8: P 40 -> r 0.
    const r = ok(rollingMismatch(series(Array(9).fill(4)), series([0, 0, 10, 0, 0, 0, 0, 30, 0]), 7));
    expect(r.validWindows).toBe(3);
    expect(r.frequency).toBeCloseTo(1 / 3, 10);
    expect(r.mismatch).toBeCloseTo(18 / 28 / 3, 10);
  });

  it("a crop shorter than 7 days uses its whole interval as one window", () => {
    const r = ok(rollingMismatch(series([2, 2, 2, 2]), series([1, 1, 1, 1]), 7));
    expect(r).toEqual({ frequency: 1, mismatch: 0.5, validWindows: 1 });
  });

  it("excludes zero-demand windows rather than scoring them", () => {
    // w0 (days 0-6) has D = 0 and is skipped; w1 (days 1-7) has D = 5, P = 0 -> r = 1.
    const r = ok(rollingMismatch(series([0, 0, 0, 0, 0, 0, 0, 5]), series(Array(8).fill(0)), 7));
    expect(r).toEqual({ frequency: 1, mismatch: 1, validWindows: 1 });
  });

  it("all-zero demand is unavailable, not a perfect score", () => {
    expect(rollingMismatch(series(Array(10).fill(0)), series(Array(10).fill(0)), 7).kind).toBe("unavailable");
  });

  it("skips a window with missing rain instead of reading it as 0 mm", () => {
    // Day 0 rain missing: w0 skipped. w1 (days 1-7) gets 100 mm on day 7 -> r 0.
    // Reading the gap as 0 mm would instead give w0 r = 1 and F = 0.5.
    const r = ok(rollingMismatch(series(Array(8).fill(1)), series([null, 0, 0, 0, 0, 0, 0, 100]), 7));
    expect(r).toEqual({ frequency: 0, mismatch: 0, validWindows: 1 });
  });

  it("skips a window with missing demand (ET0 unavailable)", () => {
    const r = ok(rollingMismatch(series([null, 1, 1, 1, 1, 1, 1, 1]), series([0, 0, 0, 0, 0, 0, 0, 100]), 7));
    expect(r).toEqual({ frequency: 0, mismatch: 0, validWindows: 1 });
  });

  it("is unavailable when every window has a gap", () => {
    expect(rollingMismatch(series(Array(7).fill(1)), series([0, 0, 0, null, 0, 0, 0]), 7).kind).toBe("unavailable");
  });

  it("does not carry surplus rain from one window into a later one (no soil storage)", () => {
    // 14 days, 200 mm on day 0 only: w0 covered, w1..w7 all r = 1.
    const r = ok(rollingMismatch(series(Array(14).fill(5)), series([200, ...Array(13).fill(0)]), 7));
    expect(r.validWindows).toBe(8);
    expect(r.frequency).toBeCloseTo(7 / 8, 10);
    expect(r.mismatch).toBeCloseTo(7 / 8, 10);
  });

  it("partial shortfall: D 7, P 3.5 in a single window gives r = 0.5", () => {
    expect(ok(rollingMismatch(series(Array(7).fill(1)), series([3.5, 0, 0, 0, 0, 0, 0]), 7)))
      .toEqual({ frequency: 1, mismatch: 0.5, validWindows: 1 });
  });
});

describe("worst-crop aggregation through assessClimate", () => {
  const dry = profile({ id: "dry-crop" });
  const wet = profile({ id: "wet-crop" });
  // Plan from 1 Jul: 4-day dry crop on days 0-3 (rain 0), 4-day wet crop on days 7-10 (rain 100 mm/day).
  const split = (_date: string, i: number) => ({ rainMm: i < 7 ? 0 : 100 });
  const twoCrops = metricInput({
    horizonDays: 365,
    profiles: [dry, wet],
    occurrences: [occurrence(dry, "2026-07-01"), occurrence(wet, "2026-07-08")],
    cohort: [season("2025-07-01", 14, split)],
  });

  it("season F and M take the worst crop (1), not the average (0.5)", () => {
    const a = assessed(assessClimate(twoCrops));
    expect(value(a.seasonMetrics[0].metrics, "frequency")).toBe(1);
    expect(value(a.seasonMetrics[0].metrics, "mismatch")).toBe(1);
    expect(value(a.metrics, "mean_frequency")).toBe(1);
    expect(value(a.metrics, "mean_mismatch")).toBe(1);
  });

  it("per-occurrence season metrics keep each crop's own value", () => {
    const a = assessed(assessClimate(twoCrops));
    const byCrop = (id: string) => a.occurrences.find(o => o.cropPurposeId === id)!.seasonMetrics[0].metrics;
    expect(value(byCrop("dry-crop"), "frequency")).toBe(1);
    expect(value(byCrop("wet-crop"), "frequency")).toBe(0);
  });

  it("adding wet repeats of another crop cannot dilute the dry crop's score", () => {
    const shape = (_d: string, i: number) => ({ rainMm: i < 7 ? 0 : 100 });
    const alone = metricInput({
      horizonDays: 365, profiles: [dry, wet],
      occurrences: [occurrence(dry, "2026-07-01")],
      cohort: [season("2025-07-01", 28, shape)],
    });
    const withRepeats = metricInput({
      horizonDays: 365, profiles: [dry, wet],
      occurrences: [occurrence(dry, "2026-07-01"), occurrence(wet, "2026-07-08"), occurrence(wet, "2026-07-15"), occurrence(wet, "2026-07-22")],
      cohort: [season("2025-07-01", 28, shape)],
    });
    const a = assessed(assessClimate(alone));
    const b = assessed(assessClimate(withRepeats));
    expect(value(b.metrics, "mean_frequency")).toBe(value(a.metrics, "mean_frequency"));
    expect(value(b.metrics, "mean_mismatch")).toBe(value(a.metrics, "mean_mismatch"));
  });

  it("mean_frequency / mean_mismatch average the worst-crop values over seasons", () => {
    const crop = profile({ id: "solo", stageDays: { initial: 2, development: 2, middle: 2, late: 1 } });
    const input = metricInput({
      horizonDays: 365, profiles: [crop],
      occurrences: [occurrence(crop, "2026-07-01")],
      cohort: seasons(4, 7, year => (year === 2025 ? DRY : WET)),
    });
    const a = assessed(assessClimate(input));
    expect(value(a.metrics, "mean_frequency")).toBe(0.25);
    expect(value(a.metrics, "mean_mismatch")).toBe(0.25);
    expect(a.metrics.find(m => m.id === "mean_frequency")!.denominator).toEqual({ kind: "available", value: { count: 4, unit: "seasons" } });
  });
});
