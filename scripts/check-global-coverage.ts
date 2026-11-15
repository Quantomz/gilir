import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { z } from "zod";
import { defaultEngineSettings } from "../src/contracts/climate";
import { isoDateSchema } from "../src/contracts/common";
import type { FrozenRun } from "../src/contracts/engine";
import { parseFarmInput } from "../src/contracts/input";
import type { ClimatePreparation } from "../src/contracts/jobs";
import { buildClimateCohort } from "../src/engine/metrics/cohort";
import { createMemoryClimateCache, createPrepareClimate } from "../src/server/climate";
import { anchorInYear, dayDistance, historicalPeriod } from "../src/server/climate/dates";
import { nativeCell, products } from "../src/server/climate/products";
import { sha256 } from "../src/server/climate/power";

const locations = [
  { id: "cordoba", label: "Cordoba", category: "southern", lookup: [-64.19, -31.42] },
  { id: "berlin", label: "Berlin", category: "temperate", lookup: [13.4, 52.52] },
  { id: "quito", label: "Quito", category: "equatorial", lookup: [-78.5, -0.2] },
  { id: "taveuni", label: "Taveuni", category: "dateline-adjacent", lookup: [179.9, -16.8] },
] as const;
const limits = "Coverage at four public locations and the recorded dates only. No ET0, crop, ranking, or worldwide agronomic validation.";
const sourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("live") }),
  z.strictObject({ kind: z.literal("fixture"), label: z.string().min(1) }),
]);
const timestamp = z.iso.datetime();
const errorSchema = z.strictObject({ name: z.string(), message: z.string() });
const responseFields = { status: z.number().int().min(200).max(599), retryAfter: z.string().nullable() };
const attemptSchema = z.strictObject({
  url: z.url(), capturedAt: timestamp,
  outcome: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("text"), ...responseFields, text: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    z.strictObject({ kind: z.literal("http_error"), ...responseFields }),
    z.strictObject({ kind: z.literal("fetch_error"), error: errorSchema }),
    z.strictObject({ kind: z.literal("body_error"), ...responseFields, error: errorSchema }),
  ]),
});
const bundleSchema = z.strictObject({
  schemaVersion: z.literal(1), source: sourceSchema, context: z.unknown(), location: z.unknown(),
  attempts: z.array(attemptSchema).max(9),
  clocks: z.array(z.strictObject({ afterAttempt: z.number().int().min(1).max(9), value: timestamp })).max(3),
  expected: z.unknown(),
});
const reportSchema = z.strictObject({
  schemaVersion: z.literal(1), mode: z.enum(["live", "fixture", "replay"]), source: sourceSchema,
  context: z.object({ planningStart: isoDateSchema, cutoff: isoDateSchema }).passthrough(),
  execution: z.enum(["complete", "incomplete"]), limits: z.literal(limits),
  locations: z.array(z.strictObject({
    location: z.unknown(), bundleSha256: z.string().nullable(), summary: z.unknown(),
    integrity: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("recorded") }), z.strictObject({ kind: z.literal("verified") }),
      z.strictObject({ kind: z.literal("failed"), message: z.string() }),
    ]),
  })).max(4),
});
type Attempt = z.infer<typeof attemptSchema>;
type Bundle = z.infer<typeof bundleSchema>;
type Source = z.infer<typeof sourceSchema>;
type Options = { output: string } & (
  | { mode: "live"; planningStart?: string; cutoff?: string }
  | { mode: "fixture"; planningStart?: string; cutoff?: string; fixture: {
    label: string; fetch: typeof fetch; now?: () => Date; sleep?: (milliseconds: number) => Promise<void>;
  } }
  | { mode: "replay"; input: string }
);

function contextFor(planningStart = "2027-07-01", cutoff = "2026-11-14") {
  const start = isoDateSchema.parse(planningStart);
  const endExclusive = anchorInYear(start, Number(start.slice(0, 4)) + 1);
  const dataCutoff = isoDateSchema.parse(cutoff);
  const period = historicalPeriod(start, dataCutoff, defaultEngineSettings);
  return {
    planningStart: start, cutoff: dataCutoff, settings: defaultEngineSettings,
    horizon: { start, endExclusive }, horizonDays: dayDistance(start, endExclusive),
    period, expectedDays: dayDistance(period.start, period.endExclusive), cohortLookbackDays: 0,
  };
}
type Context = ReturnType<typeof contextFor>;

