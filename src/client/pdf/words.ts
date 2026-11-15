import type { WaterAnswer } from "@/contracts/input";
import type { AssessmentMetric, BaselineComparison, EvidenceGap, PlanResult, ResultWarning } from "@/contracts/result";
import type { rankingMetricIds } from "@/contracts/result";
import type { BarLook, StatusTone } from "./model";

type State = PlanResult["state"];
export type PlanState = Extract<PlanResult, { readonly plan: unknown }>["state"];
export type NoPlanState = Exclude<State, PlanState>;
type WarningCode = ResultWarning["code"];
type GapCode = EvidenceGap["code"];
type RankingMetricId = (typeof rankingMetricIds)[number];
type MetricUnit = AssessmentMetric["unit"];
type AssessedBaseline = Extract<BaselineComparison, { kind: "assessed" }>;
type Delta = AssessedBaseline["deltas"][number];

export const brand = "Gilir · A crop plan from past seasons";
export const documentTitle = {
  plan: (made: string) => `Gilir crop plan, made ${made}`,
  status_report: (made: string) => `Gilir status report, made ${made}`,
} as const;
export const footerTitle = {
  plan: (made: string) => `Gilir crop plan · Made ${made}`,
  status_report: (made: string) => `Gilir status report · Made ${made}`,
} as const;
export const pageNumber = (page: number, pages: number) => `Page ${page} of ${pages}`;

export const titles: Record<State, string> = {
  plan: "Your plan",
  plan_with_warnings: "Your plan, with warnings",
  insufficient_data: "We can’t make a plan yet",
  no_calendar_fit: "Your crops don’t all fit in one year",
  search_incomplete: "We couldn’t finish the search",
  service_error: "Something went wrong while making your plan",
};
export const keptTitles: Record<PlanState, string> = {
  plan: "Keep last year’s rotation",
  plan_with_warnings: "Keep last year’s rotation, with warnings",
};


export const place = {
  fallback: "Your field",
  note: "The place name uses letters this file can’t show.",
  weatherPoint: (coordinates: string) => `Weather point ${coordinates}`,
} as const;
export const madeLine = (made: string, year: string) => `Made ${made} · Your year: ${year}`;
export const answersLine = (crops: string, water: string, history: string) => `Crops: ${crops} · Water: ${water} · ${history}`;
export const waterLabels: Record<WaterAnswer, string> = {
  rain_only: "Rain only",
  rain_plus_backup: "Rain + water when it’s dry",
  unsure: "I’m not sure",
};
export const historyLine = {
  skipped: "Last year: skipped",
  nothing: "Last year: nothing recorded",
  recorded: (parts: string) => `Last year: ${parts}`,
  crops: (n: number) => count(n, "crop"),
  empty: (n: number) => count(n, "empty time"),
} as const;
export const unlisted = {
  fallback: "A crop not on our list",
  note: "A crop name uses letters this file can’t show.",
} as const;


export const status = {
  plan: { label: "This order passed every check we could run.", text: "That means only that those checks found nothing in past seasons. It isn’t a promise about next season.", tone: "ok" },
  plan_with_warnings: { label: "With warnings.", text: null, tone: "warn" },
  insufficient_data: { label: "No plan yet.", text: "Some information a plan needs is missing.", tone: "plain" },
  no_calendar_fit: { label: "No plan.", text: null, tone: "plain" },
  search_incomplete: { label: "No plan yet.", text: "The search stopped at its limit before it found a plan that fits.", tone: "plain" },
  service_error: { label: "No new plan.", text: null, tone: "warn" },
} as const satisfies Record<State, { readonly label: string; readonly text: string | null; readonly tone: StatusTone }>;
export const flaggedSentence = (parts: readonly string[]) =>
  parts.length ? `In past seasons, ${listWords(parts)}.` : "Every plan we compared had at least one warning.";
export const flaggedParts = {
  rain: (often: string | null) => `rain fell short of what the crops need${often ? ` in ${often}` : ""}`,
  heat: (who: string, size: string | null) => `temperatures went outside the limits for ${who}${size ? ` ${size}` : ""}`,
  place: (who: string) => `a published rule flagged ${who}`,
  order: "a crop order rule flagged the plan",
} as const;
export const heatSize = (fraction: number) =>
  fraction >= 1 ? "on every checked day in a bad year" : `on ${low(aboutPercent(fraction))} of checked days in a bad year`;
