import type { EvidenceValue } from "@/contracts/common";
import type { ClimateAssessment, MetricInput, ReplaySeason } from "@/contracts/engine";
import type { CropProfile } from "@/contracts/registry";
import type { AssessmentMetric, CalendarOccurrence, EvidenceGap, ResultWarning } from "@/contracts/result";
import { metric } from "./catalogue";
import { cropDemand, dailyKc, totalStageDays } from "./crop";
import type { StageDays } from "./crop";
import { daysBetween } from "./dates";
import { available, unavailable } from "./evidence";
import { referenceEt0Mm } from "./fao56";
import { nearestRankQuantile } from "./quantile";
import { unplanted } from "./schedule";
import { cropExposure } from "./temperature";
import type { Exposure } from "./temperature";
import { rollingMismatch } from "./water";
import type { WaterResult } from "./water";

interface Resolved {
  readonly profile: CropProfile;
  readonly stages: StageDays;
  readonly kc: readonly number[];
  readonly offset: number;
}

interface SeasonResult {
  readonly water: EvidenceValue<WaterResult>;
  /** null when the crop has no temperature rule (unassessed). */
  readonly exposure: EvidenceValue<Exposure> | null;
}

interface OccurrenceResult {
  readonly occurrence: CalendarOccurrence;
  readonly resolved: Resolved | null;
  readonly seasons: readonly SeasonResult[];
}

const uniq = <T>(values: readonly T[]): T[] => [...new Set(values)];
const valuesOf = (list: readonly EvidenceValue<number>[]): number[] => list.flatMap(v => (v.kind === "available" ? [v.value] : []));
const field = (w: EvidenceValue<WaterResult>, key: "frequency" | "mismatch"): EvidenceValue<number> =>
  w.kind === "available" ? available(w.value[key]) : w;

function resolve(o: CalendarOccurrence, profiles: readonly CropProfile[], horizonStart: string): Resolved | EvidenceGap {
  const gap = (reason: string): EvidenceGap => ({ code: "crop_profile", reason, cropPurposeIds: [o.cropPurposeId], sourceIds: [] });
  const profile = profiles.find(p => p.id === o.profileId && p.version === o.profileVersion);
  if (!profile) return gap(`Crop profile ${o.profileId} (${o.profileVersion}) was not supplied.`);
  const length = daysBetween(o.planted, o.lastOccupied) + 1;
  const stages = [profile.timing.generatedStageDays, ...profile.timing.historicalStageAllocations].find(s => totalStageDays(s) === length);
  if (!stages) return gap(`Occupancy of ${length} days matches no stage allocation in profile ${profile.id}.`);
  return { profile, stages, kc: dailyKc(profile.kc, stages), offset: daysBetween(horizonStart, o.planted) };
}

function assessSeason(r: Resolved, season: ReplaySeason, et0: readonly EvidenceValue<number>[], windowDays: number): SeasonResult {
  const notCovered = unavailable<number>("The replay season does not cover this day.");
  const days = r.kc.map((_, k) => season.days[r.offset + k]);
  const demand = r.kc.map((kc, k) => cropDemand(kc, et0[r.offset + k] ?? notCovered));
  const rain = days.map(d => d?.rainMm ?? notCovered);
  return { water: rollingMismatch(demand, rain, windowDays), exposure: cropExposure(r.profile.temperatureRules, days, r.stages) };
}

function worst(list: readonly EvidenceValue<number>[]): EvidenceValue<number> {
  if (list.length === 0) return unavailable("No crop occurrence to assess.");
  return list.find(v => v.kind === "unavailable") ?? available(Math.max(...valuesOf(list)));
}

function roundedMean(list: readonly EvidenceValue<number>[], places: number): EvidenceValue<number> {
  if (list.length === 0) return unavailable("No replay season to assess.");
  const gap = list.find(v => v.kind === "unavailable");
  if (gap) return gap;
  const values = valuesOf(list);
  return available(Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(places)));
}

