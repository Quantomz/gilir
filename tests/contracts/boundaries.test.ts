import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.each([
  ['engine', 'import "node:fs";'],
  ['registry', 'import "node:fs";'],
  ['app', '"use client"; import "@/server/jobs";'],
  ['engine', 'import { jobStore } from "../server/jobs";'],
  ['engine', 'export { resultFixtures } from "../fixtures/results";'],
  ['client', 'import { readCatalogue } from "@/registry";'],
  ['features', 'import { calculate } from "@/engine";'],
])("rejects a forbidden import from %s: %s", (lane, code) => {
  const root = mkdtempSync(join(tmpdir(), "gilir-boundaries-"));
  try {
    mkdirSync(join(root, lane));
    writeFileSync(join(root, lane, "probe.ts"), code);
    const result = spawnSync(process.execPath, [resolve("scripts/check-boundaries.mjs"), root], { encoding: "utf8" });
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain("imports");
  } finally {
    rmSync(root, { recursive: true });
  }
});
