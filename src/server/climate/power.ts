import { createHash } from "node:crypto";
import { z } from "zod";
import type { ClimateCacheKey, ClimateSnapshot, DailyWeather } from "@/contracts/climate";
import { parseIsoDate, type EvidenceValue, type IsoDate } from "@/contracts/common";
import { datesInPeriod } from "./dates";
import type { NativeCell, ProductDefinition } from "./products";

const responseSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number(), z.number()]) }),
  properties: z.object({ parameter: z.record(z.string(), z.record(z.string(), z.number().nullable())) }),
  header: z.object({
    title: z.string(), api: z.object({ version: z.string(), name: z.string() }),
    sources: z.array(z.string()), fill_value: z.number(), time_standard: z.literal("UTC"),
    start: z.string().regex(/^\d{8}$/), end: z.string().regex(/^\d{8}$/),
  }),
  parameters: z.record(z.string(), z.object({ units: z.string(), longname: z.string() })),
  messages: z.array(z.string()),
});

export class ClimateProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "ClimateProviderError";
  }
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJson(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
    const stack: (Set<string> | null)[] = [];
    const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === "{") stack.push(new Set());
      else if (token === "[") stack.push(null);
      else if (token === "}" || token === "]") stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ":") {
        const key = z.string().parse(JSON.parse(token));
        const keys = stack.at(-1);
        if (keys?.has(key)) throw new Error("Duplicate object key");
        keys?.add(key);
      }
    }
  } catch {
    throw new ClimateProviderError("NASA POWER returned invalid JSON or duplicate dates/metadata keys.", false);
  }
  return parsed;
}

const conversions: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  degC: { C: 1, degC: 1, "°C": 1 },
  "%": { "%": 1 },
  "m/s": { "m/s": 1 },
  "mm/day": { "mm/day": 1, mm: 1 },
  "MJ/m²/day": { "MJ/m^2/day": 1, "MJ/m²/day": 1, "kW-hr/m^2/day": 3.6, "kWh/m^2/day": 3.6, "W/m^2": 0.0864 },
  kPa: { kPa: 1, Pa: 0.001, hPa: 0.1, mb: 0.1 },
};

function emptyDay(date: IsoDate): DailyWeather {
  const missing = { kind: "unavailable", reason: "Field belongs to a separate native product snapshot." } satisfies EvidenceValue<number>;
  return {
    date, rainMm: missing, meanC: missing, minC: missing, maxC: missing,
    humidityPct: missing, wind2mMs: missing, solarMjM2Day: missing, pressureKpa: missing,
  };
}

