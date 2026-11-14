import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { cropPurposeIdSchema } from "../../../src/contracts/common";
import { releasedRegistrySchema } from "../../../src/contracts/registry";
import worksheet from "../../../docs/evidence/X1/core-source-worksheet.json";
import rawFao from "../../../docs/evidence/X1/fao-source-comparison.json";
import rawTemperatureA from "../../../docs/evidence/X1/x1-temperature-a.json";
import rawTemperatureB from "../../../docs/evidence/X1/x1-temperature-b.json";

const text = z.string().min(1);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const profile = releasedRegistrySchema.unwrap().shape.profiles.unwrap().element.unwrap();
const coreRow = z.strictObject({
  profileId: text, cropPurposeId: cropPurposeIdSchema, table11RowId: text, table12RowId: text,
  stages: profile.shape.timing.shape.generatedStageDays,
  durationDays: z.number().int().positive(),
  kc: profile.shape.kc.pick({ initial: true, middle: true, end: true }),
  months: z.array(z.number().int().min(1).max(12)).min(1), footnotes: z.array(text).min(1), qualifications: z.array(text).min(1),
});
const release = z.strictObject({ catalogueVersion: text, ruleVersion: text, profileVersions: z.record(text, text) });
const worksheetSchema = z.object({
  schemaVersion: z.literal(1), subjectSha: sha, sourceUrl: z.literal("https://www.fao.org/4/x0490e/x0490e0b.htm"),
  sourceRecordFile: z.literal("fao-source-comparison.json"), method: text,
  units: z.strictObject({ stages: z.literal("days"), durationDays: z.literal("days"), kc: z.literal("dimensionless"), months: z.literal("calendar_month"), turnaround: z.literal("days") }),
  interpretation: z.strictObject({ historicalAllocations: text, plantingMonths: text, standardConditions: text,
    turnaround: z.strictObject({ basis: z.literal("scheduling_assumption"), days: z.literal(7), published: z.literal(false), reason: text }),
  }),
  releases: z.tuple([release, release]), core: z.array(coreRow).length(12),
});
const reviewProfile = z.object({
  profileId: text, cropPurposeId: cropPurposeIdSchema, table11RowId: text, table12RowId: text, result: text, support: text,
  checks: z.array(z.object({ field: text, result: text, rationale: text })), checkedFields: z.array(text),
});
const faoSchema = z.object({
  auditSubject: z.object({ commit: sha }),
  coverage: z.object({ releaseCoverage: z.array(z.object({ catalogueVersion: text, checkedProfileIds: z.array(text) })) }),
  profiles: z.array(reviewProfile).length(86),
  findings: z.array(z.object({ id: text, kind: text, profiles: z.array(text), fact: text })).min(1),
  table11Rows: z.array(z.object({ id: text, stageDaysLiteral: z.tuple([text, text, text, text]), totalDaysLiteral: text, plantingLiteral: text, regionLiteral: text })),
  table12Rows: z.array(z.object({ id: text, effectiveInitialLiteral: text, kcLiteral: z.object({ middle: text, end: text }) })),
});
const temperatureReview = z.object({ ruleId: text, cropPurposeId: cropPurposeIdSchema, outcome: z.enum(["unsupported", "unverified"]), reason: text });
const aSchema = z.object({ subjectSHA: sha, findings: z.array(temperatureReview).length(19) });
const bSchema = z.object({ subject: z.object({ commit: sha }), records: z.array(temperatureReview).length(13) });

export function loadEvidence() {
  const sheet = worksheetSchema.parse(worksheet);
  const fao = faoSchema.parse(rawFao);
  const a = aSchema.parse(rawTemperatureA);
  const b = bSchema.parse(rawTemperatureB);
  const evidence = { ...sheet, profiles: fao.profiles, faoFindings: fao.findings,
    temperature: [...a.findings.map(row => ({ ...row, evidenceFile: "x1-temperature-a.json" })), ...b.records.map(row => ({ ...row, evidenceFile: "x1-temperature-b.json" }))],
  };
  if ([fao.auditSubject.commit, a.subjectSHA, b.subject.commit].some(value => value !== evidence.subjectSha)) throw new Error("Evidence subject revisions disagree");
  validateEvidence(evidence);
  return evidence;
}

export type Evidence = ReturnType<typeof loadEvidence>;

export function validateEvidence(evidence: Evidence): void {
  const fao = faoSchema.parse(rawFao);
  const sorted = (values: readonly string[]) => [...values].sort();
  for (const [index, release] of evidence.releases.entries()) {
    const reviewed = fao.coverage.releaseCoverage.find(row => row.catalogueVersion === release.catalogueVersion);
    const ids = (index === 0 ? evidence.core : evidence.profiles).map(row => row.profileId);
    if (!reviewed || !isDeepStrictEqual(sorted(ids), sorted(reviewed.checkedProfileIds))) throw new Error("Worksheet membership differs from reviewed releases");
  }
  if (new Set(evidence.temperature.map(row => row.ruleId)).size !== 32) throw new Error("Temperature review IDs are incomplete or duplicated");
  const months: Readonly<Record<string, readonly number[]>> = { April: [4], June: [6], October: [10], November: [11], December: [12], July: [7], "March/Apr": [3, 4] };
  for (const row of evidence.core) {
    const reviewed = fao.profiles.find(source => source.profileId === row.profileId);
    if (!reviewed || reviewed.cropPurposeId !== row.cropPurposeId || reviewed.table11RowId !== row.table11RowId || reviewed.table12RowId !== row.table12RowId) throw new Error(`Worksheet row identity differs from source review for ${row.profileId}`);
    const timing = fao.table11Rows.find(source => source.id === row.table11RowId);
    const kc = fao.table12Rows.find(source => source.id === row.table12RowId);
    if (!timing || !kc) throw new Error(`Missing source row for ${row.profileId}`);
    const sourceStages = timing.stageDaysLiteral.map(value => Number(value.split("^")[0]));
    const selectedEnd = row.cropPurposeId === "wheat-grain" ? 0.25 : 0.35;
    if (!isDeepStrictEqual(Object.values(row.stages), sourceStages)
      || row.durationDays !== Number(timing.totalDaysLiteral)
      || row.durationDays !== sourceStages.reduce((sum, value) => sum + value, 0)
      || row.kc.initial !== Number(kc.effectiveInitialLiteral)
      || row.kc.middle !== Number(kc.kcLiteral.middle.split("^")[0])
      || row.kc.end !== selectedEnd
      || !kc.kcLiteral.end.split("^")[0].split("-").map(Number).includes(selectedEnd)
      || !isDeepStrictEqual(row.months, months[timing.plantingLiteral])) throw new Error(`Worksheet differs from source cells for ${row.profileId}`);
  }
}