function inputFor(location: typeof locations[number], context: Context) {
  const [x, y] = location.lookup;
  const w = 0.0001;
  return parseFarmInput({
    schemaVersion: 1,
    field: { lookup: location.lookup, label: `Public illustrative ${location.label} lookup`,
      ring: [[x - w, y - w], [x + w, y - w], [x + w, y + w], [x - w, y + w], [x - w, y - w]] },
    cropPurposeIds: ["coverage-only"], water: "rain_only", planningStart: context.planningStart, history: { kind: "skipped" },
  });
}

function summarize(result: ClimatePreparation, location: typeof locations[number], context: Context, attempts: readonly Attempt[]) {
  const input = inputFor(location, context);
  const run: FrozenRun = {
    input, climate: result.snapshots, settings: context.settings,
    manifest: { schemaVersion: 1, normalizedInputHash: sha256(JSON.stringify(input)), engineVersion: "coverage-only",
      configurationVersion: context.settings.version, catalogueVersion: "not-assessed", ruleVersion: "not-assessed",
      climateSnapshotIds: result.snapshots.map(s => s.id), dataCutoff: context.cutoff },
  };
  const cohort = buildClimateCohort({ run, horizon: context.horizon, lookbackDays: context.cohortLookbackDays });
  return {
    preparation: result.kind === "failed" ? { kind: result.kind, failure: result.failure }
      : result.kind === "unavailable" ? { kind: result.kind, reason: result.reason } : { kind: result.kind },
    attemptCount: attempts.length,
    products: products.map(product => {
      const cell = nativeCell(product, location.lookup[0], location.lookup[1]);
      const requested = { productId: product.id, cell, gridDegrees: product.grid, fields: product.fields };
      const snapshot = result.snapshots.find(s => s.products.some(p => p.cellId === cell.id));
      const attempted = attempts.some(a => new URL(a.url).searchParams.get("parameters") === product.fields.map(f => f.parameter).join(","));
      if (!snapshot) return { ...requested, status: attempted ? "failed" : "unattempted" };
      const raw = attempts.find(a => a.url === snapshot.products[0].sourceUrl && a.outcome.kind === "text");
      const returned = raw?.outcome.kind === "text"
        ? z.object({ geometry: z.object({ coordinates: z.tuple([z.number(), z.number(), z.number()]) }) }).parse(JSON.parse(raw.outcome.text)).geometry.coordinates
        : null;
      return {
        ...requested, status: "validated", snapshotId: snapshot.id, contentHash: snapshot.contentHash,
        retrievedAt: snapshot.retrievedAt, elevationM: snapshot.elevationM,
        returnedCenter: returned?.slice(0, 2) ?? null,
        normalizedPeriod: { first: snapshot.days[0]?.date ?? null, last: snapshot.days.at(-1)?.date ?? null, days: snapshot.days.length },
        observations: product.fields.map(({ field }) => {
          const available = snapshot.days.filter(day => day[field].kind === "available");
          return { field, availableDays: available.length, first: available[0]?.date ?? null, last: available.at(-1)?.date ?? null };
        }),
        provenance: snapshot.products.map(p => ({ ...p, missingDatesByField: p.missingDatesByField.map(missing => ({
          field: missing.field, count: missing.dates.length, first: missing.dates[0] ?? null, last: missing.dates.at(-1) ?? null,
        })) })),
      };
    }),
    cohort: {
      coverage: cohort.coverage, usableSeasons: cohort.usable.length,
      meetsMinimumSeasons: cohort.usable.length >= context.settings.minimumUsableSeasons,
      applicabilityClimate: cohort.applicabilityClimate, elevationM: cohort.elevationM, gaps: cohort.gaps,
    },
  };
}

function errorRecord(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { name: "Error", message: String(error) };
}

function replayResponse(outcome: Attempt["outcome"]): Response {
  if (outcome.kind === "fetch_error" || outcome.kind === "body_error") {
    throw Object.assign(new Error(outcome.error.message), { name: outcome.error.name });
  }
  const body = outcome.kind === "text" && ![204, 205, 304].includes(outcome.status) ? outcome.text : null;
  return new Response(body, { status: outcome.status, headers: outcome.retryAfter === null ? {} : { "retry-after": outcome.retryAfter } });
}

