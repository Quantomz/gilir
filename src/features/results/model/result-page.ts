import type {
  AssessmentMetric, CompletedSnapshot, CropPurposeId, EvidenceGap, FarmInput, IsoDate, Plan, PlanResult, RankingComponent,
  ResultDetails,
} from "@/contracts";
import { item, items, note, subhead, text } from "./blocks";
import type {
  Bar, BarLook, Block, Head, IconName, Item, NoPlanSectionId, PlanSectionId, RanksBlock, ResultPage, Section, TableBlock, Tone,
  YearBlock, YearRow,
} from "./blocks";
import { addDays, baselineSpans, daysBetween, monthOf, monthStarts, planSpans, reportedSpans, shareOf } from "./calendar";
import type { AssessedBaseline, PlanSpan, RecordedHistory, ReportedSpan, Year } from "./calendar";
import * as words from "./words";
import type { CropNames, Format } from "./words";

type State = PlanResult["state"];
type Branch<S extends State> = Extract<PlanResult, { readonly state: S }>;
type PlanBranch = Branch<"plan" | "plan_with_warnings">;
type Rank = RanksBlock["ranks"][number];

interface Reading {
  readonly input: FarmInput;
  readonly format: Format;
  readonly names: CropNames;
  /** The plan keeps last year's rotation, which renames the timeline and the ranking. */
  readonly keeps: boolean;
  readonly modeling: ResultDetails["modeling"];
}

interface Body<Id extends string> {
  readonly lead: readonly Section<Id>[];
  readonly more: readonly Section<Id>[];
}

export function resultPage(snapshot: CompletedSnapshot, format: Format): ResultPage {
  const reading: Reading = {
    input: snapshot.input,
    format,
    names: words.cropNamesOf(snapshot),
    keeps: words.keepsLastYear(snapshot),
    modeling: snapshot.result.details.modeling,
  };
  const headSaying = (text: string) => headOf(snapshot, reading, text);
  const result = snapshot.result;
  switch (result.state) {
    case "plan":
      return { kind: "plan", head: headSaying(reading.modeling ? words.modeling.planStatus : words.status.plan), ...planBody(result, reading) };
    case "plan_with_warnings":
      return { kind: "plan", head: headSaying(flaggedSentence(result, reading.names)), ...planBody(result, reading) };
    case "insufficient_data": {
      const lead = missing(result.missing, result.details.search, reading);
      return { kind: "no_plan", head: headSaying(words.status.insufficient_data), ...noPlanBody(lead, result.details, reading, result.missing) };
    }
    case "no_calendar_fit":
      return { kind: "no_plan", head: headSaying(reading.modeling ? words.modeling.noFitStatus : proofSentence(result.proof, format)), ...noPlanBody(noFit(result, reading), result.details, reading) };
    case "search_incomplete":
      return { kind: "no_plan", head: headSaying(words.status.search_incomplete), ...noPlanBody(stopped(result.details.search, reading), result.details, reading) };
    case "service_error":
      return { kind: "no_plan", head: headSaying(words.failureWords[result.error.code]), ...noPlanBody(failed(result.error), result.details, reading) };
    default:
      return absurd(result);
  }
}

function planBody(result: PlanBranch, reading: Reading): Body<PlanSectionId> {
  const { plan, details } = result;
  return body<PlanSectionId>(
    [flagged(details.warnings, result.state, reading), timeline(plan, reading)],
    [
      ranking(plan, details, reading),
      unchecked(details.unassessedChecks, [], reading),
      comparedWithPlan(plan, details, reading),
      ready(details.preparation, reading),
    ],
  );
}

/** `listed` are the gaps the lead already shows, so What we couldn’t check does not repeat them. */
function noPlanBody(
  lead: Section<NoPlanSectionId>,
  details: ResultDetails,
  reading: Reading,
  listed: readonly EvidenceGap[] = [],
): Body<NoPlanSectionId> {
  // Where the search stopped already says, in plainer words, that the search reached its limit.
  const warnings = lead.id === "stopped" ? details.warnings.filter(warning => warning.code !== "search_limit") : details.warnings;
  return body<NoPlanSectionId>(
    [lead],
    [notes(warnings, reading), farm(details, reading), unchecked(details.unassessedChecks, listed, reading), comparedWithoutPlan(details.baseline, reading)],
  );
}

function body<Id extends string>(lead: readonly (Section<Id> | null)[], more: readonly (Section<Id> | null)[]): Body<Id> {
  return { lead: lead.filter(isPresent), more: more.filter(isPresent) };
}

