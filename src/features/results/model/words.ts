import { isoDateSchema } from "@/contracts";
import type {
  AssessmentMetric, BaselineComparison, CompletedSnapshot, CropPurposeId, EvidenceGap, IsoDate, Plan, PlanResult,
  RankingComponent, ResultDetails, ResultWarning, SearchCoverage, ServiceFailure, WaterAnswer,
} from "@/contracts";
import type { IconName } from "./blocks";
import { addDays } from "./calendar";
import type { ActionId, Problem, Work } from "./session";

export const appName = "Gilir";

type State = PlanResult["state"];
type RankingMetricId = RankingComponent["metricId"];
type Recommendation = Extract<BaselineComparison, { readonly kind: "assessed" }>["recommendation"];
type DenominatorUnit = Extract<AssessmentMetric["denominator"], { readonly kind: "available" }>["value"]["unit"];

export type Noun = "plan" | "result";

export function nounOf(snapshot: CompletedSnapshot): Noun {
  return planOf(snapshot.result) === null ? "result" : "plan";
}

export function planOf(result: PlanResult): Plan | null {
  return result.state === "plan" || result.state === "plan_with_warnings" ? result.plan : null;
}

/** Only an eligible baseline was ranked, so only one can be the suggestion, whatever its recommendation says. */
export function keepsLastYear(snapshot: CompletedSnapshot): boolean {
  const { baseline } = snapshot.result.details;
  return nounOf(snapshot) === "plan" && baseline.kind === "assessed" && baseline.eligible && baseline.recommendation === "kept";
}

export function titleOf(snapshot: CompletedSnapshot): string {
  const { state } = snapshot.result;
  return (state === "plan" || state === "plan_with_warnings") && keepsLastYear(snapshot) ? keptTitles[state] : titles[state];
}

export function eyebrowOf(snapshot: CompletedSnapshot, format: Format): string {
  return head.made(snapshot.input.field.label, format.madeOn(snapshot.completedAt));
}

export function syntheticOf(snapshot: CompletedSnapshot): string | null {
  const { provenance } = snapshot.result.details;
  return provenance.kind === "synthetic" ? provenance.label : null;
}

/**
 * Calendar dates are read as UTC so they never show the day before; completedAt is a real instant and shows the
 * farmer's own calendar day. Never Intl's formatRange: it joins a range with an en dash, a character the repo bans.
 * The calendar is pinned to Gregorian and the digits to Latin: the year lines, month rows and ISO dates in engine text
 * are Gregorian, and a language whose default is another calendar would name other months and years beside them.
 */
export interface Format {
  day(date: IsoDate): string;
  /** An inclusive range: "5 Jul 2026 to 30 Jun 2027", or "1 Jul to 4 Jul 2026" within one year. One day is its date. */
  dayRange(first: IsoDate, last: IsoDate): string;
  /** "July 2000", or "July 2000 to June 2024", from an interval with an exclusive end. */
  monthRange(start: IsoDate, endExclusive: IsoDate): string;
  month(month: number, style: "long" | "short" | "narrow"): string;
  madeOn(instant: string): string;
  madeAt(instant: string): string;
  whole(value: number): string;
  decimal(value: number, digits: number): string;
  count(value: number, one: string, many: string): string;
}

/** `undefined` is the browser's own language, as F1 uses. */
export function formatIn(locale: string | undefined): Format {
  const dates = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, calendar: "gregory", numberingSystem: "latn" });
  const fullDay = dates({ day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const dayInYear = dates({ day: "numeric", month: "short", timeZone: "UTC" });
  const monthOfYear = dates({ month: "long", year: "numeric", timeZone: "UTC" });
  const monthNames = {
    long: dates({ month: "long", timeZone: "UTC" }),
    short: dates({ month: "short", timeZone: "UTC" }),
    narrow: dates({ month: "narrow", timeZone: "UTC" }),
  };
  const localDay = dates({ day: "numeric", month: "short", year: "numeric" });
  const localLongDay = dates({ day: "numeric", month: "long", year: "numeric" });
  const localTime = dates({ hour: "numeric", minute: "2-digit" });
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, numberingSystem: "latn" });
  const utc = (date: IsoDate) => new Date(`${date}T00:00:00Z`);
  const day = (date: IsoDate) => fullDay.format(utc(date));
  const whole = (value: number) => numbers.format(value);
  return {
    day,
    dayRange: (first, last) => {
      if (first === last) return day(first);
      const from = first.slice(0, 4) === last.slice(0, 4) ? dayInYear.format(utc(first)) : day(first);
      return `${from} to ${day(last)}`;
    },
    monthRange: (start, endExclusive) => {
      const first = monthOfYear.format(utc(start));
      const last = monthOfYear.format(utc(addDays(endExclusive, -1)));
      return first === last ? first : `${first} to ${last}`;
    },
    month: (month, style) => monthNames[style].format(new Date(Date.UTC(2001, month - 1, 1))),
    madeOn: instant => localDay.format(new Date(instant)),
    madeAt: instant => `${localLongDay.format(new Date(instant))}, ${localTime.format(new Date(instant))}`,
    whole,
    decimal: (value, digits) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, numberingSystem: "latn" }).format(value),
    count: (value, one, many) => `${whole(value)} ${Math.round(value) === 1 ? one : many}`,
  };
}

