import { z } from "zod";
import { cropPurposeIdSchema, isoDateSchema, labels } from "./common";

export const waterAnswerSchema = z.enum(["rain_only", "rain_plus_backup", "unsure"]);
const precision = z.enum(["exact", "approximate"]);

const lngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).readonly();
export type LngLat = z.infer<typeof lngLatSchema>;

export const inputLimits = { polygonVertices: 256, selectedCrops: 12, historyEntries: 64, payloadBytes: 65536 };

const historyEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("crop"),
    id: labels,
    crop: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("catalogue"), cropPurposeId: cropPurposeIdSchema }),
      z.strictObject({ kind: z.literal("unsupported"), label: labels }),
    ]),
    planted: isoDateSchema,
    harvested: isoDateSchema,
    plantedPrecision: precision,
    harvestedPrecision: precision,
  }),
  z.strictObject({
    kind: z.literal("fallow"),
    id: labels,
    start: isoDateSchema,
    endExclusive: isoDateSchema,
  }),
]);

const historySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("skipped") }),
  z.strictObject({
    kind: z.literal("recorded"),
    start: isoDateSchema,
    endExclusive: isoDateSchema,
    entries: z.array(historyEntrySchema).max(inputLimits.historyEntries).readonly(),
  }),
]);

export const farmInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  field: z.strictObject({
    ring: z.array(lngLatSchema).min(4).max(inputLimits.polygonVertices + 1).readonly(),
    lookup: lngLatSchema,
    label: labels,
  }),
  cropPurposeIds: z.array(cropPurposeIdSchema).min(1).max(inputLimits.selectedCrops).readonly(),
  water: waterAnswerSchema,
  planningStart: isoDateSchema,
  history: historySchema,
}).superRefine(({ field, cropPurposeIds, history, planningStart }, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (new Set(cropPurposeIds).size !== cropPurposeIds.length) issue(["cropPurposeIds"], "Select each crop only once.");
  const first = field.ring[0];
  const last = field.ring.at(-1);
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    issue(["field", "ring"], "Close the field boundary.");
  } else if (!containsLookup(field.ring, field.lookup)) {
    issue(["field", "lookup"], "Choose a lookup point within a nondegenerate field.");
  }
  if (history.kind === "skipped") return;
  if (history.start >= history.endExclusive || history.endExclusive > planningStart) {
    issue(["history"], "History coverage must end at or before the planning start.");
  }
  const ids = new Set<string>();
  const intervals = history.entries.map((entry, index) => {
    const start = entry.kind === "crop" ? entry.planted : entry.start;
    const end = entry.kind === "crop" ? entry.harvested : entry.endExclusive;
    const inclusive = entry.kind === "crop";
    if (
      start < history.start || end > history.endExclusive ||
      (inclusive ? start > end || end === history.endExclusive : start >= end)
    ) issue(["history", "entries", index], "The entry must be within recorded coverage and end after it starts.");
    if (ids.has(entry.id)) issue(["history", "entries", index, "id"], "History entries must have distinct IDs.");
    ids.add(entry.id);
    return { start, end, inclusive, index };
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < intervals.length; i++) {
    const before = intervals[i - 1];
    const current = intervals[i];
    if (current.start < before.end || (current.start === before.end && before.inclusive)) {
      issue(["history", "entries", current.index], "Historical entries cannot overlap.");
    }
  }
}).readonly();

function containsLookup(ring: readonly LngLat[], [longitude, latitude]: LngLat): boolean {
  const vertices: [number, number][] = [];
  for (const [lng, lat] of ring) {
    const previous = vertices.at(-1)?.[0] ?? longitude;
    const nearest = lng + 360 * Math.round((previous - lng) / 360);
    vertices.push([nearest, lat]);
  }
  const x = longitude + 360 * Math.round((vertices[0][0] - longitude) / 360);
  let inside = false;
  let boundary = false;
  let twiceArea = 0;
  for (let i = 1; i < vertices.length; i++) {
    const [ax, ay] = vertices[i - 1];
    const [bx, by] = vertices[i];
    twiceArea += ax * by - bx * ay;
    if ((bx - ax) * (latitude - ay) === (by - ay) * (x - ax)
      && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
      && latitude >= Math.min(ay, by) && latitude <= Math.max(ay, by)) boundary = true;
    if ((ay > latitude) !== (by > latitude) && x < ax + (bx - ax) * (latitude - ay) / (by - ay)) inside = !inside;
  }
  return twiceArea !== 0 && (inside || boundary);
}

export type FarmInput = z.infer<typeof farmInputSchema>;
export type WaterAnswer = z.infer<typeof waterAnswerSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type DatePrecision = z.infer<typeof precision>;

export const parseFarmInput = (raw: unknown): FarmInput => farmInputSchema.parse(raw);
