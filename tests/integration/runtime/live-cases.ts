import { parseFarmInput } from "@/contracts";

export const boiseDryBeanCase = {
  id: "boise-dry-bean-june",
  input: parseFarmInput({
    schemaVersion: 1,
    field: {
      ring: [[-116.21, 43.59], [-116.19, 43.59], [-116.19, 43.61], [-116.21, 43.61], [-116.21, 43.59]],
      lookup: [-116.2, 43.6],
      label: "I1 public illustrative Boise region, not a surveyed farm",
    },
    cropPurposeIds: ["common-bean-dry"], water: "rain_only", planningStart: "2027-06-01", history: { kind: "skipped" },
  }),
  catalogueVersion: "fao56-hard-windows-2026-11-15",
  ruleVersion: "no-rules-2026-11-14",
  profileId: "common-bean-dry-fao56-idaho-jun",
  profileVersion: "reviewed-2026-11-15.2",
  plantingWindow: { start: "2027-06-01", endInclusive: "2027-06-30" },
};

export const bangkokMissingProfileCase = {
  id: "bangkok-dry-bean-missing-profile",
  input: parseFarmInput({
    schemaVersion: 1,
    field: {
      ring: [[100.54, 13.74], [100.56, 13.74], [100.56, 13.76], [100.54, 13.76], [100.54, 13.74]],
      lookup: [100.55, 13.75], label: "I1 public illustrative Bangkok region, not a surveyed farm",
    },
    cropPurposeIds: ["common-bean-dry"], water: "rain_only", planningStart: "2027-06-01", history: { kind: "skipped" },
  }),
};
