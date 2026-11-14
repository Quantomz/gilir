import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { checkGlobalCoverage } from "../../../scripts/check-global-coverage";
import { parseIsoDate } from "../../../src/contracts/common";
import { addDays, datesInPeriod } from "../../../src/server/climate/dates";

const exec = promisify(execFile);
const clock = () => new Date("2026-11-15T01:02:03.000Z");
const units: Record<string, string> = { T2M: "C", T2M_MIN: "C", T2M_MAX: "C", RH2M: "%", WS2M: "m/s", PS: "kPa", ALLSKY_SFC_SW_DWN: "MJ/m^2/day", IMERG_PRECTOT: "mm/day" };
const values: Record<string, number> = { T2M: 20, T2M_MIN: 15, T2M_MAX: 25, RH2M: 60, WS2M: 2, PS: 101, ALLSKY_SFC_SW_DWN: 20, IMERG_PRECTOT: 0 };
let directory: string;
let sequence = 0;
const destination = (name: string) => join(directory, `${++sequence}-${name}`);
const capture = (output: string, fetch: typeof globalThis.fetch, sleep?: (ms: number) => Promise<void>) =>
  checkGlobalCoverage({ mode: "fixture", output, fixture: { label: "Synthetic constant weather for X2 behavior tests", fetch, now: clock, sleep } });

