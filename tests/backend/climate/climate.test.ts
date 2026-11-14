import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { defaultEngineSettings, type ClimateCacheKey } from "@/contracts/climate";
import { parseIsoDate } from "@/contracts/common";
import { inputFixture } from "@/fixtures/input";
import { createMemoryClimateCache, createPrepareClimate } from "@/server/climate";
import { addDays, datesInPeriod, historicalPeriod } from "@/server/climate/dates";
import { cacheProductVersion, nativeCell, products, sourceUrl } from "@/server/climate/products";
import { normalizePowerResponse } from "@/server/climate/power";

const settings = { ...defaultEngineSettings, targetSeasons: 1 };
const cutoff = parseIsoDate("2025-08-01");
const period = historicalPeriod(inputFixture.planningStart, cutoff, settings);
const units: Record<string, string> = {
  T2M: "C", T2M_MIN: "C", T2M_MAX: "C", RH2M: "%", WS2M: "m/s",
  PS: "kPa", ALLSKY_SFC_SW_DWN: "MJ/m^2/day", IMERG_PRECTOT: "mm/day",
};
const values: Record<string, number> = { T2M: 25, T2M_MIN: 20, T2M_MAX: 30, RH2M: 70, WS2M: 2, PS: 101, ALLSKY_SFC_SW_DWN: 20, IMERG_PRECTOT: 0 };

function capturedShape(url: string) {
  const parsed = new URL(url);
  const start = parsed.searchParams.get("start") ?? "";
  const end = parsed.searchParams.get("end") ?? "";
  const parameters = (parsed.searchParams.get("parameters") ?? "").split(",");
  const dates = datesInPeriod(parseIsoDate(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6)}`),
    addDays(parseIsoDate(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6)}`), 1));
  return {
    type: "Feature", geometry: { type: "Point", coordinates: [Number(parsed.searchParams.get("longitude")), Number(parsed.searchParams.get("latitude")), 12] },
    properties: { parameter: Object.fromEntries(parameters.map((parameter) => [parameter, Object.fromEntries(dates.map((date) => [date.replaceAll("-", ""), values[parameter]]))])) },
    header: {
      title: "NASA/POWER Source Native Resolution Daily Data", api: { version: "v2.10.3", name: "POWER Daily API" },
      sources: [parameters.includes("IMERG_PRECTOT") ? "IMERG" : parameters.includes("ALLSKY_SFC_SW_DWN") ? "SYN1DEG" : "MERRA2", "POWER"],
      fill_value: -999, time_standard: "UTC", start, end,
    },
    parameters: Object.fromEntries(parameters.map((parameter) => [parameter, { units: units[parameter], longname: parameter }])),
    messages: [],
  };
}

function smallResponse(product = products[0]) {
  const cell = nativeCell(product, 100.5, 13.75);
  const key: ClimateCacheKey = {
    provider: "NASA POWER", product: product.id, productVersion: cacheProductVersion, nativeCellId: cell.id,
    fields: product.fields.map(({ field }) => field), start: parseIsoDate("2023-12-31"), endExclusive: parseIsoDate("2024-01-02"), timeStandard: "UTC",
  };
  const url = sourceUrl(product, cell, key);
  return { product, cell, key, url, response: capturedShape(url), cutoff, retrievedAt: "2026-11-14T00:00:00.000Z" };
}

