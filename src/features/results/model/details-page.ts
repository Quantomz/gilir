import type { AssessmentMetric, CompletedSnapshot, IsoDate, ResultDetails } from "@/contracts";
import type { ModelDiagnostics } from "@/contracts/model";
import { item, items, subhead, text } from "./blocks";
import type { Block, DetailsPage, DetailsSectionId, FactsBlock, Item, Section, TableBlock } from "./blocks";
import { monthOf } from "./calendar";
import { bestFoundNote, monthTable, otherInsights } from "./result-page";
import * as words from "./words";
import type { Format } from "./words";

type Builder = (snapshot: CompletedSnapshot, format: Format) => Section<DetailsSectionId>;
type Provenance = ResultDetails["provenance"];
type Fact = FactsBlock["facts"][number];

const builders: readonly Builder[] = [numbers, definitions, months, seasons, sources, profiles, coverage, assumptions, versions, answers];

export function detailsPage(snapshot: CompletedSnapshot, format: Format): DetailsPage {
  const synthetic = words.syntheticOf(snapshot);
  return {
    back: words.details.back,
    eyebrow: words.eyebrowOf(snapshot, format),
    title: words.details.title,
    lead: words.details.lead(words.titleOf(snapshot)),
    synthetic: synthetic === null ? null : words.details.synthetic(synthetic),
    sections: [
      ...(snapshot.result.details.modeling ? [modeling(snapshot, snapshot.result.details.modeling, format)] : []),
      ...builders.map(build => build(snapshot, format)),
    ],
  };
}

function modeling(snapshot: CompletedSnapshot, diagnostics: ModelDiagnostics, format: Format): Section<"modeling"> {
  const names = words.cropNamesOf(snapshot);
  const said = words.modeling;
  return section("modeling", said.label, [
    text("body", said.validation),
    text("body", said.checks),
    text("body", said.methodReservation),
    text("body", said.methodOccupancy),
    ...diagnostics.crops.flatMap(crop => [
      subhead(names.name(crop.cropPurposeId)),
      text("body", said.reference(crop.scientificName, crop.harvestPurpose)),
      text("body", said.cultivar(crop.cultivarAssumption)),
      text("body", said.basis[crop.evidenceBasis]),
      facts([
        fact("Model", `${crop.modelId}, ${crop.modelVersion}`, true),
        fact("Sources", crop.sourceIds.join(", ") || "None recorded", false),
        fact("Planting dates with completion in every retained replay", format.whole(crop.validPlantingDays), false),
        fact("Turnaround after the latest modeled harvest", words.dayCount(crop.turnaroundDays), false),
      ]),
      items([...crop.assumptions, ...crop.limitations].map(line => item(words.engineText(line, format), []))),
      ...crop.noncompletionByReplay.map(replay => text("body", said.noncompletion(format.whole(replay.plantingDays), format.day(replay.replayStart)))),
    ]),
    facts([
      fact("Model release", diagnostics.modelReleaseVersion, true),
      fact("Model release hash", diagnostics.modelReleaseHash, true),
      fact("Reservation policy", diagnostics.policy.reservation, true),
      fact("Planned-slot policy", diagnostics.policy.occupancy, true),
      fact("Retained weather replay starts", diagnostics.retainedReplayStarts.map(format.day).join(", ") || "None", false),
    ]),
  ]);
}

function numbers({ result }: CompletedSnapshot, format: Format): Section<"numbers"> {
  const { details } = result;
  const plan = words.planOf(result);
  const ranked: readonly Block[] = plan === null
    ? [text("body", words.details.noRanking)]
    : [
        text("body", words.details.tupleLead),
        facts(plan.rankingTuple.components.map(component => fact(
          (details.modeling ? words.modeling.questions : words.ranking.questions)[component.metricId],
          `${component.metricId} = ${component.unit === "days" ? words.dayCount(component.value) : exact(component.value)}`,
          true,
        ))),
      ];
  return section("numbers", plan === null ? words.details.sections.numbersNoPlan : words.details.sections.numbers, [
    ...(result.state === "service_error" ? [text("body", words.details.serviceReport(result.error.message, result.error.code))] : []),
    ...ranked,
    ...(details.metrics.length > 0
      ? details.metrics.flatMap(metric => metricBlocks(metric, details.provenance, format))
      : [text("muted", details.insights.length > 0 ? words.details.numbersAreMonthly : words.details.noMetrics)]),
  ]);
}

