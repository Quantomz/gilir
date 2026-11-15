import { resolveRegistry } from "@/registry";
import { rankingDecimalPlacesSchema } from "@/contracts/climate";
import type { FrozenRun, AssessedCandidate, CandidateCalendar, ExplanationInput, ClimateCohort } from "@/contracts/engine";
import { parseFarmInput } from "@/contracts/input";
import type { RegistryRelease, RegistryResolution } from "@/contracts/registry";
import { releasedRegistrySchema, syntheticRegistrySchema } from "@/contracts/registry";
import type { BaselineComparison, EvidenceGap, PlanResult, SearchCoverage } from "@/contracts/result";
import { assessClimate, buildClimateCohort } from "./metrics";
import { findCalendar } from "./search";
import { explainResult } from "./explain";
import { assessmentKey, calendarProblems, compileCalendar, horizonFor } from "./search/calendar";
import { initialPredecessor, modelBaseline } from "./search/baseline";
import type { ModeledBaseline } from "./search/baseline";
import { enumerateGrid } from "./search/grid";
import { MissingRankingEvidence, RankingAccumulator, rankingTuple } from "./search/ranking";
import { provenanceFor, validateAssessment, validateAssessmentSeasons, validateCohort, validateResolution, validateSources } from "./search/evidence";

export { assessClimate, buildClimateCohort } from "./metrics";
export { findCalendar, rankCandidates } from "./search";
export { explainResult } from "./explain";

export interface CalculateOptions {
  readonly resolveRegistry?: typeof resolveRegistry;
  readonly assess?: typeof assessClimate;
  readonly buildCohort?: typeof buildClimateCohort;
}

const required = (gap: EvidenceGap) => gap.code === "climate" || gap.code === "crop_profile" || gap.code === "ranking_metric" || gap.code === "rotation_rule";
const climateGap = (reason: string): EvidenceGap => ({ code: "climate", reason, cropPurposeIds: [], sourceIds: [] });

