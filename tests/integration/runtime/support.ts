import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { z } from "zod";
import { defaultEngineSettings, parseFarmInput, parseIsoDate, releasedRegistrySchema, runManifestSchema } from "@/contracts";
import type { ClimateSnapshot, FrozenRun, JobCapability } from "@/contracts";
import { createPrepareClimate } from "@/server/climate";
import { providerSnapshotSchema } from "@/server/cache/schema";
import { migrate } from "../../../scripts/migrate";

export const cutoff = parseIsoDate("2026-11-14");
export const freezeLeaseSeconds = 5;
export const replayLeaseSeconds = 30;
export const input = parseFarmInput({
  schemaVersion: 1,
  field: { ring: [[100.54, 13.74], [100.56, 13.74], [100.56, 13.76], [100.54, 13.76], [100.54, 13.74]], lookup: [100.55, 13.75], label: "I1 public illustrative location" },
  cropPurposeIds: ["i1-controlled-crop"], water: "rain_only", priority: "water", planningStart: "2026-07-01", history: { kind: "skipped" },
});
export const controlledRegistry = releasedRegistrySchema.parse({
  kind: "released", identity: { catalogueVersion: "i1-controlled-only", ruleVersion: "i1-controlled-only" },
  catalogue: { version: "i1-controlled-only", entries: [{ id: "i1-controlled-crop", label: "Controlled transport test only", purpose: "food" }] },
  sources: [], profiles: [], rules: [], coverage: [],
});

export function poolForSchema(connectionString: string, schema: string) {
  assert.match(schema, /^i1_[a-z0-9_]+$/);
  return new Pool({ connectionString, options: "-c search_path=" + schema, connectionTimeoutMillis: 5000, query_timeout: 30000 });
}

export async function database() {
  const connectionString = z.url().parse(process.env.I1_TEST_DATABASE_URL);
  assert.equal(new URL(connectionString).pathname, "/gilir_i1", "I1 must use its dedicated database.");
  const schema = "i1_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  await admin.query('CREATE SCHEMA "' + schema + '"');
  const pool = poolForSchema(connectionString, schema);
  try { await migrate(pool); }
  catch (error) { await pool.end(); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); await admin.end(); throw error; }
  return {
    pool, schema, connectionString,
    async close() { await pool.end(); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); await admin.end(); },
  };
}

const summarySchema = z.object({ sources: z.array(z.object({ productId: z.string(), file: z.string(), url: z.url(), contentHash: z.string() })) });
export async function savedProviderFetcher(): Promise<typeof fetch> {
  const directory = new URL("../../../docs/evidence/B2/bangkok/", import.meta.url);
  const summary = summarySchema.parse(JSON.parse(await readFile(new URL("summary.json", directory), "utf8")));
  const responses = new Map<string, string>();
  for (const source of summary.sources) {
    const bytes = gunzipSync(await readFile(new URL(source.file, directory))).toString("utf8");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.contentHash);
    responses.set(new URL(source.url).searchParams.get("parameters") ?? "", bytes);
  }
  return async url => {
    const key = new URL(String(url)).searchParams.get("parameters") ?? "";
    const bytes = responses.get(key);
    assert.ok(bytes, "Saved real provider bytes must exist for the requested fields.");
    return new Response(bytes, { headers: { "Content-Type": "application/json" } });
  };
}

export async function savedPreparation() {
  return createPrepareClimate({ fetch: await savedProviderFetcher(), now: () => new Date("2026-11-14T12:00:00.000Z") });
}

const frozenSchema = z.object({
  input: z.unknown(), manifest: runManifestSchema, climate: z.array(providerSnapshotSchema), settings: z.unknown(),
});
export async function frozenEvidence(pool: Pool, capability: JobCapability) {
  const row = (await pool.query("SELECT frozen_run FROM jobs WHERE id = $1", [capability.jobId])).rows[0];
  const run = frozenSchema.parse(row?.frozen_run);
  const dates = run.climate.flatMap(snapshot => snapshot.days.map(day => day.date)).sort();
  return { manifest: run.manifest, digest: digest(run), providerSnapshots: run.climate.length, syntheticSnapshots: 0, firstDate: dates[0] ?? "", lastDate: dates.at(-1) ?? "" };
}

export function digest(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return "[" + item.map(canonical).join(",") + "]";
    if (item !== null && typeof item === "object") return "{" + Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => JSON.stringify(key) + ":" + canonical(child)).join(",") + "}";
    const serialized = JSON.stringify(item);
    assert.notEqual(serialized, undefined);
    return serialized ?? "null";
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function startProcess(args: { mode: string; connectionString: string; schema: string; extra?: readonly string[] }) {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./process.ts", import.meta.url)), args.mode, ...(args.extra ?? [])], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: args.connectionString, I1_SCHEMA: args.schema }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => { resolve({ code, signal }); });
  });
  return {
    child, completed, logs: () => stdout + stderr,
    async event(name: string, timeout = 20000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        for (const line of stdout.split("\n")) {
          const parsed = z.object({ event: z.string() }).passthrough().safeParse(line ? JSON.parse(line) : null);
          if (parsed.success && parsed.data.event === name) return parsed.data;
        }
        assert.equal(child.exitCode, null, "Child exited before " + name + ". " + stderr);
        await delay(25);
      }
      throw new Error("Timed out waiting for " + name + ". " + stderr);
    },
    async stop(signal: NodeJS.Signals = "SIGTERM") {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      const timeout = setTimeout(() => { child.kill("SIGKILL"); }, 5000);
      try { return await completed; } finally { clearTimeout(timeout); }
    },
  };
}

export const frozenRun = (snapshots: readonly ClimateSnapshot[], normalizedInputHash: string): FrozenRun => ({
  input, settings: defaultEngineSettings, climate: snapshots,
  manifest: { schemaVersion: 1, normalizedInputHash, engineVersion: "v1", configurationVersion: defaultEngineSettings.version, ...controlledRegistry.identity, climateSnapshotIds: snapshots.map(snapshot => snapshot.id), dataCutoff: cutoff },
});
