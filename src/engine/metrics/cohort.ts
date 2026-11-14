import type { DailyWeather, WeatherField } from "@/contracts/climate";
import type { IsoDate } from "@/contracts/common";
import type { ClimateCohort, CohortInput, DateInterval, ReplaySeason } from "@/contracts/engine";
import { addDays, anchorDate, daysBetween } from "./dates";
import { available, unavailable } from "./evidence";
import { climateInsights } from "./insights";

const METHOD_VERSION = "replay-v1: anchor on the plan's month-day, 29 Feb maps to 28 Feb in non-leap years, consecutive UTC days, no gap filling";
const requiredFields: readonly WeatherField[] = ["rainMm", "meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"];

type Candidate =
  | { readonly status: "usable"; readonly season: ReplaySeason }
  | { readonly status: "excluded"; readonly interval: DateInterval; readonly reason: string };

/** The `target` most recent anchor years whose season ends on or before the cutoff, newest first. */
function candidateIntervals(horizonStart: IsoDate, length: number, cutoff: IsoDate, target: number): DateInterval[] {
  const monthDay = horizonStart.slice(5);
  const intervals: DateInterval[] = [];
  for (let year = Number(horizonStart.slice(0, 4)) - 1; intervals.length < target; year--) {
    const start = anchorDate(year, monthDay);
    const endExclusive = addDays(start, length);
    if (endExclusive <= cutoff) intervals.push({ start, endExclusive });
  }
  return intervals;
}

function collect(byDate: ReadonlyMap<string, DailyWeather>, start: IsoDate, count: number): DailyWeather[] | string {
  const out: DailyWeather[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const day = byDate.get(date);
    if (!day) return `No weather record for ${date}.`;
    const gap = requiredFields.find(field => day[field].kind !== "available");
    if (gap) return `Missing ${gap} on ${date}.`;
    out.push(day);
  }
  return out;
}

function replay(byDate: ReadonlyMap<string, DailyWeather>, interval: DateInterval, lookbackDays: number): Candidate {
  const lookback = collect(byDate, addDays(interval.start, -lookbackDays), lookbackDays);
  if (typeof lookback === "string") return { status: "excluded", interval, reason: `Lookback incomplete: ${lookback}` };
  const days = collect(byDate, interval.start, daysBetween(interval.start, interval.endExclusive));
  if (typeof days === "string") return { status: "excluded", interval, reason: days };
  return { status: "usable", season: { interval, lookbackDays: lookback, days } };
}

export function buildClimateCohort({ run, horizon, lookbackDays }: CohortInput): ClimateCohort {
  const { settings } = run;
  const snapshot = run.climate[0];
  if (!snapshot) {
    return {
      coverage: unavailable("No climate snapshot in the run."),
      usable: [],
      insights: [],
      gaps: [{ code: "climate", reason: "No climate snapshot in the run.", cropPurposeIds: [], sourceIds: [] }],
    };
  }
  const byDate = new Map(snapshot.days.map(d => [d.date, d]));
  const length = daysBetween(horizon.start, horizon.endExclusive);
  const candidates = candidateIntervals(horizon.start, length, snapshot.cutoff, settings.targetSeasons)
    .map(interval => replay(byDate, interval, lookbackDays));
  const usable = candidates.flatMap(c => (c.status === "usable" ? [c.season] : []));
  const gaps = usable.length < settings.minimumUsableSeasons
    ? [{
      code: "climate" as const,
      reason: `Only ${usable.length} complete replay seasons of ${settings.targetSeasons}; at least ${settings.minimumUsableSeasons} are required.`,
      cropPurposeIds: [],
      sourceIds: [snapshot.id],
    }]
    : [];
  return {
    coverage: available({
      targetSeasons: settings.targetSeasons,
      minimumUsableSeasons: settings.minimumUsableSeasons,
      methodVersion: METHOD_VERSION,
      seasons: candidates.map(c => (c.status === "usable"
        ? { status: "usable" as const, interval: c.season.interval }
        : { status: "excluded" as const, interval: c.interval, reason: c.reason })),
    }),
    usable,
    insights: climateInsights(usable, settings.dryDayThresholdMm),
    gaps,
  };
}
