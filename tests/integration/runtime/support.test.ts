import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { database, ownProcess } from "./support";

function fixture(mode: string) {
  return ownProcess(spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./process-fixture.ts", import.meta.url)), mode], { stdio: ["ignore", "pipe", "pipe"] }));
}

function expectStopped(pid: number | undefined) {
  expect(pid).toBeTypeOf("number");
  if (pid === undefined) throw new Error("Child did not start.");
  expect(() => process.kill(pid, 0)).toThrow();
}

it("waits for a split stdout record and preserves earlier complete events", async () => {
  const child = fixture("split-event");
  try {
    expect(await child.event("split")).toEqual({ event: "split", value: 2 });
    expect(await child.event("first")).toEqual({ event: "first", value: 1 });
    expect(await child.exit()).toEqual({ code: 0, signal: null });
  } finally { await child.stop(); }
});

it("rejects an event immediately when the child exits on a signal", async () => {
  const child = fixture("signal-exit");
  try {
    await expect(child.event("missing", 1000)).rejects.toThrow("SIGKILL");
    expect(await child.exit()).toEqual({ code: null, signal: "SIGKILL" });
  } finally { await child.stop(); }
});

it("kills a child that emits its event but misses the exit deadline", async () => {
  const child = fixture("exit-stall");
  try {
    expect(await child.event("tick")).toEqual({ event: "tick" });
    await expect(child.exit(100)).rejects.toThrow("Timed out waiting for child exit");
    expect(await child.exit()).toEqual({ code: null, signal: "SIGKILL" });
    expectStopped(child.child.pid);
  } finally { await child.stop(); }
});

it("kills a never-returning calculation thread when the diagnostic deadline expires", async () => {
  const child = fixture("diagnostic-stall");
  try {
    await child.event("calculation_started");
    await expect(child.event("engine_diagnostic", 100)).rejects.toThrow("Timed out waiting for engine_diagnostic");
    expect(await child.exit()).toEqual({ code: null, signal: "SIGKILL" });
    expectStopped(child.child.pid);
  } finally { await child.stop(); }
});

it.skipIf(!process.env.I1_TEST_DATABASE_URL)("reaches schema cleanup after a stalled diagnostic is terminated", async () => {
  const db = await database();
  const child = fixture("diagnostic-stall");
  try {
    await child.event("calculation_started");
    await expect(child.event("engine_diagnostic", 100)).rejects.toThrow("Timed out waiting for engine_diagnostic");
  } finally {
    try { await child.stop(); }
    finally { await db.close(); }
  }
  expectStopped(child.child.pid);
  const admin = new Pool({ connectionString: db.connectionString });
  try {
    expect((await admin.query("SELECT nspname FROM pg_namespace WHERE nspname = $1", [db.schema])).rows).toEqual([]);
  } finally { await admin.end(); }
});
