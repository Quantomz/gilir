// Every farmer-facing word in F1, in one file. Ported from the prototype (threefield-web src/app.js, read by function
// name) with "Threefield" replaced by "Gilir", the known-issue fixes applied, and no priority, pest or weed words
// (AGENTS.md:47). Tables keyed by a contract union are `Record<Union, ...>`, so a new contract code fails the build
// here instead of showing an empty string (design-red-flags "hand-synced list").
// Apostrophes are typographic, as the prototype shows them. Tests match these exact strings (open decision in rationale.md).
import { inputLimits } from "@/contracts";
import type { Catalogue, ServiceFailure, WaterAnswer } from "@/contracts";
import type { PageIssue } from "./check";
import type { DatesProblem, EditNote } from "./draft";
import type { Progress, Step } from "./flow";
import type { Entry } from "./timeline";

export const appName = "Gilir";

export const stepNames: Record<Step, string> = { 1: "Your farm", 2: "Crops", 3: "Water", 4: "Your rotation" };
export const stepCount = (step: Step) => `Step ${step} of 4 · ${stepNames[step]}`;

export const titles = {
  opening: "Opening Gilir…",
  openingLead: "Getting your answers ready",
  farm: "Where is your farm?",
  crops: "Which crops do you want to grow?",
  water: "Where does your water come from?",
  rotation: "Your rotation",
  making: "Making your plan",
} as const;

export const next: Record<1 | 2 | 3, string> = { 1: "Next: crops", 2: "Next: water", 3: "Next: your rotation" };
export const makePlan = { idle: "Make my plan", sending: "Sending your answers…" } as const;

export const farm = {
  lead: "Find your farm, then mark your field.",
  needField: "Mark your field to go on.",
} as const;

export const crops = {
  lead: "Every plan includes every crop you pick. Many fields fit 1 to 3 crops in a year, depending on how long they grow.",
  purpose: { food: "Grown for food", cover: "Cover crop" },
  picked: "Picked",
  count: (n: number) => `${n} picked`,
  tapToPick: "Tap a crop to pick it.",
  needOne: "Pick at least one crop to go on.",
  limit: `You can pick up to ${inputLimits.selectedCrops} crops. Remove one first.`,
  removed: (label: string) => `${label} removed`,
  loading: "Loading the crop list…",
  failedTitle: "We couldn’t load the crop list",
  failedBody: "Check your internet connection, then try again. Your answers are kept.",
  tryAgain: "Try again",
  emptyTitle: "No crops are available yet",
  emptyBody: "This version has no crops in its list, so a plan can’t be made yet. Please check again later. Your other answers are kept.",
  notListed: (label: string) => `${label} is not on the current crop list.`,
  removeNotListed: (label: string) => `Remove ${label}`,
} as const;

/** Spec labels (spec.md:44), with typographic apostrophes as the prototype shows them. */
export const waterLabels: Record<WaterAnswer, { readonly label: string; readonly detail: string }> = {
  rain_only: { label: "Rain only", detail: "No pump, canal or well." },
  rain_plus_backup: { label: "Rain + water when it’s dry", detail: "A pump, canal or well for dry spells." },
  unsure: { label: "I’m not sure", detail: "That’s fine." },
};
export const water = {
  lead: "We plan with rain alone. Water from other sources is extra protection and doesn’t change the plan.",
  needOne: "Choose one answer to go on.",
} as const;

export const rotation = {
  lead: "First the day your field is ready, then what grew there before. About right is fine.",
  dateLabel: "When is your field ready to plant?",
  dateHint: "The first day you can plant. Your plan covers one year from that day.",
  needDate: "Choose the date your field is ready first.",
  pastDate: "This date has passed. Is the year right?",
  window: (first: string, last: string) => `Your plan covers ${first} to ${last}`,
  historyTitle: "What grew on this field in the 12 months before that?",
  historyHelp: (first: string, last: string) =>
    `From ${first} to ${last}. Add each crop, then drag the ends of its bar or tap Change dates. Times you leave as Not sure stay unknown. If you don’t know any of it, tap I don’t remember.`,
  waitForDate: "The timeline appears after you choose the date your field is ready.",
  emptyAllYear: "Your field was empty for all 12 months.",
  skipped: "That’s fine. We make your plan without last year.",
  showAgain: "Show last year’s entries again",
  addInstead: "Add last year’s crops instead",
  noBars: "No crops yet. Tap Add a crop for each crop that grew here, in order.",
  addCrop: "Add a crop",
  changeDates: "Change dates",
  notOnList: "Not on our list: shown, but not scored",
  bar: (planted: string, harvested: string) => `Planted ${planted}, harvested ${harvested}`,
  about: (date: string, approximate: boolean) => (approximate ? `about ${date}` : date),
  spotsTitle: "Not sure and empty times",
  unsure: "Not sure",
  wholeYear: "The whole 12 months",
  empty: "Empty",
  markEmpty: "The field was empty then",
  markUnsure: "Mark as not sure",
  or: "Or, instead",
  altEmpty: { title: "My field was empty all year", detail: "Nothing grew there in those 12 months." },
  altSkip: { title: "I don’t remember", detail: "We plan without last year." },
  skipNote: "Skipping is not the same as an empty field. If you skip, we make the plan without last year and treat no month as empty.",
  keys: "Arrow keys move a day, Page Up and Page Down a week, Home and End to the ends of the 12 months. Enter opens the date.",
  handlePlant: (crop: string) => `${crop}: planting day`,
  handleHarvest: (crop: string) => `${crop}: harvest day, the last day in the field`,
  handleValue: (date: string, days: number) => `${date}, ${dayWord(days)} in the field`,
  jobRunning: "A plan is being made from your answers.",
  seeJob: "See how it’s going",
  fixFirst: "Fix these first",
  fixOnPage: (page: Step, words: string) => `Fix on page ${page}: ${lowerFirst(words)}`,
  fixHere: (words: string) => `On this page: ${lowerFirst(words)}`,
  dockIssues: (n: number) => `${n === 1 ? "One answer needs" : `${n} answers need`} fixing first. See the list at the top.`,
  dockFailure: (title: string) => `${title}. See the note at the top.`,
  tapAgain: "When you’re ready, tap Make my plan again.",
} as const;