function metricBlocks(metric: AssessmentMetric, provenance: Provenance, format: Format): readonly Block[] {
  const named = words.details.metricFacts;
  return [
    subhead(words.metricNames.get(metric.id) ?? metric.label),
    text("big", words.exactOf(metric.value, metric.unit, format)),
    facts([
      fact(named.inResult, `${metric.label} (${metric.id})`, false),
      fact(named.outOf, denominatorOf(metric, format), false),
      fact(named.basis, words.basisWords[metric.basis], false),
      fact(named.method, metric.methodVersion, true),
      fact(named.sources, metric.sourceIds.length === 0 ? named.noSources : sourceTitles(metric.sourceIds, provenance), false),
    ]),
    ...(metric.assumptions.length === 0 ? [] : [items(metric.assumptions.map(assumption => item(assumption, [])))]),
  ];
}

function definitions({ result }: CompletedSnapshot, format: Format): Section<"definitions"> {
  const unavailable = result.details.insights.filter(insight => insight.metric.value.kind === "unavailable");
  return section("definitions", words.details.sections.definitions, [
    facts(words.definitions.map(([name, value]) => fact(name, value, false))),
    text("muted", words.disclaimers[1]),
    ...(unavailable.length === 0 ? [] : [
      subhead(words.details.notAvailableHeading),
      items(unavailable.map(({ metric }) => item(metric.label, [words.exactOf(metric.value, metric.unit, format)]))),
    ]),
  ]);
}

function months({ input, result }: CompletedSnapshot, format: Format): Section<"months"> {
  const { insights, provenance } = result.details;
  const table = monthTable(insights, monthOf(input.planningStart), format);
  const others = otherInsights(insights, format);
  return section("months", words.details.sections.months, [
    table ?? text("body", words.details.noMonths),
    ...(others.length === 0 ? [] : [subhead(words.details.otherNumbers), items(others)]),
    ...[...new Set(insights.map(insight => insight.metric.id))].flatMap(id => insightBlocks(insights.filter(insight => insight.metric.id === id), provenance, format)),
  ]);
}

function insightBlocks(ofOneMetric: ResultDetails["insights"], provenance: Provenance, format: Format): readonly Block[] {
  const named = words.details.metricFacts;
  const [{ metric }] = ofOneMetric;
  const across = (valueOf: (insight: ResultDetails["insights"][number]) => string) => {
    const values = ofOneMetric.map(insight => [insight.month, valueOf(insight)] as const);
    if (new Set(values.map(([, value]) => value)).size === 1) return values[0][1];
    return values.map(([month, value]) => (month === null ? value : words.months.when(format.month(month, "long"), value))).join("; ");
  };
  const assumptions = [...new Set(ofOneMetric.flatMap(insight => insight.metric.assumptions))];
  return [
    subhead(words.metricNames.get(metric.id) ?? metric.label),
    facts([
      fact(named.inResult, `${metric.label} (${metric.id})`, false),
      fact(named.period, across(insight => (insight.period.kind === "available"
        ? format.monthRange(insight.period.value.start, insight.period.value.endExclusive)
        : words.details.notAvailable(insight.period.reason))), false),
      fact(named.outOf, across(insight => denominatorOf(insight.metric, format)), false),
      fact(named.basis, across(insight => words.basisWords[insight.metric.basis]), false),
      fact(named.method, across(insight => insight.metric.methodVersion), true),
      fact(named.sources, across(insight => (insight.metric.sourceIds.length === 0 ? named.noSources : sourceTitles(insight.metric.sourceIds, provenance))), false),
    ]),
    ...(assumptions.length === 0 ? [] : [items(assumptions.map(assumption => item(assumption, [])))]),
  ];
}

function denominatorOf({ denominator }: AssessmentMetric, format: Format): string {
  return denominator.kind === "available"
    ? format.count(denominator.value.count, ...words.denominatorWords[denominator.value.unit])
    : words.details.notAvailable(denominator.reason);
}

