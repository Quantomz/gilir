import type { AssessedCandidate, ClimateCohort, ExplanationInput, FrozenRun } from "@/contracts/engine";
import { parseFarmInput } from "@/contracts/input";
import { modelEngineVersion } from "@/contracts/model";
import type { ModelDiagnostics } from "@/contracts/model";
import type { RegistryRelease } from "@/contracts/registry";
import type { PlanResult, SearchCoverage } from "@/contracts/result";
import { modelRunManifestSchema } from "@/contracts/result";
import { parseCompleteModelRelease } from "@/registry/models/validate";
import { resolveRegistry } from "@/registry";
import { explainResult } from "../explain";
import { buildClimateCohort } from "../metrics";
import { initialPredecessor } from "../search/baseline";
import { horizonFor } from "../search/calendar";
import { provenanceFor, validateCohort } from "../search/evidence";
import { MissingRankingEvidence, RankingAccumulator } from "../search/ranking";
import { ModelWorkLimit, prepareCropSeasons } from "./domain";
import type { CropSeasonDomain } from "./domain";
import { enumerateModelGrid, findModelCalendar } from "./search";

export { prepareCropSeasons } from "./domain";
export { findModelCalendar, enumerateModelGrid } from "./search";

export function calculateModeled(run: FrozenRun, registry: RegistryRelease, options: { readonly buildCohort?: typeof buildClimateCohort } = {}): PlanResult {
  const manifest = modelRunManifestSchema.parse(run.manifest);
  const horizon = horizonFor(run.input.planningStart);
  const release = registry.kind === "released" ? registry.modelRelease : undefined;
  let domain: CropSeasonDomain | null = null;
  let cohort: ClimateCohort | null = null;
  let search: SearchCoverage = { structural: "not_started", ranking: "not_started", structuralExpandedStates: 0, gridExpandedStates: 0, scoredCandidates: 0,
    structuralExpansionLimit: run.settings.structuralExpansionLimit, gridExpansionLimit: run.settings.gridExpansionLimit,
    scoredCandidateLimit: run.settings.scoredCandidateLimit, gridStepDays: run.settings.searchGridStepDays };
  const emptyDiagnostics: ModelDiagnostics = { modelReleaseVersion: manifest.modelReleaseVersion, modelReleaseHash: manifest.modelReleaseHash,
    policy: manifest.modelingPolicy, retainedReplayStarts: [], crops: [], preparedTrajectories: 0, scoredCropDays: 0, aggregationVisits: 0, workLimitReached: false };
  const ranking = new RankingAccumulator(run.settings.rankingDecimalPlaces);
  const finish = (outcome: ExplanationInput["outcome"], selected: AssessedCandidate | null = null, decision: ExplanationInput["decision"] = null): PlanResult => {
    const provenance = provenanceFor(run, registry, [], []);
    const modeling = domain?.diagnostics() ?? emptyDiagnostics;
    const details = explainResult({ run, profiles: [], rules: [], outcome, selected, decision,
      baseline: run.input.history.kind === "skipped" ? { kind: "not_recorded" } : { kind: "not_assessable", reasons: [
        "Recorded harvest dates do not identify thermal stage boundaries. The previous rotation is shown as input history but receives no modeled score or ranking preference.",
      ] }, cohort: cohort?.coverage ?? { kind: "unavailable", reason: "No climate cohort was prepared." }, insights: cohort?.insights ?? [], search,
      provenance: { ...provenance, profiles: modeling.crops.map(model => ({ id: model.modelId, version: model.modelVersion, cropPurposeId: model.cropPurposeId, sourceIds: model.sourceIds })) } });
    const modelWarning = { code: "profile_limitation" as const, message: "This model estimates timing. It does not check whether crops will survive the heat or cold, suit your soil, or produce a harvest.", cropPurposeIds: run.input.cropPurposeIds, metricIds: [], ruleIds: [] };
    return { ...outcome, details: { ...details, modeling,
      explanation: outcome.state === "no_calendar_fit" ? "No calendar fits every selected crop across all retained seasons under this released thermal-development model. This is not proof that the crops cannot grow locally."
        : outcome.state === "search_incomplete" ? "A frozen operation limit ended modeling or search before an assessed calendar was available. This does not establish that no calendar fits." : details.explanation,
      warnings: [...details.warnings, modelWarning],
      assumptions: [...details.assumptions.filter(text => !text.includes("window edges") && !text.includes("benchmarks remain pending")),
        "The chosen long or maximum-length published scenario is a fixed reference cultivar assumption. It is not guaranteed maturity or conservative water demand worldwide.",
        "One set of retained weather seasons determines development and rainfall demand. No season is discarded because a crop fails to complete.",
        "Planned crop slots end at the latest modeled harvest. Earlier harvests may leave waiting time before the next crop. Schedule indicators do not measure continuous live cover.",
        "Ranking uses a fixed planting-date grid, feasible-domain edges and earliest field availability. A structural daily search provides a separate witness or model-scoped proof.",
        "The crop-scoring budget counts advanced crop days, rolling-window day visits and crop-by-replay aggregation visits. A limit preserves an assessed incumbent and never proves impossibility.",
      ] } };
  };
  const selectedResult = (): PlanResult => {
    const best = ranking.result();
    if (best.kind === "none") return finish({ state: "search_incomplete" });
    return finish({ state: best.candidate.assessment.flagged ? "plan_with_warnings" : "plan", plan: {
      horizon, occurrences: best.candidate.assessment.occurrences, rankingTuple: best.rankingTuple,
    } }, best.candidate, best.decision);
  };
  try {
    parseFarmInput(run.input);
    if (!release || manifest.engineVersion !== modelEngineVersion || registry.identity.catalogueVersion !== manifest.catalogueVersion
      || registry.identity.ruleVersion !== manifest.ruleVersion || release.version !== manifest.modelReleaseVersion || release.contentHash !== manifest.modelReleaseHash
      || run.settings.version !== manifest.configurationVersion
      || JSON.stringify(run.climate.map(snapshot => snapshot.id)) !== JSON.stringify(manifest.climateSnapshotIds)
      || JSON.stringify(run.climate.map(snapshot => snapshot.contentHash)) !== JSON.stringify(manifest.climateContentHashes)) throw new Error("Frozen model identity mismatch.");
    parseCompleteModelRelease(release, registry.catalogue, registry.sources.map(source => source.id));
    for (const value of [run.settings.structuralExpansionLimit, run.settings.gridExpansionLimit, run.settings.scoredCandidateLimit]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid search budget.");
    }
    for (const value of [run.settings.searchGridStepDays, run.settings.mismatchWindowDays, run.settings.targetSeasons, run.settings.minimumUsableSeasons]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 366) throw new Error("Invalid model settings.");
    }
    if (run.settings.targetSeasons > 100 || run.settings.minimumUsableSeasons > run.settings.targetSeasons) throw new Error("Unsupported model cohort size.");
    cohort = (options.buildCohort ?? buildClimateCohort)({ run, horizon, lookbackDays: 0 });
    validateCohort(cohort);
    const required = cohort.gaps.filter(gap => gap.code === "climate");
    if (cohort.coverage.kind === "unavailable" || cohort.usable.length < run.settings.minimumUsableSeasons || required.length) {
      return finish({ state: "insufficient_data", missing: required.length ? required : [{ code: "climate", reason: "Too few complete retained climate seasons.", cropPurposeIds: [], sourceIds: [] }] });
    }
    const prepared = prepareCropSeasons({ run, release, cohort, horizon, policy: manifest.modelingPolicy });
    if (prepared.kind === "insufficient_data") return finish({ state: "insufficient_data", missing: prepared.gaps });
    domain = prepared.domain;
    const rules = resolveRegistry({ cropPurposeIds: run.input.cropPurposeIds, lookup: run.input.field.lookup, climate: cohort.applicabilityClimate }, registry).rules;
    const base = { domain, rules, initialPredecessor: initialPredecessor(run.input) };
    const structural = findModelCalendar({ ...base, expansionLimit: run.settings.structuralExpansionLimit });
    search = { ...search, structural: structural.kind, structuralExpandedStates: structural.expandedStates };
    if (structural.kind === "proved_impossible") return finish({ state: "no_calendar_fit", proof: structural.proof });
    if (structural.kind === "limit_reached") return finish({ state: "search_incomplete" });
    search = { ...search, ranking: "interrupted" };
    ranking.add(domain.assess(structural.sequence));
    const key = (sequence: readonly { readonly id: number }[]) => sequence.map(item => item.id).join(",");
    const seen = new Set([key(structural.sequence)]);
    const grid = enumerateModelGrid({ ...base, expansionLimit: run.settings.gridExpansionLimit }, run.settings.searchGridStepDays);
    while (true) {
      const next = grid.next();
      if (next.done) { search = { ...search, ranking: next.value.kind, gridExpandedStates: next.value.expandedStates }; break; }
      search = { ...search, gridExpandedStates: next.value.expandedStates };
      const identity = key(next.value.sequence);
      if (seen.has(identity)) continue;
      if (search.scoredCandidates === run.settings.scoredCandidateLimit) { search = { ...search, ranking: "limit_reached" }; break; }
      const assessed = domain.assess(next.value.sequence);
      seen.add(identity);
      search = { ...search, scoredCandidates: search.scoredCandidates + 1 };
      ranking.add(assessed);
    }
    return selectedResult();
  } catch (error) {
    if (error instanceof ModelWorkLimit) { search = { ...search, ranking: "limit_reached" }; return selectedResult(); }
    if (error instanceof MissingRankingEvidence) return finish({ state: "insufficient_data", missing: error.gaps });
    return finish({ state: "service_error", error: { code: "processing_failed", message: "The frozen crop-model calculation could not be completed.", retryable: false } });
  }
}