function absurd(value: never): never {
  throw new Error(`Unknown result state: ${JSON.stringify(value)}`);
}

const statusLooks: Record<State, { readonly tone: Tone; readonly icon: IconName }> = {
  plan: { tone: "ok", icon: "check" },
  plan_with_warnings: { tone: "warn", icon: "alert" },
  insufficient_data: { tone: "info", icon: "info" },
  no_calendar_fit: { tone: "neutral", icon: "calendar" },
  search_incomplete: { tone: "info", icon: "grid" },
  service_error: { tone: "warn", icon: "alert" },
};

/** A no-plan result names the day the farmer gave, because it holds no horizon and F3 computes none. */
function headOf(snapshot: CompletedSnapshot, { format, names }: Reading, statusText: string): Head {
  const { result, input } = snapshot;
  const plan = words.planOf(result);
  return {
    eyebrow: words.eyebrowOf(snapshot, format),
    title: words.titleOf(snapshot),
    status: { ...statusLooks[result.state], label: result.state === "plan" && result.details.modeling ? "Modeled calendar." : words.statusLabels[result.state], text: statusText },
    facts: [
      ...(result.details.modeling ? [words.modeling.label, words.modeling.validation] : []),
      plan === null ? words.head.fieldReady(format.day(input.planningStart)) : words.head.year(yearRange(plan.horizon, format)),
      words.sentenceCase(names.list(input.cropPurposeIds)),
      words.waterLabels[input.water],
    ],
    synthetic: words.syntheticOf(snapshot),
  };
}

function flaggedSentence(result: Branch<"plan_with_warnings">, names: CropNames): string {
  const { warnings, metrics } = result.details;
  const cropsFlagged = (code: "rainfall_mismatch" | "temperature_exposure" | "environmental_rule" | "rotation_rule") => {
    const found = warnings.filter(warning => warning.code === code);
    return found.length === 0 ? null : names.list(found.flatMap(warning => warning.cropPurposeIds));
  };
  const often = result.plan.rankingTuple.components[0].value;
  const exposure = metricById(metrics, "q90_temperature_exposure")?.value;
  const share = exposure?.kind === "available" && exposure.value > 0 ? words.shareWords(exposure.value) : null;
  const rain = cropsFlagged("rainfall_mismatch");
  const heat = cropsFlagged("temperature_exposure");
  const rule = cropsFlagged("environmental_rule");
  const order = cropsFlagged("rotation_rule");
  const parts = [
    rain !== null && often > 0 ? words.status.flagged.rain(words.inSentence(words.frequencyWords(often))) : null,
    heat !== null ? words.status.flagged.temperature(heat, share) : null,
    rule !== null ? words.status.flagged.environmentalRule(rule) : null,
    order !== null ? words.status.flagged.rotationRule : null,
  ].filter(isPresent);
  return parts.length === 0 ? words.status.flagged.none : `${words.status.flagged.lead}${words.joinAnd(parts)}.`;
}

function proofSentence(proof: Branch<"no_calendar_fit">["proof"], format: Format): string {
  return proof.kind === "duration_lower_bound"
    ? words.status.noFit.duration(format.count(proof.mandatoryMinimumDays, "day", "days"), format.whole(proof.horizonDays))
    : words.status.noFit.exhausted;
}

function flagged(warnings: ResultDetails["warnings"], state: PlanBranch["state"], reading: Reading): Section<"flagged"> | null {
  if (warnings.length === 0) return null;
  const flags = warnings.filter(warning => words.warningKinds[warning.code] === "flag");
  const context = warnings.filter(warning => words.warningKinds[warning.code] === "context");
  const flagBlocks = flags.length === 0 ? [] : [text("body", words.warnings.lead), warningItems(flags, "flag", reading), text("body", words.warnings.closing)];
  const noteBlocks = context.length === 0 ? [] : [...(flags.length === 0 ? [] : [subhead(words.warnings.alsoGoodToKnow)]), warningItems(context, "plain", reading)];
  return {
    id: "flagged",
    title: flags.length > 0 || state === "plan_with_warnings" ? words.sections.flagged : words.sections.goodToKnow,
    look: flags.length > 0 ? "flagged" : "card",
    blocks: [...flagBlocks, ...noteBlocks],
  };
}

