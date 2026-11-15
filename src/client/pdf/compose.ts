import { parseIsoDate } from "@/contracts/common";
import type { CropPurposeId, IsoDate } from "@/contracts/common";
import type { FarmInput } from "@/contracts/input";
import type {
  AssessmentMetric, BaselineComparison, CompletedSnapshot, Plan, PlanOccurrence, PlanResult, RankingComponent, ResultDetails,
  ResultWarning,
} from "@/contracts/result";
import type {
  Bar, BarLook, Block, Footer, Head, Item, MonthTick, PdfDocument, PlanDocument, Section, StatusDocument, TextStyle, Timeline, TimelineBlock,
} from "./model";
import { coordinates, cropName, engineText, ownName, pdfText, sayFor, utcDay } from "./text";
import type { PdfText, Reader, Say } from "./text";
import * as words from "./words";
import type { NoPlanState, PlanState } from "./words";

type ResultOf<S extends PlanResult["state"]> = Extract<PlanResult, { readonly state: S }>;

/** A longer month name is wider than its slot on the timeline, and layout leaves out a label that doesn't fit. */
const longestMonthName = 5;

interface Context {
  readonly snapshot: CompletedSnapshot;
  readonly say: Say;
  readonly made: PdfText;
}

const t = pdfText;

export function compose(snapshot: CompletedSnapshot, reader: Reader): PdfDocument {
  const say = sayFor(reader);
  const ctx: Context = { snapshot, say, made: say.made(snapshot.completedAt) };
  const result = snapshot.result;
  switch (result.state) {
    case "plan":
    case "plan_with_warnings":
      return planDocument(ctx, result);
    case "insufficient_data":
    case "no_calendar_fit":
    case "search_incomplete":
    case "service_error":
      return statusDocument(ctx, result);
  }
}

function planDocument(ctx: Context, result: ResultOf<PlanState>): PlanDocument {
  const { details, plan } = result;
  const { timeline: drawing, rows } = timeline(plan, ctx);
  const calendar: Section<Block | TimelineBlock> = {
    heading: t(details.modeling ? words.modeling.timelineTitle : words.calendar.heading),
    blocks: [
      ...(details.modeling ? [paragraph(t(words.modeling.reservation))] : []),
      { kind: "timeline", timeline: drawing },
      list("number", rows),
      ...(details.search.ranking === "limit_reached" ? [searchLimit(details)] : []),
    ],
  };
  const sections = [
    ...warnings(details.warnings, true, ctx),
    calendar,
    ranking(plan, details, ctx),
    compared(ctx),
    prepare(details, ctx),
    couldNotCheck(result, ctx),
    modeling(details, ctx),
    method(ctx),
    assumptions(details, ctx),
    sources(details, ctx, details.metrics),
  ].filter(present);
  return { kind: "plan", ...frame(ctx, "plan"), sections };
}

function statusDocument(ctx: Context, result: ResultOf<NoPlanState>): StatusDocument {
  const { details } = result;
  const repeatsMessage = result.state === "service_error" && details.explanation.trim() === result.error.message.trim();
  const sections = [
    {
      heading: t(words.noPlanHeadings[result.state]),
      blocks: [...whyNoPlan(ctx, result.state, result), paragraph(t(words.noPlan.statusReport), "small")],
    },
    ...warnings(details.warnings, false, ctx),
    details.baseline.kind === "not_recorded" ? null : compared(ctx),
    couldNotCheck(result, ctx),
    farm(details, ctx),
    modeling(details, ctx),
    repeatsMessage ? null : method(ctx),
    assumptions(details, ctx),
    sources(details, ctx, [...details.metrics, ...monthlyInsights(details).map(insight => insight.metric)]),
  ].filter(present);
  return { kind: "status_report", ...frame(ctx, "status_report"), sections };
}

const reasons: { readonly [S in NoPlanState]: (ctx: Context, result: ResultOf<S>) => readonly Block[] } = {
  insufficient_data: (ctx, result) => [gapList(result.missing, ctx), paragraph(t(words.noPlan.missingNext))],
  no_calendar_fit: (ctx, { proof, details }) => {
    if (details.modeling) return [
      paragraph(engineText(details.explanation, ctx.say)),
      paragraph(t(words.modeling.noFitScope)),
      ...(proof.kind === "structural_exhaustion"
        ? [list("bullet", proof.constraints.map(constraint => ({ head: null, lines: [engineText(constraint, ctx.say)] })))]
        : [paragraph(t(`The modeled cropping slots require at least ${words.days(proof.mandatoryMinimumDays)} within a ${words.days(proof.horizonDays)} horizon.`))]),
    ];
    const { input, result } = ctx.snapshot;
    const one = input.cropPurposeIds.length === 1;
    return proof.kind === "duration_lower_bound"
      ? [
        paragraph(t(words.noPlan.fitEach)),
        list("bullet", proof.minimumByCrop.map(crop => ({ head: null, lines: [t(words.noPlan.fitMinimum(words.cap(cropName(ctx.snapshot, crop.cropPurposeId)), words.days(crop.minimumDays)))] }))),
        paragraph(t(words.noPlan.fitNext(one))),
      ]
      : [
        // The engine tries this proof only after the crops' days fit in the year, so the hard planting windows, or the
        // follow rules when the run had any, are what stop them. Its own constraint sentences close the report.
        paragraph(t(words.noPlan.fitPlanting(one, result.details.provenance.rules.length > 0, ctx.say.day(input.planningStart)))),
        ...(proof.expandedStates > 0 ? [paragraph(t(words.noPlan.fitTried(words.count(proof.expandedStates, "way"), one)), "small")] : []),
      ];
  },
  search_incomplete: (_, { details: { search } }) => [
    paragraph(t(search.structural === "limit_reached"
      ? words.noPlan.stoppedStructural(words.count(search.structuralExpandedStates, "try", "tries"), words.whole(search.structuralExpansionLimit))
      : search.ranking === "limit_reached"
        ? words.noPlan.stoppedScoring(words.count(search.scoredCandidates, "plan"), words.whole(search.scoredCandidateLimit))
        : words.noPlan.stoppedOther)),
    paragraph(t(words.noPlan.stoppedIsNotProof)),
  ],
  service_error: () => [paragraph(t(words.noPlan.noNewPlan))],
};

