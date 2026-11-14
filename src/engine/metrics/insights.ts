import type { DailyWeather } from "@/contracts/climate";
import { parseIsoDate } from "@/contracts/common";
import type { IsoDate } from "@/contracts/common";
import type { ClimateCohort, DateInterval } from "@/contracts/engine";
import { metric } from "./catalogue";
import { addDays, daysBetween, daysInMonth } from "./dates";
import { available, unavailable } from "./evidence";
import { nearestRankQuantile } from "./quantile";

type Insight = ClimateCohort["insights"][number];

function completeValues(byDate: ReadonlyMap<IsoDate, DailyWeather>, interval: DateInterval, field: "rainMm" | "meanC"): number[] | null {
  const values: number[] = [];
  const length = daysBetween(interval.start, interval.endExclusive);
  for (let i = 0; i < length; i++) {
    const evidence = byDate.get(addDays(interval.start, i))?.[field];
    if (evidence?.kind !== "available") return null;
    values.push(evidence.value);
  }
  return values;
}

function completeMonths(byDate: ReadonlyMap<IsoDate, DailyWeather>, intervals: readonly DateInterval[]): { month: number; interval: DateInterval }[] {
  const dates = new Set<IsoDate>();
  for (const interval of intervals) {
    const length = daysBetween(interval.start, interval.endExclusive);
    for (let i = 0; i < length; i++) dates.add(addDays(interval.start, i));
  }
  const counts = new Map<string, number>();
  for (const date of [...dates].sort()) {
    if (!byDate.has(date)) continue;
    const key = date.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].flatMap(([key, count]) => {
    const [year, month] = key.split("-").map(Number);
    if (count !== daysInMonth(year, month)) return [];
    const start = parseIsoDate(`${key}-01`);
    return [{ month, interval: { start, endExclusive: addDays(start, count) } }];
  });
}

function longestDrySpell(rain: readonly number[], threshold: number): number {
  let run = 0;
  let longest = 0;
  for (const value of rain) {
    run = value < threshold ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

function span(intervals: readonly DateInterval[]): DateInterval {
  return {
    start: intervals.map(interval => interval.start).reduce((a, b) => a < b ? a : b),
    endExclusive: intervals.map(interval => interval.endExclusive).reduce((a, b) => a > b ? a : b),
  };
}

export function climateInsights(byDate: ReadonlyMap<IsoDate, DailyWeather>, intervals: readonly DateInterval[], dryDayThresholdMm: number): Insight[] {
  const samples = completeMonths(byDate, intervals);
  const monthly = Array.from({ length: 12 }, (_, i) => i + 1).flatMap(month => {
    const inMonth = samples.filter(s => s.month === month);
    const rain = inMonth.flatMap(sample => {
      const values = completeValues(byDate, sample.interval, "rainMm");
      return values === null ? [] : [{ interval: sample.interval, values }];
    });
    const temperature = inMonth.flatMap(sample => {
      const values = completeValues(byDate, sample.interval, "meanC");
      return values === null ? [] : [{ interval: sample.interval, values }];
    });
    const totals = rain.map(sample => sample.values.reduce((sum, value) => sum + value, 0));
    const rainDays = rain.flatMap(sample => sample.values);
    const temperatureDays = temperature.flatMap(sample => sample.values);
    const forMonth = (m: Insight["metric"], periods: readonly DateInterval[]): Insight => ({ metric: m, period: available(span(periods)), month });
    const rainPeriods = rain.map(sample => sample.interval);
    const temperaturePeriods = temperature.map(sample => sample.interval);
    const quantile = (p: number) => {
      const value = nearestRankQuantile(totals, p);
      return value === null ? unavailable<number>("No complete monthly precipitation sample.") : available(value);
    };
    const rainfall = rain.length === 0 ? [] : [
      forMonth(metric("monthly_rain_median", quantile(0.5), totals.length, "seasons"), rainPeriods),
      forMonth(metric("monthly_rain_p10", quantile(0.1), totals.length, "seasons"), rainPeriods),
      forMonth(metric("monthly_rain_p90", quantile(0.9), totals.length, "seasons"), rainPeriods),
    ];
    const meanTemperature = temperature.length === 0 ? [] : [
      forMonth(metric("monthly_mean_temperature", available(temperatureDays.reduce((sum, value) => sum + value, 0) / temperatureDays.length), temperatureDays.length, "days"), temperaturePeriods),
    ];
    const wetDays = rain.length === 0 ? [] : [
      forMonth(metric("wet_day_frequency", available(rainDays.filter(value => value >= dryDayThresholdMm).length / rainDays.length), rainDays.length, "days"), rainPeriods),
    ];
    return [...rainfall, ...meanTemperature, ...wetDays];
  });
  const spells = intervals.flatMap((interval): Insight[] => {
    const rain = completeValues(byDate, interval, "rainMm");
    return rain === null ? [] : [{
      metric: metric("longest_dry_spell", available(longestDrySpell(rain, dryDayThresholdMm)), rain.length, "days"),
      period: available(interval), month: null,
    }];
  });
  return [...monthly, ...spells];
}
