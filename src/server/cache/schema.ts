import { z } from "zod";
import { evidence, isoDateSchema, labels } from "@/contracts/common";
import type { ClimateSnapshot } from "@/contracts/climate";

const field = z.enum(["rainMm", "meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"]);
const value = evidence(z.number().finite());
const product = z.strictObject({
  provider: labels,
  product: labels,
  stream: evidence(labels),
  version: evidence(labels),
  cellId: labels,
  gridDegrees: z.tuple([z.number().positive(), z.number().positive()]).readonly(),
  fields: z.array(z.strictObject({
    field,
    providerField: labels,
    originalUnit: labels,
    canonicalUnit: z.enum(["mm/day", "degC", "%", "m/s", "MJ/m²/day", "kPa"]),
    conversionVersion: labels,
  })).readonly(),
  timeStandard: z.literal("UTC"),
  sourceUrl: z.url(),
  missingDatesByField: z.array(z.strictObject({ field, dates: z.array(isoDateSchema).readonly() })).readonly(),
});

export const providerSnapshotSchema: z.ZodType<Extract<ClimateSnapshot, { kind: "provider" }>> = z.strictObject({
  kind: z.literal("provider"),
  id: labels,
  contentHash: labels,
  cutoff: isoDateSchema,
  retrievedAt: z.iso.datetime(),
  latitudeDeg: z.number().min(-90).max(90),
  elevationM: value,
  products: z.array(product).readonly(),
  days: z.array(z.strictObject({
    date: isoDateSchema,
    rainMm: value,
    meanC: value,
    minC: value,
    maxC: value,
    humidityPct: value,
    wind2mMs: value,
    solarMjM2Day: value,
    pressureKpa: value,
  })).readonly(),
}).readonly();

export const climateCacheKeySchema = z.strictObject({
  provider: labels,
  product: labels,
  productVersion: labels,
  nativeCellId: labels,
  fields: z.array(field).min(1).readonly(),
  start: isoDateSchema,
  endExclusive: isoDateSchema,
  timeStandard: z.literal("UTC"),
}).refine(key => key.start < key.endExclusive, "Cache interval must have a positive duration.");