describe("NASA POWER response boundary with synthetic captured-response shapes", () => {
  it("keeps zero rainfall available and missing markers and absent dates unavailable", () => {
    const args = smallResponse(products[2]);
    args.response.properties.parameter.IMERG_PRECTOT["20231231"] = -999;
    const snapshot = normalizePowerResponse({ ...args, text: JSON.stringify(args.response) });
    expect(snapshot.days[0].rainMm.kind).toBe("unavailable");
    expect(snapshot.days[1].rainMm).toEqual({ kind: "available", value: 0 });
    expect(snapshot.products[0].missingDatesByField).toEqual([{ field: "rainMm", dates: ["2023-12-31"] }]);
    delete args.response.properties.parameter.IMERG_PRECTOT["20240101"];
    expect(normalizePowerResponse({ ...args, text: JSON.stringify(args.response) }).days[1].rainMm.kind).toBe("unavailable");
  });

  it("converts radiation and pressure only from declared compatible units", () => {
    const solar = smallResponse(products[1]);
    solar.response.parameters.ALLSKY_SFC_SW_DWN.units = "kW-hr/m^2/day";
    solar.response.properties.parameter.ALLSKY_SFC_SW_DWN["20231231"] = 5;
    expect(normalizePowerResponse({ ...solar, text: JSON.stringify(solar.response) }).days[0].solarMjM2Day).toEqual({ kind: "available", value: 18 });
    const pressure = smallResponse();
    pressure.response.parameters.PS.units = "Pa";
    pressure.response.properties.parameter.PS["20231231"] = 101000;
    expect(normalizePowerResponse({ ...pressure, text: JSON.stringify(pressure.response) }).days[0].pressureKpa).toEqual({ kind: "available", value: 101 });
    pressure.response.parameters.PS.units = "kelvin";
    expect(() => normalizePowerResponse({ ...pressure, text: JSON.stringify(pressure.response) })).toThrow("unsupported units");
  });

  it("rejects duplicate dates before JSON parsing discards them", () => {
    const args = smallResponse(products[2]);
    const text = JSON.stringify(args.response).replace('"20231231":0', '"20231231":0,"20231231":1');
    expect(() => normalizePowerResponse({ ...args, text })).toThrow("duplicate dates");
  });

  it("rejects corrupt dates, mismatched periods, source changes, and non-UTC responses", () => {
    const args = smallResponse();
    args.response.header.time_standard = "LST";
    expect(() => normalizePowerResponse({ ...args, text: JSON.stringify(args.response) })).toThrow("UTC");
    args.response.header.time_standard = "UTC";
    args.response.header.sources = ["ERA5"];
    expect(() => normalizePowerResponse({ ...args, text: JSON.stringify(args.response) })).toThrow("unreviewed source");
    args.response.header.sources = [];
    expect(() => normalizePowerResponse({ ...args, text: JSON.stringify(args.response) })).toThrow("omitted the underlying source");
    args.response.header.sources = ["MERRA2"];
    args.response.properties.parameter.T2M["20241301"] = 3;
    expect(() => normalizePowerResponse({ ...args, text: JSON.stringify(args.response) })).toThrow("invalid daily date");
  });

  it("records source hashes, native grids, conversions and unavailable stream/version without guessing", () => {
    const args = smallResponse();
    const text = JSON.stringify(args.response);
    const snapshot = normalizePowerResponse({ ...args, text });
    expect(snapshot.kind).toBe("provider");
    expect(snapshot.contentHash).toBe(createHash("sha256").update(text).digest("hex"));
    expect(snapshot.products[0]).toMatchObject({
      gridDegrees: [0.5, 0.625], cellId: args.cell.id, timeStandard: "UTC", sourceUrl: args.url,
      stream: { kind: "unavailable" }, version: { kind: "unavailable" },
    });
    expect(snapshot.products[0].product).toContain("v2.10.3");
    expect(snapshot.products[0].fields.find(({ field }) => field === "pressureKpa"))
      .toMatchObject({ originalUnit: "kPa", canonicalUnit: "kPa", conversionVersion: "power-units-v1" });
    expect(snapshot.latitudeDeg).toBe(args.cell.latitude);
  });
});