function seasons(snapshot: CompletedSnapshot, format: Format): Section<"seasons"> {
  const { cohort, seasonMetrics } = snapshot.result.details;
  const title = words.details.sections.seasons;
  if (cohort.kind === "unavailable") return section("seasons", title, [text("body", words.cohortLine(cohort, format))]);
  const { targetSeasons, minimumUsableSeasons, methodVersion } = cohort.value;
  const all = [...cohort.value.seasons].sort((a, b) => a.interval.start.localeCompare(b.interval.start));
  const left = all.flatMap(season => (season.status === "excluded" ? [season] : []));
  const named = (season: (typeof all)[number]) => format.monthRange(season.interval.start, season.interval.endExclusive);
  const table = words.details.seasonTable;
  const measured = (start: string, id: string) => {
    const metric = seasonMetrics.find(row => row.replayStart === start)?.metrics.find(each => each.id === id);
    return metric === undefined ? words.months.noValue : words.amountOf(metric.value, metric.unit, format);
  };
  const crops = cropTables(snapshot, all, format);
  return section("seasons", title, [
    text("body", `${words.cohortLine(cohort, format)} ${words.details.seasonsText(
      format.count(targetSeasons, "season", "seasons"), format.whole(minimumUsableSeasons), methodVersion,
    )}`),
    ...(left.length === 0
      ? [text("muted", words.details.noneLeftOut)]
      : [subhead(words.details.leftOut), items(left.map(season => item(named(season), [words.engineText(season.reason, format)])))]),
    {
      kind: "table",
      caption: table.caption(words.nounOf(snapshot)),
      columns: table.columns,
      rows: all.map(season => [
        named(season),
        season.status === "usable" ? table.used : table.leftOut(words.engineText(season.reason, format)),
        ...seasonColumns.map(id => measured(season.interval.start, id)),
      ]),
    },
    ...(crops.length === 0 ? [] : [subhead(words.details.cropTables.heading), text("muted", words.details.cropTables.lead), ...crops]),
  ]);
}

/** The engine's per-season metric ids behind the table's F, M and X columns, in column order. */
const seasonColumns = ["frequency", "mismatch", "temperature_exposure"] as const;

type Season = Extract<ResultDetails["cohort"], { readonly kind: "available" }>["value"]["seasons"][number];

/**
 * Each planted crop's own F, M and X per season, beside the season table's highest among the crops (spec.md section
 * 5.2). A crop whose seasons hold none of those numbers gets no table.
 */
function cropTables(snapshot: CompletedSnapshot, seasons: readonly Season[], format: Format): readonly TableBlock[] {
  const plan = words.planOf(snapshot.result);
  if (plan === null) return [];
  const names = words.cropNamesOf(snapshot);
  const said = words.details.cropTables;
  const seasonName = (start: IsoDate) => {
    const season = seasons.find(each => each.interval.start === start);
    return season === undefined ? format.day(start) : format.monthRange(season.interval.start, season.interval.endExclusive);
  };
  const cell = (metric: AssessmentMetric | undefined) => {
    if (metric === undefined) return words.months.noValue;
    const amount = words.amountOf(metric.value, metric.unit, format);
    return metric.value.kind === "available" && metric.denominator.kind === "available" ? said.over(amount, denominatorOf(metric, format)) : amount;
  };
  return plan.occurrences.flatMap((occurrence): TableBlock[] => {
    const rows = [...occurrence.seasonMetrics].sort((a, b) => a.replayStart.localeCompare(b.replayStart));
    if (!rows.some(row => row.metrics.some(metric => seasonColumns.some(id => id === metric.id)))) return [];
    return [{
      kind: "table",
      caption: said.caption(names.name(occurrence.cropPurposeId), format.dayRange(occurrence.planted, occurrence.lastOccupied)),
      columns: said.columns,
      rows: rows.map(row => [seasonName(row.replayStart), ...seasonColumns.map(id => cell(row.metrics.find(metric => metric.id === id)))]),
    }];
  });
}

