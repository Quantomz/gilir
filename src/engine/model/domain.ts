import type { CropPurposeId } from "@/contracts/common";
import type { AssessedCandidate, ClimateCohort, DateInterval, FrozenRun } from "@/contracts/engine";
import type { CompleteModelRelease, CropModel, ModelDiagnostics, ModelingPolicy } from "@/contracts/model";
import type { AssessmentMetric, CalendarOccurrence, EvidenceGap, PlanOccurrence } from "@/contracts/result";
import { metric } from "../metrics/catalogue";
import { cropDemand } from "../metrics/crop";
import { addDays, daysBetween } from "../metrics/dates";
import { available } from "../metrics/evidence";
import { referenceEt0Mm } from "../metrics/fao56";
import { nearestRankQuantile } from "../metrics/quantile";
import { unplanted } from "../metrics/schedule";
import { rollingMismatch } from "../metrics/water";
import type { WaterResult } from "../metrics/water";
import { MissingRankingEvidence } from "../search/ranking";
import { completion, prepareThermal, trajectory } from "./thermal";
import type { PreparedThermal } from "./thermal";

export interface Placement {
  readonly id: number;
  readonly cropIndex: number;
  readonly plantedOffset: number;
  readonly earliestEndOffset: number;
  readonly latestEndOffset: number;
  readonly availableOffset: number;
  readonly occurrence: CalendarOccurrence;
}
export class ModelWorkLimit extends Error {}
export interface CropSeasonDomain {
  readonly horizon: DateInterval;
  readonly days: number;
  readonly models: readonly CropModel[];
  readonly minimumSpans: readonly number[];
  readonly edges: readonly number[];
  placement(cropIndex: number, plantedOffset: number): Placement | null;
  assess(sequence: readonly Placement[]): AssessedCandidate;
  diagnostics(): ModelDiagnostics;
}

const sourceIds = (model: CropModel): string[] => [...new Set([
  model.development.temperatureEvidence, model.development.stageEvidence, model.kc.evidence,
].flatMap(evidence => evidence.locators.map(locator => locator.sourceId)))];
const gap = (reason: string, ids: readonly CropPurposeId[] = []): EvidenceGap => ({ code: "climate", reason, cropPurposeIds: ids, sourceIds: [] });
const thermalAssumptions = [
  "Thermal prefix sums use compensated addition. Thresholds within 8 machine epsilons of the accumulated-GDD scale count as reached to absorb floating-point roundoff.",
  "Daily Kc uses calendar-time linear interpolation between thermal-derived stage boundaries. Each boundary is the end of its first threshold-reaching day; coincident boundaries create zero-day stages.",
  "Cold days remain in the current stage and retain crop demand. Thermal development does not model survival or water-stress delays.",
];

function modeledMetric(...args: Parameters<typeof metric>): AssessmentMetric {
  const value = metric(...args);
  const schedule = value.id === "unplanted_days" || value.id === "longest_unplanted_gap";
  return { ...value, methodVersion: schedule ? "planned-reservation-occupancy-v1" : "thermal-calendar-rain-demand-v1",
    assumptions: schedule ? ["Planned crop slots extend through the latest modeled harvest. Earlier harvests may leave waiting time. This is not continuous live cover."]
      : [...value.assumptions.filter(text => !text.startsWith("Generated calendars")), ...thermalAssumptions] };
}

