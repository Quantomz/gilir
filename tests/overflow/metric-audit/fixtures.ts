import { defaultEngineSettings } from "@/contracts/climate";
import type { DailyWeather } from "@/contracts/climate";
import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import type { EvidenceValue } from "@/contracts/common";
import type { MetricInput } from "@/contracts/engine";
import { syntheticRegistryFixture } from "@/fixtures/science";

const available = (value: number): EvidenceValue<number> => ({ kind: "available", value });
const unavailable: EvidenceValue<number> = { kind: "unavailable", reason: "Synthetic missing evidence." };
const date = (year: number, offset: number) => parseIsoDate(new Date(Date.UTC(year, 6, 6 + offset)).toISOString().slice(0, 10));
const source = syntheticRegistryFixture.profiles[0];

function profile(id: string, days: number, kc: number) {
  const stages = { initial: 1, development: 1, middle: days - 3, late: 1 };
  return {
    ...source, id, cropPurposeId: parseCropPurposeId(id), sourceIds: [`synthetic:${id}`],
    temperatureRules: [], preparation: [],
    timing: { ...source.timing, generatedStageDays: stages, historicalStageAllocations: [stages] },
    kc: { ...source.kc, initial: kc, middle: kc, end: kc, sourceIds: [`synthetic:${id}`] },
  };
}

function occurrence(id: string, start: number, days: number) {
  return {
    cropPurposeId: parseCropPurposeId(id), profileId: id, profileVersion: source.version,
    planted: date(2026, start), lastOccupied: date(2026, start + days - 1), fieldAvailable: date(2026, start + days + 1),
  };
}

export function fixture(options: {
  readonly length?: 4 | 9;
  readonly rain?: readonly number[];
  readonly missing?: "humidityPct" | "rainMm";
  readonly kc?: number;
  readonly wetRepeats?: 0 | 1 | 2;
  readonly windowDays?: number;
  readonly precision?: number;
} = {}): MetricInput {
  const length = options.length ?? 4;
  const rain = options.rain ?? (length === 9 ? [1, 1, 1, 1, 1, 1, 1, 15, 15] : [1, 1, 1, 1]);
  const repeats = options.wetRepeats ?? 0;
  const missingDay = length === 9 ? 4 : 0;
  const days: DailyWeather[] = Array.from({ length: 365 }, (_, i) => ({
    date: date(2001, i), rainMm: options.missing === "rainMm" && i === missingDay ? unavailable : available(rain[i] ?? 100),
    meanC: available(16.9), minC: available(12.3), maxC: available(21.5),
    humidityPct: options.missing === "humidityPct" && i === missingDay ? unavailable : available(70.5),
    wind2mMs: available(2.078), solarMjM2Day: available(22.07), pressureKpa: available(100.1),
  }));
  const occurrences = [occurrence("audit-dry", 0, length)];
  const profiles = [profile("audit-dry", length, options.kc ?? 1)];
  if (repeats > 0) {
    profiles.push(profile("audit-wet", 4, 1));
    for (let i = 0; i < repeats; i++) occurrences.push(occurrence("audit-wet", length + 1 + i * 5, 4));
  }
  return {
    history: { kind: "skipped" },
    calendar: { origin: "generated", horizon: { start: date(2026, 0), endExclusive: date(2026, 365) }, occurrences },
    profiles, rules: [], cohort: [{ interval: { start: date(2001, 0), endExclusive: date(2001, 365) }, lookbackDays: [], days }],
    settings: { ...defaultEngineSettings, targetSeasons: 1, minimumUsableSeasons: 1, mismatchWindowDays: options.windowDays ?? 7, rankingDecimalPlaces: options.precision ?? 6 },
    latitudeDeg: 50.8, elevationM: available(100),
  };
}

export const expected = {
  dailyEt0: [
    3.88089551597236, 3.87832582691145, 3.87559231400880,
    3.87269376043558, 3.86962886549954, 3.86639624285956,
    3.86299441865743, 3.85942182956922, 3.85567682077799,
  ],
  dayEt0: 3.88089551597236,
  dayMismatch: 0.18558187821055977,
  fourDemand: 15.507507417328185,
  fourMismatch: 0.7420604167804314,
  rollingDemand: [27.10652694434471, 27.08505325794158, 27.06240425180813],
  rollingRain: [7, 21, 35],
  rollingMismatch: [0.74175961330744, 0.22466462221769, 0],
  meanFrequency: 2 / 3,
  meanMismatch: 0.32214141184171,
  tolerance: 1e-10,
} as const;