export async function checkGlobalCoverage(options: Options) {
  if (!["live", "fixture", "replay"].includes(options.mode)) throw new Error("Choose live, fixture, or replay mode.");
  if (options.mode !== "fixture" && "fixture" in options) throw new Error("Injected providers require fixture mode.");
  const output = resolve(z.string().min(1).parse(options.output));
  const saved = options.mode === "replay"
    ? reportSchema.parse(JSON.parse(await readFile(resolve(options.input, "report.json"), "utf8"))) : null;
  if (saved && saved.mode !== "replay" && saved.mode !== saved.source.kind) throw new Error("Capture mode and evidence source disagree.");
  if (saved && (saved.execution !== "complete" || saved.locations.length !== locations.length
    || saved.locations.some(row => row.integrity.kind === "failed"))) throw new Error("Replay source execution is incomplete or corrupt.");
  const context = saved ? contextFor(saved.context.planningStart, saved.context.cutoff)
    : contextFor(options.mode === "replay" ? undefined : options.planningStart, options.mode === "replay" ? undefined : options.cutoff);
  if (saved && !isDeepStrictEqual(saved.context, context)) throw new Error("Replay context does not match the recorded policy.");
  const source: Source = saved?.source ?? (options.mode === "fixture"
    ? sourceSchema.parse({ kind: "fixture", label: options.fixture.label }) : { kind: "live" });
  const report: {
    schemaVersion: 1; mode: Options["mode"]; source: Source; context: Context;
    execution: "incomplete" | "complete"; limits: string;
    locations: {
      location: typeof locations[number]; bundleSha256: string | null;
      summary: ReturnType<typeof summarize> | null;
      integrity: { kind: "recorded" | "verified" } | { kind: "failed"; message: string };
    }[];
  } = { schemaVersion: 1, mode: options.mode, source, context, execution: "incomplete", limits, locations: [] };
  await mkdir(output);
  const saveReport = () => writeFile(resolve(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await saveReport();
  const clock = options.mode === "fixture" ? options.fixture.now ?? (() => new Date()) : () => new Date();
  const request = options.mode === "fixture" ? options.fixture.fetch : globalThis.fetch;
  let active: Bundle;
  let attemptIndex = 0;
  let clockIndex = 0;
  let integrityError: Error | null = null;
  const corrupt = (message: string): never => {
    integrityError ??= new Error(`Replay integrity failed: ${message}`);
    throw integrityError;
  };
  const prepare = createPrepareClimate({
    fetch: async (url, init) => {
      if (options.mode === "replay") {
        if (integrityError) throw integrityError;
        const attempt = active.attempts[attemptIndex++];
        if (!attempt || attempt.url !== String(url)) corrupt("missing or out-of-order request URL");
        return replayResponse(attempt.outcome);
      }
      const capturedAt = clock().toISOString();
      let response: Response;
      try { response = await request(url, init); }
      catch (error) {
        active.attempts.push({ url: String(url), capturedAt, outcome: { kind: "fetch_error", error: errorRecord(error) } });
        throw error;
      }
      const metadata = { status: response.status, retryAfter: response.headers.get("retry-after") };
      if (!response.ok) {
        active.attempts.push({ url: String(url), capturedAt, outcome: { kind: "http_error", ...metadata } });
        return response;
      }
      let text: string;
      try { text = await response.text(); }
      catch (error) {
        active.attempts.push({ url: String(url), capturedAt, outcome: { kind: "body_error", ...metadata, error: errorRecord(error) } });
        throw error;
      }
      const outcome: Attempt["outcome"] = { kind: "text", ...metadata, text, sha256: sha256(text) };
      active.attempts.push({ url: String(url), capturedAt, outcome });
      return replayResponse(outcome);
    },
    now: () => {
      if (options.mode === "replay") {
        const entry = active.clocks[clockIndex++];
        if (!entry || entry.afterAttempt !== attemptIndex) corrupt("missing or out-of-order clock read");
        return new Date(entry.value);
      }
      const value = clock();
      active.clocks.push({ afterAttempt: active.attempts.length, value: value.toISOString() });
      return value;
    },
    ...(options.mode === "replay" ? { sleep: async () => {} }
      : options.mode === "fixture" ? { sleep: options.fixture.sleep ?? (async () => {}) } : {}),
  });
  for (const [index, location] of locations.entries()) {
    attemptIndex = 0;
    clockIndex = 0;
    integrityError = null;
    active = { schemaVersion: 1, source, context, location, attempts: [], clocks: [], expected: null };
    try {
      if (options.mode === "replay" && saved) {
        const bytes = await readFile(resolve(options.input, `${location.id}.json.gz`));
        const row = saved.locations[index];
        if (createHash("sha256").update(bytes).digest("hex") !== row.bundleSha256) corrupt("bundle hash mismatch");
        active = bundleSchema.parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
        if (!isDeepStrictEqual(active.location, location) || !isDeepStrictEqual(row.location, location)
          || !isDeepStrictEqual(active.context, context) || !isDeepStrictEqual(active.source, source)
          || !isDeepStrictEqual(active.expected, row.summary)) corrupt("bundle context, location, source, or expectation mismatch");
        for (const { outcome } of active.attempts) {
          if (outcome.kind === "text" && (outcome.status >= 300 || sha256(outcome.text) !== outcome.sha256)) corrupt("successful body hash or status mismatch");
          if (outcome.kind === "body_error" && outcome.status >= 300) corrupt("body error must be a successful HTTP response");
          if (outcome.kind === "http_error" && outcome.status < 300) corrupt("unread response must be non-OK");
        }
      }
      const result = await prepare({ input: inputFor(location, context), cutoff: context.cutoff,
        settings: context.settings, cache: createMemoryClimateCache() });
      if (integrityError) throw integrityError;
      if (options.mode === "replay" && (attemptIndex !== active.attempts.length || clockIndex !== active.clocks.length)) corrupt("unused attempts or clock reads");
      const summary = summarize(result, location, context, active.attempts);
      if (options.mode === "replay" && !isDeepStrictEqual(summary, active.expected)) corrupt("normalized snapshots or coverage summary changed");
      active.expected = summary;
      const bytes = gzipSync(JSON.stringify(active));
      await writeFile(resolve(output, `${location.id}.json.gz`), bytes, { flag: "wx" });
      report.locations.push({ location, bundleSha256: createHash("sha256").update(bytes).digest("hex"), summary,
        integrity: { kind: options.mode === "replay" ? "verified" : "recorded" } });
    } catch (error) {
      report.locations.push({ location, bundleSha256: null, summary: null,
        integrity: { kind: "failed", message: errorRecord(error).message } });
    }
    await saveReport();
  }
  report.execution = report.locations.some(row => row.integrity.kind === "failed") ? "incomplete" : "complete";
  await saveReport();
  return report;
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: "string" }, input: { type: "string" }, output: { type: "string" },
    "planning-start": { type: "string" }, cutoff: { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    process.stdout.write("Usage: node --import tsx scripts/check-global-coverage.ts --mode live --output NEW_DIRECTORY [--planning-start YYYY-MM-DD --cutoff YYYY-MM-DD]\n       node --import tsx scripts/check-global-coverage.ts --mode replay --input SAVED_DIRECTORY --output NEW_DIRECTORY\n");
    return;
  }
  const mode = z.enum(["live", "replay"]).parse(values.mode);
  const output = z.string().min(1).parse(values.output);
  if (mode === "replay" && (values.cutoff || values["planning-start"])) throw new Error("Replay uses the captured dates. Overrides are not accepted.");
  if (mode === "live" && values.input) throw new Error("Live mode does not accept an input capture.");
  const report = await checkGlobalCoverage(mode === "live"
    ? { mode, output, planningStart: values["planning-start"], cutoff: values.cutoff }
    : { mode, output, input: z.string().min(1).parse(values.input) });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.execution === "incomplete") process.exitCode = 2;
  else if (report.locations.some(row => !row.summary?.cohort.meetsMinimumSeasons || row.summary.preparation.kind !== "ready")) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${errorRecord(error).message}\n`); process.exitCode = 2; });
}
