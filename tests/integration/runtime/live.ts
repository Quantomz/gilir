import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createPlannerClient } from "@/client/planner";
import { defaultEngineSettings } from "@/contracts";
import type { FarmInput, JobCapability } from "@/contracts";
import { createPgClimateCache } from "@/server/cache";
import { prepareClimate } from "@/server/climate";
import { scientificEvidence, verifyRestartedPipeline } from "./acceptance";
import { bangkokMissingProfileCase, boiseDryBeanCase } from "./live-cases";
import { assertRequiredClimate, cutoff, database, digest, freezeLeaseSeconds, frozenEvidence, providerEvidence, startProcess } from "./support";

interface LiveReport {
  schemaVersion: number;
  status: "PASSED" | "BLOCKED" | "FAILED";
  exitCode: number;
  caseId: string;
  expectedState: "plan_with_warnings";
  cutoff: string;
  startedAt: string;
  finishedAt?: string;
  codeIdentity?: { commit: string; trackedDiffDigest: string; trackedChanges: boolean };
  evidence: string;
  checks: Record<string, unknown>;
  blockers: { owner: string; reason: string }[];
  failure?: { stage: string; code: "assertion_failed" | "execution_failed" | "cleanup_failed" | "private_evidence" };
  cleanup: { processesStopped: boolean; schemaRemoved: boolean; processExits: unknown[] };
}

function privateInputValues(input: FarmInput): string[] {
  return [input.field.label, ...input.field.ring.flatMap(point => point.map(String)), JSON.stringify(input.field.lookup), JSON.stringify(input.field.ring), JSON.stringify(input)];
}

