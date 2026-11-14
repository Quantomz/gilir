import type { ClimateSnapshot, DailyWeather, WeatherField } from "@/contracts/climate";
import type { EvidenceValue, IsoDate } from "@/contracts/common";
import type { ClimateCohort, CohortInput, DateInterval, ReplaySeason } from "@/contracts/engine";
import type { RegistryLookup } from "@/contracts/registry";
import type { EvidenceGap } from "@/contracts/result";
import { addDays, anchorDate, daysBetween } from "./dates";
import { available, unavailable } from "./evidence";
import { climateInsights } from "./insights";

const METHOD_VERSION = "replay-v2 (frozen cutoff, UTC, Feb29 to Feb28). "
  + "declared-field-composition-v1 (fixed owners, UTC join, no fills). "
  + "elevation-meanC-owner-v1 (one synthetic exception). "
  + "annual-applicability-v1 (365+ day annual rain and temperature means)";
const YEAR_DAYS = 365;
const requiredFields: readonly WeatherField[] = ["rainMm", "meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"];

type Candidate =
  | { readonly status: "usable"; readonly season: ReplaySeason }
  | { readonly status: "excluded"; readonly interval: DateInterval; readonly reason: string };

interface IndexedSnapshot {
  readonly snapshot: ClimateSnapshot;
  readonly byDate: ReadonlyMap<IsoDate, DailyWeather>;
}

interface AssembledClimate {
  readonly byDate: ReadonlyMap<IsoDate, DailyWeather>;
  readonly elevationM: EvidenceValue<number>;
  readonly gaps: readonly EvidenceGap[];
  readonly sourceIds: readonly string[];
}

function assembleClimate(snapshots: readonly ClimateSnapshot[]): AssembledClimate {
  const sourceIds = [...new Set(snapshots.map(snapshot => snapshot.id))].sort();
  const gap = (reason: string): EvidenceGap => ({ code: "climate", reason: reason.slice(0, 240), cropPurposeIds: [], sourceIds });
  if (snapshots.length === 0) {
    const reason = "No climate snapshot in the run.";
    return { byDate: new Map(), elevationM: unavailable(reason), gaps: [gap(reason)], sourceIds };
  }
  const indexed = snapshots.map(snapshot => ({ snapshot, byDate: new Map(snapshot.days.map(day => [day.date, day])) }));
  const only = indexed[0];
  const synthetic = indexed.length === 1 && only.snapshot.kind === "synthetic" && only.snapshot.products.length === 0;
  const gaps: EvidenceGap[] = [];
  const owners = Object.fromEntries(requiredFields.map(field => {
    const declared = synthetic ? [only] : indexed.filter(({ snapshot }) => snapshot.products.some(product => product.fields.some(entry => entry.field === field)));
    if (declared.length === 1) return [field, available(declared[0])];
    const reason = declared.length === 0
      ? `No snapshot declares ownership of ${field}.`
      : `Competing snapshot owners for ${field}: ${declared.map(owner => owner.snapshot.id).sort().join(", ")}.`;
    gaps.push(gap(reason));
    return [field, unavailable(reason)];
  })) as Record<WeatherField, EvidenceValue<IndexedSnapshot>>;
  const dates = [...new Set(indexed.flatMap(owner => [...owner.byDate.keys()]))].sort();
  const byDate = new Map(dates.map(date => {
    const observations = requiredFields.map(field => {
      const owner = owners[field];
      const observation = owner.kind === "available"
        ? owner.value.byDate.get(date)?.[field] ?? unavailable(`Snapshot ${owner.value.snapshot.id} has no ${field} observation on ${date}.`)
        : owner;
      return [field, observation];
    });
    return [date, { date, ...Object.fromEntries(observations) } as DailyWeather] as const;
  }));
  const meanOwner = owners.meanC;
  const elevationM = meanOwner.kind === "available" ? meanOwner.value.snapshot.elevationM : meanOwner;
  if (meanOwner.kind === "available" && elevationM.kind === "unavailable") {
    gaps.push(gap(`Elevation from meanC owner ${meanOwner.value.snapshot.id} is unavailable: ${elevationM.reason}`));
  }
  return { byDate, elevationM, gaps, sourceIds };
}