/** A no-plan result’s warnings. The engine adds only context notes without a plan, so none is drawn as a flag. */
function notes(warnings: ResultDetails["warnings"], reading: Reading): Section<"notes"> | null {
  if (warnings.length === 0) return null;
  return { id: "notes", title: words.sections.goodToKnow, look: "card", blocks: [warningItems(warnings, "plain", reading)] };
}

function warningItems(warnings: ResultDetails["warnings"], look: "plain" | "flag", { format, input, names }: Reading): Block {
  return items(warnings.map(warning => {
    const crops = names.list(warning.cropPurposeIds);
    const several = unique(warning.cropPurposeIds).length > 1;
    const ownLine = words.warningLines[warning.code];
    return item(
      words.warningHeads[warning.code](crops, several, input.water),
      [ownLine === undefined ? words.engineText(warning.message, format) : ownLine(crops, several, input.water)],
      words.warningIcons[warning.code],
    );
  }), look);
}

function timeline(plan: Plan, reading: Reading): Section<"timeline"> {
  const { format, keeps } = reading;
  const spans = planSpans(plan);
  return {
    id: "timeline",
    title: reading.modeling ? words.modeling.timelineTitle : keeps ? words.sections.timelineKept : words.sections.timeline,
    look: "card",
    blocks: [
      text("muted", words.timeline.caption(yearRange(plan.horizon, format))),
      ...(reading.modeling ? [text("body", words.modeling.reservation)] : []),
      planYear("plan", null, plan.horizon, spans, spans.map(span => planRow(span, reading)), format),
      text("muted", words.timeline.viewOnly),
    ],
  };
}

function ranking(plan: Plan, details: ResultDetails, { format, keeps, names, modeling }: Reading): Section<"ranking"> {
  const yearDays = daysBetween(plan.horizon.start, plan.horizon.endExclusive);
  const notRanked = [badYearRank(details.metrics), heatRank(plan, details, names)].filter(isPresent);
  return {
    id: "ranking",
    title: keeps ? words.sections.rankingKept : words.sections.ranking,
    look: "card",
    blocks: [
      note("neutral", "info", null, modeling ? words.modeling.fixedOrder : words.ranking.fixedOrder),
      { kind: "ranks", numbered: true, ranks: plan.rankingTuple.components.map(component => tupleRank(component, yearDays, format, modeling !== undefined)) },
      ...(modeling ? [text("body", words.modeling.occupancy)] : []),
      ...(notRanked.length === 0 ? [] : [subhead(words.ranking.notRanked), { kind: "ranks", numbered: false, ranks: notRanked } satisfies Block]),
      text("muted", `${words.cohortLine(details.cohort, format)} ${words.ranking.cohort.closing}`),
      ...(details.search.ranking === "limit_reached" ? [bestFoundNote(details.search)] : []),
    ],
  };
}

export function bestFoundNote(search: ResultDetails["search"]): Block {
  return note("info", "grid", words.search.bestFound, words.search.bestFoundText(words.dayCount(search.gridStepDays)));
}

function tupleRank(component: RankingComponent, yearDays: number, format: Format, modeled: boolean): Rank {
  const question = (modeled ? words.modeling.questions : words.ranking.questions)[component.metricId];
  const { explain } = words.ranking;
  const { value } = component;
  switch (component.metricId) {
    case "mean_frequency":
      return { icon: null, question, value: words.frequencyWords(value), explain: value === 0 ? explain.never : value >= 1 ? explain.always : explain.often };
    case "mean_mismatch":
      return value === 0
        ? { icon: null, question, value: words.ranking.values.none, explain: explain.noShortfall }
        : { icon: null, question, value: words.sentenceCase(words.shareWords(value)), explain: explain.shortfall };
    case "unplanted_days":
      return { icon: null, question, value: words.dayCount(value), explain: (modeled ? words.modeling.unplanted : explain.unplanted)(format.count(yearDays, "day", "days")) };
    case "longest_unplanted_gap":
      return { icon: null, question, value: words.dayCount(value), explain: modeled ? words.modeling.longest : explain.longest };
    default:
      return absurd(component);
  }
}

function badYearRank(metrics: ResultDetails["metrics"]): Rank | null {
  const metric = metricById(metrics, "q90_mismatch");
  if (metric === undefined) return null;
  const { badYear } = words.ranking;
  if (metric.value.kind === "unavailable") {
    return { icon: "drop", question: badYear.question, value: words.ranking.notAvailable, explain: words.endSentence(metric.value.reason) };
  }
  return metric.value.value === 0
    ? { icon: "drop", question: badYear.question, value: words.ranking.values.none, explain: badYear.none }
    : { icon: "drop", question: badYear.question, value: words.sentenceCase(words.shareWords(metric.value.value)), explain: badYear.some };
}