function whyNoPlan<S extends NoPlanState>(ctx: Context, state: S, result: ResultOf<S>): readonly Block[] {
  return reasons[state](ctx, result);
}

function frame(ctx: Context, kind: PdfDocument["kind"]) {
  return {
    title: t(words.documentTitle[kind](ctx.made)),
    head: head(ctx),
    closing: words.closing.map(line => t(line)),
    footer: footer(ctx, t(words.footerTitle[kind](ctx.made))),
  };
}

function head(ctx: Context): Head {
  const { input, result } = ctx.snapshot;
  const place = ownName(input.field.label, words.place.fallback);
  const kept = result.details.baseline.kind === "assessed" && result.details.baseline.recommendation === "kept";
  const title = (result.state === "plan" || result.state === "plan_with_warnings") && kept
    ? words.keptTitles[result.state] : words.titles[result.state];
  const horizon = yearOf(ctx);
  const tone = words.status[result.state].tone;
  return {
    brand: t(words.brand),
    title: t(result.state === "no_calendar_fit" && result.details.modeling ? words.modeling.noFitTitle : title),
    place: place.text,
    lines: [
      ...(result.details.modeling ? [t(words.modeling.label), t(words.modeling.validation)] : []),
      t(words.place.weatherPoint(coordinates(input.field.lookup))),
      t(words.madeLine(ctx.made, period(ctx, horizon.start, addDays(horizon.endExclusive, -1)))),
      t(words.answersLine(words.cap(cropList(ctx, input.cropPurposeIds) ?? ""), words.waterLabels[input.water], historyWords(input.history))),
      ...(place.shown === "replaced" ? [t(words.place.note)] : []),
    ],
    synthetic: synthetic(ctx),
    status: { label: t(result.state === "plan" && result.details.modeling ? "Modeled calendar." : words.status[result.state].label), text: statusSentence(ctx), tone },
  };
}

function statusSentence(ctx: Context): PdfText {
  const result = ctx.snapshot.result;
  switch (result.state) {
    case "plan": return t(result.details.modeling ? words.modeling.planStatus : words.status.plan.text);
    case "plan_with_warnings": return t(flagged(ctx, result));
    case "insufficient_data": return t(words.status.insufficient_data.text);
    case "no_calendar_fit": return t(result.details.modeling ? words.modeling.noFitStatus : result.proof.kind === "duration_lower_bound"
      ? words.proofLine.duration(words.days(result.proof.mandatoryMinimumDays), words.whole(result.proof.horizonDays))
      : words.proofLine.structural);
    case "search_incomplete": return t(words.status.search_incomplete.text);
    case "service_error": return engineText(result.error.message, ctx.say);
  }
}

function flagged(ctx: Context, result: ResultOf<"plan_with_warnings">): string {
  const { details, plan } = result;
  const of = (code: ResultWarning["code"]) => details.warnings.filter(warning => warning.code === code);
  const cropsOf = (list: readonly ResultWarning[]) => cropList(ctx, list.flatMap(warning => warning.cropPurposeIds));
  const parts: string[] = [];
  if (of("rainfall_mismatch").length) {
    const frequency = plan.rankingTuple.components[0].value;
    parts.push(words.flaggedParts.rain(frequency > 0 ? words.low(words.howOften(frequency).value) : null));
  }
  const heat = of("temperature_exposure");
  if (heat.length) {
    const share = available(metricIn(details.metrics, "q90_temperature_exposure"));
    parts.push(words.flaggedParts.heat(cropsOf(heat) ?? "a crop", share !== null && share > 0 ? words.heatSize(share) : null));
  }
  const place = of("environmental_rule");
  if (place.length) parts.push(words.flaggedParts.place(cropsOf(place) ?? "the plan"));
  if (of("rotation_rule").length) parts.push(words.flaggedParts.order);
  return words.flaggedSentence(parts);
}

