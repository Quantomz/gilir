import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { runLiveAcceptance } from "./live";
import { ownProcess } from "./support";

it("persists a sanitized partial failure through the Vitest entrypoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "i1-report-"));
  const secret = "private-invalid-database-url";
  vi.stubEnv("I1_TEST_DATABASE_URL", secret);
  vi.stubEnv("I1_EXPECTED_STATE", "insufficient_data");
  try {
    const path = join(directory, "partial.json");
    const report = await runLiveAcceptance(false, path);
    const bytes = await readFile(path, "utf8");
    expect(JSON.parse(bytes)).toEqual(report);
    expect(report).toMatchObject({ status: "FAILED", exitCode: 1, caseId: "boise-dry-bean-june", expectedState: "plan_with_warnings", failure: { stage: "database", code: "execution_failed" }, cleanup: { processesStopped: true, schemaRemoved: true } });
    expect(report.checks.expectedRelease).toEqual({ catalogueVersion: "fao56-hard-windows-2026-11-15", ruleVersion: "no-rules-2026-11-14", profileId: "common-bean-dry-fao56-idaho-jun", profileVersion: "reviewed-2026-11-15.2", plantingWindow: { start: "2027-06-01", endInclusive: "2027-06-30" } });
    expect(report.codeIdentity?.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(bytes).not.toContain(secret);
    expect(bytes).not.toContain("ZodError");
    expect(bytes).not.toContain("ring");
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it("persists sanitized CLI failure evidence and returns its actual exit status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "i1-report-cli-"));
  const path = join(directory, "partial.json");
  const secret = "private-cli-database-url";
  const child = ownProcess(spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./live.ts", import.meta.url)), "--report", path], {
    env: { ...process.env, I1_TEST_DATABASE_URL: secret }, stdio: ["ignore", "pipe", "pipe"],
  }));
  try {
    expect(await child.exit()).toEqual({ code: 1, signal: null });
    const report = JSON.parse(await readFile(path, "utf8"));
    expect(report).toMatchObject({ status: "FAILED", exitCode: 1, failure: { stage: "database", code: "execution_failed" } });
    expect(child.logs()).not.toContain(secret);
    expect(child.logs()).not.toContain("ZodError");
  } finally {
    await child.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