const quantile = (values: readonly number[], p: number, none: string): EvidenceValue<number> => {
  const q = nearestRankQuantile(values, p);
  return q === null ? unavailable(none) : available(q);
};

function occurrenceSeasonMetrics(s: SeasonResult): AssessmentMetric[] {
  const windows = s.water.kind === "available" ? s.water.value.validWindows : 0;
  const exposure = s.exposure ?? unavailable<Exposure>("No temperature rule for this crop; exposure is unassessed.");
  return [
    metric("frequency", field(s.water, "frequency"), windows, "windows"),
    metric("mismatch", field(s.water, "mismatch"), windows, "windows"),
    metric("temperature_exposure", exposure.kind === "available" ? available(exposure.value.fraction) : exposure,
      exposure.kind === "available" ? exposure.value.validDays : 0, "days"),
  ];
}

export function assessClimate(input: MetricInput): ClimateAssessment {
  const { calendar, cohort, settings } = input;
  const site = { latitudeDeg: input.latitudeDeg, elevationM: input.elevationM };
  const et0BySeason = cohort.map(s => s.days.map(d => referenceEt0Mm(d, site)));

  const profileGaps: EvidenceGap[] = [];
  const results: OccurrenceResult[] = calendar.occurrences.map(occurrence => {
    const resolution = resolve(occurrence, input.profiles, calendar.horizon.start);
    if ("code" in resolution) {
      profileGaps.push(resolution);
      const missing = unavailable<never>(resolution.reason);
      return { occurrence, resolved: null, seasons: cohort.map(() => ({ water: missing, exposure: missing })) };
    }
    const seasons = cohort.map((s, y) => assessSeason(resolution, s, et0BySeason[y], settings.mismatchWindowDays));
    return { occurrence, resolved: resolution, seasons };
  });

  const n = results.length;
  const seasonRows = cohort.map((season, y) => {
    const exposures = valuesOf(results.flatMap(r => {
      const e = r.seasons[y].exposure;
      return e?.kind === "available" ? [available(e.value.fraction)] : [];
    }));
    return {
      season,
      frequency: worst(results.map(r => field(r.seasons[y].water, "frequency"))),
      mismatch: worst(results.map(r => field(r.seasons[y].water, "mismatch"))),
      exposure: exposures.length > 0 ? available(Math.max(...exposures)) : unavailable<number>("No crop with a temperature rule had valid days."),
      exposureCount: exposures.length,
    };
  });

  const seasons = cohort.length;
  const schedule = unplanted(calendar.horizon, calendar.occurrences);
  const profilesUsed = results.flatMap(r => (r.resolved ? [r.resolved.profile] : []));
  const allResolved = profilesUsed.length === n;
  const descriptive = (count: number): EvidenceValue<number> =>
    allResolved ? available(count) : unavailable("A scheduled crop has no supplied profile.");
  const mismatchValues = valuesOf(seasonRows.map(r => r.mismatch));
  const exposureValues = valuesOf(seasonRows.map(r => r.exposure));

  const meanFrequency = roundedMean(seasonRows.map(r => r.frequency), settings.rankingDecimalPlaces);
  const meanMismatch = roundedMean(seasonRows.map(r => r.mismatch), settings.rankingDecimalPlaces);
  const metrics = [
    metric("mean_frequency", meanFrequency, seasons, "seasons"),
    metric("mean_mismatch", meanMismatch, seasons, "seasons"),
    metric("unplanted_days", available(schedule.days), schedule.length, "days"),
    metric("longest_unplanted_gap", available(schedule.longestGap), schedule.length, "days"),
    metric("q90_mismatch", quantile(mismatchValues, settings.adverseQuantile, "No season has a mismatch value."), mismatchValues.length, "seasons"),
    metric("q90_temperature_exposure", quantile(exposureValues, settings.adverseQuantile, "No crop has an assessable temperature rule."), exposureValues.length, "seasons"),
    metric("crop_family_count", descriptive(uniq(profilesUsed.map(p => p.family)).length), n, "occurrences"),
    metric("legume_crop_count", descriptive(profilesUsed.filter(p => p.isLegume).length), n, "occurrences"),
  ];

  const seasonMetrics = seasonRows.map(r => ({
    replayStart: r.season.interval.start,
    metrics: [
      metric("frequency", r.frequency, n, "occurrences"),
      metric("mismatch", r.mismatch, n, "occurrences"),
      metric("temperature_exposure", r.exposure, r.exposureCount, "occurrences"),
    ],
  }));

  const shortfallCrops = uniq(results.filter(r => r.seasons.some(s => s.water.kind === "available" && s.water.value.frequency > 0))
    .map(r => r.occurrence.cropPurposeId));
  const exposed = results.flatMap(r => r.seasons.flatMap(s =>
    s.exposure?.kind === "available" && s.exposure.value.fraction > 0 ? [{ crop: r.occurrence.cropPurposeId, ruleIds: s.exposure.value.exposedRuleIds }] : []));
  const exposedCrops = uniq(exposed.map(e => e.crop));
  const warnings: ResultWarning[] = [
    ...(shortfallCrops.length > 0 ? [{
      code: "rainfall_mismatch" as const,
      message: "In some replay seasons, rainfall fell below estimated crop demand in at least one rolling window.",
      cropPurposeIds: shortfallCrops, ruleIds: [], metricIds: ["frequency", "mismatch", "mean_frequency", "mean_mismatch"],
    }] : []),
    ...(exposedCrops.length > 0 ? [{
      code: "temperature_exposure" as const,
      message: "In some replay seasons, daily temperatures passed a crop's temperature limit during its sensitive period.",
      cropPurposeIds: exposedCrops, ruleIds: uniq(exposed.flatMap(e => e.ruleIds)), metricIds: ["temperature_exposure", "q90_temperature_exposure"],
    }] : []),
  ];

  const unruled = uniq(results.filter(r => r.resolved?.profile.temperatureRules.length === 0).map(r => r.occurrence.cropPurposeId));
  const unassessedChecks: EvidenceGap[] = unruled.length > 0
    ? [{ code: "temperature_rule", reason: "No released temperature rule; heat and cold exposure are unassessed, not safe.", cropPurposeIds: unruled, sourceIds: [] }]
    : [];

  const evidence = { metrics, seasonMetrics, warnings, unassessedChecks };
  if (meanFrequency.kind === "available" && meanMismatch.kind === "available") {
    return {
      ...evidence,
      kind: "assessed",
      occurrences: results.map(r => ({ ...r.occurrence, seasonMetrics: r.seasons.map((s, y) => ({ replayStart: cohort[y].interval.start, metrics: occurrenceSeasonMetrics(s) })) })),
      flagged: shortfallCrops.length > 0 || exposedCrops.length > 0,
    };
  }

  const noWindows = uniq(results.filter(r => r.resolved && r.seasons.some(s => s.water.kind === "unavailable")).map(r => r.occurrence.cropPurposeId));
  const missing: EvidenceGap[] = [
    ...profileGaps,
    ...(seasons === 0 ? [{ code: "climate" as const, reason: "No usable replay season.", cropPurposeIds: [], sourceIds: [] }] : []),
    ...(noWindows.length > 0 ? [{
      code: "ranking_metric" as const,
      reason: "A crop has a replay season with no rolling window of complete rain and positive estimated demand.",
      cropPurposeIds: noWindows, sourceIds: [],
    }] : []),
  ];
  return {
    ...evidence,
    kind: "insufficient_data",
    missing: missing.length > 0 ? missing : [{ code: "ranking_metric", reason: "Rain-demand ranking metrics are unavailable.", cropPurposeIds: [], sourceIds: [] }],
  };
}