function synthetic(ctx: Context): PdfText | null {
  const provenance = ctx.snapshot.result.details.provenance;
  return provenance.kind === "synthetic" ? t(provenance.label) : null;
}

function footer(ctx: Context, left: PdfText): Footer {
  return { left, synthetic: synthetic(ctx) };
}

function yearOf(ctx: Context): { readonly start: IsoDate; readonly endExclusive: IsoDate } {
  const { input, result } = ctx.snapshot;
  if (result.state === "plan" || result.state === "plan_with_warnings") return result.plan.horizon;
  const end = utcDay(input.planningStart);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  // 29 February rolls over to 1 March in a common year; the engine ends that year on 28 February instead.
  if (end.getUTCDate() !== utcDay(input.planningStart).getUTCDate()) end.setUTCDate(0);
  return { start: input.planningStart, endExclusive: isoDate(end) };
}

function historyWords(history: FarmInput["history"]): string {
  if (history.kind === "skipped") return words.historyLine.skipped;
  if (!history.entries.length) return words.historyLine.nothing;
  const crops = history.entries.filter(entry => entry.kind === "crop").length;
  const empty = history.entries.length - crops;
  return words.historyLine.recorded(words.listWords([
    ...(crops ? [words.historyLine.crops(crops)] : []),
    ...(empty ? [words.historyLine.empty(empty)] : []),
  ]));
}

function warnings(all: readonly ResultWarning[], flagsAllowed: boolean, ctx: Context): readonly Section<Block>[] {
  const flagCodes = new Set<string>(words.flagCodes);
  const isFlag = (warning: ResultWarning) => flagsAllowed && flagCodes.has(warning.code);
  const item = (warning: ResultWarning): Item => {
    const who = cropList(ctx, warning.cropPurposeIds);
    const many = unique(warning.cropPurposeIds).length > 1;
    const water = ctx.snapshot.input.water;
    const ownLine = words.warningLines[warning.code];
    return {
      head: t(words.warningHeads[warning.code](who, many, water)),
      lines: [ownLine === undefined ? engineText(warning.message, ctx.say) : t(ownLine(who, many, water))],
    };
  };
  const flags = all.filter(isFlag);
  const notes = all.filter(warning => !isFlag(warning));
  const sections: Section<Block>[] = [];
  if (flags.length) {
    sections.push({
      heading: t(words.warningSections.flagged),
      blocks: [
        paragraph(t(words.flagWhy)),
        list("bullet", flags.map(item)),
        paragraph(t(words.flagWhyNot)),
      ],
    });
  }
  if (notes.length) {
    sections.push({ heading: t(words.warningSections.goodToKnow), blocks: [list("bullet", notes.map(item))] });
  }
  return sections;
}

type Stretch =
  | { readonly look: "crop" | "after_harvest"; readonly from: number; readonly to: number; readonly occurrence: PlanOccurrence }
  | { readonly look: "no_crop"; readonly from: number; readonly to: number };