function payload(url: string) {
  const query = new URL(url).searchParams;
  const start = query.get("start")!;
  const end = query.get("end")!;
  const iso = (day: string) => parseIsoDate(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`);
  const dates = datesInPeriod(iso(start), addDays(iso(end), 1));
  const parameters = query.get("parameters")!.split(",");
  return {
    type: "Feature", geometry: { type: "Point", coordinates: [Number(query.get("longitude")), Number(query.get("latitude")), 42] },
    properties: { parameter: Object.fromEntries(parameters.map(name => [name, Object.fromEntries(dates.map(day => [day.replaceAll("-", ""), values[name]]))])) },
    header: { title: "SYNTHETIC X2 TEST DATA", api: { version: "synthetic-test", name: "Synthetic POWER-shaped response" },
      sources: [parameters.includes("IMERG_PRECTOT") ? "IMERG" : parameters.includes("ALLSKY_SFC_SW_DWN") ? "SYN1DEG" : "MERRA2"],
      fill_value: -999, time_standard: "UTC", start, end },
    parameters: Object.fromEntries(parameters.map(name => [name, { units: units[name], longname: name }])), messages: [],
  };
}
const successful: typeof fetch = async url => new Response(JSON.stringify(payload(String(url))));
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const bundle = async (path: string) => JSON.parse(gunzipSync(await readFile(path)).toString("utf8"));
const cli = (...args: string[]) => exec(process.execPath, ["--import", "tsx", "scripts/check-global-coverage.ts", ...args], { cwd: resolve("."), maxBuffer: 2_000_000 });

beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "gilir-x2-")); });
afterAll(async () => { vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

describe("X2 coverage through B2 and E2 using synthetic responses", () => {
  let source: string;
  let original: Awaited<ReturnType<typeof checkGlobalCoverage>>;
  beforeAll(async () => { source = destination("capture"); original = await capture(source, successful); }, 30_000);

  it("records all public cells, leap-year dates, zero rain, provenance, and exact replay", async () => {
    expect(original.execution).toBe("complete");
    expect(original.source.kind).toBe("fixture");
    expect(original.context).toMatchObject({ planningStart: "2027-07-01", cutoff: "2026-11-14", horizonDays: 366,
      expectedDays: 9498, cohortLookbackDays: 0, period: { start: "2000-06-30", endExclusive: "2026-07-02" },
      settings: { targetSeasons: 25, minimumUsableSeasons: 15 } });
    expect(await readdir(source)).toEqual(["berlin.json.gz", "cordoba.json.gz", "quito.json.gz", "report.json", "taveuni.json.gz"]);
    for (const row of original.locations) {
      expect(row.summary?.preparation.kind).toBe("ready");
      expect(row.summary?.cohort).toMatchObject({ usableSeasons: 25, meetsMinimumSeasons: true,
        applicabilityClimate: { meanAnnualPrecipitationMm: { kind: "available", value: 0 } }, elevationM: { kind: "available", value: 42 } });
      for (const product of row.summary!.products) {
        expect(product.status).toBe("validated");
        if ("provenance" in product) expect(product.provenance[0]).toMatchObject({
          stream: { kind: "unavailable" }, version: { kind: "unavailable" }, timeStandard: "UTC",
          missingDatesByField: product.provenance[0].missingDatesByField.map(field => ({ field: field.field, count: 0, first: null, last: null })),
        });
      }
    }
    expect(original.locations[3].summary!.products.map(p => p.cell.longitude)).toEqual([-180, 179.5, 179.95]);
    expect(original.locations[3].summary!.products.map(p => "returnedCenter" in p ? p.returnedCenter?.[0] : null)).toEqual([-180, 179.5, 179.95]);
    const network = vi.fn(() => { throw new Error("Offline replay reached the network"); });
    vi.stubGlobal("fetch", network);
    const replay = await checkGlobalCoverage({ mode: "replay", input: source, output: destination("replay") });
    expect(replay.execution).toBe("complete");
    expect(replay.source).toEqual(original.source);
    expect(replay.locations.map(row => row.summary)).toEqual(original.locations.map(row => row.summary));
    expect(replay.locations.every(row => row.integrity.kind === "verified")).toBe(true);
    expect(network).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  }, 30_000);

  it("separates one missing rain day, all-missing rain, and missing elevation from zero rain", async () => {
    const report = await capture(destination("gaps"), async url => {
      const data = payload(String(url));
      const longitude = data.geometry.coordinates[0];
      if (longitude > 10 && longitude < 20 && data.properties.parameter.IMERG_PRECTOT) data.properties.parameter.IMERG_PRECTOT["20240115"] = -999;
      if (longitude < -70 && data.properties.parameter.IMERG_PRECTOT) data.properties.parameter.IMERG_PRECTOT = {};
      if (Math.abs(longitude) > 170) data.geometry.coordinates[2] = -999;
      return new Response(JSON.stringify(data));
    });
    const [zero, missing, absent, elevation] = report.locations.map(row => row.summary!);
    expect(zero.cohort.usableSeasons).toBe(25);
    expect(missing.preparation.kind).toBe("ready");
    expect(missing.cohort.usableSeasons).toBe(24);
    expect(missing.products[2]).toMatchObject({ observations: [{ field: "rainMm", availableDays: 9497 }], provenance: [{ missingDatesByField: [{ field: "rainMm", count: 1, first: "2024-01-15", last: "2024-01-15" }] }] });
    expect(missing.cohort.coverage.kind === "available" && missing.cohort.coverage.value.seasons.filter(s => s.status === "excluded")).toEqual([
      expect.objectContaining({ status: "excluded", reason: expect.stringContaining("Missing rainMm on 2024-01-15") }),
    ]);
    expect(absent.preparation.kind).toBe("unavailable");
    expect(absent.products).toHaveLength(3);
    expect(absent.products[2]).toMatchObject({ observations: [{ field: "rainMm", availableDays: 0, first: null, last: null }], provenance: [{ missingDatesByField: [{ count: 9498 }] }] });
    expect(absent.cohort).toMatchObject({ coverage: { kind: "available" }, usableSeasons: 0, meetsMinimumSeasons: false });
    expect(elevation.cohort).toMatchObject({ usableSeasons: 25, meetsMinimumSeasons: true, elevationM: { kind: "unavailable" } });
    expect(elevation.cohort.gaps.some(gap => gap.reason.includes("Elevation"))).toBe(true);
  }, 30_000);

  it("preserves retries, unread HTTP failures, corrupt 200 bodies and earlier snapshots, then continues", async () => {
    const output = destination("failures");
    const sleeps: number[] = [];
    const reads = vi.fn();
    const report = await capture(output, async url => {
      const data = payload(String(url));
      const [longitude] = data.geometry.coordinates;
      const solar = Boolean(data.parameters.ALLSKY_SFC_SW_DWN);
      if ((longitude < -60 && longitude > -70 && solar) || (longitude > 10 && longitude < 20 && solar)) {
        const response = new Response("must stay unread", { status: longitude < 0 ? 503 : 422, headers: { "retry-after": "3" } });
        response.text = async () => { reads(); throw new Error("Non-OK body was read"); };
        return response;
      }
      if (longitude < -70 && solar) return new Response("{invalid JSON");
      return new Response(JSON.stringify(data));
    }, async ms => { sleeps.push(ms); });
    expect(reads).not.toHaveBeenCalled();
    expect(sleeps).toEqual([3000, 3000]);
    expect(report.execution).toBe("complete");
    for (const [index, retryable] of [true, false, false].entries()) {
      const summary = report.locations[index].summary!;
      expect(summary.preparation).toMatchObject({ kind: "failed", failure: { retryable } });
      expect(summary.products.map(product => product.status)).toEqual(["validated", "failed", "unattempted"]);
    }
    expect(report.locations[3].summary?.preparation.kind).toBe("ready");
    const recorded = await bundle(join(output, "cordoba.json.gz"));
    expect(recorded.attempts.map((a: { outcome: { kind: string } }) => a.outcome.kind)).toEqual(["text", "http_error", "http_error", "http_error"]);
    expect((await bundle(join(output, "quito.json.gz"))).attempts[1].outcome.text).toBe("{invalid JSON");
    const replay = await checkGlobalCoverage({ mode: "replay", input: output, output: destination("failure-replay") });
    expect(replay.execution).toBe("complete");
    expect(replay.locations.every(row => row.integrity.kind === "verified")).toBe(true);
    expect(replay.locations.map(row => row.summary)).toEqual(report.locations.map(row => row.summary));
    await expect(cli("--mode", "replay", "--input", output, "--output", destination("failure-cli"))).rejects.toMatchObject({ code: 1 });
  }, 30_000);

  it("records fetch and successful-body read failures without adding retries", async () => {
    const output = destination("transport");
    const counts = new Map<string, number>();
    const report = await capture(output, async url => {
      const key = String(url);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      const data = payload(key);
      const [longitude] = data.geometry.coordinates;
      if (longitude < -60 && longitude > -70) throw new TypeError("synthetic transport outage");
      if (longitude > 10 && longitude < 20 && count === 1) {
        const response = new Response("unused");
        response.text = async () => { throw new Error("synthetic interrupted body"); };
        return response;
      }
      return new Response(JSON.stringify(data));
    });
    expect(report.locations[0].summary).toMatchObject({ preparation: { kind: "failed", failure: { retryable: true } }, attemptCount: 3 });
    expect(report.locations[1].summary).toMatchObject({ preparation: { kind: "ready" }, attemptCount: 6 });
    expect((await bundle(join(output, "berlin.json.gz"))).attempts[0].outcome).toMatchObject({ kind: "body_error", status: 200 });
    expect((await bundle(join(output, "cordoba.json.gz"))).attempts.every((a: { outcome: { kind: string } }) => a.outcome.kind === "fetch_error")).toBe(true);
    const replay = await checkGlobalCoverage({ mode: "replay", input: output, output: destination("transport-replay") });
    expect(replay.execution).toBe("complete");
    expect(replay.locations.map(row => row.summary)).toEqual(report.locations.map(row => row.summary));
  }, 30_000);

  it.each(["body", "bundle-hash", "url", "missing-attempt", "extra-attempt", "reordered", "missing-clock", "extra-clock", "clock-order", "clock-value", "summary", "context"])("rejects %s capture corruption without network fallback", async kind => {
    const altered = destination(`corrupt-${kind}`);
    await cp(source, altered, { recursive: true });
    const file = join(altered, "cordoba.json.gz");
    const captured = await bundle(file);
    if (kind === "body" || kind === "bundle-hash") captured.attempts[0].outcome.text += " ";
    if (kind === "url") captured.attempts[0].url += "&unexpected=1";
    if (kind === "missing-attempt") captured.attempts.pop();
    if (kind === "extra-attempt") captured.attempts.push(captured.attempts[2]);
    if (kind === "reordered") [captured.attempts[0], captured.attempts[1]] = [captured.attempts[1], captured.attempts[0]];
    if (kind === "missing-clock") captured.clocks.pop();
    if (kind === "extra-clock") captured.clocks.push(captured.clocks[2]);
    if (kind === "clock-order") captured.clocks[0].afterAttempt = 2;
    if (kind === "clock-value") captured.clocks[0].value = "2026-11-15T12:00:00.000Z";
    if (kind === "summary") captured.expected.cohort.usableSeasons = 0;
    if (kind === "context") captured.context.horizonDays = 365;
    const bytes = gzipSync(JSON.stringify(captured));
    await writeFile(file, bytes);
    const saved = await json(join(altered, "report.json"));
    if (kind !== "bundle-hash") saved.locations[0].bundleSha256 = createHash("sha256").update(bytes).digest("hex");
    if (kind === "summary") saved.locations[0].summary = captured.expected;
    await writeFile(join(altered, "report.json"), JSON.stringify(saved));
    const network = vi.fn(() => { throw new Error("Replay made a network call"); });
    vi.stubGlobal("fetch", network);
    try {
      const replay = await checkGlobalCoverage({ mode: "replay", input: altered, output: destination("rejected") });
      expect(replay.execution).toBe("incomplete");
      expect(replay.locations[0].integrity.kind).toBe("failed");
      expect(replay.locations[0].summary).toBeNull();
      expect(replay.locations.slice(1).every(row => row.integrity.kind === "verified")).toBe(true);
      expect(network).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  }, 30_000);

  it("rejects incomplete sources, missing bundles, and overwrite", async () => {
    const disguisedFixture = { mode: "live" as const, output: destination("disguised"), fixture: { label: "synthetic", fetch: successful } };
    await expect(checkGlobalCoverage(disguisedFixture)).rejects.toThrow("fixture mode");
    await expect(capture(source, successful)).rejects.toMatchObject({ code: "EEXIST" });
    const altered = destination("missing-file");
    await cp(source, altered, { recursive: true });
    await rm(join(altered, "cordoba.json.gz"));
    const result = await checkGlobalCoverage({ mode: "replay", input: altered, output: destination("missing-result") });
    expect(result.execution).toBe("incomplete");
    await expect(cli("--mode", "replay", "--input", altered, "--output", destination("corrupt-cli"))).rejects.toMatchObject({ code: 2 });
    const saved = await json(join(altered, "report.json"));
    saved.execution = "incomplete";
    await writeFile(join(altered, "report.json"), JSON.stringify(saved));
    await expect(checkGlobalCoverage({ mode: "replay", input: altered, output: destination("incomplete") })).rejects.toThrow("incomplete");
  }, 30_000);

  it("supports the actual CLI, requires explicit modes, rejects replay overrides, and imports without work", async () => {
    const output = destination("cli");
    const result = await cli("--mode", "replay", "--input", source, "--output", output);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "replay", source: { kind: "fixture" }, execution: "complete" });
    expect((await json(join(output, "report.json"))).locations).toHaveLength(4);
    await expect(cli("--mode", "replay", "--input", source, "--output", output)).rejects.toMatchObject({ code: 2 });
    for (const args of [[], ["--mode", "fixture"], ["--mode", "replay", "--input", source, "--output", destination("bad-date"), "--cutoff", "2020-01-01"]]) {
      await expect(cli(...args)).rejects.toMatchObject({ code: 2 });
    }
    const imported = await exec(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      "globalThis.fetch = () => { throw new Error('Unexpected network'); }; await import('./scripts/check-global-coverage.ts'); process.stdout.write('imported');"]);
    expect(imported.stdout).toBe("imported");
  }, 30_000);
});