export const sheets = {
  close: "Close",
  addTitle: (inGap: boolean) => (inGap ? "Which crop grew then?" : "Which crop grew here?"),
  addLead: (inGap: boolean) => (inGap ? "It goes in the Not sure time you tapped." : "Add each crop, one at a time."),
  yourCrops: "Your crops",
  otherCrops: "Other crops",
  allCrops: "Crops",
  notListedTitle: "A crop not on our list",
  nameLabel: "Name of the crop",
  addThis: "Add this crop",
  nameHint: "Not on our list: shown, but not scored.",
  nameMissing: "Type the name of the crop.",
  nameLong: "Use a shorter name, up to 80 letters.",
  listFailed: "We couldn’t load the crop list. You can still add a crop by name below.",
  datesTitle: (crop: string) => `Change dates: ${crop}`,
  planted: "Planted",
  harvested: "Harvested",
  harvestedHint: "The last day the crop was in the field.",
  /** Prototype words. The spec names the control "Dates are approximate" (spec.md:46): open decision in rationale.md. */
  approximate: "These dates are approximate",
  approximateHint: "Leave this on unless you know the exact days.",
  length: (days: number) => `${dayWord(days)} in the field.`,
  save: "Save dates",
  remove: (crop: string) => `Remove ${crop}`,
  gapTitle: (range: string) => `Not sure: ${range}`,
  gapBody: (days: number) => `${dayWord(days)}. If you don’t know, leave it as Not sure: it stays unknown and is not counted as empty.`,
  cropGrew: "A crop grew then",
  emptyTitle: (range: string) => `Empty: ${range}`,
  emptyBody: "You said the field was empty then. If you are not sure, mark it as not sure again.",
  textTitle: "Text size",
  sizes: { normal: "Normal", large: "Large", largest: "Largest" },
  sizeSample: "Words, buttons and spaces all grow together. This sentence shows the size you picked.",
  contrast: "High contrast",
  contrastHint: "Black text on white, thicker edges",
  done: "Done",
} as const;

/** Known issue 8: "Comparing orders", never "every order". */
const makingSteps: Record<Progress, string> = {
  queued: "Waiting for a free place in line",
  fetching: "Getting NASA weather records for your area",
  calculating: "Comparing orders and planting dates",
};

export const making = {
  lead: (place: string | null) => `This usually takes less than a minute.${place ? ` ${place}.` : ""}`,
  steps: makingSteps,
  status: { done: "Done", now: "Working on it", wait: "Waiting" },
  /** The one sentence the polite status line says (known issue 19: never the whole list). */
  announce: (progress: Progress) => `Step ${progressIndex(progress) + 1} of 3: ${makingSteps[progress]}.`,
  /** Graft from candidates 2 and 3: retryable read failures never end the wait. */
  reaching: "We can’t reach the planning service right now. We keep trying.",
  cancel: "Cancel",
  noPlan: "No plan was made.",
  tryAgain: "Try again",
  makeAgain: "Make my plan again",
  changeAnswers: "Change my answers",
  earlierPlan: (made: string) => `Open my earlier plan, made ${made}`,
} as const;