/** The `target` most recent anchor years whose season ends on or before the cutoff, newest first. */
function candidateIntervals(horizonStart: IsoDate, length: number, cutoff: IsoDate, target: number): DateInterval[] {
  const monthDay = horizonStart.slice(5);
  const intervals: DateInterval[] = [];
  for (let year = Number(cutoff.slice(0, 4)); intervals.length < target; year--) {
    const start = anchorDate(year, monthDay);
    const endExclusive = addDays(start, length);
    if (endExclusive <= cutoff) intervals.push({ start, endExclusive });
  }
  return intervals;
}

function applicabilityClimate(usable: readonly ReplaySeason[], minimumUsableSeasons: number): RegistryLookup["climate"] {
  const missing = (reason: string): RegistryLookup["climate"] => ({
    meanAnnualTemperatureC: unavailable(reason),
    meanAnnualPrecipitationMm: unavailable(reason),
  });
  if (usable.length < minimumUsableSeasons || usable.length === 0) {
    return missing(`Only ${usable.length} complete replay seasons; ${minimumUsableSeasons} are needed for annual climate.`);
  }
  if (usable.some(s => s.days.length < YEAR_DAYS)) return missing("Replay seasons are shorter than one year, so they give no annual totals.");
  // Usable seasons hold only available values.
  const value = (v: DailyWeather["rainMm"]): number => (v.kind === "available" ? v.value : Number.NaN);
  const rainTotals = usable.map(s => s.days.reduce((sum, d) => sum + value(d.rainMm), 0));
  const days = usable.flatMap(s => s.days);
  return {
    meanAnnualTemperatureC: available(days.reduce((sum, d) => sum + value(d.meanC), 0) / days.length),
    meanAnnualPrecipitationMm: available(rainTotals.reduce((a, b) => a + b, 0) / rainTotals.length),
  };
}

function collect(byDate: ReadonlyMap<string, DailyWeather>, start: IsoDate, count: number): DailyWeather[] | string {
  const out: DailyWeather[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const day = byDate.get(date);
    if (!day) return `No weather record for ${date}.`;
    for (const field of requiredFields) {
      const evidence = day[field];
      if (evidence.kind === "unavailable") return `Missing ${field} on ${date}. ${evidence.reason}`.slice(0, 240);
    }
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
  const weather = assembleClimate(run.climate);
  if (run.climate.length === 0) {
    return {
      coverage: unavailable("No climate snapshot in the run."),
      applicabilityClimate: applicabilityClimate([], settings.minimumUsableSeasons),
      elevationM: weather.elevationM,
      usable: [],
      insights: [],
      gaps: weather.gaps,
    };
  }
  const length = daysBetween(horizon.start, horizon.endExclusive);
  const intervals = candidateIntervals(horizon.start, length, run.manifest.dataCutoff, settings.targetSeasons);
  const candidates = intervals.map(interval => replay(weather.byDate, interval, lookbackDays));
  const usable = candidates.flatMap(c => (c.status === "usable" ? [c.season] : []));
  const coverageGaps = usable.length < settings.minimumUsableSeasons
    ? [{
      code: "climate" as const,
      reason: `Only ${usable.length} complete replay seasons of ${settings.targetSeasons}; at least ${settings.minimumUsableSeasons} are required.`,
      cropPurposeIds: [],
      sourceIds: weather.sourceIds,
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
    applicabilityClimate: applicabilityClimate(usable, settings.minimumUsableSeasons),
    elevationM: weather.elevationM,
    usable,
    insights: climateInsights(weather.byDate, intervals, settings.dryDayThresholdMm),
    gaps: [...weather.gaps, ...coverageGaps],
  };
}
