import { parseFarmInput } from "@/contracts/input";

export const inputFixture = parseFarmInput({
  schemaVersion: 1,
  field: {
    ring: [[100, 15], [100.01, 15], [100.01, 15.01], [100, 15.01], [100, 15]],
    lookup: [100.005, 15.005],
    label: "Synthetic example field",
  },
  cropPurposeIds: ["synthetic-crop"],
  water: "rain_only",
  planningStart: "2026-07-01",
  history: {
    kind: "recorded",
    start: "2025-07-01",
    endExclusive: "2026-07-01",
    entries: [{
      kind: "crop", id: "synthetic-previous", crop: { kind: "catalogue", cropPurposeId: "synthetic-crop" },
      planted: "2025-07-01", harvested: "2025-07-04", plantedPrecision: "approximate", harvestedPrecision: "approximate",
    }],
  },
});

export const unsupportedHistoryFixture = parseFarmInput({
  ...inputFixture,
  history: {
    kind: "recorded",
    start: "2025-07-01",
    endExclusive: "2026-07-01",
    entries: [
      {
        kind: "crop", id: "synthetic-unsupported", crop: { kind: "unsupported", label: "Synthetic unlisted crop" },
        planted: "2025-07-01", harvested: "2025-07-04", plantedPrecision: "approximate", harvestedPrecision: "approximate",
      },
      { kind: "fallow", id: "synthetic-fallow", start: "2025-07-05", endExclusive: "2025-08-01" },
    ],
  },
});