function timeline(plan: Plan, ctx: Context): { readonly timeline: Timeline; readonly rows: readonly Item[] } {
  const { say } = ctx;
  const { start, endExclusive } = plan.horizon;
  const length = daysBetween(start, endExclusive);
  const at = (date: IsoDate) => Math.min(Math.max(daysBetween(start, date), 0), length);
  const dayAt = (offset: number) => addDays(start, offset);

  const stretches: Stretch[] = [];
  let cursor = 0;
  for (const occurrence of [...plan.occurrences].sort((a, b) => a.planted.localeCompare(b.planted))) {
    const from = Math.max(at(occurrence.planted), cursor);
    const harvested = at(addDays(occurrence.lastOccupied, 1));
    const free = Math.max(at(occurrence.fieldAvailable), harvested);
    if (harvested <= from) continue;
    if (from > cursor) stretches.push({ look: "no_crop", from: cursor, to: from });
    stretches.push({ look: "crop", from, to: harvested, occurrence });
    if (free > harvested) stretches.push({ look: "after_harvest", from: harvested, to: free, occurrence });
    cursor = free;
  }
  if (cursor < length) stretches.push({ look: "no_crop", from: cursor, to: length });

  const rows: Item[] = [];
  const bars: Bar[] = [];
  const span = (from: number, to: number) => words.calendar.span(period(ctx, dayAt(from), dayAt(to - 1)), words.days(to - from));
  stretches.forEach((stretch, index) => {
    const bar = (key: number): Bar => ({ look: stretch.look, from: stretch.from, days: stretch.to - stretch.from, key });
    const previous = stretches[index - 1];
    // The ranking counts the days after a harvest as days without a planned crop, so the no_crop row that follows
    // describes this bar too, and its length matches the tuple's longest_unplanted_gap.
    if (stretch.look === "after_harvest" && stretches[index + 1]?.look === "no_crop") {
      bars.push(bar(rows.length + 1));
      return;
    }
    bars.push(bar(rows.length + 1));
    if (stretch.look === "crop") {
      const { occurrence } = stretch;
      rows.push({
        head: t(words.cap(cropName(ctx.snapshot, occurrence.cropPurposeId))),
        lines: ctx.snapshot.result.details.modeling && occurrence.modeledTiming ? [
          t(words.modeling.cropDates(say.day(occurrence.planted), period(ctx, occurrence.modeledTiming.earliestHarvest, occurrence.modeledTiming.latestHarvest))),
          t(words.modeling.cropDays(words.days(stretch.to - stretch.from), say.day(occurrence.modeledTiming.latestHarvest), say.day(occurrence.fieldAvailable))),
        ] : [
          t(words.calendar.crop(say.day(occurrence.planted), say.day(occurrence.lastOccupied))),
          t(words.calendar.cropDays(words.days(stretch.to - stretch.from), say.day(occurrence.fieldAvailable))),
        ],
      });
    } else if (stretch.look === "after_harvest") {
      rows.push({
        head: t(words.calendar.afterHarvest),
        lines: [t(span(stretch.from, stretch.to)), t(words.calendar.afterHarvestOf(cropName(ctx.snapshot, stretch.occurrence.cropPurposeId)))],
      });
    } else if (previous?.look === "after_harvest") {
      rows.push({
        head: t(words.calendar.noCrop),
        lines: [
          t(span(previous.from, stretch.to)),
          t(words.calendar.firstDaysAfterHarvest(previous.to - previous.from, cropName(ctx.snapshot, previous.occurrence.cropPurposeId))),
        ],
      });
    } else {
      rows.push({ head: t(words.calendar.noCrop), lines: [t(span(stretch.from, stretch.to))] });
    }
  });

  const names = Array.from({ length: 12 }, (_, index) => say.month(index + 1));
  const namesFit = names.every(name => name.length <= longestMonthName);
  const monthLabel = namesFit ? (month: number) => names[month - 1] : (month: number) => t(String(month));
  const months: MonthTick[] = [];
  const years: { readonly from: number; readonly label: PdfText }[] = [];
  for (let first = start; first < endExclusive;) {
    const year = Number(first.slice(0, 4));
    const month = Number(first.slice(5, 7));
    const next = utcDay(first);
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    const last = isoDate(next) < endExclusive ? isoDate(next) : endExclusive;
    const from = daysBetween(start, first);
    const days = daysBetween(first, last);
    months.push({ from, days, label: days >= 20 ? monthLabel(month) : null });
    if (months.length === 1 || month === 1) {
      const newYear = utcDay(first);
      newYear.setUTCFullYear(year + 1, 0, 1);
      if (at(isoDate(newYear)) - from >= 0.14 * length) years.push({ from, label: t(String(year)) });
    }
    first = last;
  }

  const looks: readonly BarLook[] = ["crop", "after_harvest", "no_crop"];
  const legend = looks.filter(look => bars.some(bar => bar.look === look)).map(look => ({
    look, label: t(look === "crop" && ctx.snapshot.result.details.modeling ? "Reserved cropping slot, numbered as in the list below" : words.legend[look]),
  }));
  return { timeline: { days: length, months, years, bars, legend }, rows };
}

function searchLimit(details: ResultDetails): Block {
  return list("none", [{
    head: t(words.searchLimit.lead),
    lines: [t(words.searchLimit.text), t(words.searchLimit.gridStep(words.days(details.search.gridStepDays)))],
  }]);
}

function ranking(plan: Plan, details: ResultDetails, ctx: Context): Section<Block> {
  const yearDays = daysBetween(plan.horizon.start, plan.horizon.endExclusive);
  const rows = plan.rankingTuple.components.map((component): Item => ({
    head: t((details.modeling ? words.modeling.questions : words.rankingQuestions)[component.metricId]),
    lines: rankingLines(component, yearDays, details.modeling !== undefined).map(line => t(line)),
  }));
  return {
    heading: t(words.ranking.heading),
    blocks: [
      paragraph(t(details.modeling ? words.modeling.fixedOrder : words.ranking.order)),
      list("number", rows),
      ...(details.modeling ? [paragraph(t(words.modeling.occupancy))] : []),
      paragraph(t(words.ranking.notRanked), "strong"),
      list("bullet", [badYear(details, ctx), heatAndCold(plan, details, ctx)]),
      paragraph(t(`${cohortLine(details, ctx)} ${words.ranking.pastNotPrediction} ${words.ranking.rainAlone}`), "small"),
    ],
  };
}

function rankingLines(component: RankingComponent, yearDays: number, modeled: boolean): readonly string[] {
  switch (component.metricId) {
    case "mean_frequency": return said(words.howOften(component.value));
    case "mean_mismatch": return said(words.howMuch(component.value));
    case "unplanted_days": return [words.days(component.value), (modeled ? words.modeling.unplanted : words.ranking.unplannedNote)(words.whole(yearDays))];
    case "longest_unplanted_gap": return [words.days(component.value), modeled ? words.modeling.longest : words.ranking.longestNote];
  }
}

const said = ({ value, note }: words.ValueWords) => [value, note];

function badYear(details: ResultDetails, ctx: Context): Item {
  const metric = metricIn(details.metrics, "q90_mismatch");
  const value = available(metric);
  return { head: t(words.ranking.badYear), lines: value === null ? notAvailable(metric, ctx) : said(words.badYearShortfall(value)).map(line => t(line)) };
}