/** A crop with a temperature_rule gap is "not assessed", never safe. */
function heatRank(plan: Plan, details: ResultDetails, names: CropNames): Rank | null {
  const metric = metricById(details.metrics, "q90_temperature_exposure");
  const unruled = unique(details.unassessedChecks.filter(gap => gap.code === "temperature_rule").flatMap(gap => gap.cropPurposeIds));
  const outside = unique(details.warnings.filter(warning => warning.code === "temperature_exposure").flatMap(warning => warning.cropPurposeIds));
  if (metric === undefined && unruled.length === 0 && outside.length === 0) return null;
  const { heatAndCold } = words.ranking;
  const about = [
    outside.length > 0 ? heatAndCold.outside(names.list(outside)) : null,
    unruled.length > 0 ? heatAndCold.notAssessedFor(names.list(unruled)) : null,
  ].filter(isPresent);
  const said = (value: string, lead: readonly string[]): Rank => ({ icon: "heat", question: heatAndCold.question, value, explain: [...lead, ...about].join(" ") });
  if (metric?.value.kind === "available") {
    const share = metric.value.value;
    const value = share === 0 ? heatAndCold.none : share >= 1 ? heatAndCold.every : words.sentenceCase(heatAndCold.ofCheckedDays(words.shareWords(share)));
    return said(value, [heatAndCold.note]);
  }
  const everyCropUnruled = plan.occurrences.every(occurrence => unruled.includes(occurrence.cropPurposeId));
  return said(
    everyCropUnruled ? heatAndCold.notAssessed : words.ranking.notAvailable,
    metric?.value.kind === "unavailable" ? [words.endSentence(metric.value.reason)] : [],
  );
}

function unchecked(
  checks: ResultDetails["unassessedChecks"],
  alreadyListed: ResultDetails["unassessedChecks"],
  reading: Reading,
): Section<"unchecked"> | null {
  const listed = new Set(alreadyListed.map(gapKey));
  const left = checks.filter(gap => !listed.has(gapKey(gap)));
  if (left.length === 0) return null;
  return { id: "unchecked", title: words.sections.unchecked, look: "card", blocks: [gapItems(left, reading)] };
}

function comparedWithPlan(plan: Plan, details: ResultDetails, reading: Reading): Section<"compared"> {
  const { baseline } = details;
  switch (baseline.kind) {
    case "not_recorded":
      return compared([text("body", words.compared.skipped)]);
    case "not_assessable":
      return compared(notScored(baseline.reasons, reading));
    case "assessed":
      return compared(assessed(plan, baseline, details.metrics, reading));
    default:
      return absurd(baseline);
  }
}

function comparedWithoutPlan(baseline: ResultDetails["baseline"], reading: Reading): Section<"compared"> | null {
  switch (baseline.kind) {
    case "not_recorded":
      return null;
    case "not_assessable":
      return compared(notScored(baseline.reasons, reading));
    case "assessed":
      return compared([text("body", words.compared.noPlanToCompare), ...reported(reading, baseline.approximateDates)]);
    default:
      return absurd(baseline);
  }
}

function compared(blocks: readonly Block[]): Section<"compared"> {
  return { id: "compared", title: words.sections.compared, look: "card", blocks };
}

function notScored(reasons: readonly string[], reading: Reading): readonly Block[] {
  return [
    text("body", words.compared.notScored),
    items(reasons.map(reason => item(words.engineText(reason, reading.format), [], "info"))),
    ...reported(reading, approximateIn(reading.input.history)),
  ];
}

function reported(reading: Reading, approximate: boolean): readonly Block[] {
  const { history } = reading.input;
  return [
    ...(approximate ? [estimates(false)] : []),
    ...(history.kind === "recorded" ? [subhead(words.compared.reported), reportedYear(history, reading)] : []),
  ];
}

function estimates(comparedToo: boolean): Block {
  return note("info", "calendar", words.compared.estimates, words.compared.estimatesText(comparedToo));
}

function approximateIn(history: FarmInput["history"]): boolean {
  return history.kind === "recorded" && history.entries.some(entry =>
    entry.kind === "crop" && (entry.plantedPrecision === "approximate" || entry.harvestedPrecision === "approximate"));
}

