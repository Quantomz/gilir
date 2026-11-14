import { defaultEngineSettings } from "@/contracts/climate";
import type { ClimateSnapshot, DailyWeather, EngineSettings, WeatherField } from "@/contracts/climate";
import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import type { EvidenceValue, IsoDate } from "@/contracts/common";
import type { CandidateCalendar, ClimateAssessment, CohortInput, FrozenRun, MetricInput, ReplaySeason } from "@/contracts/engine";
import type { CropProfile } from "@/contracts/registry";
import type { AssessmentMetric, CalendarOccurrence } from "@/contracts/result";
import { climateSnapshotFixture, frozenRunFixture, metricInputFixture, syntheticRegistryFixture } from "@/fixtures/science";

export const av = (value: number): EvidenceValue<number> => ({ kind: "available", value });
export const missing = (reason = "Test marker: value missing."): EvidenceValue<number> => ({ kind: "unavailable", reason });

export function addDays(iso: string, n: number): IsoDate {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return parseIsoDate(date.toISOString().slice(0, 10));
}
export const daysBetween = (start: string, endExclusive: string): number =>
  Math.round((Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);

type Overrides = Partial<Record<WeatherField, number | EvidenceValue<number>>>;
const defaults: Record<WeatherField, number> = {
  rainMm: 0, meanC: 24, minC: 18, maxC: 30, humidityPct: 60, wind2mMs: 2, solarMjM2Day: 18, pressureKpa: 101.3,
};

/** One complete synthetic day. Numbers become available values; pass `missing()` for a gap. */
export function day(date: string, overrides: Overrides = {}): DailyWeather {
  const field = (name: WeatherField) => {
    const value = overrides[name] ?? defaults[name];
    return typeof value === "number" ? av(value) : value;
  };
  return {
    date: parseIsoDate(date),
    rainMm: field("rainMm"), meanC: field("meanC"), minC: field("minC"), maxC: field("maxC"),
    humidityPct: field("humidityPct"), wind2mMs: field("wind2mMs"),
    solarMjM2Day: field("solarMjM2Day"), pressureKpa: field("pressureKpa"),
  };
}

/** Consecutive days from `start`; `shape(date, index)` returns per-day overrides. */
export function days(start: string, count: number, shape: (date: IsoDate, index: number) => Overrides = () => ({})): DailyWeather[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i);
    return day(date, shape(date, i));
  });
}

export function season(start: string, count: number, shape?: (date: IsoDate, index: number) => Overrides): ReplaySeason {
  return {
    interval: { start: parseIsoDate(start), endExclusive: addDays(start, count) },
    lookbackDays: [],
    days: days(start, count, shape),
  };
}

const baseProfile = syntheticRegistryFixture.profiles[0];

export interface ProfileOptions {
  readonly id: string;
  readonly cropPurposeId?: string;
  readonly family?: string;
  readonly isLegume?: boolean;
  readonly stageDays?: { initial: number; development: number; middle: number; late: number };
  readonly kc?: { initial: number; middle: number; end: number };
  readonly temperatureRules?: CropProfile["temperatureRules"];
}

/** A synthetic profile. Default: four 1-day stages and constant Kc 1, so ETc equals ET0. */
export function profile(options: ProfileOptions): CropProfile {
  const stageDays = options.stageDays ?? { initial: 1, development: 1, middle: 1, late: 1 };
  return {
    ...baseProfile,
    id: options.id,
    cropPurposeId: parseCropPurposeId(options.cropPurposeId ?? options.id),
    family: options.family ?? "Synthetic family",
    isLegume: options.isLegume ?? false,
    timing: { ...baseProfile.timing, generatedStageDays: stageDays, historicalStageAllocations: [stageDays] },
    kc: { ...baseProfile.kc, ...(options.kc ?? { initial: 1, middle: 1, end: 1 }) },
    temperatureRules: options.temperatureRules ?? [],
  };
}

export const stageLength = (p: CropProfile): number => {
  const s = p.timing.generatedStageDays;
  return s.initial + s.development + s.middle + s.late;
};