function sources({ result }: CompletedSnapshot, format: Format): Section<"sources"> {
  const { provenance } = result.details;
  const said = words.details;
  const named = said.productFacts;
  const sourceItems = provenance.sources.map((source): Item => ({
    icon: null,
    head: source.title,
    href: linkOf(source.url),
    lines: [
      source.section,
      source.publishedOn.kind === "available" ? said.published(format.day(source.publishedOn.value)) : said.publishedUnknown(source.publishedOn.reason),
      said.taken(format.day(source.extractedOn)),
    ],
  }));
  const products = provenance.climateProducts.flatMap(product => {
    const missing = product.missingDayCounts.filter(count => count.missingDays > 0);
    return [
      subhead(`${product.provider}: ${product.product}`),
      facts([
        fact(named.cell, product.cellId, true),
        fact(named.size, said.cellSize(format.decimal(product.gridDegrees[0], 6), format.decimal(product.gridDegrees[1], 6)), false),
        fact(named.version, product.version.kind === "available" ? product.version.value : said.notRecorded(product.version.reason), false),
        fact(named.stream, product.stream.kind === "available" ? product.stream.value : said.notRecorded(product.stream.reason), false),
        fact(named.time, product.timeStandard, false),
        fact(named.units, product.unitsByField.map(unit => said.unitsUsed(unit.field, unit.originalUnit, words.unitWords[unit.canonicalUnit])).join("; "), false),
        fact(named.missing, missing.length === 0
          ? said.noMissingDays
          : missing.map(count => said.missingDays(count.field, format.count(count.missingDays, "day", "days"))).join("; "), false),
        fact(named.address, product.sourceUrl, true),
      ]),
    ];
  });
  return section("sources", said.sections.sources, [
    sourceItems.length === 0 ? text("body", said.noSources) : items(sourceItems),
    subhead(said.weather),
    ...(products.length === 0 ? [text("body", said.noWeather)] : products),
    text("muted", said.gridNote),
  ]);
}

function profiles(snapshot: CompletedSnapshot): Section<"profiles"> {
  const { provenance } = snapshot.result.details;
  const names = words.cropNamesOf(snapshot);
  const said = words.details;
  const sourced = (ids: readonly string[]) => said.sourcesLine(ids.length === 0 ? said.unreviewed : sourceTitles(ids, provenance));
  return section("profiles", said.sections.profiles, [
    provenance.profiles.length === 0
      ? text("body", said.noProfiles)
      : items(provenance.profiles.map(profile => item(names.name(profile.cropPurposeId), [said.profile(profile.id, profile.version), sourced(profile.sourceIds)]))),
    provenance.rules.length === 0
      ? text("body", said.noRules)
      : items(provenance.rules.map(rule => item(said.rule(rule.id, rule.version, rule.target), [sourced(rule.sourceIds)]))),
  ]);
}

function coverage({ result }: CompletedSnapshot, format: Format): Section<"coverage"> {
  const { search, baseline } = result.details;
  const said = words.details;
  const named = said.coverageFacts;
  const status = words.structuralWords[search.structural];
  const fitting = () => {
    if (search.structuralExpandedStates > 0) {
      return said.counted(status, said.upTo(format.whole(search.structuralExpandedStates), format.count(search.structuralExpansionLimit, "try", "tries")));
    }
    if (search.structural === "witness") return baseline.kind === "assessed" && baseline.eligible ? said.noSearchBaseline : said.noSearch(status);
    if (search.structural === "proved_impossible" && result.state === "no_calendar_fit" && result.proof.kind === "duration_lower_bound") {
      return said.noSearchDuration;
    }
    return status;
  };
  const ranked = search.ranking !== "not_started";
  const planned = words.planOf(result) !== null;
  return section("coverage", said.sections.coverage, [
    facts([
      fact(named.fitting, fitting(), false),
      fact(named.comparing, words.rankingWords[search.ranking], false),
      ...(ranked ? [
        fact(named.opened, said.upTo(format.whole(search.gridExpandedStates), format.whole(search.gridExpansionLimit)), false),
        fact(named.scored, `${said.upTo(format.whole(search.scoredCandidates), format.whole(search.scoredCandidateLimit))}${said.scoredTail}`, false),
        fact(named.dates, said.datesTried(words.dayCount(search.gridStepDays)), false),
      ] : []),
    ]),
    ...(planned && search.ranking === "limit_reached" ? [bestFoundNote(search)] : []),
    subhead(said.calculationSaid),
    text("body", words.engineText(result.details.explanation, format)),
    ...(result.state === "no_calendar_fit" && result.proof.kind === "structural_exhaustion"
      ? [items(result.proof.constraints.map(constraint => item(words.engineText(constraint, format), [])))]
      : []),
  ]);
}

