import { describe, expect, it } from "vitest";
import { defaultEngineSettings } from "@/contracts/climate";
import type { ClimateCohort } from "@/contracts/engine";
import { buildClimateCohort } from "@/engine/metrics";
import { addDays, cohortInput, daysBetween, history, missing } from "./helpers";

const starts = (cohort: ClimateCohort) => cohort.usable.map(s => s.interval.start).sort();
const coverage = (cohort: ClimateCohort) => {
  if (cohort.coverage.kind !== "available") throw new Error("coverage unavailable");
  return cohort.coverage.value;
};
const years = (from: number, to: number, monthDay: string) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${from + i}-${monthDay}`);

// 37 years of complete daily data; individual tests punch holes where needed.
const fullHistory = history("1990-01-01", "2027-01-01");

describe("replay season selection", () => {
  it("targets the 25 most recent seasons that end on or before the data cutoff", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30 }));
    expect(starts(cohort)).toEqual(years(2002, 2026, "03-15"));
    expect(cohort.gaps).toEqual([]);
  });

  it("excludes a season that would end after the cutoff (one-year horizon)", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 365 }));
    // 2026-03-15 + 365 days ends after 2027-01-01, so the newest season starts 2025-03-15.
    expect(starts(cohort)).toEqual(years(2001, 2025, "03-15"));
  });

  it("each season holds the plan's length of real consecutive UTC dates starting on its anchor", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30 }));
    for (const s of cohort.usable) {
      expect(s.days).toHaveLength(30);
      expect(daysBetween(s.interval.start, s.interval.endExclusive)).toBe(30);
      s.days.forEach((d, i) => expect(d.date).toBe(addDays(s.interval.start, i)));
    }
  });

  it("crosses 31 December into the next year", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2026-12-20", horizonDays: 30 }));
    const s = cohort.usable.find(x => x.interval.start === "2024-12-20");
    expect(s).toBeDefined();
    expect(s!.days.map(d => d.date)).toContain("2024-12-31");
    expect(s!.days.map(d => d.date)).toContain("2025-01-01");
    expect(s!.interval.endExclusive).toBe("2025-01-19");
  });

  it("maps a 29 February anchor to 28 February in non-leap years and keeps 29 February in leap years", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2028-02-29", horizonDays: 30 }));
    const s = starts(cohort);
    expect(s).toContain("2026-02-28");
    expect(s).toContain("2024-02-29");
    expect(s).toContain("2023-02-28");
    expect(s).not.toContain("2023-03-01");
  });

  it("keeps the same day count when a season crosses a leap day", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2026-03-01", horizonDays: 365 }));
    const leap = cohort.usable.find(x => x.interval.start === "2023-03-01");
    expect(leap).toBeDefined();
    expect(leap!.days).toHaveLength(365);
    expect(leap!.interval.endExclusive).toBe("2024-02-29");
  });

  it("honours the run's settings for target and minimum seasons", () => {
    const settings = { ...defaultEngineSettings, targetSeasons: 5, minimumUsableSeasons: 3 };
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30, settings }));
    expect(starts(cohort)).toEqual(years(2022, 2026, "03-15"));
    expect(coverage(cohort)).toMatchObject({ targetSeasons: 5, minimumUsableSeasons: 3 });
  });

  it("gives the same cohort when the snapshot's days arrive out of order", () => {
    const input = { cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30 };
    const ordered = buildClimateCohort(cohortInput({ days: fullHistory, ...input }));
    const shuffled = buildClimateCohort(cohortInput({ days: [...fullHistory].reverse(), ...input }));
    expect(shuffled).toEqual(ordered);
  });
});

describe("completeness gate", () => {
  const holeOn = (date: string, field: "rainMm" | "solarMjM2Day") =>
    fullHistory.map(d => (d.date === date ? { ...d, [field]: missing() } : d));
  const base = { cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30 };

  it("excludes a season with one missing rain day and never treats it as 0 mm", () => {
    const cohort = buildClimateCohort(cohortInput({ days: holeOn("2010-03-20", "rainMm"), ...base }));
    expect(starts(cohort)).not.toContain("2010-03-15");
    expect(cohort.usable).toHaveLength(24);
    const excluded = coverage(cohort).seasons.filter(s => s.status === "excluded");
    expect(excluded).toHaveLength(1);
    expect(excluded[0].interval.start).toBe("2010-03-15");
    if (excluded[0].status === "excluded") expect(excluded[0].reason.length).toBeGreaterThan(0);
  });

  it("excludes a season missing any other required variable (solar radiation)", () => {
    const cohort = buildClimateCohort(cohortInput({ days: holeOn("2015-04-01", "solarMjM2Day"), ...base }));
    expect(starts(cohort)).not.toContain("2015-03-15");
  });

  it("excludes a season whose date is absent from the record entirely", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory.filter(d => d.date !== "2018-03-16"), ...base }));
    expect(starts(cohort)).not.toContain("2018-03-15");
  });

  it("does not replace an excluded season with an older year", () => {
    const cohort = buildClimateCohort(cohortInput({ days: holeOn("2010-03-20", "rainMm"), ...base }));
    expect(starts(cohort)).not.toContain("2001-03-15");
    expect(coverage(cohort).seasons).toHaveLength(25);
  });

  it("reports coverage: targets, method version and every season's status", () => {
    const cohort = buildClimateCohort(cohortInput({ days: holeOn("2010-03-20", "rainMm"), ...base }));
    const c = coverage(cohort);
    expect(c.targetSeasons).toBe(25);
    expect(c.minimumUsableSeasons).toBe(15);
    expect(c.methodVersion.length).toBeGreaterThan(0);
    expect(c.seasons.filter(s => s.status === "usable")).toHaveLength(24);
  });

  it("passes with exactly 15 usable seasons", () => {
    const cohort = buildClimateCohort(cohortInput({ days: history("2012-01-01", "2027-01-01"), ...base }));
    expect(cohort.usable).toHaveLength(15);
    expect(cohort.gaps).toEqual([]);
  });

  it("fewer than 15 usable seasons adds a climate gap and still returns usable seasons and insights", () => {
    const cohort = buildClimateCohort(cohortInput({ days: history("2017-01-01", "2027-01-01"), ...base }));
    expect(cohort.usable).toHaveLength(10);
    expect(cohort.gaps.some(g => g.code === "climate")).toBe(true);
    expect(cohort.insights.length).toBeGreaterThan(0);
  });

  it("lists seasons before the record starts as excluded rather than inventing data", () => {
    const cohort = buildClimateCohort(cohortInput({ days: history("2017-01-01", "2027-01-01"), ...base }));
    const c = coverage(cohort);
    expect(c.seasons).toHaveLength(25);
    expect(c.seasons.filter(s => s.status === "excluded")).toHaveLength(15);
  });
});

describe("lookback days", () => {
  const base = { cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30, lookbackDays: 3 };

  it("attaches the requested days before each season start", () => {
    const cohort = buildClimateCohort(cohortInput({ days: fullHistory, ...base }));
    const s = cohort.usable.find(x => x.interval.start === "2020-03-15")!;
    expect(s.lookbackDays.map(d => d.date)).toEqual(["2020-03-12", "2020-03-13", "2020-03-14"]);
  });

  it("excludes a season whose lookback has a missing required value", () => {
    const days = fullHistory.map(d => (d.date === "2020-03-13" ? { ...d, rainMm: missing() } : d));
    const cohort = buildClimateCohort(cohortInput({ days, ...base }));
    expect(starts(cohort)).not.toContain("2020-03-15");
  });
});

describe("annual applicability climate", () => {
  // Rain 1 mm and mean temperature 20 degC every day; 365-day plan from 1 Mar gives 25 replay years of 365 days.
  const steady = history("1990-01-01", "2027-01-01", () => ({ rainMm: 1, meanC: 20 }));
  const yearPlan = { cutoff: "2027-01-01", horizonStart: "2027-03-01", horizonDays: 365 };

  it("averages replay-year rain totals and daily mean temperature over the usable seasons", () => {
    const { applicabilityClimate } = buildClimateCohort(cohortInput({ days: steady, ...yearPlan }));
    expect(applicabilityClimate.meanAnnualPrecipitationMm).toEqual({ kind: "available", value: 365 });
    expect(applicabilityClimate.meanAnnualTemperatureC.kind).toBe("available");
    if (applicabilityClimate.meanAnnualTemperatureC.kind === "available") expect(applicabilityClimate.meanAnnualTemperatureC.value).toBeCloseTo(20, 10);
  });

  it("uses only usable seasons: an excluded wet year does not move the annual rain", () => {
    const days = steady.map(d => (d.date === "2010-06-01" ? { ...d, rainMm: { kind: "available" as const, value: 5_000 }, solarMjM2Day: missing() } : d));
    const { applicabilityClimate } = buildClimateCohort(cohortInput({ days, ...yearPlan }));
    expect(applicabilityClimate.meanAnnualPrecipitationMm).toEqual({ kind: "available", value: 365 });
  });

  it("is unavailable, with a reason, when replay seasons are shorter than a year", () => {
    const { applicabilityClimate } = buildClimateCohort(cohortInput({ days: steady, cutoff: "2027-01-01", horizonStart: "2027-03-15", horizonDays: 30 }));
    for (const value of [applicabilityClimate.meanAnnualPrecipitationMm, applicabilityClimate.meanAnnualTemperatureC]) {
      expect(value.kind).toBe("unavailable");
      if (value.kind === "unavailable") expect(value.reason.length).toBeGreaterThan(0);
    }
  });

  it("is unavailable when fewer than the minimum usable seasons remain", () => {
    const short = history("2017-01-01", "2027-01-01", () => ({ rainMm: 1, meanC: 20 }));
    const { applicabilityClimate } = buildClimateCohort(cohortInput({ days: short, ...yearPlan }));
    expect(applicabilityClimate.meanAnnualPrecipitationMm.kind).toBe("unavailable");
    expect(applicabilityClimate.meanAnnualTemperatureC.kind).toBe("unavailable");
  });

  it("records the annual aggregation method in the cohort method version", () => {
    const cohort = buildClimateCohort(cohortInput({ days: steady, ...yearPlan }));
    if (cohort.coverage.kind !== "available") throw new Error("coverage unavailable");
    expect(cohort.coverage.value.methodVersion).toMatch(/annual/i);
  });
});
