import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { z } from "zod";
import { defaultEngineSettings, farmInputSchema, parseFarmInput, parseIsoDate, releasedRegistrySchema, runManifestSchema } from "@/contracts";
import type { ClimateSnapshot, FrozenRun, JobCapability } from "@/contracts";
import { createPrepareClimate, historicalPeriod } from "@/server/climate";
import { addDays, dayDistance } from "@/server/climate/dates";
import { products } from "@/server/climate/products";
import { providerSnapshotSchema } from "@/server/cache/schema";
import type { FrozenEvidence } from "./acceptance";
import { migrate } from "../../../scripts/migrate";

export const cutoff = parseIsoDate("2026-11-14");
export const freezeLeaseSeconds = 5;
export const replayLeaseSeconds = 30;
export const input = parseFarmInput({
  schemaVersion: 1,
  field: { ring: [[100.54, 13.74], [100.56, 13.74], [100.56, 13.76], [100.54, 13.76], [100.54, 13.74]], lookup: [100.55, 13.75], label: "I1 public illustrative location" },
  cropPurposeIds: ["i1-controlled-crop"], water: "rain_only", planningStart: "2026-07-01", history: { kind: "skipped" },
});
export const controlledRegistry = releasedRegistrySchema.parse({
  kind: "released", identity: { catalogueVersion: "i1-controlled-only", ruleVersion: "i1-controlled-only" },
  catalogue: { version: "i1-controlled-only", entries: [{ id: "i1-controlled-crop", label: "Controlled transport test only", purpose: "food" }] },
  sources: [], profiles: [], rules: [],
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
  try { await admin.query('CREATE SCHEMA "' + schema + '"'); }
  catch (error) { await admin.end(); throw error; }
  const pool = poolForSchema(connectionString, schema);
  try { await migrate(pool); }
  catch (error) { await pool.end(); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); await admin.end(); throw error; }
  return {
    pool, schema, connectionString,
    async close() {
      try { await pool.end(); }
      finally {
        try { await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); }
        finally { await admin.end(); }
      }
    },
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

export function sanitizedUrl(source: string): string {
  const url = new URL(source);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function providerEvidence(snapshot: Extract<ClimateSnapshot, { kind: "provider" }>) {
  const firstDate = snapshot.days[0]?.date;
  const lastDate = snapshot.days.at(-1)?.date;
  return {
    id: snapshot.id, contentHash: snapshot.contentHash, retrievedAt: snapshot.retrievedAt, cutoff: snapshot.cutoff,
    period: { start: firstDate ?? "", endExclusive: lastDate ? addDays(lastDate, 1) : "" },
    dayCount: snapshot.days.length,
    dailySequenceComplete: firstDate !== undefined && snapshot.days.every((day, index) => day.date === addDays(firstDate, index)),
    products: snapshot.products.map(product => ({
      provider: product.provider, product: product.product, version: product.version, stream: product.stream,
      cellId: product.cellId, gridDegrees: product.gridDegrees, timeStandard: product.timeStandard,
      sourceUrl: sanitizedUrl(product.sourceUrl), fields: product.fields,
      missingDayCounts: product.missingDatesByField.map(field => ({ field: field.field, missingDays: field.dates.length })),
    })),
  };
}

export function assertRequiredClimate(evidence: FrozenEvidence, period: { start: string; endExclusive: string }) {
  assert.equal(evidence.syntheticSnapshots, 0, "Synthetic snapshots cannot satisfy I1.");
  assert.equal(evidence.providerSnapshots, products.length, "Every required NASA product must be frozen.");
  assert.deepEqual(evidence.snapshots.map(snapshot => snapshot.id), evidence.manifest.climateSnapshotIds, "Stored snapshots must match the frozen manifest identity.");
  assert.deepEqual(evidence.snapshots.flatMap(snapshot => snapshot.products.map(product => product.cellId.match(/^([^:]+):/)?.[1])).sort(), products.map(product => product.id).sort(), "Every required NASA product must appear exactly once.");
  const expectedDays = dayDistance(parseIsoDate(period.start), parseIsoDate(period.endExclusive));
  for (const snapshot of evidence.snapshots) {
    assert.deepEqual(snapshot.period, period, "Each frozen product must cover the full derived source period.");
    assert.equal(snapshot.dayCount, expectedDays, "Each frozen product must contain every required day.");
    assert.equal(snapshot.dailySequenceComplete, true, "Each frozen product must have consecutive unique daily records.");
    assert.equal(snapshot.cutoff, evidence.manifest.dataCutoff);
    assert.equal(snapshot.products.length, 1);
    const actual = snapshot.products[0];
    const expected = products.find(product => actual.cellId.startsWith(product.id + ":"));
    assert.ok(expected);
    assert.ok(actual.product === expected.id || actual.product.startsWith(expected.id + " ["), "A frozen product label must match its native cell identity.");
    assert.deepEqual(actual.fields.map(field => field.field).sort(), expected.fields.map(field => field.field).sort());
  }
}

const frozenSchema = z.object({
  input: farmInputSchema, manifest: runManifestSchema,
  climate: z.array(z.object({ kind: z.enum(["provider", "synthetic"]) }).passthrough()),
  settings: z.object({ version: z.string(), targetSeasons: z.number().int().positive(), minimumUsableSeasons: z.number().int().positive() }).passthrough(),
});
export async function frozenEvidence(pool: Pool, capability: JobCapability): Promise<FrozenEvidence> {
  const row = (await pool.query("SELECT frozen_run FROM jobs WHERE id = $1", [capability.jobId])).rows[0];
  const run = frozenSchema.parse(row?.frozen_run);
  const providers = run.climate.filter(snapshot => snapshot.kind === "provider").map(snapshot => providerSnapshotSchema.parse(snapshot));
  const dates = providers.flatMap(snapshot => snapshot.days.map(day => day.date)).sort();
  return {
    manifest: run.manifest, digest: digest(run), providerSnapshots: providers.length,
    syntheticSnapshots: run.climate.filter(snapshot => snapshot.kind === "synthetic").length,
    firstDate: dates[0] ?? "", lastDate: dates.at(-1) ?? "", snapshots: providers.map(providerEvidence),
    settings: { version: run.settings.version, targetSeasons: run.settings.targetSeasons, minimumUsableSeasons: run.settings.minimumUsableSeasons },
    requiredSourcePeriod: historicalPeriod(run.input.planningStart, run.manifest.dataCutoff, { ...defaultEngineSettings, targetSeasons: run.settings.targetSeasons }),
  };
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
  return ownProcess(child);
}

export function ownProcess(child: ChildProcessByStdio<null, Readable, Readable>) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk.toString(); });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => { resolve({ code, signal }); });
  });
  async function waitForExit(timeout: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([completed, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error("Timed out waiting for child exit. " + stderr)); }, timeout);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function stop(signal: NodeJS.Signals = "SIGTERM") {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    try { return await waitForExit(5000); }
    catch (error) {
      if (signal === "SIGKILL") throw error;
      child.kill("SIGKILL");
      return waitForExit(5000);
    }
  }
  return {
    child, logs: () => stdout + stderr,
    async exit(timeout = 20000) {
      try { return await waitForExit(timeout); }
      catch (error) { await stop("SIGKILL"); throw error; }
    },
    async event(name: string, timeout = 20000) {
      const deadline = Date.now() + timeout;
      try {
        while (Date.now() < deadline) {
          for (const line of stdout.slice(0, stdout.lastIndexOf("\n") + 1).split("\n")) {
            const parsed = z.object({ event: z.string() }).passthrough().safeParse(line ? JSON.parse(line) : null);
            if (parsed.success && parsed.data.event === name) return parsed.data;
          }
          assert.equal(child.signalCode, null, "Child was signalled before " + name + ". " + child.signalCode + ". " + stderr);
          assert.equal(child.exitCode, null, "Child exited before " + name + ". " + stderr);
          await delay(25);
        }
        throw new Error("Timed out waiting for " + name + ". " + stderr);
      } catch (error) { await stop("SIGKILL"); throw error; }
    },
    stop,
  };
}

export const frozenRun = (snapshots: readonly ClimateSnapshot[], normalizedInputHash: string): FrozenRun => ({
  input, settings: defaultEngineSettings, climate: snapshots,
  manifest: { schemaVersion: 1, normalizedInputHash, engineVersion: "v1", configurationVersion: defaultEngineSettings.version, ...controlledRegistry.identity, climateSnapshotIds: snapshots.map(snapshot => snapshot.id), dataCutoff: cutoff },
});
