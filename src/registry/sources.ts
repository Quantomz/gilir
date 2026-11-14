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
  section: "Chapter 6, Table 12 (single time-averaged crop coefficients for non-stressed, well-managed crops in subhumid climates) and footnotes 1, 2, 10 and 11",
  publishedOn,
  extractedOn,
} as const;

const yearOnly = (year: number) => ({ kind: "unavailable", reason: `Published in ${year}; exact day not recorded.` }) as const;

export const gourdji2013 = {
  id: "gourdji2013",
  title: "Gourdji, Sibley & Lobell 2013, Global crop exposure to critical high temperatures in the reproductive period: historical trends and future projections, Environmental Research Letters 8:024041",
  url: "https://doi.org/10.1088/1748-9326/8/2/024041",
  section: "Methods: critical temperatures (34 °C wheat, 35 °C maize, 36 °C rice, 39 °C soybean) over a 30-day reproductive period",
  publishedOn: yearOnly(2013),
  extractedOn,
} as const;

export const teixeira2013 = {
  id: "teixeira2013",
  title: "Teixeira, Fischer, van Velthuizen, Walter & Ewert 2013, Global hot-spots of heat stress on agricultural crops due to climate change, Agricultural and Forest Meteorology 170:206-215",
  url: "https://doi.org/10.1016/j.agrformet.2011.09.002",
  section: "Table 2 (Tcrit/Tlim on daytime temperature: maize 35/45, wetland rice 35/45, soybean 35/40, wheat 27/40) and Eq. 1",
  publishedOn: yearOnly(2013),
  extractedOn,
} as const;

export const vargas2021 = {
  id: "vargas2021",
  title: "Vargas et al. 2021, Physiological and genetic characterization of heat stress effects in a common bean RIL population, PLoS ONE 16(4): e0249859",
  url: "https://doi.org/10.1371/journal.pone.0249859",
  section: "Introduction: temperatures above 20 °C during the night or above 30 °C during the day reported to cause seed yield reduction (citing Rainey & Griffiths 2005)",
  publishedOn: yearOnly(2021),
  extractedOn,
} as const;

export const silva2020 = {
  id: "silva2020",
  title: "Silva et al. 2020, Influence of high temperature on the reproductive biology of dry edible bean (Phaseolus vulgaris L.), Scientia Agricola 77(3)",
  url: "https://doi.org/10.1590/1678-992X-2018-0233",
  section: "Discussion: mean maximum daily temperatures above 30 °C and nighttime temperatures above 20 °C can significantly affect bean yield in the tropics (quoting Porch et al. 2010)",
  publishedOn: yearOnly(2020),
  extractedOn,
} as const;

const fao56Table12Release2 = {
  ...fao56Table12,
  section: "Chapter 6, Table 12 (single time-averaged crop coefficients for non-stressed, well-managed crops in subhumid climates) with footnotes 1, 2, 4, 6, 9, 10 and 11, and Table 14 with the rice Kc ini paragraph",
} as const;

export const fao56Release1Sources = [fao56Table11, fao56Table12] as const;
export const releasedSources = [fao56Table11, fao56Table12Release2, gourdji2013, teixeira2013, vargas2021, silva2020] as const;