function heatAndCold(plan: Plan, details: ResultDetails, ctx: Context): Item {
  const crops = unique(plan.occurrences.map(occurrence => occurrence.cropPurposeId));
  const unassessed = unique(details.unassessedChecks.filter(gap => gap.code === "temperature_rule").flatMap(gap => gap.cropPurposeIds));
  const outside = unique(details.warnings.filter(warning => warning.code === "temperature_exposure").flatMap(warning => warning.cropPurposeIds));
  const inside = crops.filter(id => !unassessed.includes(id) && !outside.includes(id));
  const metric = metricIn(details.metrics, "q90_temperature_exposure");
  const value = available(metric);
  const who = (ids: readonly CropPurposeId[]) => cropList(ctx, ids) ?? "";
  const parts = [
    ...(outside.length ? [words.heat.outside(who(outside))] : []),
    ...(inside.length && value !== null ? [words.heat.inside(who(inside))] : []),
    ...(unassessed.length ? [words.heat.notAssessedFor(who(unassessed))] : []),
  ];
  const lines: PdfText[] = value === null
    ? unassessed.length && !outside.length && !inside.length
      ? [t(words.heat.notAssessed)]
      : notAvailable(metric, ctx)
    : value <= 0 ? [t(words.heat.none)]
    : [t(value >= 1 ? words.heat.every : words.heat.share(words.aboutPercent(value))), t(words.heat.note)];
  return { head: t(words.ranking.heatAndCold), lines: [...lines, ...parts.map(part => t(part))] };
}

function notAvailable(metric: AssessmentMetric | undefined, ctx: Context): PdfText[] {
  const reason = metric?.value.kind === "unavailable" ? [engineText(metric.value.reason, ctx.say)] : [];
  return [t(words.notAvailable), ...reason];
}

function compared(ctx: Context): Section<Block> | null {
  const { say } = ctx;
  const heading = t(words.compare.heading);
  const { result, input: { history } } = ctx.snapshot;
  const { details } = result;
  const baseline = details.baseline;
  switch (baseline.kind) {
    case "not_recorded":
      return { heading, blocks: [paragraph(t(words.compare.skipped))] };
    case "not_assessable": {
      const estimated = history.kind === "recorded" && history.entries.some(entry =>
        entry.kind === "crop" && (entry.plantedPrecision === "approximate" || entry.harvestedPrecision === "approximate"));
      return {
        heading,
        blocks: [
          paragraph(t(words.compare.notScored)),
          list("bullet", baseline.reasons.map(reason => ({ head: null, lines: [engineText(reason, say)] }))),
          ...(estimated ? [paragraph(t(words.compare.estimatesNotAssessed))] : []),
          ...reported(ctx, false),
        ],
      };
    }
    case "assessed": {
      if (result.state !== "plan" && result.state !== "plan_with_warnings") {
        const lines = (metric: AssessmentMetric) => {
          const value = available(metric);
          return value === null ? notAvailable(metric, ctx) : [t(words.metricValue(value, metric.unit))];
        };
        return {
          heading,
          blocks: [
            paragraph(t(words.verdict(baseline))),
            ...(baseline.approximateDates ? [paragraph(t(words.compare.estimatesScored))] : []),
            ...(baseline.metrics.length ? [
              paragraph(t(words.compare.scored), "strong"),
              list("bullet", baseline.metrics.map(metric => ({ head: t(words.deltaNames[metric.id] ?? metric.label), lines: lines(metric) }))),
            ] : []),
            ...reported(ctx, true),
          ],
        };
      }
      const deltas = baseline.deltas.map((delta): Item => {
        const now = metricIn(details.metrics, delta.metricId);
        const before = metricIn(baseline.metrics, delta.metricId);
        const valueOf = (metric: AssessmentMetric | undefined) => {
          const value = available(metric);
          return value === null ? words.notAvailable : words.metricValue(value, delta.unit);
        };
        return {
          head: t(words.deltaNames[delta.metricId] ?? now?.label ?? before?.label ?? delta.metricId),
          lines: [
            t(words.compare.thisPlan(valueOf(now))),
            t(words.compare.lastYear(valueOf(before))),
            delta.difference.kind === "available"
              ? t(words.deltaWords(delta.difference.value, delta.unit, delta.direction))
              : engineText(words.compare.notCompared(delta.difference.reason), say),
          ],
        };
      });
      const changes = baseline.changes.map((change): Item => ({ head: null, lines: [t(changeWords(change, ctx))] }));
      return {
        heading,
        blocks: [
          paragraph(t(words.verdict(baseline))),
          ...(baseline.approximateDates ? [paragraph(t(words.compare.estimatesAssessed))] : []),
          paragraph(t(words.compare.howTheyCompare), "strong"),
          deltas.length
            ? list("bullet", deltas)
            : paragraph(t(words.compare.noNumbers)),
          paragraph(t(words.compare.changesHeading), "strong"),
          ...(changes.length ? [paragraph(t(words.compare.movedForward), "small"), list("bullet", changes)]
            // The engine can say "changed" with no changes listed, so only "kept" means no changes.
            : [paragraph(t(baseline.recommendation === "kept" ? words.compare.noChanges : words.compare.cantList))]),
        ],
      };
    }
  }
}

