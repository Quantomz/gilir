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
  section: "Methods: critical temperatures 34 °C wheat, 35 °C maize, 36 °C rice, 39 °C soybean (taken from the review of Hatfield et al. 2011, ref. 14), counted as days over Tcrit in a 30-day reproductive period",
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

export const luo2011 = {
  id: "luo2011",
  title: "Luo 2011, Temperature thresholds and crop production: a review, Climatic Change 109:583-598",
  url: "https://doi.org/10.1007/s10584-011-0028-6",
  section: "Table 2 broccoli row: lethal minimum -9 to -7 °C (field) and failure point 35 °C maximum temperature during inflorescence production and floral initiation; sections 2.2 and 3.3",
  publishedOn: yearOnly(2011),
  extractedOn: "2026-11-15",
} as const;

export const qin2020 = {
  id: "qin2020",
  title: "Qin et al. 2020, Phosphoproteomic analysis of lettuce (Lactuca sativa L.) reveals starch and sucrose metabolism functions during bolting induced by high temperature, PLoS ONE 15(12): e0244198",
  url: "https://doi.org/10.1371/journal.pone.0244198",
  section: "Introduction: temperatures above 30 °C have resulted in early lettuce bolting (citing Jenni & Yan 2009); optimum growth 15-20 °C",
  publishedOn: yearOnly(2020),
  extractedOn: "2026-11-15",
} as const;

const fao56Table12Release3 = {
  ...fao56Table12,
  section: "Chapter 6, Table 12 crop and group rows (small vegetables, Solanum family, cucumber family, roots and tubers, legumes, cereals, oil crops) with footnotes 1, 2, 4, 6, 9, 10, 11 and 12, and Table 14 with the rice Kc ini paragraph",
} as const;

const peerReviewed = (id: string, title: string, url: string, section: string, year: number, extracted = "2026-11-15") =>
  ({ id, title, url, section, publishedOn: yearOnly(year), extractedOn: extracted }) as const;

const luo2011Release4 = {
  ...luo2011,
  section: "Table 2 rows for barley (Tlmin -17.3 to -12.9 °C), sorghum (Tfp 40/30 °C) and broccoli; section 2.1 (barley, Prasil et al. 2007); section 2.2 (broccoli frost); section 3.2 (groundnut fruit set above 37 °C)",
} as const;