export function calculate(run: FrozenRun, registry: RegistryRelease, options: CalculateOptions = {}): PlanResult {
  let resolution: RegistryResolution = { profiles: [], rules: [], gaps: [] };
  let cohort: ClimateCohort = { coverage: { kind: "unavailable", reason: "No common climate cohort was assessed." },
    applicabilityClimate: {
      meanAnnualTemperatureC: { kind: "unavailable", reason: "No annual evidence was assessed." },
      meanAnnualPrecipitationMm: { kind: "unavailable", reason: "No annual evidence was assessed." },
    }, elevationM: { kind: "unavailable", reason: "No elevation evidence was assessed." }, usable: [], insights: [], gaps: [] };
  let baseline: BaselineComparison = run.input.history.kind === "skipped" ? { kind: "not_recorded" }
    : { kind: "not_assessable", reasons: ["The historical comparison was not assessed."] };
  let search: SearchCoverage = {
    structural: "not_started", ranking: "not_started", structuralExpandedStates: 0, gridExpandedStates: 0, scoredCandidates: 0,
    structuralExpansionLimit: run.settings.structuralExpansionLimit, gridExpansionLimit: run.settings.gridExpansionLimit,
    scoredCandidateLimit: run.settings.scoredCandidateLimit, gridStepDays: run.settings.searchGridStepDays,
  };
  const finish = (outcome: ExplanationInput["outcome"], selected: AssessedCandidate | null = null,
    decision: ExplanationInput["decision"] = null): PlanResult => {
    const details = explainResult({ run, profiles: resolution.profiles, rules: resolution.rules, outcome, selected, decision, baseline,
      cohort: cohort.coverage, insights: cohort.insights, search, provenance: provenanceFor(run, registry, resolution.profiles, resolution.rules) });
    return { ...outcome, details: { ...details,
      unassessedChecks: [...details.unassessedChecks, ...cohort.gaps.filter(gap => !required(gap)), ...resolution.gaps.filter(gap => !required(gap))] } };
  };
  try {
    parseFarmInput(run.input);
    (registry.kind === "released" ? releasedRegistrySchema : syntheticRegistrySchema).parse(registry);
    validateSources(registry);
    if (registry.identity.catalogueVersion !== run.manifest.catalogueVersion || registry.identity.ruleVersion !== run.manifest.ruleVersion
      || registry.catalogue.version !== registry.identity.catalogueVersion || run.settings.version !== run.manifest.configurationVersion) {
      throw new Error("Frozen registry or configuration identity mismatch.");
    }
    if (new Set(run.manifest.climateSnapshotIds).size !== run.manifest.climateSnapshotIds.length
      || JSON.stringify([...run.manifest.climateSnapshotIds].sort()) !== JSON.stringify(run.climate.map(snapshot => snapshot.id).sort())) {
      throw new Error("Frozen climate identity mismatch.");
    }
    for (const limit of [run.settings.structuralExpansionLimit, run.settings.gridExpansionLimit, run.settings.scoredCandidateLimit]) {
      if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid search budget.");
    }
    rankingDecimalPlacesSchema.parse(run.settings.rankingDecimalPlaces);
    const horizon = horizonFor(run.input.planningStart);
    const builtCohort = (options.buildCohort ?? buildClimateCohort)({ run, horizon, lookbackDays: 0 });
    validateCohort(builtCohort);
    cohort = builtCohort;
    const cohortMissing = cohort.gaps.filter(required);
    if (cohort.coverage.kind === "unavailable" || cohort.usable.length < run.settings.minimumUsableSeasons) {
      cohortMissing.push(climateGap("The common climate cohort has too few usable seasons for this run."));
    }
    if (cohortMissing.length) return finish({ state: "insufficient_data", missing: cohortMissing });
    const resolve = options.resolveRegistry ?? resolveRegistry;
    const lookup = { cropPurposeIds: run.input.cropPurposeIds, lookup: run.input.field.lookup, climate: cohort.applicabilityClimate };
    const selectedResolution = resolve(lookup, registry);
    validateResolution(selectedResolution, lookup.cropPurposeIds, registry);
    resolution = selectedResolution;
    const missing = resolution.gaps.filter(required);
    for (const id of run.input.cropPurposeIds) {
      if (!resolution.profiles.some(profile => profile.cropPurposeId === id)
        && !resolution.gaps.some(gap => gap.code === "crop_profile" && gap.cropPurposeIds.includes(id))) missing.push({ code: "crop_profile",
        reason: "A selected crop has no applicable released profile.", cropPurposeIds: [id], sourceIds: [] });
    }
    if (missing.length) return finish({ state: "insufficient_data", missing });
    const selectedProfiles = resolution.profiles;
    const selectedRules = resolution.rules;
    const history = run.input.history;
    const extras = history.kind === "skipped" ? [] : [...new Set(history.entries.flatMap(entry =>
      entry.kind === "crop" && entry.crop.kind === "catalogue" && !run.input.cropPurposeIds.includes(entry.crop.cropPurposeId) ? [entry.crop.cropPurposeId] : []))];
    const modeled = ((): ModeledBaseline => {
      if (extras.length) {
        try {
          const historical = resolve({ ...lookup, cropPurposeIds: extras }, registry);
          validateResolution(historical, extras, registry);
          resolution = { profiles: [...selectedProfiles, ...historical.profiles],
            rules: [...new Map([...selectedRules, ...historical.rules].map(rule => [rule.id, rule])).values()], gaps: resolution.gaps };
        } catch {
          return { kind: "unavailable", comparison: { kind: "not_assessable", reasons: [
            "Historical-only profile or rule processing failed; no previous-rotation comparison was calculated.",
          ] } };
        }
      }
      return modelBaseline(run.input, horizon, resolution.profiles, resolution.rules);
    })();
    if (modeled.kind === "unavailable") baseline = modeled.comparison;
    const searchInput = { horizon, cropPurposeIds: run.input.cropPurposeIds, profiles: selectedProfiles, hardConstraints: selectedRules,
      initialPredecessor: initialPredecessor(run.input), eligibleBaseline: modeled.kind === "modeled" && modeled.eligible ? modeled.calendar : null,
      expansionLimit: run.settings.structuralExpansionLimit };
    const domain = compileCalendar(searchInput);
    const ranking = new RankingAccumulator(run.settings.rankingDecimalPlaces);
    const seen = new Set<string>();
    const assess = (calendar: CandidateCalendar): AssessedCandidate => {
      const response = validateAssessment((options.assess ?? assessClimate)({ history: run.input.history, calendar,
        profiles: resolution.profiles, rules: resolution.rules, cohort: cohort.usable, settings: run.settings,
        latitudeDeg: run.input.field.lookup[1], elevationM: cohort.elevationM }), calendar);
      validateAssessmentSeasons(response, cohort.usable);
      if (response.kind === "insufficient_data") {
        if (!response.missing.some(required)) throw new Error("An insufficient assessment did not identify missing required evidence.");
        throw new MissingRankingEvidence(response.missing);
      }
      const missing = response.unassessedChecks.filter(required);
      if (missing.length) throw new MissingRankingEvidence(missing);
      const candidate = { calendar, assessment: response };
      rankingTuple(candidate, run.settings.rankingDecimalPlaces);
      return candidate;
    };
    if (modeled.kind === "modeled") {
      try {
        const baselineCandidate = assess(modeled.calendar);
        baseline = { kind: "assessed", recommendation: "no_recommendation", eligible: modeled.eligible, approximateDates: modeled.approximate,
          occurrences: baselineCandidate.assessment.occurrences, metrics: baselineCandidate.assessment.metrics, deltas: [], changes: [] };
        if (modeled.eligible) { ranking.add(baselineCandidate); seen.add(assessmentKey(modeled.calendar)); }
      } catch (error) {
        if (!(error instanceof MissingRankingEvidence)) throw error;
        baseline = { kind: "not_assessable", reasons: ["Required evidence for the historical comparison is unavailable."] };
        if (modeled.eligible) throw error;
      }
    }
    const structural = findCalendar(searchInput);
    search = { ...search, structural: structural.kind, structuralExpandedStates: structural.expandedStates };
    if (structural.kind === "proved_impossible") return finish({ state: "no_calendar_fit", proof: structural.proof });
    if (structural.kind === "limit_reached") return finish({ state: "search_incomplete" });
    const witnessKey = assessmentKey(structural.calendar);
    if (!seen.has(witnessKey)) {
      ranking.add(assess(structural.calendar));
      seen.add(witnessKey);
    }
    const grid = enumerateGrid(domain, run.settings.searchGridStepDays, run.settings.gridExpansionLimit,
      modeled.kind === "modeled" ? modeled.calendar : null);
    search = { ...search, ranking: "interrupted" };
    while (true) {
      const next = grid.next();
      if (next.done) {
        search = { ...search, ranking: next.value.kind, gridExpandedStates: next.value.expandedStates };
        break;
      }
      search = { ...search, gridExpandedStates: next.value.expandedStates };
      const calendar = next.value.calendar;
      const key = assessmentKey(calendar);
      if (seen.has(key)) continue;
      if (search.scoredCandidates === run.settings.scoredCandidateLimit) { search = { ...search, ranking: "limit_reached" }; break; }
      search = { ...search, scoredCandidates: search.scoredCandidates + 1 };
      if (calendarProblems(calendar, domain).length) throw new Error("Search produced an invalid calendar.");
      ranking.add(assess(calendar));
    }
    const ranked = ranking.result();
    if (ranked.kind === "none") return finish({ state: "search_incomplete" });
    return finish({ state: ranked.candidate.assessment.flagged ? "plan_with_warnings" : "plan",
      plan: { horizon, occurrences: ranked.candidate.assessment.occurrences, rankingTuple: ranked.rankingTuple } }, ranked.candidate, ranked.decision);
  } catch (error) {
    if (error instanceof MissingRankingEvidence) return finish({ state: "insufficient_data", missing: error.gaps });
    return finish({ state: "service_error", error: { code: "processing_failed", message: "Planning could not finish because required processing failed.", retryable: false } });
  }
}
