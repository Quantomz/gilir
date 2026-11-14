import { z } from "zod";

export const isoDateSchema = z.iso.date().brand<"IsoDate">();
export const cropPurposeIdSchema = z.string().regex(/^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/).max(80).brand<"CropPurposeId">();
export const labels = z.string().trim().min(1).max(240);
export const count = z.number().int().nonnegative();
export const days = count;
export const positiveDays = days.min(1);
export const fraction = z.number().min(0).max(1);

export type IsoDate = z.infer<typeof isoDateSchema>;
export type CropPurposeId = z.infer<typeof cropPurposeIdSchema>;
export type EvidenceValue<T> =
  | { readonly kind: "available"; readonly value: T }
  | { readonly kind: "unavailable"; readonly reason: string };

export const parseIsoDate = (raw: unknown): IsoDate => isoDateSchema.parse(raw);
export const parseCropPurposeId = (raw: unknown): CropPurposeId => cropPurposeIdSchema.parse(raw);

export function evidence<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("available"), value }),
    z.strictObject({ kind: z.literal("unavailable"), reason: labels }),
  ]);
}

export const sourceReferenceSchema = z.strictObject({
  id: labels,
  title: labels,
  url: z.url(),
  section: labels,
  publishedOn: evidence(isoDateSchema),
  extractedOn: isoDateSchema,
});

export class NotImplementedError extends Error {
  constructor(readonly operation: string) {
    super(`${operation} is not implemented`);
    this.name = "NotImplementedError";
  }
}