export function prepareCropSeasons(input: {
  readonly run: FrozenRun;
  readonly release: CompleteModelRelease;
  readonly cohort: ClimateCohort;
  readonly horizon: DateInterval;
  readonly policy: ModelingPolicy;
}): { readonly kind: "ready"; readonly domain: CropSeasonDomain } | { readonly kind: "insufficient_data"; readonly gaps: readonly EvidenceGap[] } {
  const { run, release, cohort, horizon, policy } = input;
  const days = daysBetween(horizon.start, horizon.endExclusive);
  const models = [...run.input.cropPurposeIds].sort().map(id => release.models.find(model => model.cropPurposeId === id));
  if (models.some(model => !model)) return { kind: "insufficient_data", gaps: [{ code: "crop_profile", reason: "A selected crop has no reviewed model.", cropPurposeIds: run.input.cropPurposeIds, sourceIds: [] }] };
  const selected = models.filter(model => model !== undefined);
  if (!cohort.usable.length) return { kind: "insufficient_data", gaps: [gap("No retained climate seasons.")] };
  for (const season of cohort.usable) {
    if (season.days.length !== days) return { kind: "insufficient_data", gaps: [gap("The retained climate season does not span the planning horizon.")] };
    for (const day of season.days) if (day.minC.kind !== "available" || day.maxC.kind !== "available"
      || !Number.isFinite(day.minC.value) || !Number.isFinite(day.maxC.value) || day.minC.value > day.maxC.value) {
      return { kind: "insufficient_data", gaps: [gap("Required daily minimum or maximum temperature is missing or invalid.")] };
    }
  }
  const temperatures = cohort.usable.map(season => season.days.map(day => {
    if (day.minC.kind !== "available" || day.maxC.kind !== "available") throw new Error("Validated temperature disappeared.");
    return { minC: day.minC.value, maxC: day.maxC.value };
  }));
  const prepared: readonly (readonly PreparedThermal[])[] = selected.map(model => temperatures.map(season => prepareThermal(season, model.development)));
  const et0 = cohort.usable.map(season => season.days.map(day => referenceEt0Mm(day, { latitudeDeg: run.input.field.lookup[1], elevationM: cohort.elevationM })));
  if (et0.some(season => season.some(value => value.kind === "unavailable"))) return { kind: "insufficient_data", gaps: [gap("Reference evaporation cannot be calculated for every retained climate day.")] };
  const table: (Placement | null)[][] = [];
  const minimumSpans: number[] = [];
  const noncompletion: number[][] = [];
  const edges = new Set<number>();
  for (let crop = 0; crop < selected.length; crop++) {
    const model = selected[crop];
    const row: (Placement | null)[] = [];
    noncompletion[crop] = cohort.usable.map(() => 0);
    let minimumSpan = Infinity;
    for (let planted = 0; planted < days; planted++) {
      const ends = prepared[crop].map((thermal, replay) => {
        const value = completion(thermal, model.development, planted);
        if (value.kind === "not_completed") { noncompletion[crop][replay]++; return null; }
        return value.endOffset;
      });
      if (ends.some(end => end === null)) { row.push(null); continue; }
      const completed = ends.filter(end => end !== null);
      const earliestEndOffset = Math.min(...completed);
      const latestEndOffset = Math.max(...completed);
      const availableOffset = latestEndOffset + model.turnaround.days;
      if (availableOffset > days) { row.push(null); continue; }
      minimumSpan = Math.min(minimumSpan, availableOffset - planted);
      row.push({ id: crop * days + planted, cropIndex: crop, plantedOffset: planted, earliestEndOffset, latestEndOffset, availableOffset,
        occurrence: { cropPurposeId: model.cropPurposeId, profileId: model.id, profileVersion: model.version,
          planted: addDays(horizon.start, planted), lastOccupied: addDays(horizon.start, latestEndOffset - 1), fieldAvailable: addDays(horizon.start, availableOffset) } });
    }
    for (let day = 0; day < days; day++) if (row[day] && (!row[day - 1] || !row[day + 1])) edges.add(day);
    table.push(row);
    minimumSpans.push(minimumSpan);
  }
  let scoredCropDays = 0;
  let aggregationVisits = 0;
  let work = 0;
  let workLimitReached = false;
  const spend = (amount: number) => {
    if (work + amount > policy.scoringWorkLimit) { workLimitReached = true; throw new ModelWorkLimit("Frozen crop-scoring operation budget exhausted."); }
    work += amount;
  };
  const cache = new Map<number, { occurrence: PlanOccurrence; water: readonly WaterResult[] }>();
  const assessPlacement = (placement: Placement) => {
    const cached = cache.get(placement.id);
    if (cached) return cached;
    const model = selected[placement.cropIndex];
    const water: WaterResult[] = [];
    const replays: NonNullable<PlanOccurrence["modeledTiming"]>["replays"][number][] = [];
    const seasonMetrics: PlanOccurrence["seasonMetrics"][number][] = [];
    for (let replay = 0; replay < cohort.usable.length; replay++) {
      const thermal = prepared[placement.cropIndex][replay];
      const completed = completion(thermal, model.development, placement.plantedOffset);
      if (completed.kind !== "completed") throw new Error("A reserved trajectory failed completion.");
      const length = completed.endOffset - placement.plantedOffset;
      const size = Math.min(run.settings.mismatchWindowDays, length);
      spend(length + (length - size + 1) * size);
      scoredCropDays += length;
      const development = trajectory(thermal, model.development, model.kc, placement.plantedOffset);
      if (development.kind !== "completed") throw new Error("A reserved trajectory changed its completion.");
      const demand = development.kc.map((kc, offset) => cropDemand(kc, et0[replay][placement.plantedOffset + offset]));
      const rain = cohort.usable[replay].days.slice(placement.plantedOffset, development.endOffset).map(day => day.rainMm);
      const result = rollingMismatch(demand, rain, run.settings.mismatchWindowDays);
      if (result.kind === "unavailable") throw new MissingRankingEvidence([{ code: "ranking_metric", reason: result.reason, cropPurposeIds: [model.cropPurposeId], sourceIds: sourceIds(model) }]);
      water.push(result.value);
      const replayStart = cohort.usable[replay].interval.start;
      replays.push({ replayStart, harvestOffset: development.endOffset - 1, stageCompletionOffsets: development.stageCompletionOffsets });
      seasonMetrics.push({ replayStart, metrics: [modeledMetric("frequency", available(result.value.frequency), result.value.validWindows, "windows", run.settings.mismatchWindowDays),
        modeledMetric("mismatch", available(result.value.mismatch), result.value.validWindows, "windows", run.settings.mismatchWindowDays)] });
    }
    const value = { water, occurrence: { ...placement.occurrence, seasonMetrics, modeledTiming: {
      kind: "historical-replay-potential-development", modelId: model.id, modelVersion: model.version,
      earliestHarvest: addDays(horizon.start, placement.earliestEndOffset - 1), latestHarvest: placement.occurrence.lastOccupied,
      reservationPolicy: policy.reservation, replays,
    } } satisfies PlanOccurrence };
    cache.set(placement.id, value);
    return value;
  };
  return { kind: "ready", domain: {
    horizon, days, models: selected, minimumSpans, edges: [...edges].sort((a, b) => a - b),
    placement: (crop, planted) => table[crop]?.[planted] ?? null,
    diagnostics: () => ({ modelReleaseVersion: release.version, modelReleaseHash: release.contentHash, policy,
      retainedReplayStarts: cohort.usable.map(season => season.interval.start),
      crops: selected.map((model, crop) => ({ cropPurposeId: model.cropPurposeId, modelId: model.id, modelVersion: model.version,
        scientificName: model.scientificName, harvestPurpose: model.harvestPurpose, cultivarAssumption: model.cultivarAssumption,
        evidenceBasis: model.development.stageEvidence.basis, sourceIds: sourceIds(model),
        assumptions: [...model.transfer.assumptions, ...model.kc.assumptions, model.turnaround.assumption, ...thermalAssumptions], limitations: model.limitations,
        turnaroundDays: model.turnaround.days, validPlantingDays: table[crop].filter(Boolean).length,
        noncompletionByReplay: cohort.usable.map((season, replay) => ({ replayStart: season.interval.start, plantingDays: noncompletion[crop][replay] })),
      })), preparedTrajectories: selected.length * days * cohort.usable.length, scoredCropDays, aggregationVisits, workLimitReached }),
    assess(sequence) {
      if (!sequence.length || sequence.some(item => table[item.cropIndex]?.[item.plantedOffset] !== item)) throw new Error("Foreign or empty placement sequence.");
      const values = sequence.map(assessPlacement);
      const visits = values.length * cohort.usable.length;
      spend(visits);
      aggregationVisits += visits;
      const rows = cohort.usable.map((season, replay) => ({ replayStart: season.interval.start,
        frequency: Math.max(...values.map(value => value.water[replay].frequency)), mismatch: Math.max(...values.map(value => value.water[replay].mismatch)) }));
      const mean = (key: "frequency" | "mismatch") => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
      const occurrences = values.map(value => value.occurrence);
      const schedule = unplanted(horizon, occurrences);
      const metrics = [modeledMetric("mean_frequency", available(mean("frequency")), rows.length, "seasons", run.settings.mismatchWindowDays),
        modeledMetric("mean_mismatch", available(mean("mismatch")), rows.length, "seasons", run.settings.mismatchWindowDays),
        modeledMetric("unplanted_days", available(schedule.days), days, "days"), modeledMetric("longest_unplanted_gap", available(schedule.longestGap), days, "days"),
        modeledMetric("q90_mismatch", available(nearestRankQuantile(rows.map(row => row.mismatch), run.settings.adverseQuantile) ?? 0), rows.length, "seasons", run.settings.mismatchWindowDays)];
      const flagged = rows.some(row => row.frequency > 0);
      return { calendar: { origin: "generated", horizon, occurrences }, assessment: { kind: "assessed", occurrences, metrics, flagged,
        seasonMetrics: rows.map(row => ({ replayStart: row.replayStart, metrics: [
          modeledMetric("frequency", available(row.frequency), values.length, "occurrences", run.settings.mismatchWindowDays),
          modeledMetric("mismatch", available(row.mismatch), values.length, "occurrences", run.settings.mismatchWindowDays),
        ] })), warnings: flagged ? [{ code: "rainfall_mismatch", message: "Rainfall fell below estimated crop demand in at least one modeled crop window.", cropPurposeIds: selected.map(model => model.cropPurposeId), metricIds: ["mean_frequency", "mean_mismatch"], ruleIds: [] }] : [],
        unassessedChecks: [{ code: "temperature_rule", reason: "This model estimates timing. It does not check whether crops will survive the heat or cold, suit your soil, or produce a harvest.", cropPurposeIds: selected.map(model => model.cropPurposeId), sourceIds: [] }],
      } };
    },
  } };
}