export const frederiks2015 = peerReviewed("frederiks2015", "Frederiks et al. 2015, Journal of Experimental Botany 66:3487-3498 (post-head-emergence frost in wheat and barley)", "https://doi.org/10.1093/jxb/erv088", "Crop canopy air temperatures of -3.5 to -4.5 °C and below damage post-head-emergence wheat and barley; barley significant damage at about -4 to -5 °C", 2015);
export const prasad2015 = peerReviewed("prasad2015", "Prasad et al. 2015, Frontiers in Plant Science 6:820 (grain sorghum floret fertility and grain weight under high temperature)", "https://doi.org/10.3389/fpls.2015.00820", "Methods (daily-mean regimes 27-40 °C) and Results Fig. 2A (floret fertility falls above a 25 °C mean, near 0% at 37 °C)", 2015);
export const prasad2006 = peerReviewed("prasad2006", "Prasad, Boote & Allen 2006, Agricultural and Forest Meteorology 139:237-251 (grain sorghum pollen, seed set and yield at high temperature)", "https://doi.org/10.1016/j.agrformet.2006.07.003", "Abstract: 36/26 °C or above reduced pollen viability and seed set relative to 32/22 °C", 2006);
export const djanaguiraman2018 = peerReviewed("djanaguiraman2018", "Djanaguiraman et al. 2018, Plant, Cell & Environment 41:1065-1082 (sorghum pollen and pistil sensitivity to high temperature)", "https://doi.org/10.1111/pce.13089", "Results: 36/26 °C damaged pollen and 39/29 °C damaged pistils", 2018);
export const brooking1976 = peerReviewed("brooking1976", "Brooking 1976, Australian Journal of Plant Physiology 3:589-596 (sorghum male sterility from low night temperature)", "https://doi.org/10.1071/PP9760589", "Abstract: five low-temperature nights (25 °C day / 10 °C night) at the pollen-mother-cell stage induced male sterility", 1976);
export const sita2017 = peerReviewed("sita2017", "Sita et al. 2017, Frontiers in Plant Science 8:744 (lentil heat tolerance at the reproductive stage)", "https://doi.org/10.3389/fpls.2017.00744", "Abstract and Methods (reproductive stage above 32/20 °C under late sowing); Table 10 (35/25 °C cut pods 29-52%)", 2017);
export const bishop2016 = peerReviewed("bishop2016", "Bishop, Potts & Jones 2016, Journal of Agronomy and Crop Science 202:508-517 (faba bean heat stress at floral development and anthesis)", "https://doi.org/10.1111/jac.12172", "Abstract and Results: yield t50 about 28 °C for flowers present during 5 days of stress; pollen germination t50 31.7 °C", 2016);
export const alharbi2021 = peerReviewed("alharbi2021", "Alharbi et al. 2021, Plants 10:1925 (faba bean frost)", "https://doi.org/10.3390/plants10091925", "Results: a -4.19 °C field frost aborted all tagged flowers; a -3.9 °C frost damaged stems and pods", 2021);
export const priya2019 = peerReviewed("priya2019", "Priya et al. 2019, Scientific Reports 9:7788 (mung bean reproductive heat stress)", "https://doi.org/10.1038/s41598-019-44163-w", "Introduction: heat stress above 36/28 °C at the reproductive stage (citing Kaur et al. 2015); Table 2: 45/30 °C cut pod set from 76.4 to 36.2%", 2019);
export const patelHall1990 = peerReviewed("patelhall1990", "Patel & Hall 1990, Crop Science 30:614-621 (cowpea reproductive responses to high temperature)", "https://doi.org/10.2135/cropsci1990.0011183X003000030029x", "Abstract: field site with mean daily max/min 41/24 °C caused floral-bud abortion; 35/17 °C site normal", 1990);
export const kaya2025 = peerReviewed("kaya2025", "Kaya et al. 2025, PeerJ 13:e20282 (sunflower frost tolerance at early growth stages)", "https://doi.org/10.7717/peerj.20282", "Table 1: -4 °C for 4 h at V2/V4 killed 4.1% / 19.4% of plants", 2025);
export const hnilickova2017 = peerReviewed("hnilickova2017", "Hniličková et al. 2017, Plant, Soil and Environment 63:375-380 (sunflower frost)", "https://doi.org/10.17221/214/2017-PSE", "Methods and Results: one 10-hour night at -3 °C at 6-8 leaves caused recoverable injury", 2017);
export const seppanen2001 = peerReviewed("seppanen2001", "Seppänen et al. 2001, Agricultural and Food Science in Finland 10:153-163 (potato frost tolerance)", "https://doi.org/10.23986/afsci.5690", "Abstract: lethal temperature for potato cultivars from -2.5 to -3.0 °C; canopy destroyed below -4 °C", 2001);
export const kimLee2019 = peerReviewed("kimlee2019", "Kim & Lee 2019, Frontiers in Plant Science 10:300 (potato yield loss from high day and night temperature at tuber initiation and bulking)", "https://doi.org/10.3389/fpls.2019.00300", "Abstract and Table 2: mean night 21.7 vs 17.8 °C for 14 days at tuber initiation cut yield 17.2%", 2019);
export const gautam2024 = peerReviewed("gautam2024", "Gautam et al. 2024, Frontiers in Plant Science 15:1364244 (potato heat stress)", "https://doi.org/10.3389/fpls.2024.1364244", "Introduction (no citation given): night temperatures above 18 °C reduce tuberization; optimum tuberization upper limit 20 °C", 2024);
export const rosen2018 = peerReviewed("rosen2018", "Rosen et al. 2018, Frontiers in Plant Science 9:78 (cauliflower curd induction and temperature)", "https://doi.org/10.3389/fpls.2018.00078", "Introduction: temperatures above 20 °C delay or inhibit curd induction; optimum about 15 °C for many summer cultivars", 2018);
export const leskovar1999 = peerReviewed("leskovar1999", "Leskovar et al. 1999, Journal of the American Society for Horticultural Science 124(3):301-306 (spinach seed thermoinhibition)", "https://agris.fao.org/search/en/records/65df458f63b8185d9cabe353", "Abstract: germination inhibition began above 20 °C constant temperature and was totally suppressed at 35 °C", 1999);
export const aloni2001 = peerReviewed("aloni2001", "Aloni et al. 2001, Physiologia Plantarum 112:505-512 (pepper pollen and high temperature)", "https://doi.org/10.1034/j.1399-3054.2001.1120407.x", "Abstract: 32/26 °C for 8 days before anthesis greatly reduced pollen germination and seeds per fruit vs 28/22 °C", 2001);
export const karniAloni2002 = peerReviewed("karnialoni2002", "Karni & Aloni 2002, Annals of Botany 90:607-612 (pepper pollen and high temperature)", "https://doi.org/10.1093/aob/mcf234", "Abstract: 32/26 °C vs 26/22 °C reduced pollen performance", 2002);
export const darnell2012 = peerReviewed("darnell2012", "Darnell et al. 2012, Annals of Botany 110:987-994 (pepper ovary swelling at low night temperature)", "https://doi.org/10.1093/aob/mcs173", "Abstract: ovary swelling and fruit malformation favoured by 12 °C vs 20 °C nights", 2012);
export const pressman2002 = peerReviewed("pressman2002", "Pressman, Peet & Pharr 2002, Annals of Botany 90:631-636 (tomato pollen under mild chronic heat)", "https://doi.org/10.1093/aob/mcf240", "Introduction: daily mean 29 °C markedly decreased fruit and seed number (citing Peet et al. 1997); Discussion: pollen abnormal after a few hours above 40 °C at meiosis (citing Iwahori 1965)", 2002);
export const sato2006 = peerReviewed("sato2006", "Sato et al. 2006, Annals of Botany 97:731-738 (tomato fruit set under moderately elevated temperature)", "https://doi.org/10.1093/aob/mcl037", "Introduction and Results: 32/26 °C vs 28/22 °C reduced fruit set", 2006);
export const sato2002 = peerReviewed("sato2002", "Sato, Peet & Thomas 2002, Journal of Experimental Botany 53:1187-1195 (tomato reproduction under chronic heat)", "https://doi.org/10.1093/jexbot/53.371.1187", "Abstract: at 32/26 °C fruit set failed unless relieved more than 5 days before anthesis; most sensitive 7-15 days before anthesis", 2002);
export const tao2026 = peerReviewed("tao2026", "Tao et al. 2026, Frontiers in Plant Science 17:1902742 (cucurbit flowering and temperature review)", "https://doi.org/10.3389/fpls.2026.1902742", "In watermelon a daytime temperature of 32 °C inhibited female flower development relative to 27 °C (citing Manzano et al. 2014; Rudich and Peles 1976)", 2026);
export const konsens1991 = peerReviewed("konsens1991", "Konsens, Ofir & Kigel 1991, Annals of Botany 67:391-399 (snap bean flower and pod abscission and temperature)", "https://doi.org/10.1093/oxfordjournals.aob.a088155", "Abstract: raising night temperature from 17 to 27 °C strongly reduced pod production; 32/27 °C enhanced abscission", 1991);

export const fao56Release1Sources = [fao56Table11, fao56Table12] as const;
export const releasedSources = [fao56Table11, fao56Table12Release2, gourdji2013, teixeira2013, vargas2021, silva2020] as const;
export const release3Sources = [fao56Table11, fao56Table12Release3, gourdji2013, teixeira2013, vargas2021, silva2020, luo2011, qin2020] as const;
export const release4Sources = [
  fao56Table11, fao56Table12Release3, gourdji2013, teixeira2013, vargas2021, silva2020, luo2011Release4, qin2020,
  frederiks2015, prasad2015, prasad2006, djanaguiraman2018, brooking1976, sita2017, bishop2016, alharbi2021, priya2019,
  patelHall1990, kaya2025, hnilickova2017, seppanen2001, kimLee2019, gautam2024, rosen2018, leskovar1999,
  aloni2001, karniAloni2002, darnell2012, pressman2002, sato2006, sato2002, tao2026, konsens1991,
] as const;