function assumptions({ result }: CompletedSnapshot, format: Format): Section<"assumptions"> {
  const { details } = result;
  const said = words.details;
  const planned = words.planOf(result) !== null;
  const steps = planned ? details.preparation : [];
  return section("assumptions", said.sections.assumptions, [
    details.assumptions.length === 0
      ? text("body", said.noAssumptions)
      : items(details.assumptions.map(assumption => item(words.engineText(assumption, format), []))),
    ...(steps.length === 0 ? [] : [
      subhead(said.preparation),
      items(steps.map(step => item(words.engineText(step.text, format), [
        said.sourcesLine(step.sourceIds.length === 0 ? said.noneRecorded : sourceTitles(step.sourceIds, details.provenance)),
      ]))),
    ]),
    text("muted", words.disclaimers[0]),
  ]);
}

function versions(snapshot: CompletedSnapshot, format: Format): Section<"versions"> {
  const { manifest } = snapshot.result.details.provenance;
  const said = words.details;
  const named = said.versionFacts;
  return section("versions", said.sections.versions, [
    manifest.kind === "unavailable"
      ? text("body", said.notRecorded(manifest.reason))
      : facts([
          fact(named.engine, manifest.value.engineVersion, true),
          fact(named.settings, manifest.value.configurationVersion, true),
          fact(named.catalogue, manifest.value.catalogueVersion, true),
          fact(named.rules, manifest.value.ruleVersion, true),
          fact(named.cutoff, said.cutoff(format.day(manifest.value.dataCutoff)), false),
          fact(named.climate, manifest.value.climateSnapshotIds.join(", "), true),
          fact(named.fingerprint, manifest.value.normalizedInputHash, true),
        ]),
    text("muted", said.resultLine(snapshot.id, format.madeAt(snapshot.completedAt), String(snapshot.schemaVersion))),
  ]);
}

function answers(snapshot: CompletedSnapshot, format: Format): Section<"answers"> {
  const { input } = snapshot;
  const said = words.details;
  const named = said.answerFacts;
  const [longitude, latitude] = input.field.lookup;
  const degrees = (value: number, positive: "N" | "E", negative: "S" | "W") =>
    said.degrees(format.decimal(Math.abs(value), 3), value < 0 ? negative : positive);
  return section("answers", said.sections.answers, [
    facts([
      fact(named.field, said.weatherPoint(input.field.label, degrees(latitude, "N", "S"), degrees(longitude, "E", "W")), false),
      fact(named.corners, format.whole(input.field.ring.length - 1), false),
      fact(named.crops, words.sentenceCase(words.cropNamesOf(snapshot).list(input.cropPurposeIds)), false),
      fact(named.water, words.waterLabels[input.water], false),
      fact(named.ready, format.day(input.planningStart), false),
      fact(named.lastYear, lastYear(input.history, format), false),
    ]),
  ]);
}

function lastYear(history: CompletedSnapshot["input"]["history"], format: Format): string {
  const said = words.details.lastYear;
  if (history.kind === "skipped") return said.skipped;
  const crops = history.entries.filter(entry => entry.kind === "crop").length;
  const empty = history.entries.length - crops;
  if (crops + empty === 0) return said.nothing;
  return words.joinAnd([
    ...(crops === 0 ? [] : [format.count(crops, ...said.crops)]),
    ...(empty === 0 ? [] : [format.count(empty, ...said.empty)]),
  ]);
}

/** The contract's z.url() also accepts javascript: and data: addresses, and a stored snapshot is local data. */
function linkOf(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function sourceTitles(ids: readonly string[], provenance: Provenance): string {
  return ids.map(id => provenance.sources.find(source => source.id === id)?.title ?? id).join("; ");
}

/** Up to six decimals, the same in every language, because it sits next to a metric id as code. */
function exact(value: number): string {
  return String(Number(value.toFixed(6)));
}

function section<Id extends DetailsSectionId>(id: Id, title: string, blocks: readonly Block[]): Section<Id> {
  return { id, title, look: "card", blocks };
}

function facts(list: readonly Fact[]): Block {
  return { kind: "facts", facts: list };
}

function fact(name: string, value: string, code: boolean): Fact {
  return { name, value, code };
}