export async function runLiveAcceptance(preflight = false, reportPath = process.env.I1_REPORT_PATH ?? "docs/evidence/I1/current-live-report.json") {
  const report: LiveReport = {
    schemaVersion: 1, status: "FAILED", exitCode: 1, caseId: boiseDryBeanCase.id, expectedState: "plan_with_warnings", cutoff,
    startedAt: new Date().toISOString(),
    evidence: "Local production HTTP API, PostgreSQL, registry, engine, and separate workers with live NASA. Provider outage is separately identified controlled injection.",
    checks: {}, blockers: [], cleanup: { processesStopped: false, schemaRemoved: false, processExits: [] },
  };
  const checks = report.checks;
  const processes: ReturnType<typeof startProcess>[] = [];
  const secrets = new Set([process.env.I1_TEST_DATABASE_URL ?? "", ...privateInputValues(boiseDryBeanCase.input), ...privateInputValues(bangkokMissingProfileCase.input)]);
  const databases: Awaited<ReturnType<typeof database>>[] = [];
  let stage = "code_identity";
  try {
    const cwd = fileURLToPath(new URL("../../../", import.meta.url));
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const diff = execFileSync("git", ["diff", "--binary", "HEAD"], { cwd, encoding: "utf8" });
    report.codeIdentity = { commit, trackedDiffDigest: createHash("sha256").update(diff).digest("hex"), trackedChanges: diff.length > 0 };
    stage = "database";
    const activeDb = await database();
    databases.push(activeDb);
    secrets.add(activeDb.connectionString);
    let web = startProcess({ ...activeDb, mode: "web-live" });
    processes.push(web);
    stage = "http_catalogue";
    const { port } = z.object({ port: z.number() }).parse(await web.event("web_ready"));
    const baseUrl = "http://127.0.0.1:" + port;
    const client = createPlannerClient({ baseUrl });
    const catalogue = await client.catalogue();
    checks.catalogue = { version: catalogue.version, entries: catalogue.entries.length, selectedCropPresent: catalogue.entries.some(entry => entry.id === boiseDryBeanCase.input.cropPurposeIds[0]) };
    const readiness = startProcess({ ...activeDb, mode: "readiness" });
    processes.push(readiness);
    await readiness.event("worker_ready");
    assert.deepEqual(await readiness.exit(), { code: 0, signal: null });
    checks.postgresAndWorkerReadiness = "PASSED";

    if (preflight) {
      stage = "preflight";
      const submission = await client.submit(boiseDryBeanCase.input);
      checks.httpSubmission = { kind: submission.kind };
      if (submission.kind === "accepted") {
        secrets.add(submission.capability.token);
        await client.remove(submission.capability);
      }
      const actual = await prepareClimate({ input: boiseDryBeanCase.input, cutoff, settings: defaultEngineSettings, cache: createPgClimateCache(activeDb.pool) });
      checks.liveNASA = {
        kind: actual.kind,
        failureCode: actual.kind === "failed" ? actual.failure.code : null,
        syntheticSnapshots: actual.snapshots.filter(snapshot => snapshot.kind === "synthetic").length,
        snapshots: actual.snapshots.filter(snapshot => snapshot.kind === "provider").map(providerEvidence),
      };
      const diagnostic = startProcess({ ...activeDb, mode: "engine-diagnostic" });
      processes.push(diagnostic);
      checks.productionEngineDiagnostic = await diagnostic.event("engine_diagnostic", 240000);
      assert.deepEqual(await diagnostic.exit(), { code: 0, signal: null });
      report.blockers.push({ owner: "I1 / kyusuku", reason: "Preflight does not execute strict live restart acceptance." });
      report.status = "BLOCKED";
    } else {
      assert.equal(catalogue.version, boiseDryBeanCase.catalogueVersion, "The corrected reviewed E1 release is required.");
      assert.ok(catalogue.entries.some(entry => entry.id === boiseDryBeanCase.input.cropPurposeIds[0]), "The named live crop must be present in the released catalogue.");
      const unauthorized = async (capability: JobCapability) => {
        secrets.add(capability.token);
        const peer = await client.submit(boiseDryBeanCase.input);
        assert.equal(peer.kind, "accepted", "A separate accepted job must supply the cross-job token.");
        if (peer.kind !== "accepted") throw new Error("Cross-job capability unavailable.");
        secrets.add(peer.capability.token);
        secrets.add("incorrect-token");
        try {
          const tokens: (string | undefined)[] = [undefined, "incorrect-token", peer.capability.token];
          for (const method of ["GET", "DELETE"]) {
            for (const token of tokens) {
              const response: Response = await fetch(baseUrl + "/api/plans/" + capability.jobId, { method, headers: token ? { Authorization: "Bearer " + token } : {} });
              assert.equal(response.status, 404, "Missing, wrong, and cross-job capabilities must be rejected.");
              z.strictObject({ error: z.strictObject({ code: z.literal("not_found"), message: z.string(), retryable: z.literal(false) }) }).parse(await response.json());
            }
          }
          assert.notEqual((await client.read(capability)).state, "failed");
        } finally { await client.remove(peer.capability); }
      };
      stage = "primary_restart_acceptance";
      const primaryProgress: Record<string, unknown> = {};
      checks.primaryProgress = primaryProgress;
      const primary = await verifyRestartedPipeline({
        input: boiseDryBeanCase.input, client, expectedState: "plan_with_warnings", rejectUnauthorized: unauthorized,
        observe: observation => {
          if (observation.stage === "submitted") primaryProgress.jobId = observation.jobId;
          if (observation.stage === "frozen") primaryProgress.frozen = observation.evidence;
          if (observation.stage === "completed") {
            primaryProgress.scientific = observation.scientific;
            primaryProgress.resultDigest = observation.resultDigest;
          }
        },
        freezeAndCrash: async capability => {
          const worker = startProcess({ ...activeDb, mode: "worker-live-freeze" });
          processes.push(worker);
          await worker.event("frozen", 240000);
          const evidence = await frozenEvidence(activeDb.pool, capability);
          primaryProgress.frozen = evidence;
          const period = evidence.requiredSourcePeriod;
          checks.requiredSourcePeriod = period;
          assertRequiredClimate(evidence, { start: period.start, endExclusive: period.endExclusive });
          assert.deepEqual(evidence.settings, { version: defaultEngineSettings.version, targetSeasons: defaultEngineSettings.targetSeasons, minimumUsableSeasons: defaultEngineSettings.minimumUsableSeasons });
          const exit = await worker.stop("SIGKILL");
          primaryProgress.freezeWorkerExit = exit;
          assert.deepEqual(exit, { code: null, signal: "SIGKILL" });
          await delay(freezeLeaseSeconds * 1000 + 100);
          return evidence;
        },
        finishAfterRestart: async capability => {
          const worker = startProcess({ ...activeDb, mode: "worker-live-replay" });
          processes.push(worker);
          const tick = await worker.event("tick", 240000);
          primaryProgress.replayTick = { kind: tick.kind };
          assert.equal(tick.kind, "completed");
          assert.deepEqual(await worker.exit(), { code: 0, signal: null });
          const completed = await client.read(capability);
          primaryProgress.jobState = completed.state;
          assert.equal(completed.state, "completed");
          if (completed.state !== "completed") throw new Error("Live job did not complete.");
          return completed.snapshot;
        },
        readFrozen: capability => frozenEvidence(activeDb.pool, capability),
        restartWeb: async () => {
          assert.deepEqual(await web.stop(), { code: 0, signal: null });
          web = startProcess({ ...activeDb, mode: "web-live", extra: [String(port)] });
          processes.push(web);
          await web.event("web_ready");
        },
        assertPrivateLogs: async () => {
          const logs = processes.map(child => child.logs()).join("\n");
          for (const secret of secrets) if (secret) assert.ok(!logs.includes(secret), "A private value appeared in child logs.");
        },
      });
      checks.liveRestartAcceptance = primary;
      assert.deepEqual(primary.scientific.profiles.map(profile => ({ id: profile.id, version: profile.version })), [{ id: boiseDryBeanCase.profileId, version: boiseDryBeanCase.profileVersion }]);
      assert.ok(primary.scientific.unassessedChecks.some(check => check.code === "temperature_rule"), "The real result must disclose unassessed temperature.");
      assert.equal(primary.scientific.cohort.kind, "available");
      if (primary.scientific.cohort.kind !== "available") throw new Error("The live plan has no real cohort.");
      assert.equal(primary.scientific.cohort.value.targetSeasons, defaultEngineSettings.targetSeasons);
      assert.ok(primary.scientific.usableSeasons >= defaultEngineSettings.minimumUsableSeasons);
      checks.primaryProgress = { jobId: primary.jobId, freezeWorkerExit: primaryProgress.freezeWorkerExit, replayTick: primaryProgress.replayTick };

      stage = "missing_profile_control";
      const missingProgress: Record<string, unknown> = { caseId: bangkokMissingProfileCase.id, expectedState: "insufficient_data" };
      checks.missingProfileControl = missingProgress;
      const missing = await client.submit(bangkokMissingProfileCase.input);
      assert.equal(missing.kind, "accepted");
      if (missing.kind !== "accepted") throw new Error("Missing-profile control was not accepted.");
      secrets.add(missing.capability.token);
      missingProgress.jobId = missing.capability.jobId;
      try {
        await unauthorized(missing.capability);
        const worker = startProcess({ ...activeDb, mode: "worker-live" });
        processes.push(worker);
        const tick = await worker.event("tick", 240000);
        missingProgress.workerTick = { kind: tick.kind };
        assert.equal(tick.kind, "completed");
        assert.deepEqual(await worker.exit(), { code: 0, signal: null });
        const completed = await client.read(missing.capability);
        missingProgress.jobState = completed.state;
        assert.equal(completed.state, "completed");
        if (completed.state !== "completed") throw new Error("Missing-profile control did not complete.");
        const frozen = await frozenEvidence(activeDb.pool, missing.capability);
        missingProgress.frozen = frozen;
        const period = frozen.requiredSourcePeriod;
        assertRequiredClimate(frozen, { start: period.start, endExclusive: period.endExclusive });
        const result = completed.snapshot.result;
        missingProgress.scientific = scientificEvidence(result);
        missingProgress.resultDigest = digest(completed.snapshot);
        assert.equal(result.state, "insufficient_data");
        assert.ok(!("plan" in result));
        if (result.state !== "insufficient_data") throw new Error("Missing-profile control returned another state.");
        assert.ok(result.missing.some(gap => gap.code === "crop_profile" && gap.cropPurposeIds.includes(bangkokMissingProfileCase.input.cropPurposeIds[0])));
        assert.ok(result.missing.every(gap => gap.code === "crop_profile"), "Climate failure cannot satisfy the missing-profile control.");
        assert.equal(result.details.provenance.kind, "run");
        assert.equal(result.details.cohort.kind, "available");
        if (result.details.cohort.kind !== "available") throw new Error("Missing-profile control has no real cohort.");
        assert.equal(result.details.cohort.value.targetSeasons, defaultEngineSettings.targetSeasons);
        assert.ok(result.details.cohort.value.seasons.filter(season => season.status === "usable").length >= defaultEngineSettings.minimumUsableSeasons);
        await unauthorized(missing.capability);
        missingProgress.status = "PASSED";
      } finally { await client.remove(missing.capability); }

      stage = "production_composed_provider_outage";
      const outageDb = await database();
      databases.push(outageDb);
      const outageWeb = startProcess({ ...outageDb, mode: "web-live" });
      processes.push(outageWeb);
      const outagePort = z.object({ port: z.number() }).parse(await outageWeb.event("web_ready")).port;
      const outageClient = createPlannerClient({ baseUrl: "http://127.0.0.1:" + outagePort });
      const outage = await outageClient.submit(boiseDryBeanCase.input);
      assert.equal(outage.kind, "accepted");
      if (outage.kind !== "accepted") throw new Error("Provider-outage control was not accepted.");
      secrets.add(outage.capability.token);
      const outageEvidence: Record<string, unknown> = { kind: "controlled_provider_http_503", composition: "Production HTTP, PostgreSQL, registry, worker, and engine executor with provider-only injection. Preparation fails before calculation.", freshCacheSchema: true, jobId: outage.capability.jobId };
      checks.providerOutageControl = outageEvidence;
      try {
        const worker = startProcess({ ...outageDb, mode: "worker-live-provider-outage" });
        processes.push(worker);
        const tick = await worker.event("tick");
        outageEvidence.workerTick = { kind: tick.kind };
        assert.equal(tick.kind, "failed");
        const attempts = z.object({ attempts: z.number(), status: z.number() }).parse(await worker.event("provider_outage"));
        outageEvidence.provider = attempts;
        assert.equal(attempts.attempts, 3);
        assert.equal(attempts.status, 503);
        assert.deepEqual(await worker.exit(), { code: 0, signal: null });
        const state = await outageClient.read(outage.capability);
        outageEvidence.state = state.state;
        assert.equal(state.state, "failed");
        if (state.state !== "failed") throw new Error("Provider-outage control did not fail.");
        outageEvidence.failureCode = state.failure.code;
        assert.equal(state.failure.code, "retrieval_failed");
        outageEvidence.status = "PASSED";
      } finally { await outageClient.remove(outage.capability); }
      report.status = "PASSED";
    }
  } catch (error) {
    report.status = "FAILED";
    report.failure = { stage, code: error instanceof assert.AssertionError ? "assertion_failed" : "execution_failed" };
  } finally {
    const stopped = await Promise.allSettled(processes.map(child => child.stop()));
    report.cleanup.processExits = stopped.map(result => result.status === "fulfilled" ? result.value : { stopped: false });
    report.cleanup.processesStopped = stopped.every(result => result.status === "fulfilled");
    const closed = await Promise.allSettled(databases.map(db => db.close()));
    report.cleanup.schemaRemoved = closed.every(result => result.status === "fulfilled");
    if (!report.cleanup.schemaRemoved) { report.status = "FAILED"; report.failure = { stage: "schema_cleanup", code: "cleanup_failed" }; }
    if (!report.cleanup.processesStopped) { report.status = "FAILED"; report.failure = { stage: "process_cleanup", code: "cleanup_failed" }; }
    const logs = processes.map(child => child.logs()).join("\n");
    if ([...secrets].some(secret => secret && logs.includes(secret))) {
      report.status = "FAILED";
      report.failure = { stage: "process_log_privacy", code: "private_evidence" };
    } else checks.processLogPrivacy = "PASSED";
  }
  report.finishedAt = new Date().toISOString();
  report.exitCode = report.status === "PASSED" ? 0 : report.status === "BLOCKED" ? 2 : 1;
  checks.artifactPrivacy = "PASSED";
  if ([...secrets].some(secret => secret && JSON.stringify(report).includes(secret))) {
    report.status = "FAILED";
    report.exitCode = 1;
    report.failure = { stage: "artifact_privacy", code: "private_evidence" };
    report.checks = { artifactPrivacy: "FAILED" };
  }
  await mkdir(dirname(resolve(reportPath)), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reportFlag = process.argv.indexOf("--report");
  const reportPath = reportFlag >= 0 ? process.argv[reportFlag + 1] : undefined;
  runLiveAcceptance(process.argv.includes("--preflight"), reportPath).then(report => {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exitCode = report.exitCode;
  }).catch(() => {
    process.stderr.write(JSON.stringify({ status: "FAILED", failure: { stage: "report_persistence", code: "execution_failed" }, exitCode: 1 }) + "\n");
    process.exitCode = 1;
  });
}