export const proofLine = {
  duration: (need: string, year: string) => `Together they need at least ${need}; your year has ${year}.`,
  structural: "We tried every way to fit them into your year, and none fit.",
} as const;


export const warningSections = { flagged: "What we flagged", goodToKnow: "Good to know" } as const;
export const flagWhy = "We flag a crop if, in any past season, even one week had less rain than it needs, or a temperature outside its limits. The check is strict, so most plans have warnings.";
export const flagWhyNot = "A warning doesn’t mean the crop fails, and it isn’t a prediction for next season. It shows where past seasons fell short, so you know what to watch.";
export const flagCodes = ["rainfall_mismatch", "temperature_exposure", "environmental_rule", "rotation_rule"] as const satisfies readonly WarningCode[];
export const warningHeads: Record<WarningCode, (who: string | null, many: boolean, water: WaterAnswer) => string> = {
  rainfall_mismatch: (who, many) => `Rain fell short of what ${who === null ? "the crops need" : `${who} ${many ? "need" : "needs"}`} in past seasons`,
  temperature_exposure: who => `Temperatures went outside the limits for ${who ?? "a crop"}`,
  environmental_rule: who => `A published rule about this place flagged ${who ?? "the plan"}`,
  rotation_rule: who => `A rule about which crop may follow which flagged ${who ?? "the plan"}`,
  profile_limitation: who => (who === null ? "About the growing details we used" : `About the growing details for ${who}`),
  search_limit: () => "The search stopped at its limit",
  water_context: (_who, _many, water) => (water === "rain_plus_backup" ? "Your backup water isn’t counted" : "Only rain is counted"),
  approximate_history: () => "Your dates for last year are estimates",
};
/**
 * The report's own line under a warning's head, for a code whose engine message is one fixed sentence written for
 * developers. Each is true of that sentence, and reads as the result screen does. A code without a line here carries
 * content of its own (a crop profile's note, a published rule), so its message prints as the engine wrote it.
 */
export const warningLines: Partial<Record<WarningCode, (who: string | null, many: boolean, water: WaterAnswer) => string>> = {
  rainfall_mismatch: (who, many) =>
    `In some past seasons, at least one week had less rain than ${who === null ? "the crops need" : many ? "they need" : "it needs"}.`,
  temperature_exposure: (who, many) =>
    `In some past seasons, at least one day was hotter or colder than ${who === null ? "a crop’s" : many ? "their" : "its"} limit, at a time of growth when that matters.`,
  search_limit: () => "We stopped at our search limit before everything was compared.",
  water_context: (_who, _many, water) => water === "rain_plus_backup"
    ? "It may give extra protection. Every number here is worked out with rain alone."
    : "Every number here is worked out with rain alone.",
  approximate_history: () => "So any comparison with last year is approximate too.",
};


export const calendar = {
  heading: "When to plant and harvest",
  crop: (planted: string, harvested: string) => `Plant ${planted} · Harvest ${harvested}`,
  cropDays: (days: string, free: string) => `${days} in the field. The field is free again on ${free}.`,
  afterHarvest: "After harvest, before the field is free",
  afterHarvestOf: (crop: string) => `No planned crop: the days after the ${crop} harvest.`,
  noCrop: "No planned crop",
  firstDaysAfterHarvest: (n: number, crop: string) => n === 1
    ? `The first day is the time after the ${crop} harvest, before the field is free.`
    : `The first ${days(n)} are the time after the ${crop} harvest, before the field is free.`,
  span: (range: string, days: string) => `${range} · ${days}`,
} as const;
export const legend: Record<BarLook, string> = {
  crop: "A crop, numbered as in the list below",
  after_harvest: calendar.afterHarvest,
  no_crop: calendar.noCrop,
};
export const searchLimit = {
  lead: "We stopped at our search limit.",
  text: "This is the best plan we found, not proven to be the best.",
  gridStep: (days: string) => `We tried planting dates every ${days}.`,
} as const;