function assessed(plan: Plan, baseline: AssessedBaseline, metrics: ResultDetails["metrics"], reading: Reading): readonly Block[] {
  const { format } = reading;
  // The engine marks every baseline beside a new plan "changed", eligible or not; only an eligible one was ranked.
  const verdict = baseline.eligible ? baseline.recommendation : "no_recommendation";
  const kept = verdict === "kept";
  return [
    note(kept ? "ok" : "info", kept ? "check" : "swap", null, words.compared.verdicts[verdict]),
    ...(baseline.approximateDates ? [estimates(true)] : []),
    ...(kept ? [] : comparedYears(plan, baseline, reading)),
    subhead(words.compared.howTheyCompare),
    deltas(baseline, metrics, format),
    subhead(words.compared.changes),
    ...changes(baseline.changes, reading),
  ];
}

const deltaOrder = words.deltaNames.map(([metricId]) => metricId);
const deltaNames = new Map(words.deltaNames);

function deltas(baseline: AssessedBaseline, metrics: ResultDetails["metrics"], format: Format): Block {
  if (baseline.deltas.length === 0) return text("muted", words.compared.noNumbers);
  const place = (metricId: string) => {
    const index = deltaOrder.indexOf(metricId);
    return index < 0 ? deltaOrder.length : index;
  };
  const ordered = [...baseline.deltas].sort((a, b) => place(a.metricId) - place(b.metricId));
  return items(ordered.map(delta => {
    const now = metricById(metrics, delta.metricId);
    const was = metricById(baseline.metrics, delta.metricId);
    return item(deltaNames.get(delta.metricId) ?? now?.label ?? was?.label ?? delta.metricId, [
      ...(now === undefined ? [] : [words.compared.nowValue(words.amountOf(now.value, now.unit, format))]),
      ...(was === undefined ? [] : [words.compared.lastYearValue(words.amountOf(was.value, was.unit, format))]),
      deltaWords(delta, format),
    ]);
  }));
}

function deltaWords(delta: AssessedBaseline["deltas"][number], format: Format): string {
  const { difference } = delta;
  const said = words.compared.delta;
  if (difference.kind === "unavailable") return said.notCompared(difference.reason);
  if (difference.value === 0) return said.same;
  const fewer = difference.value < 0;
  const size = Math.abs(difference.value);
  const change = delta.unit === "days" ? said.days(words.dayCount(size), fewer)
    : delta.unit === "count" ? said.count(format.whole(size), fewer)
    : said.share(fewer);
  if (delta.direction === "descriptive") return change;
  return change + ((delta.direction === "lower_preferred") === fewer ? said.better : said.worse);
}

function changes(list: AssessedBaseline["changes"], reading: Reading): readonly Block[] {
  if (list.length === 0) return [text("body", words.compared.noChanges)];
  return [text("muted", words.compared.moved), items(list.map(change => changeItem(change, reading)))];
}

function changeItem(change: AssessedBaseline["changes"][number], { format, names }: Reading): Item {
  const crop = (id: CropPurposeId) => names.list([id]);
  switch (change.kind) {
    case "added":
      return item(words.compared.added(crop(change.occurrence.cropPurposeId), format.dayRange(change.occurrence.planted, change.occurrence.lastOccupied)), [], "plus");
    case "removed":
      return item(words.compared.removed(crop(change.occurrence.cropPurposeId), format.dayRange(change.occurrence.planted, change.occurrence.lastOccupied)), [], "minus");
    case "date_shift": {
      const { before, after } = change;
      const shift = daysBetween(before.planted, after.planted);
      return item(shift === 0
        ? words.compared.sameDay(crop(after.cropPurposeId), format.day(after.planted), format.day(after.lastOccupied), format.day(before.lastOccupied))
        : words.compared.shifted(crop(after.cropPurposeId), words.dayCount(Math.abs(shift)), shift < 0, format.day(after.planted), format.day(before.planted)), [], "calendar");
    }
    case "order_change":
      return item(words.compared.reordered(names.name(change.cropPurposeId), words.ordinal(change.beforeIndex), words.ordinal(change.afterIndex)), [], "swap");
    default:
      return absurd(change);
  }
}

function ready(preparation: ResultDetails["preparation"], { format }: Reading): Section<"ready"> | null {
  if (preparation.length === 0) return null;
  return {
    id: "ready",
    title: words.sections.ready,
    look: "card",
    blocks: [{ kind: "steps", steps: preparation.map(step => words.engineText(step.text, format)) }],
  };
}