function changeWords(change: Extract<BaselineComparison, { kind: "assessed" }>["changes"][number], ctx: Context): string {
  const { say } = ctx;
  const crop = (id: CropPurposeId) => cropName(ctx.snapshot, id);
  switch (change.kind) {
    case "added": return words.changes.added(crop(change.occurrence.cropPurposeId), period(ctx, change.occurrence.planted, change.occurrence.lastOccupied));
    case "removed": return words.changes.removed(crop(change.occurrence.cropPurposeId), period(ctx, change.occurrence.planted, change.occurrence.lastOccupied));
    case "date_shift": {
      const shift = daysBetween(change.before.planted, change.after.planted);
      const who = crop(change.after.cropPurposeId);
      return shift === 0
        ? words.changes.sameDay(who, say.day(change.after.planted), say.day(change.after.lastOccupied), say.day(change.before.lastOccupied))
        : words.changes.shifted(who, words.days(Math.abs(shift)), shift < 0, say.day(change.after.planted), say.day(change.before.planted));
    }
    case "order_change":
      return words.changes.order(words.cap(cropName(ctx.snapshot, change.cropPurposeId)), words.ordinal(change.beforeIndex + 1), words.ordinal(change.afterIndex + 1));
  }
}

function reported(ctx: Context, scored: boolean): Block[] {
  const { say } = ctx;
  const history = ctx.snapshot.input.history;
  if (history.kind === "skipped") return [];
  const items: Item[] = [];
  const unsure = (from: IsoDate, to: IsoDate) => items.push({
    head: t(words.compare.unknown),
    lines: [t(words.calendar.span(period(ctx, from, addDays(to, -1)), words.days(daysBetween(from, to))))],
  });
  let cursor = history.start;
  const entries = [...history.entries].sort((a, b) =>
    (a.kind === "crop" ? a.planted : a.start).localeCompare(b.kind === "crop" ? b.planted : b.start));
  for (const entry of entries) {
    const from = entry.kind === "crop" ? entry.planted : entry.start;
    const to = entry.kind === "crop" ? addDays(entry.harvested, 1) : entry.endExclusive;
    if (from > cursor) unsure(cursor, from);
    if (entry.kind === "fallow") {
      items.push({ head: t(words.compare.fallow), lines: [t(words.calendar.span(period(ctx, from, addDays(to, -1)), words.days(daysBetween(from, to))))] });
    } else {
      const dates = t(words.compare.planted(entry.plantedPrecision === "approximate", say.day(entry.planted),
        entry.harvestedPrecision === "approximate", say.day(entry.harvested)));
      if (entry.crop.kind === "catalogue") {
        items.push({ head: t(words.cap(cropName(ctx.snapshot, entry.crop.cropPurposeId))), lines: [dates] });
      } else {
        const name = ownName(entry.crop.label, words.unlisted.fallback);
        items.push(name.shown === "replaced"
          ? { head: name.text, lines: [dates, t(words.unlisted.note)] }
          : { head: t(words.compare.notListed(name.text)), lines: [dates] });
      }
    }
    if (to > cursor) cursor = to;
  }
  if (cursor < history.endExclusive) unsure(cursor, history.endExclusive);
  return [
    paragraph(t(words.compare.reported(scored)), "strong"),
    list("none", items),
  ];
}

function prepare(details: ResultDetails, ctx: Context): Section<Block> | null {
  if (!details.preparation.length) return null;
  return {
    heading: t(words.prepareHeading),
    blocks: [list("number", details.preparation.map(step => ({ head: null, lines: [engineText(step.text, ctx.say)] })))],
  };
}

/** The engine copies `missing` into unassessedChecks, so a gap already listed under What’s missing is left out here. */
function couldNotCheck(result: PlanResult, ctx: Context): Section<Block> | null {
  const key = (gap: { readonly code: string; readonly reason: string }) => `${gap.code}|${gap.reason}`;
  const listed = new Set(result.state === "insufficient_data" ? result.missing.map(key) : []);
  const gaps = result.details.unassessedChecks.filter(gap => !listed.has(key(gap)));
  if (!gaps.length) return null;
  return { heading: t(words.unassessedHeading), blocks: [gapList(gaps, ctx)] };
}

/** The engine can report one gap twice with different reasons, so a code and its crops make one item with every reason. */
function gapList(gaps: ResultDetails["unassessedChecks"], ctx: Context): Block {
  const items = new Map<string, { readonly gap: ResultDetails["unassessedChecks"][number]; readonly reasons: string[] }>();
  for (const gap of gaps) {
    const key = `${gap.code}|${unique(gap.cropPurposeIds).sort().join(" ")}`;
    const item = items.get(key);
    if (item === undefined) items.set(key, { gap, reasons: [gap.reason] });
    else if (!item.reasons.includes(gap.reason)) item.reasons.push(gap.reason);
  }
  return list("bullet", [...items.values()].map(({ gap, reasons }) => ({
    head: t(words.gapHeads[gap.code](cropList(ctx, gap.cropPurposeIds), unique(gap.cropPurposeIds).length > 1)),
    lines: reasons.map(reason => engineText(namingCrops(reason, gap.cropPurposeIds, ctx), ctx.say)),
  })));
}