/** Failure words by contract code. No helpline code is shown (known issue 10): Gilir has no helpline yet. */
export const failureWords: Record<ServiceFailure["code"], { readonly title: string; readonly body: string }> = {
  retrieval_failed: { title: "We couldn’t get the weather records", body: "NASA’s weather service didn’t answer this time. Your answers are kept, so you can try again." },
  processing_failed: { title: "Something went wrong while making your plan", body: "It wasn’t anything you did, and your answers are kept." },
  temporarily_unavailable: { title: "The planning service isn’t available right now", body: "Your answers are kept. Try again in a few minutes." },
  not_found: { title: "This plan request has expired", body: "Plan requests are kept for 24 hours. Your answers are still here, so you can make the plan again." },
  rate_limited: { title: "Too many plan requests right now", body: "Wait a minute, then try again. Your answers are kept." },
  payload_too_large: { title: "Your answers are too large to send", body: "Use fewer corners for your field, or fewer entries for last year. Then tap Make my plan again." },
  not_configured: { title: "Plans can’t be made in this version yet", body: "The planning service is not set up. Your answers are kept." },
  not_implemented: { title: "Plans can’t be made in this version yet", body: "This part of the planning service is not ready. Your answers are kept." },
};

export const notices = {
  /** "kept", not "saved": storage may not be saving (honest while F4 is a stub). */
  notSaving: "This browser isn’t saving your answers. They stay while this page is open.",
  keptNewer: "We kept the answers you changed after that plan was made.",
  offline: "You’re offline. Your answers stay on this page.",
  gotIt: "Got it",
} as const;

export const shell = {
  skip: "Skip to the main content",
  back: "Back",
  textSize: "Text size",
  listen: "Listen",
  stop: "Stop",
  undo: "Undo",
  broken: { title: "Something went wrong on our side", body: "This screen couldn’t open. It wasn’t anything you did.", action: "Open Gilir again" },
} as const;

/** Crop names from the loaded catalogue. A readable form of the id stands in when the list is not loaded or lacks it. */
export interface CropNames {
  crop(id: string | null): string;
  entry(entry: Entry): string;
}

export function namesFrom(catalogue: Catalogue | null): CropNames {
  throw new Error("not implemented");
}

/** Farmer words for an issue. Exhaustive over IssueKind (the `never` default fails the build on a new kind). */
export function issueWords(issue: PageIssue, names: CropNames): string {
  throw new Error("not implemented");
  // TODO (switch on issue.kind):
  //  field_missing   "Mark your field on page 1."
  //  field_shape     "The field outline has a problem. Mark the field again."
  //  crops_missing   "Pick at least one crop."
  //  crops_duplicate "Each crop can be picked only once."
  //  crop_not_listed `${names.crop(issue.cropId)} is not on the current crop list. Remove it, then pick again.`
  //  water_missing   "Choose where your water comes from."
  //  date_missing    "Choose the date your field is ready."
  //  history_missing "Add last year’s crops, or tap “My field was empty all year” or “I don’t remember”."
  //  history_window  "Last year’s 12 months must end on the day your field is ready. Choose the date again."
  //  entry_outside   inverted ? `${name} ends before it starts. Change its dates.` : `${name} is outside the 12 months shown. Change its dates or remove it.`
  //  entry_overlap   `${name} overlaps another entry. One crop at a time: change the dates.`
  //  entry_id        "Two entries have the same name. Remove one and add it again."
  //  entry_name      sheets.nameMissing
  //  too_large       failureWords.payload_too_large.body
  //  unreadable      "Your answers couldn’t be read. Tap Make my plan again."
  //  other           "Check the answers on page {page}." (never the contract's developer message)
  //  default         const unreachable: never = issue.kind
}

/** What the controller toasts or announces for an edit. Null when nothing is said. */
export function noteWords(note: EditNote, names: CropNames): { readonly text: string; readonly undo: boolean; readonly polite: boolean } | null {
  throw new Error("not implemented");
  // TODO: cropRemoved "{crop} removed" + Undo; entryRemoved "{crop} removed" + Undo; markedEmpty "Marked as empty: {range}" + Undo;
  //       markedUnsure "Marked as not sure again: {range}" + Undo; setAside "Last year’s entries are set aside" | "Marked as empty all year" + Undo;
  //       yearFull "The 12 months are full. Change the dates of a crop first."; cropLimit crops.limit;
  //       entryLimit `You can add up to ${inputLimits.historyEntries} entries. Remove one first.`;
  //       listedInstead "{label} is on our list, so it was added from the list."; entryAdded "{crop} added. {bar text}." (announce only);
  //       stepped with stop: "{crop} stays inside the 12 months shown." | "{crop} needs at least one day in the field." |
  //       "{crop} can’t overlap the empty time." | "{crop} can’t overlap {other}. One crop at a time." (announce only)
}

export function datesProblemWords(problem: DatesProblem, names: CropNames): string {
  throw new Error("not implemented");
  // TODO: order "The harvest date must be on or after the planting date."; window "Choose dates from {first} to {last}.";
  //       overlap "This overlaps {the empty time | your {crop}} ({range}). One crop at a time: choose other dates."; name sheets.nameMissing
}

export function dayWord(n: number): string {
  return n + (n === 1 ? " day" : " days");
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function progressIndex(progress: Progress): 0 | 1 | 2 {
  return progress === "queued" ? 0 : progress === "fetching" ? 1 : 2;
}