describe("prepareClimate", () => {
  it("retrieves the full historical range and reuses the same native cells across neighboring points", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(capturedShape(String(url)))));
    const prepare = createPrepareClimate({ fetch: fetcher, sleep: async () => {} });
    const cache = createMemoryClimateCache();
    const first = await prepare({ input: inputFixture, cutoff, settings, cache });
    const neighboring = { ...inputFixture, field: { ...inputFixture.field, lookup: [100.006, 15.006] satisfies readonly [number, number] } };
    const second = await prepare({ input: neighboring, cutoff, settings, cache });
    expect(first.kind).toBe("ready");
    expect(second.snapshots.map(({ id }) => id)).toEqual(first.snapshots.map(({ id }) => id));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(first.snapshots).toHaveLength(3);
    expect(first.snapshots[0].days[0].date).toBe(period.start);
    expect(first.snapshots[0].days.at(-1)?.date).toBe(addDays(period.endExclusive, -1));
    for (const [url] of fetcher.mock.calls) expect(new URL(String(url)).searchParams.get("time-standard")).toBe("UTC");
  });

  it("keeps partial snapshots on bounded provider errors", async () => {
    const delays: number[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("ALLSKY")
      ? new Response("outage", { status: 503 }) : new Response(JSON.stringify(capturedShape(String(url)))));
    const result = await createPrepareClimate({ fetch: fetcher, sleep: async (delay) => { delays.push(delay); } })({ input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() });
    expect(result).toMatchObject({ kind: "failed", failure: { code: "retrieval_failed", retryable: true } });
    expect(result.snapshots).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([1000, 2000]);
  });

  it("distinguishes genuine missing coverage from failed retrieval without replacing rain", async () => {
    const prepare = createPrepareClimate({ fetch: async (url) => {
      const body = capturedShape(String(url));
      if (body.properties.parameter.IMERG_PRECTOT) {
        body.properties.parameter.IMERG_PRECTOT = Object.fromEntries(Object.keys(body.properties.parameter.IMERG_PRECTOT).map((date) => [date, -999]));
      }
      return new Response(JSON.stringify(body));
    } });
    const result = await prepare({ input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() });
    expect(result.kind).toBe("unavailable");
    expect(result.snapshots).toHaveLength(3);
    expect(result.snapshots[2].days.every(({ rainMm }) => rainMm.kind === "unavailable")).toBe(true);
  });

  it("fails corrupt provider units without retry and preserves the earlier product", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const body = capturedShape(String(url));
      if (body.parameters.ALLSKY_SFC_SW_DWN) body.parameters.ALLSKY_SFC_SW_DWN.units = "unknown";
      return new Response(JSON.stringify(body));
    });
    const result = await createPrepareClimate({ fetch: fetcher })({ input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() });
    expect(result).toMatchObject({ kind: "failed", failure: { retryable: false } });
    expect(result.snapshots).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests for one cell and cache", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(capturedShape(String(url)))));
    const prepare = createPrepareClimate({ fetch: fetcher });
    const args = { input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() };
    expect((await Promise.all([prepare(args), prepare(args)])).map(({ kind }) => kind)).toEqual(["ready", "ready"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("bounds retries for transport and response-body failures", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("Network disconnected"); });
    const result = await createPrepareClimate({ fetch: fetcher, sleep: async () => {} })({ input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() });
    expect(result).toMatchObject({ kind: "failed", failure: { retryable: true }, snapshots: [] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const brokenBody = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("Body interrupted")); } })));
    const bodyResult = await createPrepareClimate({ fetch: brokenBody, sleep: async () => {} })({ input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() });
    expect(bodyResult).toMatchObject({ kind: "failed", failure: { retryable: true } });
    expect(brokenBody).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent HTTP errors or synthetic cache entries", async () => {
    const fetcher = vi.fn(async () => new Response("invalid request", { status: 422 }));
    const prepare = createPrepareClimate({ fetch: fetcher });
    const result = await prepare({ input: inputFixture, cutoff, settings, cache: createMemoryClimateCache() });
    expect(result).toMatchObject({ kind: "failed", failure: { retryable: false, message: "NASA POWER returned HTTP 422." } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const sample = smallResponse();
    const synthetic = { ...normalizePowerResponse({ ...sample, text: JSON.stringify(sample.response) }), kind: "synthetic", label: "Synthetic cache corruption test" } satisfies import("@/contracts/climate").ClimateSnapshot;
    expect(await prepare({ input: inputFixture, cutoff, settings, cache: { read: async () => synthetic, put: async () => {} } }))
      .toMatchObject({ kind: "failed", failure: { retryable: false } });
  });

  it("keeps independent retrieval timestamps immutable when provider bytes are identical", async () => {
    const savedById = new Map<string, string>();
    const makeCache = () => ({
      read: async () => null,
      put: async (_key: ClimateCacheKey, snapshot: import("@/contracts/climate").ClimateSnapshot) => {
        const bytes = JSON.stringify(snapshot);
        const existing = savedById.get(snapshot.id);
        if (existing !== undefined && existing !== bytes) throw new Error("Immutable snapshot identity conflict");
        savedById.set(snapshot.id, bytes);
      },
    });
    const fetcher: typeof fetch = async (url) => new Response(JSON.stringify(capturedShape(String(url))));
    const first = createPrepareClimate({ fetch: fetcher, now: () => new Date("2026-11-14T01:00:00Z") });
    const second = createPrepareClimate({ fetch: fetcher, now: () => new Date("2026-11-14T01:01:00Z") });
    const results = await Promise.all([
      first({ input: inputFixture, cutoff, settings, cache: makeCache() }),
      second({ input: inputFixture, cutoff, settings, cache: makeCache() }),
    ]);
    expect(results.map(({ kind }) => kind)).toEqual(["ready", "ready"]);
    expect(savedById.size).toBe(6);
    expect(results[0].snapshots.map(({ contentHash }) => contentHash)).toEqual(results[1].snapshots.map(({ contentHash }) => contentHash));
    expect(results[0].snapshots[0].id).not.toBe(results[1].snapshots[0].id);
  });
});