/** The registry names a crop by its ID ("No released common-bean-dry profile applies"). An ID inside a longer ID is left alone. */
function namingCrops(text: string, ids: readonly CropPurposeId[], ctx: Context): string {
  if (!ids.length) return text;
  const names = new Map<string, string>(ids.map(id => [id, cropName(ctx.snapshot, id)]));
  const standalone = new RegExp(`(?<![a-z0-9]|[a-z0-9][-_:])(?:${[...names.keys()].join("|")})(?![a-z0-9]|[-_:][a-z0-9])`, "g");
  return words.cap(text.replace(standalone, match => names.get(match) ?? match));
}

function monthlyInsights(details: ResultDetails): ResultDetails["insights"] {
  const columns: readonly string[] = words.insightColumns;
  return details.insights.filter(insight => insight.month !== null && columns.includes(insight.metric.id));
}

function farm(details: ResultDetails, ctx: Context): Section<Block> | null {
  const monthly = monthlyInsights(details);
  if (!monthly.length) return null;
  const firstMonth = Number(ctx.snapshot.input.planningStart.slice(5, 7));
  const cell = (month: number, id: string) => {
    const value = available(monthly.find(insight => insight.month === month && insight.metric.id === id)?.metric);
    return t(value === null ? words.notAvailable : words.whole(value));
  };
  const rows = Array.from({ length: 12 }, (_, index) => {
    const month = ((firstMonth - 1 + index) % 12) + 1;
    return [ctx.say.month(month), ...words.insightColumns.map(id => cell(month, id))];
  });
  const periods = monthly.flatMap(insight => insight.metric.id === "monthly_rain_median" && insight.period.kind === "available" ? [insight.period.value] : []);
  const firstYear = periods.map(period => period.start.slice(0, 4)).sort()[0];
  const lastYear = periods.map(period => addDays(period.endExclusive, -1).slice(0, 4)).sort().at(-1);
  const years = firstYear && lastYear ? (firstYear === lastYear ? firstYear : `${firstYear} to ${lastYear}`) : null;
  return {
    heading: t(words.farm.heading),
    blocks: [
      paragraph(t(`${cohortLine(details, ctx)}${years ? ` ${words.farm.rainFrom(years)}` : ""}`), "small"),
      paragraph(t(words.farm.caption), "small"),
      { kind: "table", columns: words.farm.columns.map(column => t(column)), rows },
    ],
  };
}

function method(ctx: Context): Section<Block> {
  const { result } = ctx.snapshot;
  const constraints = result.state === "no_calendar_fit" && result.proof.kind === "structural_exhaustion" ? result.proof.constraints : [];
  return {
    heading: t(words.methodHeading),
    blocks: [
      paragraph(engineText(result.details.explanation, ctx.say)),
      ...(constraints.length ? [list("bullet", constraints.map(constraint => ({ head: null, lines: [engineText(constraint, ctx.say)] })))] : []),
    ],
  };
}

function modeling(details: ResultDetails, ctx: Context): Section<Block> | null {
  const diagnostics = details.modeling;
  if (!diagnostics) return null;
  const said = words.modeling;
  return {
    heading: t(said.label),
    blocks: [
      paragraph(t(said.validation)),
      paragraph(t(said.checks)),
      paragraph(t(said.methodReservation)),
      paragraph(t(said.methodOccupancy)),
      list("none", diagnostics.crops.map(crop => ({
        head: cropName(ctx.snapshot, crop.cropPurposeId),
        lines: [
          t(said.reference(crop.scientificName, crop.harvestPurpose)),
          t(said.cultivar(crop.cultivarAssumption)),
          t(said.basis[crop.evidenceBasis]),
          t(said.identity(crop.modelId, crop.modelVersion)),
          t(`Sources ${crop.sourceIds.join(", ") || "none recorded"}.`),
          t(`Turnaround after the latest modeled harvest is ${words.days(crop.turnaroundDays)}.`),
          t(`${words.whole(crop.validPlantingDays)} planting dates completed in every retained replay.`),
          ...crop.assumptions.map(line => engineText(line, ctx.say)),
          ...crop.limitations.map(line => engineText(line, ctx.say)),
          ...crop.noncompletionByReplay.map(replay => t(said.noncompletion(words.whole(replay.plantingDays), ctx.say.day(replay.replayStart)))),
        ],
      }))),
      paragraph(t(`Model release ${diagnostics.modelReleaseVersion}.`), "small"),
      paragraph(t(`Model release hash ${diagnostics.modelReleaseHash}.`), "small"),
      paragraph(t(`Reservation policy ${diagnostics.policy.reservation}.`), "small"),
      paragraph(t(`Planned-slot policy ${diagnostics.policy.occupancy}.`), "small"),
      paragraph(t(`Retained weather replay starts ${diagnostics.retainedReplayStarts.map(ctx.say.day).join(", ") || "none"}.`), "small"),
    ],
  };
}