function missing(gaps: Branch<"insufficient_data">["missing"], search: ResultDetails["search"], reading: Reading): Section<"missing"> {
  return {
    id: "missing",
    title: words.sections.missing,
    look: "card",
    blocks: [
      gapItems(gaps, reading),
      ...(search.ranking === "interrupted" ? [note("info", "info", null, words.search.interrupted)] : []),
      note("neutral", "edit", null, words.noPlan.missingNext),
    ],
  };
}

/** No hint about which crops or dates would fit: the proof does not show that. */
function noFit({ proof, details }: Branch<"no_calendar_fit">, { format, input, names, modeling }: Reading): Section<"no_fit"> {
  if (modeling) return {
    id: "no_fit", title: words.modeling.noFitTitle, look: "card",
    blocks: [
      text("body", words.engineText(details.explanation, format)),
      text("body", words.modeling.noFitScope),
      ...(proof.kind === "structural_exhaustion"
        ? [items(proof.constraints.map(constraint => item(words.engineText(constraint, format), [], "info")))]
        : [text("body", `The modeled cropping slots require at least ${words.dayCount(proof.mandatoryMinimumDays)} within a ${words.dayCount(proof.horizonDays)} horizon.`)]),
    ],
  };
  const one = unique(input.cropPurposeIds).length === 1;
  const why: readonly Block[] = proof.kind === "duration_lower_bound"
    ? [
        {
          kind: "versus",
          sides: [
            { value: format.whole(proof.mandatoryMinimumDays), caption: words.noPlan.needAtLeast, tone: "warn" },
            { value: format.whole(proof.horizonDays), caption: words.noPlan.inYourYear, tone: "plain" },
          ],
        },
        text("body", words.noPlan.eachCrop),
        items(proof.minimumByCrop.map(crop => item(words.noPlan.perCrop(names.name(crop.cropPurposeId), words.dayCount(crop.minimumDays)), []))),
      ]
    : [
        // The engine tries this proof only after the crops' days fit in the year, so the planting times, or the follow
        // rules when the run had any, are what stop them. Its own constraint sentences are in View details.
        text("body", words.noPlan.noFitPlanting(one, details.provenance.rules.length > 0, format.day(input.planningStart))),
        ...(proof.expandedStates > 0 ? [text("muted", words.noPlan.checkedWays(format.count(proof.expandedStates, "way", "ways"), one))] : []),
      ];
  const next = proof.kind === "duration_lower_bound" ? words.noPlan.noFitNext(one) : words.noPlan.noFitPlantingNext(one);
  return { id: "no_fit", title: words.sections.no_fit, look: "card", blocks: [...why, note("neutral", "edit", null, next)] };
}

function stopped(search: ResultDetails["search"], { format }: Reading): Section<"stopped"> {
  return {
    id: "stopped",
    title: words.sections.stopped,
    look: "card",
    blocks: [text("body", whereStopped(search, format)), text("body", words.search.notProof), note("neutral", "edit", null, words.noPlan.tryAgain)],
  };
}

function whereStopped(search: ResultDetails["search"], format: Format): string {
  if (search.structural === "limit_reached") {
    return words.search.stoppedFitting(format.count(search.structuralExpandedStates, "try", "tries"), format.whole(search.structuralExpansionLimit));
  }
  if (search.ranking === "limit_reached") {
    return words.search.stoppedScoring(format.count(search.scoredCandidates, "plan", "plans"), format.whole(search.scoredCandidateLimit));
  }
  return words.search.stopped;
}

function failed(error: Branch<"service_error">["error"]): Section<"failed"> {
  return {
    id: "failed",
    title: words.sections.failed,
    look: "card",
    blocks: [
      text("body", words.failureWords[error.code]),
      note("neutral", "edit", null, error.retryable ? words.noPlan.tryAgain : words.noPlan.failedNotRetryable),
    ],
  };
}

function farm(details: ResultDetails, { input, format }: Reading): Section<"farm"> | null {
  const table = monthTable(details.insights, monthOf(input.planningStart), format);
  const others = otherInsights(details.insights, format);
  const usable = details.cohort.kind === "available" && details.cohort.value.seasons.some(season => season.status === "usable");
  if (table === null && others.length === 0 && !usable) return null;
  const periods = unique(details.insights.filter(inTable).map(insight =>
    (insight.period.kind === "available" ? format.monthRange(insight.period.value.start, insight.period.value.endExclusive) : null)));
  const [period] = periods;
  return {
    id: "farm",
    title: words.sections.farm,
    look: "card",
    blocks: [
      ...(table === null ? [] : [table]),
      ...(periods.length === 1 && period !== null && period !== undefined ? [text("muted", words.months.period(period))] : []),
      ...(others.length === 0 ? [] : [items(others)]),
      text("muted", `${words.cohortLine(details.cohort, format)} ${words.noPlan.farmSource}`),
    ],
  };
}

