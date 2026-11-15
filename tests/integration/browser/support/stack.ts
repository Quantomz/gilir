// The live phase needs the real stack: PostgreSQL, the web server and one worker that reaches NASA POWER.
//
//   I3_LIVE=1 DATABASE_URL=...            the Playwright config starts the web server; this file migrates the
//                                         database and runs one worker for the length of the live spec.
//   I3_LIVE=1 I3_BASE_URL=https://...     the stack already runs somewhere (a local `next start` with its own
//                                         worker, or the hosted site); nothing is started here.
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export const baseUrl = process.env.I3_BASE_URL;
export const live = process.env.I3_LIVE === "1" && (baseUrl !== undefined || process.env.DATABASE_URL !== undefined);
export const blocked =
  "BLOCKED: the live phase needs I3_LIVE=1 with DATABASE_URL (a migrated PostgreSQL, and a network that reaches power.larc.nasa.gov), or with I3_BASE_URL naming a running Gilir.";

const node = process.execPath;
const tsx = ["--import", "tsx"];

export async function startWorker(): Promise<ChildProcess | null> {
  if (baseUrl !== undefined) return null;
  const migrated = spawnSync(node, [...tsx, "scripts/migrate.ts"], { encoding: "utf8" });
  if (migrated.status !== 0) throw new Error(`Migration failed with exit ${migrated.status}.`);
  const worker = spawn(node, [...tsx, "scripts/worker.ts"], {
    env: { ...process.env, WORKER_ID: `i3-${process.pid}` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((ready, failed) => {
    const timer = setTimeout(() => failed(new Error("The worker did not report worker_ready in 60 s.")), 60_000);
    worker.stdout?.on("data", (chunk: Buffer) => {
      if (!chunk.toString().includes("worker_ready")) return;
      clearTimeout(timer);
      ready();
    });
    worker.once("exit", code => {
      clearTimeout(timer);
      failed(new Error(`The worker stopped with exit ${code} before it was ready.`));
    });
  });
  return worker;
}

export async function stopWorker(worker: ChildProcess | null): Promise<void> {
  if (worker === null || worker.exitCode !== null) return;
  const stopped = new Promise<void>(done => worker.once("exit", () => done()));
  worker.kill("SIGTERM");
  await stopped;
}
