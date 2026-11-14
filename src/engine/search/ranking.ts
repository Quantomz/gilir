import { rankingDecimalPlacesSchema } from "@/contracts/climate";
import type { AssessedCandidate, RankingDecision, RankingInput, RankingResult } from "@/contracts/engine";
import { assessmentMetricSchema, rankingMetricIds } from "@/contracts/result";
import type { EvidenceGap, RankingTuple } from "@/contracts/result";
import { validateAssessment } from "./evidence";
import { calendarKey, compareText, dayCount } from "./calendar";

export class MissingRankingEvidence extends Error {
  constructor(readonly gaps: readonly EvidenceGap[]) {
    super("Required ranking evidence is unavailable.");
  }
}

export function rankingTuple(candidate: AssessedCandidate, precision: number): RankingTuple {
  const { metrics } = candidate.assessment;
  const missing: EvidenceGap[] = [];
  const values = rankingMetricIds.map((id, index) => {
    const matches = metrics.filter(metric => metric.id === id);
    if (matches.length > 1) throw new Error("Duplicate required ranking metric.");
    const metric = matches[0];
    if (metric) {
      assessmentMetricSchema.parse(metric);
      if (metric.unit !== (index < 2 ? "fraction" : "days")) throw new Error("Incorrect ranking metric unit.");
    }
    if (!metric || metric.value.kind === "unavailable") {
      missing.push({ code: "ranking_metric", reason: `Required metric ${id} is unavailable.`,
        cropPurposeIds: [...new Set(candidate.calendar.occurrences.map(item => item.cropPurposeId))], sourceIds: metric?.sourceIds ?? [] });
      return 0;
    }
    const value = metric.value.value;
    if (!Number.isFinite(value) || value < 0 || (index < 2 ? value > 1 : !Number.isInteger(value) || value > dayCount(candidate.calendar.horizon))) {
      throw new Error("Ranking metric is outside its supported range.");
    }
    return Number(value.toFixed(precision));
  });
  if (missing.length) throw new MissingRankingEvidence(missing);
  if (values[3] > values[2]) throw new Error("Longest gap exceeds total unplanted days.");
  return { components: [
    { metricId: "mean_frequency", value: values[0], unit: "fraction" },
    { metricId: "mean_mismatch", value: values[1], unit: "fraction" },
    { metricId: "unplanted_days", value: values[2], unit: "days" },
    { metricId: "longest_unplanted_gap", value: values[3], unit: "days" },
  ] };
}

interface Ranked { readonly candidate: AssessedCandidate; readonly key: string; readonly tuple: RankingTuple }

function compare(a: Ranked, b: Ranked): number {
  if (a.candidate.assessment.flagged !== b.candidate.assessment.flagged) return a.candidate.assessment.flagged ? 1 : -1;
  for (let index = 0; index < rankingMetricIds.length; index++) {
    const difference = a.tuple.components[index].value - b.tuple.components[index].value;
    if (difference) return difference;
  }
  if (a.candidate.calendar.origin !== b.candidate.calendar.origin) return a.candidate.calendar.origin === "baseline" ? -1 : 1;
  return a.candidate.calendar.occurrences.length - b.candidate.calendar.occurrences.length || compareText(a.key, b.key);
}

function decision(winner: Ranked, second: Ranked | null): RankingDecision {
  if (!second) return { kind: "only_candidate" };
  const comparedCalendarKey = second.key;
  if (winner.candidate.assessment.flagged !== second.candidate.assessment.flagged) return {
    kind: "environmental_pool", comparedCalendarKey,
    selectedFlagged: winner.candidate.assessment.flagged, otherFlagged: second.candidate.assessment.flagged,
  };
  for (let index = 0; index < rankingMetricIds.length; index++) {
    const component = winner.tuple.components[index];
    const otherValue = second.tuple.components[index].value;
    if (component.value !== otherValue) {
      const { value, ...metric } = component;
      return { kind: "metric", comparedCalendarKey, ...metric, selectedValue: value, otherValue };
    }
  }
  if (winner.candidate.calendar.origin !== second.candidate.calendar.origin) return { kind: "baseline", comparedCalendarKey };
  if (winner.candidate.calendar.occurrences.length !== second.candidate.calendar.occurrences.length) return { kind: "fewer_occurrences", comparedCalendarKey };
  return { kind: "canonical", comparedCalendarKey };
}

export class RankingAccumulator {
  private best: Ranked | null = null;
  private second: Ranked | null = null;
  constructor(private readonly precision: number) { rankingDecimalPlacesSchema.parse(precision); }

  add(candidate: AssessedCandidate): void {
    const record = { candidate, key: calendarKey(candidate.calendar), tuple: rankingTuple(candidate, this.precision) };
    if (record.key === this.best?.key) {
      if (compare(record, this.best) < 0) this.best = record;
      return;
    }
    if (record.key === this.second?.key) {
      if (compare(record, this.second) >= 0) return;
      this.second = null;
    }
    if (!this.best || compare(record, this.best) < 0) {
      this.second = this.best;
      this.best = record;
    } else if (!this.second || compare(record, this.second) < 0) this.second = record;
  }

  result(): RankingResult {
    return this.best ? { kind: "selected", candidate: this.best.candidate,
      rankingTuple: this.best.tuple, decision: decision(this.best, this.second) } : { kind: "none" };
  }
}

export function rankCandidates(input: RankingInput): RankingResult {
  const ranking = new RankingAccumulator(input.rankingDecimalPlaces);
  for (const candidate of input.candidates) {
    validateAssessment(candidate.assessment, candidate.calendar);
    ranking.add(candidate);
  }
  return ranking.result();
}