export const ranking = {
  heading: "Why this plan ranked first",
  order: "Plans are compared in one fixed order: water first, then days without a crop.",
  unplannedNote: (yearDays: string) => `Of the ${yearDays} days in your year, counting the days after each harvest. Fewer is better.`,
  longestNote: "Days in a row without a planned crop. Shorter is better.",
  notRanked: "Shown, but not used to rank",
  badYear: "In a bad year",
  heatAndCold: "Heat and cold",
  pastNotPrediction: "From past seasons, not a prediction.",
  rainAlone: "Checked with rain alone: backup water is not counted.",
} as const;
export const rankingQuestions: Record<RankingMetricId, string> = {
  mean_frequency: "How often rain fell below what the crops need",
  mean_mismatch: "How big the shortfall was",
  unplanted_days: "Days without a planned crop",
  longest_unplanted_gap: "Longest stretch without a planned crop",
};

export const modeling = {
  label: "Estimated crop development from historical weather",
  validation: "These estimates have not been checked for your area.",
  planStatus: "A calendar fits the estimated growing times.",
  noFitTitle: "No calendar fits this development model",
  noFitStatus: "No calendar fits the saved model and weather replays within one year.",
  noFitScope: "Completion was assessed under the saved reference model and retained weather seasons. The result describes that model’s development thresholds.",
  reservation: "We leave time until the latest estimated harvest in the past weather years we checked, plus time to prepare the field. An earlier harvest may leave extra waiting time.",
  methodReservation: "The calendar reserves each cropping slot until the latest modeled completion across all retained weather seasons, then adds turnaround time. Earlier modeled harvests can leave waiting time before the next crop.",
  occupancy: "These two numbers describe the planned calendar, with each crop ending at its latest estimated harvest. An earlier harvest may leave extra days without a crop. They do not measure actual crop cover. Rain and water need are checked only until each past year’s estimated harvest.",
  methodOccupancy: "The last two ranking indicators measure planned cropping slots through the latest modeled harvest. They do not measure continuous live crop cover. Rainfall and demand calculations end at each weather season’s own modeled completion.",
  checks: "Local checks remain unavailable for frost, crop survival, photoperiod, vernalization and soil suitability.",
  timelineTitle: "Planting dates and estimated harvest ranges",
  cropDates: (planted: string, harvested: string) => `Plant ${planted} · Estimated harvest ${harvested}`,
  cropDays: (days: string, latest: string, free: string) => `${days} set aside through ${latest}. The field is ready again on ${free}.`,
  fixedOrder: "Plans are compared in one fixed order, water first, then days without a planned crop.",
  questions: {
    ...rankingQuestions,
    unplanted_days: "Days without a planned crop",
    longest_unplanted_gap: "Longest gap without a planned crop",
  } satisfies Record<RankingMetricId, string>,
  unplanted: (yearDays: string) => `Of the ${yearDays} days in your year, outside the planned crop dates. Fewer is better.`,
  longest: "Days in a row without a scheduled crop. Shorter is better.",
  basis: {
    published_parameter: "Published model parameters",
    derived_estimate: "Derived model estimate. Values were derived from reference inputs by Gilir.",
    analogue_estimate: "Analogue model estimate. Values were transferred from a reference crop or purpose.",
  },
  reference: (name: string, purpose: string) => `Reference crop ${name}. Harvest purpose ${purpose}.`,
  cultivar: (assumption: string) => `Reference cultivar assumption. ${assumption}`,
  identity: (id: string, version: string) => `Model ${id}, version ${version}.`,
  noncompletion: (days: string, replay: string) => `${days} planting dates did not complete within the modeled horizon for the replay starting ${replay}.`,
} as const;

export interface ValueWords {
  readonly value: string;
  readonly note: string;
}

