import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

let database;
try { database = new URL(process.env.DATABASE_URL ?? ""); }
catch { throw new Error("Set DATABASE_URL to the disposable local gilir_hosting database."); }
assert(["postgres:", "postgresql:"].includes(database.protocol), "Use a PostgreSQL connection URL.");
assert(database.search === "", "Connection query parameters are not allowed for the local smoke database.");
assert(["host.docker.internal", "127.0.0.1", "localhost"].includes(database.hostname), "Use a disposable local PostgreSQL database.");
assert.equal(database.pathname, "/gilir_hosting", "Use the isolated gilir_hosting database.");
const image = process.env.GILIR_SMOKE_IMAGE ?? "gilir-hosting:smoke";
const suffix = process.pid.toString();
const web = `gilir-hosting-web-${suffix}`;
const worker = `gilir-hosting-worker-${suffix}`;
const httpPort = "8080";
const environment = ["--env", "DATABASE_URL", "--env", "WORKER_ID=gilir-hosting-smoke"];

function docker(args, { stream = false, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", data => { stdout += data; if (stream) process.stdout.write(data); });
    child.stderr.on("data", data => { stderr += data; if (stream) process.stderr.write(data); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`docker ${args[0]} failed with code ${code}\n${stderr}`)));
    child.stdin.end(input);
  });
}

function passed(check, details = {}) {
  process.stdout.write(JSON.stringify({ check, status: "passed", ...details }) + "\n");
}

try {
  await docker(["build", "--tag", image, "."], { stream: true });
  passed("image_build", { imageId: await docker(["image", "inspect", "--format", "{{.Id}}", image]) });
  assert.equal(await docker(["run", "--rm", image, "id", "-u"]), "1000");
  passed("non_root_runtime");
  await docker(["run", "--rm", ...environment, image, "sh", "deploy/start.sh", "migrate"], { stream: true });
  assert.equal(await docker(["run", "--rm", ...environment, image, "sh", "deploy/start.sh", "migrate"]), "");
  passed("migrations_idempotent");
  const ready = JSON.parse(await docker(["run", "--rm", ...environment, image, "sh", "deploy/start.sh", "worker-check"]));
  assert.equal(ready.event, "worker_ready");
  passed("worker_readiness");

  const cleanup = JSON.parse(await docker(["run", "--rm", ...environment, image, "sh", "deploy/start.sh", "cleanup"]));
  assert.equal(cleanup.event, "expired_jobs_purged");
  passed("cleanup_exits", { purged: cleanup.count });

  await docker(["run", "--detach", "--name", web, "--publish", `127.0.0.1::${httpPort}`, "--env", `PORT=${httpPort}`, ...environment, image]);
  const address = await docker(["port", web, `${httpPort}/tcp`]);
  const base = `http://${address}`;
  let response;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { response = await fetch(base); if (response.status === 200) break; } catch {}
    await delay(500);
  }
  assert.equal(response?.status, 200);
  passed("web_http", { httpStatus: response.status, containerPort: Number(httpPort) });
  const fixture = await fetch(base + "/dev/fixtures");
  assert.equal(fixture.status, 404);
  passed("production_fixture_hidden", { httpStatus: fixture.status });
  const catalogue = await fetch(base + "/api/catalogue");
  assert.equal(catalogue.status, 200);
  const catalogueBody = await catalogue.json();
  assert(Array.isArray(catalogueBody.entries));
  passed("catalogue_http", { httpStatus: catalogue.status, entries: catalogueBody.entries.length });

  await docker(["run", "--detach", "--name", worker, ...environment, image, "sh", "deploy/start.sh", "worker"]);
  let workerLogs = "";
  for (let attempt = 0; attempt < 60; attempt++) {
    workerLogs = await docker(["logs", worker]);
    if (workerLogs.includes('"event":"worker_ready"')) break;
    await delay(500);
  }
  assert(workerLogs.includes('"event":"worker_ready"'));
  await docker(["stop", "--time", "10", worker]);
  const state = JSON.parse(await docker(["inspect", "--format", "{{json .State}}", worker]));
  assert.equal(state.Running, false);
  assert.equal(state.ExitCode, 0);
  passed("idle_worker_sigterm", { exitCode: state.ExitCode });
} finally {
  for (const name of [web, worker]) {
    await docker(["rm", "--force", name]).catch(() => {});
  }
}