describe("historical range and worldwide native cells", () => {
  it("includes 25 complete fixed-length replay candidates and 366 lookback days across December", () => {
    const result = historicalPeriod(parseIsoDate("2026-07-01"), parseIsoDate("2026-11-14"), defaultEngineSettings);
    expect(result.seasons).toHaveLength(25);
    expect(result.seasons[0]).toEqual({ start: "2001-07-01", endExclusive: "2002-07-01" });
    expect(result.seasons.at(-1)).toEqual({ start: "2025-07-01", endExclusive: "2026-07-01" });
    expect(result.start).toBe("2000-06-30");
  });

  it("maps February 29 anchors and uses the actual planning horizon length", () => {
    const result = historicalPeriod(parseIsoDate("2028-02-29"), parseIsoDate("2026-01-01"), settings);
    expect(result.horizonDays).toBe(365);
    expect(result.seasons[0]).toEqual({ start: "2024-02-29", endExclusive: "2025-02-28" });
  });

  it("handles southern latitudes, pole edges and the wrapped dateline with different native grids", () => {
    expect(nativeCell(products[0], 28.2, -25.75)).toMatchObject({ latitude: -25.5, longitude: 28.125 });
    expect(nativeCell(products[1], 28.2, -25.75)).toMatchObject({ latitude: -25.5, longitude: 28.5 });
    expect(nativeCell(products[2], 28.2, -25.75)).toMatchObject({ latitude: -25.75, longitude: 28.25 });
    expect(nativeCell(products[2], 180, 90)).toMatchObject({ latitude: 89.95, longitude: -179.95 });
    expect(nativeCell(products[0], 180, -90)).toEqual(nativeCell(products[0], -180, -90));
  });
});

describe("saved real NASA full-period evidence", () => {
  it("keeps the real recent all-missing solar response unavailable when NASA reports no source", () => {
    const args = smallResponse(products[1]);
    const key = { ...args.key, start: parseIsoDate("2026-11-05"), endExclusive: parseIsoDate("2026-11-07") };
    const url = sourceUrl(args.product, args.cell, key);
    const text = readFileSync(new URL("../../../docs/evidence/B2/recent-solar-missing.json", import.meta.url), "utf8");
    const snapshot = normalizePowerResponse({ ...args, key, url, text, cutoff: parseIsoDate("2026-11-14") });
    expect(snapshot.days.every(({ solarMjM2Day }) => solarMjM2Day.kind === "unavailable")).toBe(true);
    expect(snapshot.products[0].stream.kind).toBe("unavailable");
  });

  it.each(["bangkok", "pretoria"])("normalizes every saved %s source body and verifies recorded hashes", (location) => {
    const directory = new URL(`../../../docs/evidence/B2/${location}/`, import.meta.url);
    const summary = z.object({
      sources: z.array(z.object({ productId: z.string(), file: z.string(), url: z.string(), retrievedAt: z.string(), contentHash: z.string() })),
      period: z.object({ start: z.string(), endExclusive: z.string() }), cutoff: z.string(), completeDailyWeatherSeasonPotential: z.number(),
    }).parse(JSON.parse(readFileSync(new URL("summary.json", directory), "utf8")));
    const savedSnapshots: unknown = JSON.parse(gunzipSync(readFileSync(new URL("snapshots.json.gz", directory))).toString("utf8"));
    const reconstructed = [];
    for (const product of products) {
      const source = summary.sources.find((entry) => entry.productId === product.id);
      if (!source) throw new Error(`Missing saved source for ${product.id}`);
      const text = gunzipSync(readFileSync(new URL(source.file, directory))).toString("utf8");
      const url = new URL(source.url);
      const cell = nativeCell(product, Number(url.searchParams.get("longitude")), Number(url.searchParams.get("latitude")));
      const key: ClimateCacheKey = {
        provider: "NASA POWER", product: product.id, productVersion: cacheProductVersion, nativeCellId: cell.id,
        fields: product.fields.map(({ field }) => field), start: parseIsoDate(summary.period.start), endExclusive: parseIsoDate(summary.period.endExclusive), timeStandard: "UTC",
      };
      const snapshot = normalizePowerResponse({ text, product, cell, key, cutoff: parseIsoDate(summary.cutoff), retrievedAt: source.retrievedAt, url: source.url });
      expect(snapshot.contentHash).toBe(source.contentHash);
      expect(snapshot.days).toHaveLength(9497);
      expect(snapshot.products[0].missingDatesByField.every(({ dates }) => dates.length === 0)).toBe(true);
      reconstructed.push(snapshot);
    }
    expect(reconstructed).toEqual(savedSnapshots);
    expect(summary.completeDailyWeatherSeasonPotential).toBe(25);
  });
});