export function howOften(fraction: number): ValueWords {
  if (fraction <= 0) return { value: "Never", note: "In past seasons, no 7-day window had less rain than the crops need." };
  if (fraction >= 1) return { value: "Every week", note: "In past seasons, every 7-day window had less rain than the crops need." };
  const tenths = Math.round(fraction * 10);
  return {
    value: tenths < 1 ? "Fewer than 1 in 10 weeks" : tenths > 9 ? "More than 9 in 10 weeks" : `About ${tenths} in 10 weeks`,
    note: "In past seasons, for the crop with the most short weeks each season. Lower is better.",
  };
}

export function howMuch(fraction: number): ValueWords {
  if (fraction <= 0) return { value: "None", note: "In past seasons, rain covered what the crops need in every week." };
  return { value: aboutPercent(fraction), note: "The average share of the crops’ need that rain didn’t cover. Weeks with enough rain count as 0%. Lower is better." };
}

export function badYearShortfall(fraction: number): ValueWords {
  if (fraction <= 0) return { value: "None", note: "In at least 9 of 10 past seasons, rain covered what the crops need every week." };
  return { value: aboutPercent(fraction), note: "Of the crops’ need, rain didn’t cover this much in a bad year: 9 in 10 past seasons had this much shortfall or less." };
}

export const heat = {
  none: "None",
  every: "Every checked day",
  share: (percent: string) => `${percent} of checked days`,
  note: "Outside a crop’s temperature limits in a bad year: 9 in 10 past seasons had this share or less.",
  notAssessed: "Not assessed",
  outside: (who: string) => `Outside the limits in past seasons: ${who}.`,
  inside: (who: string) => `No checked day outside the limits for ${who}.`,
  notAssessedFor: (who: string) => `Not assessed for ${who}.`,
} as const;


export const compare = {
  heading: "Compared with last year",
  skipped: "You skipped last year, so we didn’t compare.",
  notScored: "We couldn’t score last year’s rotation:",
  reported: (scored: boolean) => `What you told us about last year${scored ? "" : " (not scored)"}`,
  kept: "Last year’s rotation ranked first, so we suggest keeping it.",
  changed: "The new plan ranked ahead of last year’s rotation.",
  notEligible: "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan.",
  noNewPlan: "Last year’s rotation is shown for comparison only. No new plan was made to compare it with.",
  estimatesAssessed: "Your dates are estimates. You said some of last year’s dates are approximate, so this comparison is approximate too.",
  estimatesNotAssessed: "Your dates are estimates. You said some of last year’s dates are approximate.",
  estimatesScored: "Your dates are estimates. You said some of last year’s dates are approximate, so these numbers are approximate too.",
  scored: "Last year’s rotation in past seasons",
  howTheyCompare: "How they compare",
  noNumbers: "No numbers to compare.",
  changesHeading: "Changes from last year",
  noChanges: "No changes: the same crops, order and dates as last year.",
  cantList: "We can’t list the changes one by one.",
  movedForward: "Last year’s dates are moved forward to this year to compare them.",
  thisPlan: (value: string) => `This plan: ${value}`,
  lastYear: (value: string) => `Last year’s rotation: ${value}`,
  same: "The same",
  notCompared: (reason: string) => (reason ? `Not compared: ${reason}` : "Not compared"),
  fallow: "Field empty, as you said",
  unknown: "Not sure: nothing recorded",
  notListed: (label: string) => `${label} (not on our crop list)`,
  planted: (aboutPlanted: boolean, planted: string, aboutHarvested: boolean, harvested: string) =>
    `Planted ${aboutPlanted ? "about " : ""}${planted} · Harvested ${aboutHarvested ? "about " : ""}${harvested}`,
} as const;
/** The engine writes "changed" for every plan that isn't last year's, so only `eligible` says whether last year was ranked. */
export function verdict({ recommendation, eligible }: AssessedBaseline): string {
  if (recommendation === "kept") return compare.kept;
  if (!eligible) return compare.notEligible;
  return recommendation === "changed" ? compare.changed : compare.noNewPlan;
}
export const deltaNames: Readonly<Record<string, string>> = {
  mean_frequency: "Weeks with less rain than the crops need",
  mean_mismatch: "Average shortfall",
  unplanted_days: "Days without a planned crop",
  longest_unplanted_gap: "Longest stretch without a planned crop",
  q90_mismatch: "Shortfall in a bad year",
  q90_temperature_exposure: "Checked days outside temperature limits in a bad year",
  crop_family_count: "Crop families",
  legume_crop_count: "Bean-family plantings",
};
export function deltaWords(difference: number, unit: MetricUnit, direction: Delta["direction"]): string {
  if (unit === "fraction" ? Math.abs(difference) < 0.0005 : Math.abs(difference) < 0.5) return compare.same;
  const lower = difference < 0;
  const judge = direction === "lower_preferred" ? (lower ? "better" : "worse") : direction === "higher_preferred" ? (lower ? "worse" : "better") : "";
  const what = unit === "days" ? `${days(Math.abs(difference))} ${lower ? "fewer" : "more"}`
    : unit === "count" ? `${whole(Math.abs(difference))} ${lower ? "fewer" : "more"}`
    : lower ? "Lower" : "Higher";
  return `${cap(what)} with this plan${judge ? ` (${judge})` : ""}`;
}
const unitWords: Record<Exclude<MetricUnit, "fraction" | "days" | "count">, string> = {
  mm: "mm",
  "mm/day": "mm a day",
  degC: "°C",
  degrees: "degrees",
  kPa: "kPa",
  "%": "%",
  "m/s": "m/s",
  "MJ/m²/day": "MJ/m² a day",
};
export function metricValue(value: number, unit: MetricUnit): string {
  if (unit === "fraction") return percent(value);
  if (unit === "days") return days(value);
  if (unit === "count") return whole(value);
  return `${Number(value.toFixed(2))} ${unitWords[unit]}`;
}
export const changes = {
  added: (crop: string, range: string) => `Added: ${crop}, ${range}.`,
  removed: (crop: string, range: string) => `Not in the new plan: ${crop}, ${range} in last year’s rotation.`,
  sameDay: (crop: string, planted: string, harvested: string, before: string) => `Plant ${crop} on the same day, ${planted}; harvest ${harvested} instead of ${before}.`,
  shifted: (crop: string, days: string, earlier: boolean, planted: string, before: string) => `Plant ${crop} ${days} ${earlier ? "earlier" : "later"}: ${planted} instead of ${before}.`,
  order: (crop: string, from: string, to: string) => `${crop} moves from ${from} to ${to} in the order.`,
} as const;
export const ordinal = (n: number) =>
  ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][n - 1] ?? `number ${n}`;