function assumptions(details: ResultDetails, ctx: Context): Section<Block> | null {
  if (!details.assumptions.length) return null;
  return {
    heading: t(words.assumptionsHeading),
    blocks: [list("bullet", details.assumptions.map(line => ({ head: null, lines: [engineText(line, ctx.say)] })))],
  };
}

function cohortLine(details: ResultDetails, ctx: Context): string {
  if (details.cohort.kind === "unavailable") return words.sources.cohortUnavailable(engineText(details.cohort.reason, ctx.say));
  const usable = details.cohort.value.seasons.filter(season => season.status === "usable")
    .sort((a, b) => a.interval.start.localeCompare(b.interval.start));
  if (!usable.length) return words.sources.cohortNone;
  const { state } = ctx.snapshot.result;
  return (state === "plan" || state === "plan_with_warnings" ? words.sources.cohort : words.sources.weatherFrom)(words.count(usable.length, "past season"),
    monthRange(ctx, usable[0].interval.start, addDays(usable[usable.length - 1].interval.endExclusive, -1)));
}

function sources(details: ResultDetails, ctx: Context, printedMetrics: readonly AssessmentMetric[]): Section<Block> {
  const { say } = ctx;
  const { provenance, cohort } = details;
  const lines: string[] = [cohortLine(details, ctx)];
  if (cohort.kind === "available") {
    lines.push(words.sources.seasonsMethod(cohort.value.methodVersion));
    for (const season of cohort.value.seasons) {
      if (season.status === "excluded") {
        lines.push(words.sources.excluded(monthRange(ctx, season.interval.start, addDays(season.interval.endExclusive, -1)), engineText(season.reason, say)));
      }
    }
  }
  const methods = unique(printedMetrics.map(metric => metric.methodVersion));
  if (methods.length) lines.push(words.sources.methods(methods.join("; ")));
  for (const source of provenance.sources) lines.push(words.sources.source(source.title, source.section, source.url));
  for (const product of provenance.climateProducts) {
    const version = product.version.kind === "available"
      ? words.sources.productVersion(product.version.value)
      : words.sources.productVersionMissing(engineText(product.version.reason, say));
    lines.push(words.sources.cell(product.provider, product.product, product.cellId,
      words.sources.grid(product.gridDegrees[0], product.gridDegrees[1]), version, product.sourceUrl));
  }
  if (provenance.profiles.length) {
    lines.push(words.sources.profiles(provenance.profiles.map(profile => `${words.cap(cropName(ctx.snapshot, profile.cropPurposeId))} ${profile.id} ${profile.version}`).join("; ")));
  }
  if (provenance.rules.length) lines.push(words.sources.rules(provenance.rules.map(rule => `${rule.id} ${rule.version}`).join("; ")));
  if (provenance.manifest.kind === "available") {
    const manifest = provenance.manifest.value;
    lines.push(words.sources.versions(manifest.engineVersion, manifest.configurationVersion, manifest.catalogueVersion, manifest.ruleVersion, say.day(manifest.dataCutoff)));
    if (manifest.climateSnapshotIds.length) lines.push(words.sources.weatherRecords(manifest.climateSnapshotIds.join(", ")));
  } else {
    lines.push(words.sources.versionsMissing(engineText(provenance.manifest.reason, say)));
  }
  return {
    heading: t(words.sources.heading),
    blocks: lines.map(line => paragraph(t(line), "small")),
  };
}


function metricIn(list: readonly AssessmentMetric[], id: string): AssessmentMetric | undefined {
  return list.find(metric => metric.id === id);
}

function available(metric: AssessmentMetric | undefined): number | null {
  return metric?.value.kind === "available" ? metric.value.value : null;
}

function unique<T>(list: readonly T[]): T[] {
  return [...new Set(list)];
}

function cropList(ctx: Context, ids: readonly CropPurposeId[]): string | null {
  const names = unique(ids).map(id => cropName(ctx.snapshot, id));
  if (!names.length) return null;
  // "Pumpkin and winter squash and Squash and zucchini" reads as four crops.
  return names.some(name => /,| and /.test(name)) ? names.join("; ") : words.listWords(names);
}

const paragraph = (text: PdfText, style: TextStyle = "body"): Block => ({ kind: "text", style, text });
const list = (marker: "bullet" | "number" | "none", items: readonly Item[]): Block => ({ kind: "list", marker, items });

function present<T>(value: T | null): value is T {
  return value !== null;
}


function period(ctx: Context, first: IsoDate, last: IsoDate): PdfText {
  return first === last ? ctx.say.day(first) : ctx.say.range(first, last);
}

function monthRange(ctx: Context, first: IsoDate, last: IsoDate): string {
  const from = ctx.say.monthYear(first);
  const to = ctx.say.monthYear(last);
  return from === to ? from : `${from} to ${to}`;
}

const isoDate = (date: Date) => parseIsoDate(date.toISOString().slice(0, 10));

function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / 86_400_000);
}

function addDays(date: IsoDate, days: number): IsoDate {
  const moved = utcDay(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return isoDate(moved);
}
