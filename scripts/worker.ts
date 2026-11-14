import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { Pool } from "pg";
import { z } from "zod";
import { defaultEngineSettings, parsePlanResult } from "@/contracts";
import type { FrozenRun, PlanResult, ReleasedRegistry } from "@/contracts";
import { calculate } from "@/engine";
import { readRegistryRelease } from "@/registry";
import { prepareClimate } from "@/server/climate";
import { jobStore } from "@/server/jobs";
import { createPgClimateCache } from "@/server/cache";
import { runWorkerLoop, runWorkerOnce } from "@/server/runtime";

const environment = z.object({
  DATABASE_URL: z.url(),
  WORKER_ID: z.string().trim().min(1).max(120),
  WORKER_LEASE_SECONDS: z.coerce.number().positive().default(60),
  WORKER_POLL_MILLISECONDS: z.coerce.number().positive().default(1000),
});

export function executeInThread(
  run: FrozenRun,
  registry: ReleasedRegistry,
  enginePath = fileURLToPath(new URL("../src/engine/index.ts", import.meta.url)),
): Promise<PlanResult> {
  return new Promise((resolveResult, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      require("tsx/cjs");
      const { calculate } = require(workerData.enginePath);
      parentPort.postMessage(calculate(workerData.run, workerData.registry));
    `, {
      eval: true,
      workerData: { run, registry, enginePath },
    });
    let received = false;
    worker.once("message", (message: unknown) => {
      received = true;
      try { resolveResult(parsePlanResult(message)); } catch (error) { reject(error); }
    });
    worker.once("error", reject);
    worker.once("exit", code => {
      if (!received || code !== 0) reject(new Error("Calculation thread exited before returning a result."));
    });
  });
}

export async function workerMain(args = process.argv.slice(2)): Promise<void> {
  if (args.includes("--help")) {
    process.stdout.write("Run the durable worker with DATABASE_URL and WORKER_ID. Use --once for one tick or --check for database readiness.\n");
    return;
  }
  if (args.some(argument => argument !== "--once" && argument !== "--check")) throw new Error("Unknown worker argument.");
  const config = environment.parse(process.env);
  const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
  const stopping = new AbortController();
  const stop = () => { stopping.abort(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await pool.query("SELECT 1 FROM jobs LIMIT 0");
    await pool.query("SELECT 1 FROM gilir_climate_cache LIMIT 0");
    await pool.query("SELECT 1 FROM gilir_climate_snapshots LIMIT 0");
    readRegistryRelease();
    process.stdout.write(JSON.stringify({ event: "worker_ready", workerId: config.WORKER_ID }) + "\n");
    if (args.includes("--check") || stopping.signal.aborted) return;
    const dependencies = {
      jobs: jobStore,
      climateCache: createPgClimateCache(pool),
      prepareClimate,
      readRegistryRelease,
      calculate,
      executeCalculation: executeInThread,
      settings: defaultEngineSettings,
      workerId: config.WORKER_ID,
      leaseSeconds: config.WORKER_LEASE_SECONDS,
      now: () => new Date().toISOString(),
    };
    const onTick = (result: Awaited<ReturnType<typeof runWorkerOnce>>) => {
      if (result.kind !== "idle") process.stdout.write(JSON.stringify({ event: "worker_tick", kind: result.kind, jobId: result.jobId }) + "\n");
    };
    if (args.includes("--once")) onTick(await runWorkerOnce(dependencies));
    else await runWorkerLoop({ dependencies, signal: stopping.signal, pollMilliseconds: config.WORKER_POLL_MILLISECONDS, onTick });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  workerMain().catch(() => {
    process.stderr.write(JSON.stringify({ event: "worker_startup_or_storage_failed" }) + "\n");
    process.exitCode = 1;
  });
}