/** Engine text with every ISO calendar date in it shown the reader's way. Nothing else in it is changed. */
export function engineText(text: string, format: Format): string {
  return text.replace(/(?<![\d-])\d{4}-\d{2}-\d{2}(?![\dT:])/g, found => {
    const date = isoDateSchema.safeParse(found);
    return date.success ? format.day(date.data) : found;
  });
}

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function inSentence(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function endSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function joinAnd(parts: readonly string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** A result's crop names. `name` heads a row or a line; `list` sits inside a sentence and names each crop once. */
export interface CropNames {
  name(id: CropPurposeId): string;
  list(ids: readonly CropPurposeId[]): string;
}

/**
 * The one place a crop gets its name. A version 2 snapshot keeps the catalogue frozen when its plan was made, and its
 * label is used as written, even inside a sentence, because it is the name the farmer picked. A version 1 snapshot has
 * no catalogue, and a crop known only from last year may be missing from one, so its id is made readable instead:
 * "maize-grain" becomes "Maize grain", and "maize grain" inside a sentence.
 */
export function cropNamesOf(snapshot: CompletedSnapshot): CropNames {
  const labels = new Map<string, string>(snapshot.schemaVersion === 2 ? snapshot.catalogue.entries.map(entry => [entry.id, entry.label]) : []);
  const readable = (id: CropPurposeId) => sentenceCase(id.replace(/[-_:]+/g, " "));
  const name = (id: CropPurposeId) => labels.get(id) ?? readable(id);
  const inList = (id: CropPurposeId) => labels.get(id) ?? inSentence(readable(id));
  return { name, list: ids => joinAnd([...new Set(ids)].map(inList)) };
}

export function dayCount(value: number): string {
  return `${value} ${value === 1 ? "day" : "days"}`;
}

export function shareWords(value: number): string {
  if (value === 0 || value === 1) return `${value * 100}%`;
  const percent = Math.round(value * 100);
  if (percent === 0) return "under 1%";
  if (percent === 100) return "over 99%";
  return `about ${percent}%`;
}

export function frequencyWords(value: number): string {
  if (value === 0) return "Never";
  if (value >= 1) return "Every week";
  const inTen = Math.round(value * 10);
  if (inTen < 1) return "Fewer than 1 in 10 weeks";
  if (inTen > 9) return "More than 9 in 10 weeks";
  return `About ${inTen} in 10 weeks`;
}

const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

export function ordinal(index: number): string {
  return ordinals[index] ?? `number ${index + 1}`;
}

export const titles: Record<State, string> = {
  plan: "Your plan",
  plan_with_warnings: "Your plan, with warnings",
  insufficient_data: "We can’t make a plan yet",
  no_calendar_fit: "Your crops don’t all fit in one year",
  search_incomplete: "We couldn’t finish the search",
  service_error: "Something went wrong while making your plan",
};
const keptTitles: Record<"plan" | "plan_with_warnings", string> = {
  plan: "Keep last year’s rotation",
  plan_with_warnings: "Keep last year’s rotation, with warnings",
};

export const statusLabels: Record<State, string> = {
  plan: "This order passed every check we could run.",
  plan_with_warnings: "With warnings.",
  insufficient_data: "No plan yet.",
  no_calendar_fit: "No plan.",
  search_incomplete: "No plan yet.",
  service_error: "No new plan.",
};

export const status = {
  plan: "That means only that those checks found nothing in past seasons. It isn’t a promise about next season.",
  flagged: {
    lead: "In past seasons, ",
    rain: (often: string) => `rain fell short of what the crops need in ${often}`,
    /** `share` is null at 0: a bad year with no day outside the limits has no size that fits the warning. */
    temperature: (crops: string, share: string | null) =>
      `temperatures went outside the limits for ${crops || "a crop"}${share === null ? "" : ` on ${share} of checked days in a bad year`}`,
    environmentalRule: (crops: string) => `a published rule flagged ${crops || "the plan"}`,
    rotationRule: "a crop order rule flagged the plan",
    none: "Every plan we compared had at least one warning.",
  },
  insufficient_data: "Some information a plan needs is missing.",
  noFit: {
    duration: (need: string, year: string) => `Together they need at least ${need}; your year has ${year}.`,
    exhausted: "We tried every way to fit them into your year, and none fit.",
  },
  search_incomplete: "The search stopped at its limit before it found a plan that fits.",
} as const;

export const failureWords: Record<ServiceFailure["code"], string> = {
  retrieval_failed: "We couldn’t get the weather records this time. It wasn’t anything you did.",
  processing_failed: "The plan couldn’t be finished. It wasn’t anything you did.",
  temporarily_unavailable: "The planning service wasn’t available. It wasn’t anything you did.",
  not_found: "This plan request had expired. It wasn’t anything you did.",
  rate_limited: "There were too many plan requests at once. It wasn’t anything you did.",
  payload_too_large: "Your answers were too large to send. Use fewer corners for your field, or fewer entries for last year.",
  not_configured: "Plans can’t be made in this version yet.",
  not_implemented: "Plans can’t be made in this version yet.",
};

export const head = {
  made: (place: string, date: string) => `${place} · Made ${date}`,
  year: (range: string) => `Your year: ${range}`,
  fieldReady: (date: string) => `Field ready: ${date}`,
} as const;

/** The same words as onboarding's water question. */
export const waterLabels: Record<WaterAnswer, string> = {
  rain_only: "Rain only",
  rain_plus_backup: "Rain + water when it’s dry",
  unsure: "I’m not sure",
};

export const sections = {
  flagged: "What we flagged",
  goodToKnow: "Good to know",
  timeline: "When to plant and harvest",
  timelineKept: "Your rotation, kept",
  ranking: "Why this plan ranked first",
  rankingKept: "Why your rotation ranked first",
  unchecked: "What we couldn’t check",
  compared: "Compared with last year",
  ready: "Get ready",
  missing: "What’s missing",
  no_fit: "Why they don’t fit",
  stopped: "Where the search stopped",
  failed: "What happened",
  farm: "What we know about your farm",
} as const;

/** spec.md section 6.4 names the four screens that flag a plan. The other codes are context. */
export const warningKinds: Record<ResultWarning["code"], "flag" | "context"> = {
  rainfall_mismatch: "flag",
  temperature_exposure: "flag",
  environmental_rule: "flag",
  rotation_rule: "flag",
  profile_limitation: "context",
  search_limit: "context",
  water_context: "context",
  approximate_history: "context",
};

/** `crops` is "" when the warning names none. */
export const warningHeads: Record<ResultWarning["code"], (crops: string, several: boolean) => string> = {
  rainfall_mismatch: (crops, several) => `Rain fell short of what ${crops ? `${crops} ${several ? "need" : "needs"}` : "the crops need"} in past seasons`,
  temperature_exposure: crops => `Temperatures went outside the limits for ${crops || "a crop"}`,
  environmental_rule: crops => `A published rule about this place flagged ${crops || "the plan"}`,
  rotation_rule: crops => `A rule about which crop may follow which flagged ${crops || "the plan"}`,
  profile_limitation: crops => (crops ? `A limit of the growing details for ${crops}` : "A limit of the growing details"),
  search_limit: () => "The search stopped at its limit",
  water_context: () => "Your backup water isn’t counted",
  approximate_history: () => "Your dates for last year are estimates",
};

export const warningIcons: Record<ResultWarning["code"], IconName> = {
  rainfall_mismatch: "drop",
  temperature_exposure: "heat",
  environmental_rule: "alert",
  rotation_rule: "swap",
  profile_limitation: "info",
  search_limit: "grid",
  water_context: "drop",
  approximate_history: "calendar",
};

export const warnings = {
  lead: "We flag a crop if, in any past season, even one week had less rain than it needs, or a temperature outside its limits. The check is strict, so most plans have warnings.",
  closing: "A warning doesn’t mean the crop fails, and it isn’t a prediction for next season. It shows where past seasons fell short, so you know what to watch.",
  alsoGoodToKnow: "Also good to know",
} as const;

export const gapHeads: Record<EvidenceGap["code"], (crops: string, several: boolean) => string> = {
  crop_profile: crops => `Growing details for ${crops || "a crop"} in this place`,
  climate: () => "Enough complete past seasons of weather",
  temperature_rule: crops => `Heat and cold limits for ${crops || "a crop"}`,
  rotation_rule: () => "Which crop may follow which",
  history: () => "What you told us about last year",
  ranking_metric: (crops, several) => `Rain compared with what ${crops ? `${crops} ${several ? "need" : "needs"}` : "the crops need"}`,
};

/**
 * F3's own line under a gap's head, for a code whose engine reasons name crops by id or by profile id. It is true of
 * each crop_profile reason the engine writes: no profile, none that applies or can be confirmed here, two that tie, and
 * one whose stages do not fit. Every other code shows the engine's reason.
 */
export const gapLines: Partial<Record<EvidenceGap["code"], (several: boolean) => string>> = {
  crop_profile: several => several
    ? "We can’t use any yet. They say when to plant them, how long they grow and how much water they need."
    : "We can’t use any yet. They say when to plant it, how long it grows and how much water it needs.",
};

export const gapIcons: Record<EvidenceGap["code"], IconName> = {
  crop_profile: "info",
  climate: "rain",
  temperature_rule: "heat",
  rotation_rule: "swap",
  history: "calendar",
  ranking_metric: "drop",
};

export const timeline = {
  caption: (range: string) => `Your year: ${range}. One crop at a time.`,
  tick: (month: string, year: string | null) => (year === null ? month : `${month} ${year}`),
  cropDates: (planted: string, harvested: string) => `Plant ${planted} · Harvest ${harvested}`,
  cropDays: (inField: string, freeOn: string) => `${inField} in the field. The field is free again on ${freeOn}.`,
  open: "No planned crop",
  openDates: (range: string, length: string) => `${range} · ${length}`,
  afterHarvest: (afterDays: number, length: string, crop: string) =>
    afterDays === 1
      ? `The first day is the time after the ${crop} harvest, before the field is free.`
      : `The first ${length} are the time after the ${crop} harvest, before the field is free.`,
  /** An open run that is all turnaround: the next crop goes in the day the field is free. */
  turnOnly: {
    head: "After harvest, before the field is free",
    note: (crop: string) => `No planned crop: the days after the ${crop} harvest.`,
  },
  legend: {
    after_harvest: "After harvest, before the field is free",
    open: "No planned crop",
    unlisted: "Not on our crop list",
    empty: "Field empty, as you said",
    not_sure: "Not sure: nothing recorded",
  },
  viewOnly: "The plan can’t be edited here. To change it, change your answers and make the plan again.",
} as const;

export const ranking = {
  fixedOrder: "We compare plans in one fixed order: water first, then days without a crop. You don’t choose it.",
  questions: {
    mean_frequency: "How often rain fell below what the crops need",
    mean_mismatch: "How big the shortfall was",
    unplanted_days: "Days without a planned crop",
    longest_unplanted_gap: "Longest stretch without a planned crop",
  } satisfies Record<RankingMetricId, string>,
  values: { none: "None" },
  explain: {
    never: "In past seasons, no 7-day window had less rain than the crops need.",
    always: "In past seasons, every 7-day window had less rain than the crops need.",
    often: "In past seasons, for the crop with the most short weeks each season. Lower is better.",
    noShortfall: "In past seasons, rain covered what the crops need in every week.",
    shortfall: "The average share of the crops’ need that rain didn’t cover. Weeks with enough rain count as 0%. Lower is better.",
    unplanted: (yearDays: string) => `Of the ${yearDays} in your year, counting the days after each harvest. Fewer is better.`,
    longest: "Days in a row without a planned crop. Shorter is better.",
  },
  notAvailable: "Not available",
  notRanked: "Shown, but not used to rank",
  badYear: {
    question: "In a bad year",
    none: "In at least 9 of 10 past seasons, rain covered what the crops need every week.",
    some: "Of the crops’ need, rain didn’t cover this much in a bad year: 9 in 10 past seasons had this much shortfall or less.",
  },
  /** The engine emits no worst-season temperature value, so this row reads q90_temperature_exposure. */
  heatAndCold: {
    question: "Heat and cold",
    none: "None",
    every: "Every checked day",
    ofCheckedDays: (share: string) => `${share} of checked days`,
    notAssessed: "Not assessed",
    note: "In a bad year, this share of the checked days was outside a crop’s temperature limits: 9 in 10 past seasons had this share or less.",
    outside: (crops: string) => `Outside the limits: ${crops}.`,
    notAssessedFor: (crops: string) => `Not assessed for ${crops}.`,
  },
  cohort: {
    checked: (seasons: string, period: string) => `Checked against ${seasons}, ${period}.`,
    noneUsable: "No complete past season could be used.",
    unavailable: (reason: string) => `Past seasons: ${reason}`,
    closing: "From past seasons, not a prediction. Checked with rain alone.",
  },
} as const;

export function cohortLine(cohort: ResultDetails["cohort"], format: Format): string {
  if (cohort.kind === "unavailable") return ranking.cohort.unavailable(endSentence(cohort.reason));
  const usable = cohort.value.seasons.flatMap(season => (season.status === "usable" ? [season.interval] : []));
  if (usable.length === 0) return ranking.cohort.noneUsable;
  const first = usable.reduce((earliest, season) => (season.start < earliest.start ? season : earliest));
  const last = usable.reduce((latest, season) => (season.endExclusive > latest.endExclusive ? season : latest));
  return ranking.cohort.checked(format.count(usable.length, "past season", "past seasons"), format.monthRange(first.start, last.endExclusive));
}

export function amountOf(value: AssessmentMetric["value"], unit: AssessmentMetric["unit"], format: Format): string {
  if (value.kind === "unavailable") return details.notAvailable(value.reason);
  switch (unit) {
    case "fraction":
      return shareWords(value.value);
    case "days":
      return format.count(value.value, "day", "days");
    case "count":
      return format.whole(value.value);
    default:
      return `${format.decimal(value.value, 1)} ${unitWords[unit]}`;
  }
}

export function exactOf(value: AssessmentMetric["value"], unit: AssessmentMetric["unit"], format: Format): string {
  if (value.kind === "unavailable") return details.notAvailable(value.reason);
  switch (unit) {
    case "fraction":
      return `${format.decimal(value.value, 6)} (${shareWords(value.value)})`;
    case "days":
      return format.count(value.value, "day", "days");
    case "count":
      return format.whole(value.value);
    default:
      return `${format.decimal(value.value, 6)} ${unitWords[unit]}`;
  }
}

export const search = {
  bestFound: "We stopped at our search limit.",
  bestFoundText: (step: string) => `This is the best plan we found, not proven to be the best. We tried planting dates every ${step}.`,
  stoppedFitting: (tries: string, limit: string) =>
    `We stopped after ${tries} at fitting your crops into your year (our limit is ${limit}), before we found an order that fits.`,
  stoppedScoring: (plans: string, limit: string) => `We stopped after scoring ${plans} (our limit is ${limit}).`,
  stopped: "The search stopped before it found an order that fits.",
  notProof: "A stopped search doesn’t show that your crops can’t fit.",
  interrupted: "The comparison of plans stopped part way, because required data was missing.",
} as const;

export const compared = {
  skipped: "You skipped last year, so we didn’t compare.",
  notScored: "We couldn’t score last year’s rotation:",
  noPlanToCompare: "There is no new plan to compare last year’s rotation with.",
  reported: "What you told us about last year (not scored)",
  verdicts: {
    kept: "Last year’s rotation ranked first, so we suggest keeping it.",
    changed: "The new plan ranked ahead of last year’s rotation.",
    no_recommendation: "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan.",
  } satisfies Record<Recommendation, string>,
  estimates: "Your dates are estimates.",
  estimatesText: (comparedToo: boolean) =>
    `You said some of last year’s dates are approximate${comparedToo ? ", so this comparison is approximate too" : ""}.`,
  thisPlan: "This plan",
  lastYearMoved: "Last year’s rotation, moved to this year",
  lastYearRows: {
    inField: (range: string, length: string) => `In the field ${range} · ${length}`,
    noCrop: "No crop",
  },
  howTheyCompare: "How they compare",
  nowValue: (value: string) => `This plan: ${value}`,
  lastYearValue: (value: string) => `Last year’s rotation: ${value}`,
  noNumbers: "No numbers to compare.",
  delta: {
    same: "The same",
    days: (days: string, fewer: boolean) => `${days} ${fewer ? "fewer" : "more"} with this plan`,
    count: (n: string, fewer: boolean) => `${n} ${fewer ? "fewer" : "more"} with this plan`,
    share: (lower: boolean) => `${lower ? "Lower" : "Higher"} with this plan`,
    better: " (better)",
    worse: " (worse)",
    notCompared: (reason: string) => `Not compared: ${reason}`,
  },
  changes: "Changes from last year",
  noChanges: "No changes: the same crops, order and dates as last year.",
  moved: "Last year’s dates are moved forward to this year to compare them.",
  added: (crop: string, range: string) => `Added: ${crop}, ${range}.`,
  removed: (crop: string, range: string) => `Not in the new plan: ${crop}, ${range} in last year’s rotation.`,
  shifted: (crop: string, days: string, earlier: boolean, now: string, was: string) =>
    `Plant ${crop} ${days} ${earlier ? "earlier" : "later"}: ${now} instead of ${was}.`,
  sameDay: (crop: string, planted: string, harvestNow: string, harvestWas: string) =>
    `Plant ${crop} on the same day, ${planted}; harvest ${harvestNow} instead of ${harvestWas}.`,
  reordered: (crop: string, from: string, to: string) => `${crop} moves from ${from} to ${to} in the order.`,
  reportedRows: {
    unlisted: (label: string) => `${label} (not on our crop list)`,
    empty: "Field empty, as you said",
    notSure: "Not sure: nothing recorded",
    dates: (planted: string, harvested: string) => `Planted ${planted} · Harvested ${harvested}`,
    about: (date: string) => `about ${date}`,
  },
} as const;

export const deltaNames: readonly (readonly [metricId: string, name: string])[] = [
  ["mean_frequency", "Weeks with less rain than the crops need"],
  ["mean_mismatch", "Average shortfall"],
  ["unplanted_days", "Days without a planned crop"],
  ["longest_unplanted_gap", "Longest stretch without a planned crop"],
  ["q90_mismatch", "Shortfall in a bad year"],
  ["q90_temperature_exposure", "Checked days outside temperature limits in a bad year"],
  ["crop_family_count", "Crop families"],
  ["legume_crop_count", "Bean-family plantings"],
];

export const noPlan = {
  missingNext: "Making the plan again gives the same answer until new data is available. You can change your answers, for example to other crops.",
  needAtLeast: "days your crops need, at least",
  inYourYear: "days in your year",
  eachCrop: "Each crop needs at least:",
  perCrop: (crop: string, days: string) => `${crop}: ${days}`,
  whatStops: "What stops them:",
  checkedWays: (ways: string) => `We checked ${ways} of placing them.`,
  noFitNext: "Choose fewer crops, or crops that grow faster, then make the plan again.",
  /** There is no retry port, so trying again is Change my answers, then Make my plan. */
  tryAgain: "To try again, tap Change my answers, then Make my plan on the last page. You don’t have to change anything.",
  failedNotRetryable: "Making the plan again may give the same result. You can change your answers and try.",
  farmSource: "From past seasons, not a prediction.",
} as const;

export const months = {
  caption: "Month by month for the area around your field: rain in mm and mean temperature in °C",
  period: (range: string) => `Weather records from ${range}.`,
  month: "Month",
  columns: [
    ["monthly_rain_median", "Usual rain"],
    ["monthly_rain_p10", "Dry year"],
    ["monthly_rain_p90", "Wet year"],
    ["monthly_mean_temperature", "Mean temperature"],
  ],
  noValue: "No data",
  when: (when: string, value: string) => `${when}: ${value}`,
} as const;

export const details = {
  title: "How this result was made",
  lead: (resultTitle: string) =>
    `Sources, calculations and assumptions behind “${resultTitle}”. Everything here comes from the saved result; nothing is worked out again.`,
  synthetic: (label: string) => `${label} Use it to see how ${appName} works, not to decide what to plant.`,
  back: "Back to the result",
  sections: {
    numbers: "The numbers behind the ranking",
    numbersNoPlan: "The numbers in this result",
    definitions: "How the numbers are worked out",
    months: "Rain and temperature by month",
    seasons: "Past seasons used",
    sources: "Where the data comes from",
    profiles: "Crop profiles and rules",
    coverage: "How far the search went",
    assumptions: "Assumptions",
    versions: "Method versions",
    answers: "Your answers",
  },
  tupleLead: "Plans were compared in one fixed order: the first number decides, and the next one only breaks a tie. Lower is better for all four.",
  noRanking: "No plan was ranked, so there is no ranking score.",
  noMetrics: "No other numbers are on record for this result.",
  numbersAreMonthly: "The numbers on record for this result are under Rain and temperature by month.",
  metricFacts: { inResult: "In the result", period: "Period", outOf: "Out of", basis: "Kind of value", method: "Method version", sources: "Sources", noSources: "None recorded" },
  notAvailable: (reason: string) => `Not available: ${reason}`,
  notAvailableHeading: "Not available in this result",
  noMonths: "No monthly rain or temperature numbers are on record for this result.",
  otherNumbers: "Other numbers on record",
  seasonsText: (target: string, minimum: string, method: string) =>
    `The target is ${target}, and at least ${minimum} must be complete. Each season starts on your field-ready day in a past year and runs for your plan’s length. Method ${method}.`,
  leftOut: "Left out",
  noneLeftOut: "No season was left out.",
  seasonTable: {
    caption: (noun: Noun) => `Each past season, and what it showed for this ${noun}`,
    columns: ["Season", "Status", "Short weeks (F)", "Shortfall (M)", "Heat or cold (X)"],
    used: "Used",
    leftOut: (reason: string) => `Left out: ${reason}`,
  },
  cropTables: {
    heading: "Each crop’s own numbers",
    lead: "The table above keeps the highest number among your crops for each season. These tables show each crop’s own numbers, so you can see which crop it came from.",
    caption: (crop: string, range: string) => `${crop}, in the field ${range}, in each past season`,
    columns: ["Season", "Short weeks (F)", "Shortfall (M)", "Heat or cold (X)"],
    over: (value: string, outOf: string) => `${value}, over ${outOf}`,
  },
  noSources: "No sources are recorded for this result.",
  published: (date: string) => `Published ${date}.`,
  publishedUnknown: (reason: string) => `Publication date: ${reason}`,
  taken: (date: string) => `Taken on ${date}.`,
  weather: "Weather records",
  noWeather: "No weather product is on record for this result.",
  productFacts: { cell: "Grid cell", size: "Cell size", version: "Version", stream: "Rain stream", time: "Time standard", units: "Units", missing: "Missing days", address: "Address" },
  cellSize: (lat: string, lng: string) => `${lat}° of latitude by ${lng}° of longitude`,
  unitsUsed: (field: string, given: string, used: string) => `${field}: ${given}, used as ${used}`,
  missingDays: (field: string, days: string) => `${field}: ${days}`,
  noMissingDays: "None",
  gridNote: "A weather grid cell is much larger than a field. Every farm in the same cell shares the same records, so your own field can be a little wetter or drier. Marking your field more exactly doesn’t make the weather records finer.",
  profile: (id: string, version: string) => `Profile ${id}, version ${version}.`,
  noProfiles: "No crop profile is on record for this result.",
  sourcesLine: (titles: string) => `Sources: ${titles}.`,
  unreviewed: "none recorded, so these values are not reviewed",
  rule: (id: string, version: string, target: string) => `Rule ${id} (version ${version}) for ${target}`,
  noRules: "No crop-sequence rules were used.",
  coverageFacts: { fitting: "Finding an order that fits", comparing: "Comparing plans", opened: "Partial plans opened", scored: "Plans scored", dates: "Planting dates tried" },
  counted: (status: string, upTo: string) => `${status}: ${upTo}`,
  upTo: (n: string, limit: string) => `${n} of up to ${limit}`,
  scoredTail: ", besides the first order that fit and last year’s rotation",
  datesTried: (step: string) => `Every ${step} from the day your field is ready, plus last year’s planting dates and the first free day after each crop`,
  noSearchBaseline: "Last year’s rotation already fits, so no search was needed",
  noSearchDuration: "Your crops’ shortest times already add up to more than your year, so no search was needed",
  noSearch: (status: string) => `${status}, with no search needed`,
  noAssumptions: "No assumptions are listed.",
  preparation: "Where the Get ready steps come from",
  noneRecorded: "none recorded",
  versionFacts: { engine: "Engine", settings: "Settings", catalogue: "Crop list", rules: "Rules", cutoff: "Data cutoff", climate: "Weather records used", fingerprint: "Answers fingerprint" },
  cutoff: (date: string) => `Records before ${date}`,
  notRecorded: (reason: string) => `Not recorded: ${reason}`,
  resultLine: (id: string, made: string, schema: string) => `Result ${id}, made ${made}. Schema version ${schema}.`,
  answerFacts: { field: "Field", corners: "Field corners", crops: "Crops", water: "Water", ready: "Field ready", lastYear: "Last year" },
  weatherPoint: (label: string, latitude: string, longitude: string) => `${label}, weather point ${latitude}, ${longitude}`,
  degrees: (value: string, hemisphere: "N" | "S" | "E" | "W") => `${value}° ${hemisphere}`,
  lastYear: {
    skipped: "Skipped",
    crops: ["crop", "crops"],
    empty: ["empty time", "empty times"],
    nothing: "Nothing recorded",
  },
  serviceReport: (message: string, code: string) => `What the service reported: ${message} (${code})`,
} as const;

export const definitions: readonly (readonly [string, string])[] = [
  ["7-day window", "Every run of 7 days in a row while a crop is in the field. A crop in the field for less than 7 days counts as one window."],
  ["D, the crop’s need", "Estimated water need over the window, in mm: the crop factor (Kc) times reference evaporation (ET0), added up day by day."],
  ["P, rain", "Rain over the same days, in mm."],
  ["r, the shortfall", "The share of the need that rain didn’t cover: (D − P) ÷ D when rain is below the need, and 0 otherwise. Windows with no need are left out."],
  ["F, how often", "The share of a crop’s windows with any shortfall in one past season. Each season keeps its highest F among the plan’s crops; the plan’s number is the average over seasons."],
  ["M, how much", "The average r over a crop’s windows in one past season, kept and averaged the same way."],
  ["Q90, a bad year", "The 90th percentile of M over past seasons, by nearest rank: 9 in 10 seasons had this much shortfall or less."],
  ["Dry and wet days", "A dry day has less than 1 mm of rain. A wet day has 1 mm or more."],
];

export const metricNames: ReadonlyMap<string, string> = new Map([
  ["mean_frequency", `${ranking.questions.mean_frequency} (ranked first)`],
  ["mean_mismatch", `${ranking.questions.mean_mismatch} (ranked second)`],
  ["unplanted_days", `${ranking.questions.unplanted_days} (ranked third)`],
  ["longest_unplanted_gap", `${ranking.questions.longest_unplanted_gap} (ranked fourth)`],
  ["q90_mismatch", "Shortfall in a bad year (shown, not ranked)"],
  ["q90_temperature_exposure", "Heat and cold in a bad year (shown, not ranked)"],
  ["crop_family_count", "Crop families (a count, not a score)"],
  ["legume_crop_count", "Bean-family plantings (a count, not a score)"],
  ...months.columns,
  ["wet_day_frequency", "Wet days"],
  ["longest_dry_spell", "Longest run of dry days"],
]);

export const basisWords: Record<AssessmentMetric["basis"], string> = {
  measured: "Measured",
  estimated: "Estimated",
  rule_derived: "Worked out from the plan’s dates",
};

export const unitWords: Record<AssessmentMetric["unit"], string> = {
  fraction: "share",
  days: "days",
  count: "count",
  mm: "mm",
  "mm/day": "mm a day",
  degC: "°C",
  degrees: "degrees",
  kPa: "kPa",
  "%": "%",
  "m/s": "m/s",
  "MJ/m²/day": "MJ/m² a day",
};

export const denominatorWords: Record<DenominatorUnit, readonly [one: string, many: string]> = {
  days: ["day", "days"],
  windows: ["window", "windows"],
  seasons: ["season", "seasons"],
  occurrences: ["planting", "plantings"],
  rule_events: ["rule event", "rule events"],
};

export const structuralWords: Record<SearchCoverage["structural"], string> = {
  not_started: "Not started",
  witness: "Found an order that fits",
  proved_impossible: "Showed that no order fits",
  limit_reached: "Stopped at its limit",
};

export const rankingWords: Record<SearchCoverage["ranking"], string> = {
  not_started: "Not started",
  grid_complete: "Compared every planting date on the grid",
  limit_reached: "Stopped at a limit, with work left",
  interrupted: "Stopped part way: required data was missing",
};

/**
 * Sentences that name what Gilir does not do. words.test.ts allows the otherwise banned words (yield, fertilizer,
 * cost) only inside exactly these sentences, so a disclaimer can never turn into a claim.
 */
export const disclaimers = [
  "Not included: fertilizer amounts, costs, yields, prices, watering schedules and soil tests.",
  "These are screening numbers from rain and estimated need. They leave out water stored in the soil, runoff, groundwater and paddy water losses, and they are not a yield estimate.",
] as const;

export const actions = {
  title: "What you can do",
  labels: {
    pdf: "Download PDF",
    details: "View details",
    change: "Change my answers",
    clear: "Clear saved data",
    save: "Save on this device",
    undo: "Undo",
  } satisfies Record<Exclude<ActionId, "earlier">, string>,
  busy: {
    pdf: "Making the PDF…",
    save: "Saving…",
    clear: "Clearing…",
    undo: "Putting it back…",
  } satisfies Record<Work, string>,
  openEarlier: (noun: Noun) => `Open my earlier ${noun}`,
} as const;

export const kept = {
  /** A saved no-plan result says what is saved, so "Saved" never sits bare beside "No new plan". */
  saved: { plan: "Saved on this device.", result: "This result is saved on this device." } satisfies Record<Noun, string>,
  notSaved: (noun: Noun) => `This ${noun} isn’t saved on this device.`,
  notSaving: (noun: Noun, problem: Problem) => {
    const why = actionable(problem);
    return why === null
      ? `This browser isn’t saving here, so this ${noun} stays only while this page is open. Download the PDF to keep a copy.`
      : `${why} ${staysHere(noun)}`;
  },
  earlier: (earlier: Noun, made: string) => `This result isn’t saved. Your earlier ${earlier}, made ${made}, is still saved on this device.`,
  cleared: (noun: Noun, setAside: boolean) => withWhy(
    `Your saved answers and plan are cleared. This ${noun} stays on this page until you leave it.`,
    setAside ? "Saved data this version of Gilir couldn’t open was cleared too. Undo can’t bring that back." : null,
  ),
} as const;

function staysHere(noun: Noun): string {
  return `This ${noun} stays here while this page is open. Download the PDF to keep a copy.`;
}

/**
 * F4's words for a full device or a newer Gilir tell the farmer what to do about it. Its words for "unavailable" only
 * say the browser refused, which F3's own sentences already say along with what happens to this result. A clear can
 * fail "full" only while reading first, and "no room left to save" there would read as a reason to clear again.
 */
function actionable(problem: Problem | null, helps: readonly Problem["reason"][] = ["full", "newer"]): string | null {
  return problem !== null && helps.includes(problem.reason) ? problem.text : null;
}

export const failures: Record<Work, (noun: Noun, problem: Problem | null) => string> = {
  pdf: noun => `We couldn’t make the PDF. Your ${noun} is still here on this page. You can try again.`,
  save: (noun, problem) => {
    const why = actionable(problem);
    return why === null
      ? "We couldn’t save this on this device. It stays here while this page is open. Download the PDF to keep a copy."
      : `${why} ${staysHere(noun)}`;
  },
  clear: (_, problem) => withWhy("We couldn’t clear the saved data. It is still on this device.", actionable(problem, ["newer"])),
  undo: (_, problem) => withWhy("We couldn’t put your saved answers and plan back.", actionable(problem)),
};

export const undoKeptNewer = "Something was saved on this device after you cleared it. We kept it, so your earlier answers and plan were not put back.";

function withWhy(sentence: string, why: string | null): string {
  return why === null ? sentence : `${sentence} ${why}`;
}

export const pdfMade = "The PDF was made. Look in your downloads.";
