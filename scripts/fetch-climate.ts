import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { z } from "zod";
import { defaultEngineSettings, type WeatherField } from "../src/contracts/climate";
import { parseIsoDate } from "../src/contracts/common";
import { parseFarmInput } from "../src/contracts/input";
import { createMemoryClimateCache, createPrepareClimate, historicalPeriod } from "../src/server/climate";
import { datesInPeriod } from "../src/server/climate/dates";
import { products } from "../src/server/climate/products";
import { sha256 } from "../src/server/climate/power";

const { values } = parseArgs({ options: {
  longitude: { type: "string" }, latitude: { type: "string" }, "planning-start": { type: "string" },
  cutoff: { type: "string" }, output: { type: "string" }, help: { type: "boolean" },
} });

if (values.help) {
  process.stdout.write("Usage: node --import tsx scripts/fetch-climate.ts --longitude 100.5 --latitude 13.75 --planning-start 2026-07-01 --cutoff 2026-11-14 --output docs/evidence/B2/bangkok\nUse public illustrative coordinates. Output contains source native cells, never field geometry.\n");
} else {
  const longitude = z.coerce.number().min(-179.999).max(179.999).parse(values.longitude);
  const latitude = z.coerce.number().min(-89.999).max(89.999).parse(values.latitude);
  const planningStart = parseIsoDate(values["planning-start"]);
  const cutoff = parseIsoDate(values.cutoff);
  const output = resolve(z.string().min(1).parse(values.output));
  const width = 0.0001;
  const input = parseFarmInput({
    schemaVersion: 1,
    field: {
      lookup: [longitude, latitude], label: "Public illustrative climate lookup",
      ring: [[longitude - width, latitude - width], [longitude + width, latitude - width],
        [longitude + width, latitude + width], [longitude - width, latitude + width], [longitude - width, latitude - width]],
    },
    cropPurposeIds: ["climate-retrieval-only"], water: "rain_only", priority: "water", planningStart, history: { kind: "skipped" },
  });
  await mkdir(output, { recursive: true });
  const sources: { productId: string; url: string; retrievedAt: string; contentHash: string; file: string }[] = [];
  const prepare = createPrepareClimate({ onResponse: async ({ productId, text, url, retrievedAt }) => {
    const file = `${productId.toLowerCase()}.json.gz`;
    await writeFile(resolve(output, file), gzipSync(text));
    sources.push({ productId, url, retrievedAt, contentHash: sha256(text), file });
    process.stdout.write(`Saved ${productId} source response.\n`);
  } });
  const result = await prepare({ input, cutoff, settings: defaultEngineSettings, cache: createMemoryClimateCache() });
  await writeFile(resolve(output, "snapshots.json.gz"), gzipSync(JSON.stringify(result.snapshots)));
  const period = historicalPeriod(planningStart, cutoff, defaultEngineSettings);
  const available = new Map<string, Set<WeatherField>>();
  for (const snapshot of result.snapshots) {
    for (const day of snapshot.days) {
      const fields = available.get(day.date) ?? new Set<WeatherField>();
      for (const product of snapshot.products) {
        for (const { field } of product.fields) if (day[field].kind === "available") fields.add(field);
      }
      available.set(day.date, fields);
    }
  }
  const requiredFields = products.flatMap(({ fields }) => fields.map(({ field }) => field));
  const complete = (date: string) => requiredFields.every((field) => available.get(date)?.has(field));
  const seasons = period.seasons.map((season) => {
    const dates = datesInPeriod(season.start, season.endExclusive);
    return { ...season, days: dates.length, completeDays: dates.filter(complete).length, completeDailyWeather: dates.every(complete) };
  });
  const summary = {
    evidence: "Real NASA POWER responses for public illustrative native cells. No crop or ET0 assessment.",
    kind: result.kind, ...(result.kind === "failed" ? { failure: result.failure } : {}),
    ...(result.kind === "unavailable" ? { reason: result.reason } : {}),
    planningStart, cutoff, period,
    sources,
    products: result.snapshots.flatMap(({ products: snapshotProducts }) => snapshotProducts.map((product) => ({
      ...product, missingDatesByField: product.missingDatesByField.map(({ field, dates }) => ({ field, count: dates.length, first: dates[0] ?? null, last: dates.at(-1) ?? null })),
    }))),
    completeDailyWeatherSeasonPotential: seasons.filter(({ completeDailyWeather }) => completeDailyWeather).length,
    seasonPotentialLimit: "Only required daily field completeness is counted. E2 must apply its common cohort, activated lookback, rules, and ET0 method. Lookback longer than 366 days is not supplied.",
    seasons,
    snapshotContentHashes: result.snapshots.map(({ id, contentHash }) => ({ id, contentHash })),
  };
  await writeFile(resolve(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ kind: result.kind, start: period.start, endExclusive: period.endExclusive, completeDailyWeatherSeasonPotential: summary.completeDailyWeatherSeasonPotential, summary: resolve(output, "summary.json") })}\n`);
  if (result.kind === "failed") process.exitCode = 1;
}