export const prepareHeading = "Get ready";
export const unassessedHeading = "What we couldn’t check";
export const gapHeads: Record<GapCode, (who: string | null, many: boolean) => string> = {
  crop_profile: who => `Growing details for ${who ?? "a crop"} in this place`,
  climate: () => "Enough complete past seasons of weather",
  temperature_rule: who => `Heat and cold limits for ${who ?? "a crop"}`,
  rotation_rule: () => "Which crop may follow which",
  history: () => "What you told us about last year",
  ranking_metric: (who, many) => `Rain compared with what ${who === null ? "the crops need" : `${who} ${many ? "need" : "needs"}`}`,
};
export const noPlanHeadings: Record<NoPlanState, string> = {
  insufficient_data: "What’s missing",
  no_calendar_fit: "Why they don’t fit",
  search_incomplete: "Where the search stopped",
  service_error: "What happened",
};
export const noPlan = {
  statusReport: "This is a status report. No calendar is shown, because no plan was made.",
  missingNext: "Making the plan again gives the same answer until new data is available. You can change your answers, for example to other crops.",
  fitEach: "Each crop needs at least:",
  fitMinimum: (crop: string, days: string) => `${crop}: at least ${days}`,
  fitTried: (ways: string, one: boolean) => `We checked ${ways} of placing ${one ? "it" : "them"}.`,
  fitNext: (one: boolean) => (one
    ? "Choose a crop that grows faster, then make the plan again."
    : "Choose fewer crops, or crops that grow faster, then make the plan again."),
  fitPlanting: (one: boolean, rules: boolean, start: string) =>
    `${one ? "The time of year when your crop can be planted" : "The times of year when your crops can be planted"}`
    + `${rules ? ", and the rules about which crop may follow which," : ""} leave${one && !rules ? "s" : ""} no way to fit `
    + `${one ? "it" : "them all"} into one year from your start date, ${start}. `
    + `Try ${one ? "another start date or another crop" : "another start date, other crops or fewer crops"}, then make the plan again.`,
  stoppedStructural: (tries: string, limit: string) => `We stopped after ${tries} at fitting your crops into your year (our limit is ${limit}), before we found an order that fits.`,
  stoppedScoring: (plans: string, limit: string) => `We stopped after scoring ${plans} (our limit is ${limit}).`,
  stoppedOther: "The search stopped before it found an order that fits.",
  stoppedIsNotProof: "A stopped search doesn’t show that your crops can’t fit. You can try again, or change your answers.",
  noNewPlan: "No new plan was made. It wasn’t anything you did.",
} as const;