type Insight = ResultDetails["insights"][number];

function inTable(insight: Insight): insight is Insight & { readonly month: number } {
  return insight.month !== null && words.months.columns.some(([id]) => id === insight.metric.id);
}

export function monthTable(insights: ResultDetails["insights"], firstMonth: number, format: Format): TableBlock | null {
  const monthly = insights.filter(inTable);
  if (monthly.length === 0) return null;
  const order = (month: number) => (month - firstMonth + 12) % 12;
  const shown = unique(monthly.map(insight => insight.month)).sort((a, b) => order(a) - order(b));
  const cell = (month: number, id: string) => {
    const value = monthly.find(insight => insight.month === month && insight.metric.id === id)?.metric.value;
    if (value === undefined) return words.months.noValue;
    return value.kind === "available" ? format.decimal(value.value, 1) : words.details.notAvailable(value.reason);
  };
  return {
    kind: "table",
    caption: words.months.caption,
    columns: [words.months.month, ...words.months.columns.map(([, name]) => name)],
    rows: shown.map(month => [format.month(month, "long"), ...words.months.columns.map(([id]) => cell(month, id))]),
  };
}

export function otherInsights(insights: ResultDetails["insights"], format: Format): readonly Item[] {
  const others = insights.filter(insight => !inTable(insight));
  return unique(others.map(insight => insight.metric.id)).map(id => {
    const ofId = others.filter(insight => insight.metric.id === id);
    const [first] = ofId;
    return item(words.metricNames.get(id) ?? first.metric.label, ofId.map(insight => {
      const value = words.amountOf(insight.metric.value, insight.metric.unit, format);
      if (insight.month !== null) return words.months.when(format.month(insight.month, "long"), value);
      if (insight.period.kind === "available") return words.months.when(format.monthRange(insight.period.value.start, insight.period.value.endExclusive), value);
      return value;
    }));
  });
}

function yearRange(year: Year, format: Format): string {
  return format.dayRange(year.start, addDays(year.endExclusive, -1));
}

/** The plan's rows are already in its timeline card, so its copy here has none. */
function comparedYears(plan: Plan, baseline: AssessedBaseline, reading: Reading): readonly YearBlock[] {
  const { format } = reading;
  const moved = baselineSpans(plan, baseline);
  return [
    planYear("plan", words.compared.thisPlan, plan.horizon, planSpans(plan), [], format),
    planYear("baseline", words.compared.lastYearMoved, plan.horizon, moved, moved.map(span => lastYearRow(span, reading)), format),
  ];
}

function lastYearRow(span: PlanSpan, { format, names }: Reading): YearRow {
  const said = words.compared.lastYearRows;
  if (span.kind === "crop") {
    return { mark: String(span.order), head: names.name(span.cropPurposeId), lines: [said.inField(format.dayRange(span.planted, span.lastOccupied), words.dayCount(span.occupiedDays))] };
  }
  return { mark: null, head: said.noCrop, lines: [words.timeline.openDates(format.dayRange(span.first, span.last), words.dayCount(span.openDays))] };
}

function planYear(source: "plan" | "baseline", caption: string | null, year: Year, spans: readonly PlanSpan[], rows: readonly YearRow[], format: Format): YearBlock {
  const bars = spans.flatMap((span): Bar[] => {
    if (span.kind === "crop") return [bar(year, "crop", span.planted, addDays(span.lastOccupied, 1), String(span.order))];
    const free = addDays(span.first, span.afterHarvestDays);
    return [bar(year, "after_harvest", span.first, free, null), bar(year, "open", free, addDays(span.last, 1), null)];
  });
  return yearBlock(source, caption, year, bars, rows, format);
}

