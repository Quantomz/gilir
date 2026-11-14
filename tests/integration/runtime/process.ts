import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defaultEngineSettings, parseFarmInput } from "@/contracts";
import type { FrozenRun } from "@/contracts";
import { calculate } from "@/engine";
import { readRegistryRelease } from "@/registry";
import { createPgClimateCache } from "@/server/cache";
import { createPgJobStore, hashNormalizedInput } from "@/server/jobs";
import { createPlanApi } from "@/server/jobs/http";
import { prepareClimate } from "@/server/climate";
import { runWorkerOnce } from "@/server/runtime";
import { executeInThread } from "../../../scripts/worker";
import { controlledRegistry, cutoff, freezeLeaseSeconds, input, poolForSchema, replayLeaseSeconds, savedPreparation } from "./support";

const config = z.object({ DATABASE_URL: z.url(), I1_SCHEMA: z.string().regex(/^i1_[a-z0-9_]+$/) }).parse(process.env);
const mode = z.enum(["web-controlled", "web-live", "worker-freeze", "worker-replay", "worker-live", "worker-live-freeze", "worker-live-replay", "readiness", "engine-diagnostic"]).parse(process.argv[2]);
const pool = poolForSchema(config.DATABASE_URL, config.I1_SCHEMA);
const jobs = createPgJobStore(pool);
const event = (value: object) => { process.stdout.write(JSON.stringify(value) + "\n"); };

if (mode.startsWith("web-")) {
  const handle = createPlanApi({ store: jobs, readRegistry: mode === "web-live" ? readRegistryRelease : () => controlledRegistry, dataCutoff: cutoff, requestsPerMinute: 1000 });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
      const response = await handle(new Request("http://127.0.0.1" + incoming.url, { method: incoming.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      event({ event: "http", method: incoming.method, status: response.status });
    } catch { outgoing.writeHead(500); outgoing.end(); event({ event: "http_failed" }); }
  });
  await new Promise<void>(resolve => { server.listen(Number(process.argv[3] ?? "0"), "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP port was not allocated.");
  event({ event: "web_ready", port: address.port });
  process.once("SIGTERM", () => { server.close(() => { void pool.end(); }); server.closeIdleConnections(); });
} else {
  try {
    await pool.query("SELECT 1 FROM jobs LIMIT 0");
    await pool.query("SELECT 1 FROM gilir_climate_cache LIMIT 0");
    readRegistryRelease();
    event({ event: "worker_ready" });
    if (mode === "engine-diagnostic") {
      const liveInput = parseFarmInput({ ...input, cropPurposeIds: [z.string().min(1).parse(process.argv[3])] });
      const registry = readRegistryRelease();
      const climate = await prepareClimate({ input: liveInput, cutoff, settings: defaultEngineSettings, cache: createPgClimateCache(pool) });
      const run: FrozenRun = {
        input: liveInput, settings: defaultEngineSettings, climate: climate.snapshots,
        manifest: { schemaVersion: 1, normalizedInputHash: hashNormalizedInput(liveInput), engineVersion: "v1", configurationVersion: defaultEngineSettings.version, ...registry.identity, climateSnapshotIds: climate.snapshots.map(snapshot => snapshot.id), dataCutoff: cutoff },
      };
      const diagnostic = await executeInThread(run, registry);
      event({ event: "engine_diagnostic", state: diagnostic.state, ...(diagnostic.state === "service_error" ? { error: diagnostic.error } : {}) });
    } else if (mode !== "readiness") {
      const live = mode.startsWith("worker-live");
      const originalFreeze = jobs.freeze;
      if (mode.endsWith("-freeze")) jobs.freeze = async (...args) => {
        const accepted = await originalFreeze(...args);
        if (accepted) { event({ event: "frozen" }); await new Promise<never>(() => {}); }
        return accepted;
      };
      const result = await runWorkerOnce({
        jobs, climateCache: createPgClimateCache(pool),
        prepareClimate: mode.endsWith("-replay") ? async () => { throw new Error("Replay attempted to replace frozen climate."); } : live ? prepareClimate : await savedPreparation(),
        readRegistryRelease: live ? readRegistryRelease : () => controlledRegistry,
        calculate,
        executeCalculation: live ? executeInThread : (run, registry) => executeInThread(run, registry, fileURLToPath(new URL("./controlled-engine.ts", import.meta.url))),
        settings: defaultEngineSettings, workerId: "i1-" + mode, leaseSeconds: mode.endsWith("-freeze") ? freezeLeaseSeconds : replayLeaseSeconds, now: () => new Date().toISOString(),
      });
      event({ event: "tick", ...result });
    }
  } finally { await pool.end(); }
}
