import { recomputeFirstOccurrence, registry, runCase, scienceCases, sha256, usableSeasons } from "./harness";

const cases = scienceCases.map(c => {
  const result = runCase(c);
  const rerun = runCase(c);
  const { provenance } = result.details;
  return {
    id: c.id,
    input: { lookup: c.lookup, cropPurposeIds: c.cropPurposeIds, planningStart: c.planningStart, recording: c.recording, history: "skipped", water: "rain_only" },
    expected: c.expect.state === "plan" ? "plan or plan_with_warnings" : c.expect.state,
    state: result.state,
    provenanceKind: provenance.kind,
    profiles: provenance.profiles.map(p => ({ id: p.id, version: p.version, sourceIds: p.sourceIds })),
    sources: provenance.sources.map(s => s.id),
    climateSnapshotIds: provenance.manifest.kind === "available" ? provenance.manifest.value.climateSnapshotIds : [],
    usableSeasons: usableSeasons(result),
    rankingDecision: "plan" in result ? result.details.explanation : null,
    explanation: result.details.explanation,
    plan: "plan" in result ? {
      horizon: result.plan.horizon,
      occurrences: result.plan.occurrences.map(o => ({ cropPurposeId: o.cropPurposeId, profileId: o.profileId, profileVersion: o.profileVersion,
        planted: o.planted, lastOccupied: o.lastOccupied, fieldAvailable: o.fieldAvailable })),
      rankingTuple: result.plan.rankingTuple.components,
    } : null,
    missing: result.state === "insufficient_data" ? result.missing : null,
    proof: result.state === "no_calendar_fit" ? result.proof : null,
    warnings: result.details.warnings.map(w => ({ code: w.code, cropPurposeIds: w.cropPurposeIds })),
    unassessedChecks: result.details.unassessedChecks.map(g => g.code),
    search: result.details.search,
    resultSha256: sha256(result),
    rerunSha256: sha256(rerun),
  };
});

const first = scienceCases[0];
const check = recomputeFirstOccurrence(first, runCase(first));
const independentRecompute = {
  caseId: first.id,
  occurrence: check.occurrence,
  replayStart: check.replayStart,
  firstReplayDate: check.firstDate,
  firstWindow: check.reference.windows[0],
  firstWindowDays: check.reference.daily.slice(0, 7),
  firstShortfallWindow: check.reference.windows.find(w => w.shortfall > 0) ?? null,
  reference: { mismatch: check.reference.mismatch, frequency: check.reference.frequency, windows: check.reference.windows.length },
  engine: check.engine,
};

process.stdout.write(JSON.stringify({ registryKind: registry.kind, registryIdentity: registry.identity, cases, independentRecompute }, null, 2) + "\n");
