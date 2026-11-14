import type { ExplanationInput, RankingDecision } from "@/contracts/engine";
import { rankingMetricIds } from "@/contracts/result";
import type { BaselineComparison, CalendarOccurrence, EvidenceGap, ResultDetails, ResultWarning } from "@/contracts/result";
import { calendarKey, compareText } from "./search/calendar";
import { initialPredecessor } from "./search/baseline";

function rankingReason(decision: RankingDecision | null): string {
  if (!decision) return "The calendar was assessed under the fixed water-first ranking.";
  switch (decision.kind) {
    case "only_candidate": return "This was the sole assessed eligible calendar; no advantage over another calendar was established.";
    case "environmental_pool": return "This calendar had no environmental flags in the performed checks; the final runner-up was flagged.";
    case "metric": return `The first deciding metric against the final runner-up was ${decision.metricId}: ${decision.selectedValue} versus ${decision.otherValue} ${decision.unit}, after comparison rounding.`;
    case "baseline": return "All four rounded metrics tied with the final runner-up; the eligible existing rotation won the baseline tie rule.";
    case "fewer_occurrences": return "All four rounded metrics and baseline preference tied; fewer crop occurrences decided against the final runner-up.";
    case "canonical": return "All metrics, baseline preference, and occurrence count tied; canonical crop, profile, and date order decided the result.";
  }
}

function comparison(input: ExplanationInput): BaselineComparison {
  const { baseline, selected } = input;
  if (baseline.kind !== "assessed" || !selected) return baseline;
  const same = calendarKey({ ...selected.calendar, occurrences: baseline.occurrences }) === calendarKey(selected.calendar);
  const before = baseline.occurrences;
  const after = selected.calendar.occurrences;
  const matched = new Set<number>();
  const changes: Extract<BaselineComparison, { kind: "assessed" }>["changes"][number][] = [];
  after.forEach((occurrence, afterIndex) => {
    const beforeIndex = before.findIndex((item, index) => item.cropPurposeId === occurrence.cropPurposeId && !matched.has(index));
    if (beforeIndex < 0) { changes.push({ kind: "added", occurrence }); return; }
    matched.add(beforeIndex);
    const previous = before[beforeIndex];
    if (previous.planted !== occurrence.planted || previous.lastOccupied !== occurrence.lastOccupied || previous.fieldAvailable !== occurrence.fieldAvailable) {
      changes.push({ kind: "date_shift", before: calendarOccurrence(previous), after: occurrence });
    }
    if (beforeIndex !== afterIndex) changes.push({ kind: "order_change", cropPurposeId: occurrence.cropPurposeId, beforeIndex, afterIndex });
  });
  before.forEach((occurrence, index) => { if (!matched.has(index)) changes.push({ kind: "removed", occurrence: calendarOccurrence(occurrence) }); });
  const deltas = selected.assessment.metrics.flatMap(metric => {
    const original = baseline.metrics.find(item => item.id === metric.id && item.unit === metric.unit);
    if (!original) return [];
    return [{ metricId: metric.id, unit: metric.unit,
      direction: rankingMetricIds.some(id => id === metric.id) ? "lower_preferred" as const : "descriptive" as const,
      difference: metric.value.kind === "available" && original.value.kind === "available"
        ? { kind: "available" as const, value: metric.value.value - original.value.value }
        : { kind: "unavailable" as const, reason: "One or both comparison values are unavailable." },
    }];
  });
  return { ...baseline, recommendation: baseline.eligible && selected.calendar.origin === "baseline" && same ? "kept" : "changed", changes, deltas };
}

function calendarOccurrence(item: CalendarOccurrence): CalendarOccurrence {
  return { cropPurposeId: item.cropPurposeId, profileId: item.profileId, profileVersion: item.profileVersion,
    planted: item.planted, lastOccupied: item.lastOccupied, fieldAvailable: item.fieldAvailable };
}

