import { describe, expect, it } from "vitest";
import type { CalendarOccurrence } from "@/contracts/result";
import { assessClimate } from "@/engine/metrics";
import { DRY, WET, assessed, metric, metricInput, occurrence, profile, season, value } from "./helpers";

// 32-day plan from 1 Jul 2026 (day 0 = 1 Jul).
const grain = profile({ id: "grain", family: "Poaceae", stageDays: { initial: 2, development: 2, middle: 2, late: 2 } }); // 8 days
const bean = profile({ id: "bean", family: "Fabaceae", isLegume: true, stageDays: { initial: 2, development: 3, middle: 3, late: 2 } }); // 10 days
const dayOf = (offset: number) => `2026-07-${String(offset + 1).padStart(2, "0")}`;

function schedule(occurrences: CalendarOccurrence[], weather = WET) {
  return assessed(assessClimate(metricInput({
    horizonDays: 32, profiles: [grain, bean], occurrences,
    cohort: [season("2025-07-01", 32, weather)],
  })));
}

describe("days without a planned crop", () => {
  // grain days 2-9, bean days 15-24: occupied 18; gaps 0-1 (2), 10-14 (5), 25-31 (7).
  const plan = [occurrence(grain, dayOf(2)), occurrence(bean, dayOf(15))];

  it("unplanted days = plan length - union of crop intervals (32 - 18 = 14)", () => {
    expect(value(schedule(plan).metrics, "unplanted_days")).toBe(14);
  });

  it("longest unplanted gap is the longest run outside crop intervals, including the start and end of the plan (7)", () => {
    expect(value(schedule(plan).metrics, "longest_unplanted_gap")).toBe(7);
  });

  it("uses days as the unit", () => {
    const a = schedule(plan);
    expect(metric(a.metrics, "unplanted_days").unit).toBe("days");
    expect(metric(a.metrics, "longest_unplanted_gap").unit).toBe("days");
  });

  it("turnaround days between harvest and field availability count as unplanted", () => {
    const withTurnaround = [occurrence(grain, dayOf(2), 3), occurrence(bean, dayOf(15))];
    expect(value(schedule(withTurnaround).metrics, "unplanted_days")).toBe(14);
  });

  it("overlapping intervals are counted once (union, not sum)", () => {
    // grain 0-7, bean 4-13 -> union 0-13 = 14 days; unplanted 18; longest gap 14-31 = 18.
    const a = schedule([occurrence(grain, dayOf(0)), occurrence(bean, dayOf(4))]);
    expect(value(a.metrics, "unplanted_days")).toBe(18);
    expect(value(a.metrics, "longest_unplanted_gap")).toBe(18);
  });

  it("depends on the schedule only, not on the weather", () => {
    const wet = schedule(plan, WET);
    const dry = schedule(plan, DRY);
    expect(value(dry.metrics, "unplanted_days")).toBe(value(wet.metrics, "unplanted_days"));
    expect(value(dry.metrics, "longest_unplanted_gap")).toBe(value(wet.metrics, "longest_unplanted_gap"));
  });
});

describe("crop family and legume counts", () => {
  it("counts distinct families and legume occurrences", () => {
    const a = schedule([occurrence(grain, dayOf(2)), occurrence(bean, dayOf(15))]);
    expect(value(a.metrics, "crop_family_count")).toBe(2);
    expect(value(a.metrics, "legume_crop_count")).toBe(1);
    expect(metric(a.metrics, "crop_family_count").unit).toBe("count");
  });

  it("a repeated legume adds a legume occurrence but not a family", () => {
    // grain 0-7, bean 8-17, bean 18-27: occupied 28, unplanted 4 (28-31).
    const a = schedule([occurrence(grain, dayOf(0)), occurrence(bean, dayOf(8)), occurrence(bean, dayOf(18))]);
    expect(value(a.metrics, "crop_family_count")).toBe(2);
    expect(value(a.metrics, "legume_crop_count")).toBe(2);
    expect(value(a.metrics, "unplanted_days")).toBe(4);
    expect(value(a.metrics, "longest_unplanted_gap")).toBe(4);
  });
});
