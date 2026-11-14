const url = "https://www.fao.org/4/x0490e/x0490e0b.htm";
const publishedOn = { kind: "unavailable", reason: "FAO Irrigation and Drainage Paper 56 was published in 1998; the page states no exact day." } as const;
const extractedOn = "2026-11-14";

export const fao56Table11 = {
  id: "fao56-table11",
  title: "FAO-56 Crop evapotranspiration, Chapter 6: Table 11, lengths of crop development stages",
  url,
  section: "Chapter 6, Table 11 (lengths of crop development stages for various planting periods and climatic regions, days) and its footnotes",
  publishedOn,
  extractedOn,
} as const;

export const fao56Table12 = {
  id: "fao56-table12",
  title: "FAO-56 Crop evapotranspiration, Chapter 6: Table 12, single crop coefficients",
  url,
  section: "Chapter 6, Table 12 crop and group rows (small vegetables, Solanum family, cucumber family, roots and tubers, legumes, cereals, oil crops) with footnotes 1, 2, 4, 6, 9, 10, 11 and 12, and Table 14 with the rice Kc ini paragraph",
  publishedOn,
  extractedOn,
} as const;

export const fao56Sources = [fao56Table11, fao56Table12] as const;