export function explainResult(input: ExplanationInput): ResultDetails {
  const baseline = comparison(input);
  const warnings: ResultWarning[] = [...(input.selected?.assessment.warnings ?? [])];
  const profiles = input.profiles.filter(profile => input.selected?.calendar.occurrences.some(item => item.profileId === profile.id && item.profileVersion === profile.version));
  for (const profile of profiles) for (const message of profile.warnings) warnings.push({ code: "profile_limitation", message,
    cropPurposeIds: [profile.cropPurposeId], metricIds: [], ruleIds: [] });
  if (input.search.ranking === "limit_reached" || input.search.structural === "limit_reached") warnings.push({
    code: "search_limit", message: "An operation limit stopped the search with work remaining. This result does not establish the best possible daily calendar.",
    cropPurposeIds: [], ruleIds: [], metricIds: [],
  });
  if (input.run.input.water === "rain_plus_backup") warnings.push({ code: "water_context",
    message: "Reported backup water may provide additional protection. No backup supply was assumed in calculations or ranking.", cropPurposeIds: [], ruleIds: [], metricIds: [] });
  if (input.run.input.water === "unsure") warnings.push({ code: "water_context",
    message: "Water availability is uncertain. Every calculation assumes rainfall alone.", cropPurposeIds: [], ruleIds: [], metricIds: [] });
  const history = input.run.input.history;
  const boundaryCropIds = input.selected ? input.selected.calendar.occurrences.slice(0, 1).map(occurrence => occurrence.cropPurposeId)
    : input.run.input.cropPurposeIds;
  const boundaryRules = initialPredecessor(input.run.input) === null ? input.rules.filter(rule =>
    rule.predicate.successorCropPurposeIds.some(id => boundaryCropIds.includes(id))) : [];
  if (history.kind === "recorded" && history.entries.some(entry => entry.kind === "crop" && (entry.plantedPrecision === "approximate" || entry.harvestedPrecision === "approximate"))) {
    warnings.push({ code: "approximate_history", message: "Historical dates are estimates. Any historical comparison retains that uncertainty.", cropPurposeIds: [], ruleIds: [], metricIds: [] });
  }
  const selectedIds = new Set(input.selected?.calendar.occurrences.map(item => item.cropPurposeId));
  const templates = [...profiles.flatMap(profile => profile.preparation), ...input.rules.filter(rule =>
    rule.predicate.successorCropPurposeIds.some(id => selectedIds.has(id))).flatMap(rule => rule.preparation)];
  const preparation = [...new Map(templates.map(template => [JSON.stringify([template.id, template.text, template.sourceIds]),
    { templateId: template.id, text: template.text, sourceIds: template.sourceIds }])).values()]
    .sort((a, b) => compareText(a.templateId, b.templateId) || compareText(a.text, b.text));
  let explanation: string;
  switch (input.outcome.state) {
    case "plan":
    case "plan_with_warnings": explanation = rankingReason(input.decision); break;
    case "insufficient_data": explanation = "Required crop, climate, or ranking evidence is missing. Available insights remain visible, but no plan can be recommended."; break;
    case "no_calendar_fit": explanation = input.outcome.proof.kind === "duration_lower_bound"
      ? `The mandatory occupancy and turnaround total ${input.outcome.proof.mandatoryMinimumDays} days, exceeding the ${input.outcome.proof.horizonDays}-day horizon under the released model.`
      : "Every reachable daily calendar state was exhausted under the released durations, hard planting windows, and successor prohibitions. No supported calendar fits."; break;
    case "search_incomplete": explanation = "The structural operation limit ended before a witness or proof was found. This does not establish that the selected crops cannot fit."; break;
    case "service_error": explanation = input.outcome.error.message; break;
  }
  const assumptions = [
    "Historical replay is a planning comparison, not a forecast or a prediction of harvest success.",
    "Rainfall alone supplies every candidate. No irrigation supply or farm soil-water balance is assumed.",
    "Ranking minimizes frequency, relative mismatch, unplanted days, then longest unplanted gap. Temperature indicators do not enter that tuple.",
    `Comparisons use ${input.run.settings.rankingDecimalPlaces} decimal places. Displayed assessment values remain unrounded.`,
    `Ranking dates use a ${input.search.gridStepDays}-day grid plus window edges, baseline planting dates, and earliest field availability. This does not establish daily optimality.`,
    "The independent prefix budget is a deterministic safety bound. Representative workload benchmarks remain pending.",
    "No pest or weed assessment, yield forecast, soil improvement, fertilizer quantity, or cost estimate is made.",
  ];
  if (baseline.kind === "not_recorded") assumptions.push("No previous rotation was recorded, so no historical comparison or predecessor was inferred.");
  else if (baseline.kind === "not_assessable") assumptions.push(...baseline.reasons);
  else if (baseline.recommendation === "kept") assumptions.push("Keep the existing rotation. Its supported translated calendar is the selected plan.");
  if (input.provenance.kind === "synthetic") assumptions.push(input.provenance.label);
  for (const snapshot of input.run.climate) if (snapshot.kind === "synthetic") assumptions.push(snapshot.label);
  for (const profile of profiles) {
    assumptions.push(...profile.applicability.managementAssumptions, ...profile.kc.assumptions);
    if (profile.timing.turnaround.basis === "scheduling_assumption") assumptions.push(profile.timing.turnaround.assumption);
  }
  const unassessedChecks: EvidenceGap[] = [...(input.selected?.assessment.unassessedChecks ?? []),
    ...(input.outcome.state === "insufficient_data" ? input.outcome.missing : [])];
  if (boundaryRules.length) unassessedChecks.push({ code: "history",
    reason: "The initial predecessor is unknown, so applicable successor prohibitions could not be assessed at the planning boundary.",
    cropPurposeIds: [...new Set(boundaryRules.flatMap(rule => rule.predicate.successorCropPurposeIds)
      .filter(id => boundaryCropIds.includes(id)))].sort(compareText),
    sourceIds: [...new Set(boundaryRules.flatMap(rule => rule.sourceIds))].sort(compareText) });
  return { explanation, insights: input.insights, metrics: input.selected?.assessment.metrics ?? [],
    seasonMetrics: input.selected?.assessment.seasonMetrics ?? [], warnings, unassessedChecks,
    cohort: input.cohort, baseline, preparation, search: input.search, provenance: input.provenance,
    assumptions: [...new Set(assumptions)] };
}
