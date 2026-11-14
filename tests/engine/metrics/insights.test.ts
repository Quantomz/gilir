import { describe, expect, it } from "vitest";
import { assessmentMetricSchema } from "@/contracts/result";
import type { ClimateCohort } from "@/contracts/engine";
import { buildClimateCohort } from "@/engine/metrics";
import { cohortInput, history, missing } from "./helpers";

type Insight = ClimateCohort["insights"][number];
const find = (cohort: ClimateCohort, id: string, month: number | null) =>
  cohort.insights.filter(i => i.metric.id === id && i.month === month);
const one = (cohort: ClimateCohort, id: string, month: number | null): Insight => {
  const found = find(cohort, id, month);
  expect(found, `${id} month ${month}`).toHaveLength(1);
  return found[0];
};
const num = (i: Insight) => {
  if (i.metric.value.kind !== "available") throw new Error(`${i.metric.id} unavailable`);
  return i.metric.value.value;
};
const denom = (i: Insight) => {
  if (i.metric.denominator.kind !== "available") throw new Error(`${i.metric.id} denominator unavailable`);
  return i.metric.denominator.value;
};

// Calendar-year plan from 1 Jan 2027, cutoff 1 Jan 2027: seasons are calendar years 2002-2026.
// Rain pattern each year: 1 Jul = (year - 2001) * 10 mm, 2 Jul = 1.0 mm (wet), 3 Jul = 0.99 mm (dry),
// 1 Oct = 20 mm, every other day 0. Daily mean temperature = month number.
const rainFor = (date: string) => {
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (md === "07-01") return (year - 2001) * 10;
  if (md === "07-02") return 1.0;
  if (md === "07-03") return 0.99;
  if (md === "10-01") return 20;
  return 0;
};
const shape = (date: string) => ({ rainMm: rainFor(date), meanC: Number(date.slice(5, 7)) });
const calendarYears = history("1990-01-01", "2027-01-01", shape);
const base = { cutoff: "2027-01-01", horizonStart: "2027-01-01", horizonDays: 365 };
let memo: ClimateCohort | undefined;
// Built on first use inside a test, so a missing implementation fails each test rather than the whole file.
const yearCohort = () => (memo ??= buildClimateCohort(cohortInput({ days: calendarYears, ...base })));

describe("monthly rainfall distribution", () => {

  it("July totals 11.99..251.99 mm over 25 seasons: nearest-rank median, P10 and P90", () => {
    // July total = (year-2001)*10 + 1.99. Sorted k-th value = 10k + 1.99.
    expect(num(one(yearCohort(), "monthly_rain_median", 7))).toBeCloseTo(131.99, 6); // ceil(0.5*25) = 13th
    expect(num(one(yearCohort(), "monthly_rain_p10", 7))).toBeCloseTo(31.99, 6); //    ceil(0.1*25) = 3rd
    expect(num(one(yearCohort(), "monthly_rain_p90", 7))).toBeCloseTo(231.99, 6); //   ceil(0.9*25) = 23rd
  });

  it("states the real denominator: 25 seasons", () => {
    expect(denom(one(yearCohort(), "monthly_rain_median", 7))).toEqual({ count: 25, unit: "seasons" });
  });

  it("reports all twelve months", () => {
    for (let m = 1; m <= 12; m++) expect(find(yearCohort(), "monthly_rain_median", m)).toHaveLength(1);
  });

  it("a dry month reports 0 mm, not unavailable", () => {
    expect(num(one(yearCohort(), "monthly_rain_median", 3))).toBe(0);
  });

  it("a solar gap excludes a ranking season while preserving available monthly rainfall", () => {
    const days = calendarYears.map(d => {
      if (d.date === "2002-07-01") return { ...d, rainMm: { kind: "available" as const, value: 99_999 } };
      if (d.date === "2002-05-05") return { ...d, solarMjM2Day: missing() };
      return d;
    });
    const c = buildClimateCohort(cohortInput({ days, ...base }));
    expect(c.usable).toHaveLength(24);
    expect(denom(one(c, "monthly_rain_median", 7))).toEqual({ count: 25, unit: "seasons" });
    expect(num(one(c, "monthly_rain_p90", 7))).toBeCloseTo(241.99, 6);
  });
});

describe("wet-day frequency", () => {

  it("counts days with at least 1 mm: 1.0 mm is wet, 0.99 mm is not (July: 2 of 31 days)", () => {
    const july = one(yearCohort(), "wet_day_frequency", 7);
    expect(num(july)).toBeCloseTo(2 / 31, 10);
    expect(denom(july)).toEqual({ count: 31 * 25, unit: "days" });
    expect(july.metric.unit).toBe("fraction");
  });

  it("a month with no rain has frequency 0", () => {
    expect(num(one(yearCohort(), "wet_day_frequency", 2))).toBe(0);
  });
});

describe("longest dry spell", () => {
  it("one value per complete precipitation replay period, dry day < 1 mm", () => {
    const cohort = yearCohort();
    const spells = find(cohort, "longest_dry_spell", null);
    expect(spells).toHaveLength(25);
    const bySeason = (start: string) => spells.find(s => s.period.kind === "available" && s.period.value.start === start)!;
    // 1 Jan .. 30 Jun is the longest run: 181 days, 182 in a leap year.
    expect(num(bySeason("2025-01-01"))).toBe(181);
    expect(num(bySeason("2024-01-01"))).toBe(182);
    expect(bySeason("2025-01-01").metric.unit).toBe("days");
  });

  it("a dry spell runs across 31 December inside one season", () => {
    // Plan starts 1 Jul: dry from 3 Jul (0.99 mm) .. 30 Sep, then 2 Oct .. 30 Jun next year.
    const cohort = buildClimateCohort(cohortInput({ days: calendarYears, cutoff: "2027-01-01", horizonStart: "2026-07-01", horizonDays: 365 }));
    const spells = find(cohort, "longest_dry_spell", null);
    const s = spells.find(x => x.period.kind === "available" && x.period.value.start === "2024-07-01")!;
    expect(num(s)).toBe(272); // 2 Oct 2024 .. 30 Jun 2025 = 91 + 181
  });
});

describe("temperature insights", () => {
  it("monthly mean temperature over 25 seasons", () => {
    const cohort = yearCohort();
    const july = one(cohort, "monthly_mean_temperature", 7);
    expect(num(july)).toBeCloseTo(7, 10);
    expect(july.metric.unit).toBe("degC");
  });
});

describe("insight records", () => {
  it("every insight is a valid AssessmentMetric with an available denominator", () => {
    const cohort = yearCohort();
    expect(cohort.insights.length).toBeGreaterThan(0);
    for (const i of cohort.insights) {
      expect(() => assessmentMetricSchema.parse(i.metric)).not.toThrow();
      expect(i.metric.denominator.kind).toBe("available");
    }
  });
});
