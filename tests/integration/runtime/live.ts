import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { createPlannerClient } from "@/client/planner";
import { defaultEngineSettings, parseFarmInput } from "@/contracts";
import type { FrozenRun, JobCapability } from "@/contracts";
import { readRegistryRelease } from "@/registry";
import { createPgClimateCache } from "@/server/cache";
import { historicalPeriod, prepareClimate } from "@/server/climate";
import { addDays } from "@/server/climate/dates";
import { hashNormalizedInput } from "@/server/jobs";
import { executeInThread } from "../../../scripts/worker";
import { verifyRestartedPipeline } from "./acceptance";
import { cutoff, database, freezeLeaseSeconds, frozenEvidence, input, startProcess } from "./support";

export async function runLiveAcceptance(preflight = false) {
  const db = await database();
  let web = startProcess({ ...db, mode: "web-live" });
  const processes = [web];
  const checks: Record<string, unknown> = {};
  const blockers: { owner: string; reason: string }[] = [];
  try {
    const { port } = z.object({ port: z.number() }).parse(await web.event("web_ready"));
    const baseUrl = "http://127.0.0.1:" + port;
    const client = createPlannerClient({ baseUrl });
    const catalogue = await client.catalogue();
    checks.catalogue = { version: catalogue.version, entries: catalogue.entries.length };
    const cropPurposeId = catalogue.entries[0]?.id ?? "maize-grain";
    const liveInput = parseFarmInput({ ...input, cropPurposeIds: [cropPurposeId] });
    const readiness = startProcess({ ...db, mode: "readiness" });
    processes.push(readiness);
    await readiness.event("worker_ready");
    assert.equal((await readiness.completed).code, 0);
    checks.postgresAndWorkerReadiness = "PASSED";

    if (catalogue.entries.length === 0 || preflight) {
      const submission = await client.submit(liveInput);
      checks.httpSubmission = { kind: submission.kind, ...(submission.kind === "invalid" ? { issues: submission.issues } : {}) };
      if (submission.kind === "accepted") await client.remove(submission.capability);
      if (catalogue.entries.length === 0) blockers.push({ owner: "E1 / yslee1106", reason: "The actual released catalogue is empty. The production HTTP API rejects a selected crop before any live job can be accepted." });
      const actual = await prepareClimate({ input: liveInput, cutoff, settings: defaultEngineSettings, cache: createPgClimateCache(db.pool) });
      checks.liveNASA = {
        kind: actual.kind,
        ...(actual.kind === "failed" ? { failure: actual.failure } : {}),
        snapshots: actual.snapshots.map(snapshot => ({
          id: snapshot.id, kind: snapshot.kind, contentHash: snapshot.contentHash, retrievedAt: snapshot.retrievedAt, cutoff: snapshot.cutoff,
          days: snapshot.days.length, firstDate: snapshot.days[0]?.date, lastDate: snapshot.days.at(-1)?.date,
          products: snapshot.products.map(product => ({ product: product.product, version: product.version, stream: product.stream, cellId: product.cellId, timeStandard: product.timeStandard, sourceUrl: product.sourceUrl })),
        })),
      };
      if (actual.kind !== "ready") blockers.push({ owner: "B2 / kyusuku", reason: "The actual NASA preparation did not return ready. See liveNASA for the provider outcome." });
      const worker = startProcess({ ...db, mode: "worker-live" });
      processes.push(worker);
      checks.productionWorker = await worker.event("tick");
      assert.equal((await worker.completed).code, 0);
      const registry = readRegistryRelease();
      const run: FrozenRun = {
        input: liveInput, settings: defaultEngineSettings, climate: actual.snapshots,
        manifest: { schemaVersion: 1, normalizedInputHash: hashNormalizedInput(liveInput), engineVersion: "v1", configurationVersion: defaultEngineSettings.version, ...registry.identity, climateSnapshotIds: actual.snapshots.map(snapshot => snapshot.id), dataCutoff: cutoff },
      };
      const diagnostic = await executeInThread(run, registry);
      checks.productionEngineDiagnostic = { state: diagnostic.state, ...(diagnostic.state === "service_error" ? { error: diagnostic.error } : {}), evidence: "Direct diagnostic only. This was not a production-accepted HTTP job." };
      if (diagnostic.state === "service_error") blockers.push({ owner: "E2/E3 / yslee1106", reason: "The actual calculation thread returns service_error. A service_error is rejected by the strict I1 acceptance runner." });
      checks.liveRestartAcceptance = "NOT RUN. A production-accepted request and implemented scientific outcome are required.";
      if (!blockers.length) blockers.push({ owner: "I1 / kyusuku", reason: "Preflight does not execute the strict restart acceptance. Run without --preflight." });
    } else {
      const expectedState = z.enum(["plan", "plan_with_warnings", "insufficient_data", "no_calendar_fit", "search_incomplete"]).parse(process.env.I1_EXPECTED_STATE ?? "plan");
      const unauthorized = async (capability: JobCapability) => {
        for (const method of ["GET", "DELETE"]) {
          for (const token of [undefined, "incorrect-token"]) {
            const response = await fetch(baseUrl + "/api/plans/" + capability.jobId, { method, headers: token ? { Authorization: "Bearer " + token } : {} });
            assert.equal(response.status, 404);
          }
        }
      };
      checks.liveRestartAcceptance = await verifyRestartedPipeline({
        input: liveInput, client, expectedState, rejectUnauthorized: unauthorized,
        freezeAndCrash: async capability => {
          const worker = startProcess({ ...db, mode: "worker-live-freeze" });
          processes.push(worker);
          await worker.event("frozen", 240000);
          const evidence = await frozenEvidence(db.pool, capability);
          const period = historicalPeriod(liveInput.planningStart, cutoff, defaultEngineSettings);
          assert.equal(evidence.providerSnapshots, 3, "The actual frozen run must contain all required NASA products.");
          assert.equal(evidence.firstDate, period.start);
          assert.equal(evidence.lastDate, addDays(period.endExclusive, -1));
          await worker.stop("SIGKILL");
          await delay(freezeLeaseSeconds * 1000 + 100);
          return evidence;
        },
        finishAfterRestart: async capability => {
          const worker = startProcess({ ...db, mode: "worker-live-replay" });
          processes.push(worker);
          const tick = await worker.event("tick", 240000);
          assert.equal(tick.kind, "completed");
          assert.equal((await worker.completed).code, 0);
          const completed = await client.read(capability);
          assert.equal(completed.state, "completed");
          if (completed.state !== "completed") throw new Error("Live job did not complete.");
          return completed.snapshot;
        },
        readFrozen: capability => frozenEvidence(db.pool, capability),
        restartWeb: async () => {
          await web.stop();
          web = startProcess({ ...db, mode: "web-live", extra: [String(port)] });
          processes.push(web);
          await web.event("web_ready");
        },
        assertPrivateLogs: async capability => {
          const logs = processes.map(process => process.logs()).join("\n");
          for (const value of [capability.token, db.connectionString, liveInput.field.label, ...liveInput.field.ring.flatMap(point => point.map(String)), JSON.stringify(liveInput.field.lookup), JSON.stringify(liveInput.field.ring), JSON.stringify(liveInput)]) assert.ok(!logs.includes(value), "A private value appeared in logs.");
        },
      });
      const state = z.object({ state: z.string() }).parse(checks.liveRestartAcceptance).state;
      if (state !== "plan" && state !== "plan_with_warnings") blockers.push({ owner: "E1/E2/E3 / yslee1106", reason: "The no-plan diagnostic completed, but I1 still requires a real source-backed plan example." });
    }
    const logs = processes.map(process => process.logs()).join("\n");
    for (const value of [db.connectionString, liveInput.field.label, ...liveInput.field.ring.flatMap(point => point.map(String)), JSON.stringify(liveInput.field.lookup), JSON.stringify(liveInput.field.ring), JSON.stringify(liveInput)]) assert.ok(!logs.includes(value), "A private value appeared in logs.");
    checks.processLogPrivacy = "PASSED. Database URL, field label, exact lookup, polygon, and full input are absent from captured child logs.";
    return { status: blockers.length ? "BLOCKED" : "PASSED", evidence: "Actual production catalogue/API, PostgreSQL, live NASA, and production calculation thread. No fixture supplies a production result.", checks, blockers };
  } finally { await Promise.all(processes.map(process => process.stop())); await db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLiveAcceptance(process.argv.includes("--preflight")).then(report => {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (report.status !== "PASSED") process.exitCode = 2;
  }).catch(error => {
    process.stderr.write(JSON.stringify({ status: "FAILED", error: error instanceof Error ? error.message : "Unknown acceptance failure" }) + "\n");
    process.exitCode = 1;
  });
}