export const farm = {
  heading: "What we know about your farm",
  rainFrom: (years: string) => `Monthly rain from ${years}.`,
  caption: "Month by month: rain in mm, mean temperature in °C.",
  columns: ["Month", "Usual rain", "Dry year", "Wet year", "Mean temperature"],
} as const;
export const insightColumns = ["monthly_rain_median", "monthly_rain_p10", "monthly_rain_p90", "monthly_mean_temperature"] as const;


export const methodHeading = "How this was worked out";
export const assumptionsHeading = "Assumptions";
export const sources = {
  heading: "Sources, period and versions",
  cohort: (seasons: string, period: string) => `Checked against ${seasons}, ${period}.`,
  weatherFrom: (seasons: string, period: string) => `Weather from ${seasons}, ${period}.`,
  cohortNone: "No complete past season could be used.",
  cohortUnavailable: (reason: string) => `Past seasons: ${reason}`,
  seasonsMethod: (version: string) => `Past seasons chosen with method ${version}.`,
  excluded: (period: string, reason: string) => `Not used: ${period}. ${reason}`,
  source: (title: string, section: string, url: string) => `${sentence(title)} ${sentence(section)} ${url}`,
  cell: (provider: string, product: string, cell: string, grid: string, version: string, url: string) =>
    `${provider}, ${product}, grid cell ${cell} (${grid}), much larger than a field. ${version} ${url}`,
  productVersion: (version: string) => `Version ${version}.`,
  productVersionMissing: (reason: string) => `Version not recorded: ${sentence(reason)}`,
  grid: (latitude: number, longitude: number) => `${latitude}° by ${longitude}°`,
  profiles: (list: string) => `Crop profiles: ${list}.`,
  rules: (list: string) => `Rules: ${list}.`,
  versions: (engine: string, settings: string, crops: string, rules: string, cutoff: string) =>
    `Engine ${engine}, settings ${settings}, crop list ${crops}, rules ${rules}, records before ${cutoff}.`,
  weatherRecords: (list: string) => `Weather records: ${list}.`,
  versionsMissing: (reason: string) => `Engine and data versions: not recorded. ${reason}`,
  methods: (list: string) => `Calculation methods: ${list}.`,
} as const;
export const closing = [
  "From past seasons. Not a prediction for next season. Checked with rain alone: backup water is not counted. No fertilizer amounts, costs or soil tests.",
  "Gilir is an independent project for the NASA Space Apps Challenge 2026, not affiliated with or endorsed by NASA.",
] as const;


export const notAvailable = "Not available";

/** Math.round(-0.3) is -0, which toLocaleString prints as "-0". */
export const whole = (n: number) => (Math.round(n) || 0).toLocaleString("en-US");
export function count(n: number, one: string, many = `${one}s`): string {
  return `${whole(n)} ${Math.round(n) === 1 ? one : many}`;
}
export const days = (n: number) => count(n, "day");
function percent(fraction: number): string {
  if (fraction > 0 && fraction < 0.005) return "under 1%";
  if (fraction < 1 && fraction > 0.995) return "over 99%";
  return `${Math.round(fraction * 100)}%`;
}
export const aboutPercent = (fraction: number) => {
  const shown = percent(fraction);
  return /^(under|over)/.test(shown) ? cap(shown) : `About ${shown}`;
};
export const listWords = (items: readonly string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
export const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const low = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