function providerDate(raw: string): IsoDate {
  if (!/^\d{8}$/.test(raw)) throw new ClimateProviderError("NASA POWER returned an invalid daily date.", false);
  try { return parseIsoDate(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`); }
  catch { throw new ClimateProviderError("NASA POWER returned an invalid daily date.", false); }
}

export function normalizePowerResponse(args: {
  readonly text: string;
  readonly product: ProductDefinition;
  readonly cell: NativeCell;
  readonly key: ClimateCacheKey;
  readonly cutoff: IsoDate;
  readonly retrievedAt: string;
  readonly url: string;
}): ClimateSnapshot {
  const parsed = responseSchema.safeParse(readJson(args.text));
  if (!parsed.success) throw new ClimateProviderError("NASA POWER response has invalid fields, units metadata, or UTC metadata.", false);
  const response = parsed.data;
  const [longitude, latitude, elevation] = response.geometry.coordinates;
  if (Math.abs(longitude - args.cell.longitude) > 0.000001 || Math.abs(latitude - args.cell.latitude) > 0.000001) {
    throw new ClimateProviderError("NASA POWER response location does not match its requested native cell.", false);
  }
  if (providerDate(response.header.start) !== args.key.start
    || providerDate(response.header.end) !== datesInPeriod(args.key.start, args.key.endExclusive).at(-1)) {
    throw new ClimateProviderError("NASA POWER response period does not match the request.", false);
  }
  if (response.header.sources.some((source) => !args.product.allowedSources.includes(source))) {
    throw new ClimateProviderError("NASA POWER returned an unreviewed source product or grid.", false);
  }
  const dates = datesInPeriod(args.key.start, args.key.endExclusive);
  const days = new Map(dates.map((date) => [date, emptyDay(date)]));
  for (const [date, day] of days) {
    let initialized = day;
    for (const { field } of args.product.fields) initialized = { ...initialized, [field]: { kind: "unavailable", reason: "NASA POWER observation is missing or outside source coverage." } };
    days.set(date, initialized);
  }
  const fields = args.product.fields.map((definition) => {
    const metadata = response.parameters[definition.parameter];
    const values = response.properties.parameter[definition.parameter];
    if (!metadata || !values) throw new ClimateProviderError("NASA POWER omitted a requested parameter or its units.", false);
    const factor = conversions[definition.unit]?.[metadata.units];
    if (factor === undefined) throw new ClimateProviderError(`NASA POWER returned unsupported units for ${definition.parameter}.`, false);
    for (const [rawDate, raw] of Object.entries(values)) {
      const date = providerDate(rawDate);
      const day = days.get(date);
      if (!day) throw new ClimateProviderError("NASA POWER returned a date outside the requested period.", false);
      if (raw === null || raw === response.header.fill_value) continue;
      const value = raw * factor;
      if (!Number.isFinite(value) || (definition.unit === "%" && (value < 0 || value > 100))
        || (["mm/day", "m/s", "MJ/m²/day"].includes(definition.unit) && value < 0)
        || (definition.unit === "kPa" && value <= 0) || (definition.unit === "degC" && value < -273.15)) {
        throw new ClimateProviderError(`NASA POWER returned invalid values for ${definition.parameter}.`, false);
      }
      days.set(date, { ...day, [definition.field]: { kind: "available", value } });
    }
    return {
      field: definition.field, providerField: definition.parameter, originalUnit: metadata.units,
      canonicalUnit: definition.unit, conversionVersion: "power-units-v1",
    };
  });
  const normalizedDays = [...days.values()];
  if (!response.header.sources.some((source) => source !== "POWER")
    && fields.some(({ field }) => normalizedDays.some((day) => day[field].kind === "available"))) {
    throw new ClimateProviderError("NASA POWER omitted the underlying source product for available observations.", false);
  }
  for (const day of normalizedDays) {
    if (day.minC.kind === "available" && day.maxC.kind === "available" && day.minC.value > day.maxC.value) {
      throw new ClimateProviderError("NASA POWER returned minimum temperature above maximum temperature.", false);
    }
  }
  const contentHash = sha256(args.text);
  return {
    kind: "provider", id: `power-${sha256(JSON.stringify({ key: args.key, cutoff: args.cutoff, contentHash, retrievedAt: args.retrievedAt }))}`,
    contentHash, cutoff: args.cutoff, retrievedAt: args.retrievedAt, latitudeDeg: latitude,
    elevationM: elevation === response.header.fill_value
      ? { kind: "unavailable", reason: "NASA POWER elevation is missing." }
      : { kind: "available", value: elevation },
    products: [{
      provider: "NASA POWER", product: `${args.product.id} [${response.header.sources.join(",")}] via ${response.header.api.name} ${response.header.api.version}`,
      stream: { kind: "unavailable", reason: "POWER does not identify the actual source stream per day; Final/Late or near-real-time attribution is unavailable." },
      version: { kind: "unavailable", reason: "POWER reports its API version but omits the underlying source release version." },
      cellId: args.cell.id, gridDegrees: args.product.grid, fields, timeStandard: "UTC", sourceUrl: args.url,
      missingDatesByField: fields.map(({ field }) => ({ field, dates: normalizedDays.filter((day) => day[field].kind === "unavailable").map(({ date }) => date) })),
    }],
    days: normalizedDays,
  };
}
