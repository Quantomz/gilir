import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

function start(mode: string, path: string) {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./process-entry.ts", import.meta.url)), mode, path], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  const completed = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    child.once("error", reject);
    child.once("exit", code => { resolveResult({ code, stdout, stderr }); });
  });
  return { child, completed, output: () => stdout };
}

describe("separate worker processes with injected ports", () => {
  it("restarts after a process dies immediately after its durable freeze", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gilir-b3-restart-"));
    try {
      const frozen = await start("freeze", join(directory, "run.json")).completed;
      expect(frozen).toEqual({ code: 23, stdout: "frozen_before_crash\n", stderr: "" });
      const replay = await start("replay", join(directory, "run.json")).completed;
      expect(replay).toEqual({ code: 0, stdout: '{"kind":"completed","state":"completed"}\n', stderr: "" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("handles SIGTERM by completing the current claim and exiting", async () => {
    const process = start("drain", "unused");
    try {
      await vi.waitFor(() => { expect(process.output()).toContain("calculation_started"); }, { timeout: 5000 });
      process.child.kill("SIGTERM");
      const result = await process.completed;
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('{"kind":"completed","state":"completed"}');
      expect(result.stderr).toBe("");
    } finally { if (process.child.exitCode === null) process.child.kill("SIGKILL"); }
  });
});