/** Occurrence occupying `planted` .. `planted + stageLength - 1` inclusive, field free after `turnaround` days. */
export function occurrence(p: CropProfile, planted: string, turnaround = 0): CalendarOccurrence {
  const lastOccupied = addDays(planted, stageLength(p) - 1);
  return {
    cropPurposeId: p.cropPurposeId,
    profileId: p.id,
    profileVersion: p.version,
    planted: parseIsoDate(planted),
    lastOccupied,
    fieldAvailable: addDays(lastOccupied, 1 + turnaround),
  };
}

export interface AssessOptions {
  readonly horizonStart?: string;
  readonly horizonDays: number;
  readonly profiles: readonly CropProfile[];
  readonly occurrences: readonly CalendarOccurrence[];
  readonly cohort: readonly ReplaySeason[];
  readonly settings?: EngineSettings;
  readonly latitudeDeg?: number;
  readonly elevationM?: EvidenceValue<number>;
}

export const PLAN_START = "2026-07-01";

export function metricInput(options: AssessOptions): MetricInput {
  const start = parseIsoDate(options.horizonStart ?? PLAN_START);
  const calendar: CandidateCalendar = {
    origin: "generated",
    horizon: { start, endExclusive: addDays(start, options.horizonDays) },
    occurrences: options.occurrences,
  };
  return {
    ...metricInputFixture,
    calendar,
    profiles: options.profiles,
    rules: [],
    cohort: options.cohort,
    settings: options.settings ?? { ...defaultEngineSettings, minimumUsableSeasons: 1 },
    latitudeDeg: options.latitudeDeg ?? 15,
    elevationM: options.elevationM ?? av(30),
  };
}

/** Replay seasons that share the plan's month/day in consecutive past years (oldest last). */
export function seasons(count: number, length: number, shape: (year: number) => (date: IsoDate, index: number) => Overrides): ReplaySeason[] {
  return Array.from({ length: count }, (_, i) => {
    const year = 2025 - i;
    return season(`${year}-07-01`, length, shape(year));
  });
}

export const DRY = () => ({ rainMm: 0 });
export const WET = () => ({ rainMm: 100 });

export function metric(metrics: readonly AssessmentMetric[], id: string): AssessmentMetric {
  const found = metrics.find(m => m.id === id);
  if (!found) throw new Error(`Metric ${id} missing; got ${metrics.map(m => m.id).join(", ")}`);
  return found;
}
export function value(metrics: readonly AssessmentMetric[], id: string): number {
  const m = metric(metrics, id);
  if (m.value.kind !== "available") throw new Error(`Metric ${id} unavailable: ${m.value.reason}`);
  return m.value.value;
}
export function assessed(result: ClimateAssessment): Extract<ClimateAssessment, { kind: "assessed" }> {
  if (result.kind !== "assessed") throw new Error(`Expected assessed, got insufficient_data: ${JSON.stringify(result.missing)}`);
  return result;
}

// ---- cohort helpers ----

export function snapshot(daysList: readonly DailyWeather[], cutoff: string, elevation = 30): ClimateSnapshot {
  return { ...climateSnapshotFixture, cutoff: parseIsoDate(cutoff), elevationM: av(elevation), days: daysList };
}

export function cohortInput(options: {
  readonly days: readonly DailyWeather[];
  readonly cutoff: string;
  readonly horizonStart: string;
  readonly horizonDays: number;
  readonly lookbackDays?: number;
  readonly settings?: EngineSettings;
}): CohortInput {
  const run: FrozenRun = {
    ...frozenRunFixture,
    climate: [snapshot(options.days, options.cutoff)],
    settings: options.settings ?? defaultEngineSettings,
  };
  const start = parseIsoDate(options.horizonStart);
  return {
    run,
    horizon: { start, endExclusive: addDays(start, options.horizonDays) },
    lookbackDays: options.lookbackDays ?? 0,
  };
}

/** Complete daily history from `start` (inclusive) to `endExclusive`. */
export function history(start: string, endExclusive: string, shape: (date: IsoDate) => Overrides = () => ({})): DailyWeather[] {
  return days(start, daysBetween(start, endExclusive), date => shape(date));
}