function planRow(span: PlanSpan, { format, names, modeling }: Reading): YearRow {
  const { timeline: said } = words;
  if (span.kind === "crop") {
    return {
      mark: String(span.order),
      head: names.name(span.cropPurposeId),
      lines: modeling && span.modeledTiming ? [
        words.modeling.cropDates(format.day(span.planted), format.dayRange(span.modeledTiming.earliestHarvest, span.modeledTiming.latestHarvest)),
        words.modeling.cropDays(words.dayCount(span.occupiedDays), format.day(span.modeledTiming.latestHarvest), format.day(span.fieldAvailable)),
      ] : [
        said.cropDates(format.day(span.planted), format.day(span.lastOccupied)),
        said.cropDays(words.dayCount(span.occupiedDays), format.day(span.fieldAvailable)),
      ],
    };
  }
  const when = said.openDates(format.dayRange(span.first, span.last), words.dayCount(span.openDays));
  if (span.after === null || span.afterHarvestDays === 0) return { mark: null, head: said.open, lines: [when] };
  const crop = names.list([span.after]);
  if (span.afterHarvestDays === span.openDays) return { mark: null, head: said.turnOnly.head, lines: [when, said.turnOnly.note(crop)] };
  return { mark: null, head: said.open, lines: [when, said.afterHarvest(span.afterHarvestDays, words.dayCount(span.afterHarvestDays), crop)] };
}

function reportedYear(history: RecordedHistory, { format, names }: Reading): YearBlock {
  const year: Year = { start: history.start, endExclusive: history.endExclusive };
  const spans = reportedSpans(history);
  const crops = spans.filter(span => span.kind === "crop");
  const markOf = (span: ReportedSpan) => (span.kind === "crop" ? String(crops.indexOf(span) + 1) : null);
  const rows = spans.map((span): YearRow => {
    const { reportedRows } = words.compared;
    if (span.kind === "crop") {
      const day = (date: IsoDate, about: boolean) => (about ? reportedRows.about(format.day(date)) : format.day(date));
      return {
        mark: markOf(span),
        head: "listed" in span.crop ? names.name(span.crop.listed) : reportedRows.unlisted(span.crop.unlisted),
        lines: [reportedRows.dates(day(span.planted, span.plantedAbout), day(span.harvested, span.harvestedAbout))],
      };
    }
    return {
      mark: null,
      head: span.kind === "empty" ? reportedRows.empty : reportedRows.notSure,
      lines: [words.timeline.openDates(format.dayRange(span.first, span.last), words.dayCount(span.spanDays))],
    };
  });
  const bars = spans.map(span => (span.kind === "crop"
    ? bar(year, "listed" in span.crop ? "crop" : "unlisted", span.planted, addDays(span.harvested, 1), markOf(span))
    : bar(year, span.kind, span.first, addDays(span.last, 1), null)));
  return yearBlock("reported", null, year, bars, rows, format);
}

const legendOrder = ["after_harvest", "open", "unlisted", "empty", "not_sure"] as const satisfies readonly Exclude<BarLook, "crop">[];

function yearBlock(source: YearBlock["source"], caption: string | null, year: Year, bars: readonly Bar[], rows: readonly YearRow[], format: Format): YearBlock {
  const drawn = bars.filter(drawnBar => drawnBar.to > drawnBar.from);
  return {
    kind: "year",
    source,
    caption,
    ticks: monthStarts(year).map((first, index) => {
      const month = monthOf(first);
      return {
        at: shareOf(year, first),
        label: words.timeline.tick(format.month(month, "short"), index === 0 || month === 1 ? first.slice(0, 4) : null),
        narrow: format.month(month, "narrow"),
      };
    }),
    bars: drawn,
    legend: legendOrder.filter(look => drawn.some(drawnBar => drawnBar.look === look)).map(look => ({ look, label: words.timeline.legend[look] })),
    rows,
  };
}

function bar(year: Year, look: BarLook, from: IsoDate, endExclusive: IsoDate, mark: string | null): Bar {
  return { look, from: shareOf(year, from), to: shareOf(year, endExclusive), mark };
}

function gapItems(gaps: readonly EvidenceGap[], { format, names, modeling }: Reading): Block {
  return items(gaps.map(gap => {
    const several = unique(gap.cropPurposeIds).length > 1;
    const ownLine = modeling ? undefined : words.gapLines[gap.code];
    return item(
      words.gapHeads[gap.code](names.list(gap.cropPurposeIds), several),
      [ownLine === undefined ? words.engineText(gap.reason, format) : ownLine(several)],
      words.gapIcons[gap.code],
    );
  }));
}

function gapKey(gap: EvidenceGap): string {
  return `${gap.code}|${gap.reason}`;
}

function metricById(metrics: readonly AssessmentMetric[], id: string): AssessmentMetric | undefined {
  return metrics.find(metric => metric.id === id);
}

function unique<T>(list: readonly T[]): T[] {
  return [...new Set(list)];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
