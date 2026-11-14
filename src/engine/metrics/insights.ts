import type { DailyWeather } from "@/contracts/climate";
import type { EvidenceValue } from "@/contracts/common";
import type { ClimateCohort, DateInterval, ReplaySeason } from "@/contracts/engine";
import { metric } from "./catalogue";
import { daysInMonth } from "./dates";
import { available } from "./evidence";
import { nearestRankQuantile } from "./quantile";

type Insight = ClimateCohort["insights"][number];

// Usable seasons hold only available values, so this never sees a gap.
const num = (v: EvidenceValue<number>): number => (v.kind === "available" ? v.value : Number.NaN);

/** Calendar months wholly inside the season, keyed by month number 1-12. */
function completeMonths(season: ReplaySeason): { month: number; days: DailyWeather[] }[] {
  const groups = new Map<string, DailyWeather[]>();
  for (const d of season.days) {
    const key = d.date.slice(0, 7);
    const group = groups.get(key);
    if (group) group.push(d);
    else groups.set(key, [d]);
  }
  return [...groups].flatMap(([key, days]) => {
    const [year, month] = key.split("-").map(Number);
    return days.length === daysInMonth(year, month) ? [{ month, days }] : [];
  });
}

function longestDrySpell(days: readonly DailyWeather[], threshold: number): number {
  let run = 0;
  let longest = 0;
  for (const d of days) {
    run = num(d.rainMm) < threshold ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

export function climateInsights(usable: readonly ReplaySeason[], dryDayThresholdMm: number): Insight[] {
  if (usable.length === 0) return [];
  const span: DateInterval = {
    start: usable.map(s => s.interval.start).reduce((a, b) => (a < b ? a : b)),
    endExclusive: usable.map(s => s.interval.endExclusive).reduce((a, b) => (a > b ? a : b)),
  };
  const samples = usable.flatMap(completeMonths);
  const monthly = Array.from({ length: 12 }, (_, i) => i + 1).flatMap(month => {
    const inMonth = samples.filter(s => s.month === month);
    if (inMonth.length === 0) return [];
    const totals = inMonth.map(s => s.days.reduce((sum, d) => sum + num(d.rainMm), 0));
    const days = inMonth.flatMap(s => s.days);
    const quantile = (p: number) => available(nearestRankQuantile(totals, p) ?? Number.NaN);
    const forMonth = (m: Insight["metric"]): Insight => ({ metric: m, period: available(span), month });
    return [
      forMonth(metric("monthly_rain_median", quantile(0.5), totals.length, "seasons")),
      forMonth(metric("monthly_rain_p10", quantile(0.1), totals.length, "seasons")),
      forMonth(metric("monthly_rain_p90", quantile(0.9), totals.length, "seasons")),
      forMonth(metric("monthly_mean_temperature", available(days.reduce((sum, d) => sum + num(d.meanC), 0) / days.length), days.length, "days")),
      forMonth(metric("wet_day_frequency", available(days.filter(d => num(d.rainMm) >= dryDayThresholdMm).length / days.length), days.length, "days")),
    ];
  });
  const spells = usable.map((s): Insight => ({
    metric: metric("longest_dry_spell", available(longestDrySpell(s.days, dryDayThresholdMm)), s.days.length, "days"),
    period: available(s.interval),
    month: null,
  }));
  return [...monthly, ...spells];
}
