// Every farmer-facing word in F1, in one file. Tables keyed by a contract union are `Record<Union, ...>`, so a new
// contract code fails the build here instead of showing an empty string.
// Apostrophes and quotation marks are typographic, and tests match these exact strings.
import { inputLimits } from "@/contracts";
import type { Catalogue, IsoDate, ServiceFailure, WaterAnswer } from "@/contracts";
import type { PageIssue } from "./check";
import { addDays, formatDay } from "./dates";
import type { DatesProblem, Draft, EditNote } from "./draft";
import type { Progress, Step } from "./flow";
import { policy } from "./policy";
import type { CropEntry, Entry, Stop } from "./timeline";

export const appName = "Gilir";

export const stepNames: Record<Step, string> = { 1: "Your farm", 2: "Crops", 3: "Water", 4: "Your rotation" };
/** Read before the step's name, which has its own span: "Step 2 of 4 · Crops". */
export const stepCount = (step: Step) => `Step ${step} of 4 · `;

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
  loaded: "The crop list is loaded.",
  stillFailed: "We still couldn’t load the crop list.",
  emptyTitle: "No crops are available yet",
  emptyBody: "This version has no crops in its list, so a plan can’t be made yet. Please check again later. Your other answers are kept.",
  notListed: (label: string) => `${label} is not on the current crop list.`,
  removeNotListed: (label: string) => `Remove ${label}`,
  filterLabel: "Find a crop",
  filterHint: "Type part of a crop’s name to make the list shorter.",
  filterClear: "Show all crops",
  filterCount: (shown: number, total: number) => `${shown} of ${total} crops shown`,
  filterNone: (text: string) => `No crop on the list matches “${text.trim()}”.`,
} as const;

/** The spec's water labels, with typographic apostrophes. */
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
  /** "Your plan covers {first} to {last}", each date in bold. */
  window: { lead: "Your plan covers", to: "to" },
  historyTitle: "What grew on this field in the 12 months before that?",
  historyHelp: (first: string, last: string) =>
    `From ${first} to ${last}. Add each crop, then drag the ends of its bar or tap Change dates. Times you leave as Not sure stay unknown. If you don’t know any of it, tap I don’t remember.`,
  waitForDate: "The timeline appears after you choose the date your field is ready.",
  emptyAllYear: "Your field was empty for all 12 months.",
  skipped: { lead: "That’s fine.", rest: "We make your plan without last year." },
  showAgain: "Show last year’s entries again",
  addInstead: "Add last year’s crops instead",
  noBars: { before: "No crops yet. Tap", after: "for each crop that grew here, in order." },
  addCrop: "Add a crop",
  changeDates: "Change dates",
  changeDatesFor: (crop: string) => `for ${crop.toLocaleLowerCase()}`,
  lanes: "Crops in those 12 months",
  notOnList: "Not on our list: shown, but not scored",
  bar: (planted: string, harvested: string) => `Planted ${planted}, harvested ${harvested}`,
  about: (date: string, approximate: boolean) => (approximate ? `about ${date}` : date),
  spotsTitle: "Not sure and empty times",
  unsure: "Not sure",
  wholeYear: "The whole 12 months",
  spotLine: (range: string, days: number) => `${range} · ${dayWord(days)}`,
  spotFor: (range: string) => `: ${range}`,
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
  dockFailure: "Your answers weren’t sent. See the note at the top.",
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
  nameLong: `Use a shorter name, up to ${policy.history.nameMaxChars} letters.`,
  listFailed: "We couldn’t load the crop list. You can still add a crop by name below.",
  datesTitle: (crop: string) => `Change dates: ${crop}`,
  planted: "Planted",
  harvested: "Harvested",
  harvestedHint: "The last day the crop was in the field.",
  plantedMissing: "Choose the planting date.",
  harvestedMissing: "Choose the harvest date.",
  approximate: "These dates are approximate",
  approximateHint: "Leave this on unless you know the exact days.",
  length: (days: number) => `${dayWord(days)} in the field.`,
  save: "Save dates",
  remove: (crop: string) => `Remove ${crop.toLocaleLowerCase()}`,
  gapTitle: (range: string) => `Not sure: ${range}`,
  gapBody: (days: number) => `${dayWord(days)}. If you don’t know, leave it as Not sure: it stays unknown and is not counted as empty.`,
  cropGrew: "A crop grew then",
  emptyTitle: (range: string) => `Empty: ${range}`,
  emptyBody: "You said the field was empty then. If you are not sure, mark it as not sure again.",
  textTitle: "Text size",
  sizes: { normal: "Normal", large: "Large", largest: "Largest" },
  sizeLetters: "Aa",
  sizeSample: "Words, buttons and spaces all grow together. This sentence shows the size you picked.",
  contrast: "High contrast",
  contrastHint: "Black text on white, thicker edges",
  done: "Done",
} as const;

/** The search tries some orders and dates within budgets, so it never claims "every order". */
const makingSteps: Record<Progress, string> = {
  queued: "Waiting for a free place in line",
  fetching: "Getting NASA weather records for your area",
  calculating: "Comparing orders and planting dates",
};

export const making = {
  /** No time is promised: how long a plan takes has not been measured. */
  lead: (place: string | null) => `Keep this page open while we work.${place ? ` ${place}.` : ""}`,
  steps: makingSteps,
  stepsLabel: "Steps",
  status: { done: "Done", now: "Working on it", wait: "Waiting" },
  /** The one sentence the polite status line says, never the whole list. */
  announce: (progress: Progress) => `Step ${progressIndex(progress) + 1} of 3: ${makingSteps[progress]}.`,
  /** Retryable read failures never end the wait, so Making says it keeps trying. */
  reaching: "We can’t reach the planning service right now. We keep trying.",
  cancel: "Cancel",
  noPlan: "No plan was made.",
  tryAgain: "Try again",
  makeAgain: "Make my plan again",
  changeAnswers: "Change my answers",
  earlierPlan: (made: string) => `Open my earlier plan, made ${made}`,
} as const;

/** Failure words by contract code. No helpline code is shown, because Gilir has no helpline yet. */
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
  /** F4's words for why storage failed, then what it means for the answers on screen. */
  notSaving: (problem: string) => `${problem} Your answers stay while this page is open.`,
  /** "kept", not "saved", because storage may not be saving. */
  keptNewer: "We kept the answers you changed after that plan was made.",
  offline: "You’re offline. Your answers stay on this page.",
  gotIt: "Got it",
} as const;

export const shell = {
  skip: "Skip to the main content",
  dock: "Next step",
  back: "Back",
  textSize: "Text size",
  listen: "Listen",
  stop: "Stop",
  undo: "Undo",
  undone: (text: string) => `Undone: ${text}.`,
  /** What the status line says for a toast, because the toast box itself is not a live region. */
  toastSaid: (text: string, undoable: boolean) => (undoable ? `${text}. You can undo this.` : text),
  broken: { title: "Something went wrong on our side", body: "This screen couldn’t open. It wasn’t anything you did.", action: "Open Gilir again" },
} as const;

/** Crop names from the loaded catalogue. A readable form of the id stands in when the list is not loaded or lacks it. */
export interface CropNames {
  crop(id: string | null): string;
  entry(entry: Entry): string;
  /** The entry with this id in the answers namesFrom was given, so an issue can name its bar. */
  entryById(id: string | null): Entry | null;
}

export function namesFrom(catalogue: Catalogue | null, draft: Draft = {}): CropNames {
  const labels = new Map<string, string>(catalogue?.entries.map(entry => [entry.id, entry.label]));
  const entries = draft.history?.kind === "recorded" ? draft.history.entries : [];
  const crop = (id: string | null) => {
    if (id === null) return "A crop";
    const readable = id.replace(/[-_:]+/g, " ");
    return labels.get(id) ?? readable.charAt(0).toLocaleUpperCase() + readable.slice(1);
  };
  return {
    crop,
    entry: entry => (entry.kind === "fallow" ? "The empty time" : entry.crop.kind === "catalogue" ? crop(entry.crop.cropPurposeId) : entry.crop.label),
    entryById: id => entries.find(entry => entry.id === id) ?? null,
  };
}

/** Farmer words for an issue. Exhaustive over IssueKind (the `never` default fails the build on a new kind). */
export function issueWords(issue: PageIssue, names: CropNames): string {
  const entry = names.entryById(issue.entryId);
  const name = entry === null ? "An entry" : names.entry(entry);
  switch (issue.kind) {
    case "field_missing": return "Mark your field on the map.";
    case "field_shape": return "The field outline has a problem. Mark the field again.";
    case "crops_missing": return "Choose at least one crop.";
    case "crops_duplicate": return "Each crop can be picked only once.";
    case "crop_not_listed": return `${names.crop(issue.cropId)} is not on the current crop list. Remove it, then pick again.`;
    case "water_missing": return "Choose where your water comes from.";
    case "date_missing": return "Choose the date your field is ready.";
    case "history_missing": return "Add last year’s crops, or tap “My field was empty all year” or “I don’t remember”.";
    case "history_window": return "Last year’s 12 months must end on the day your field is ready. Choose the date again.";
    case "entry_outside":
      return entry !== null && endsBeforeStart(entry)
        ? `${name} ends before it starts. Change its dates.`
        : `${name} is outside the 12 months shown. Change its dates or remove it.`;
    case "entry_overlap": return `${name} overlaps another entry. One crop at a time: change the dates.`;
    case "entry_id": return "Two entries have the same name. Remove one and add it again.";
    case "entry_name": return sheets.nameMissing;
    case "too_large": return failureWords.payload_too_large.body;
    case "unreadable": return "Your answers couldn’t be read. Tap Make my plan again.";
    case "other": return issue.page === null ? "Check your answers, then tap Make my plan again." : `Check the answers on page ${issue.page}.`;
    default: {
      const unreachable: never = issue.kind;
      return unreachable;
    }
  }
}

/**
 * What the controller says after an edit, or null for nothing. `polite`: only the polite status line says it (a
 * screen reader hears it, nothing pops up). Otherwise it is a toast. `undo`: the toast offers Undo.
 * `names` must come from the answers after the edit, so a new bar can be named.
 */
export function noteWords(note: EditNote, names: CropNames): { readonly text: string; readonly undo: boolean; readonly polite: boolean } | null {
  const toast = (text: string, undo = false) => ({ text, undo, polite: false });
  const said = (text: string) => ({ text, undo: false, polite: true });
  switch (note.kind) {
    case "none":
    case "needDate":
    case "datesRefused":
      return null;
    case "cropLimit": return toast(crops.limit);
    case "cropRemoved": return toast(crops.removed(names.crop(note.id)), true);
    case "entryRemoved": return toast(`${names.entry(note.entry)} removed`, true);
    case "markedEmpty": return toast(`Marked as empty: ${entryRangeWords(note.entry)}`, true);
    case "markedUnsure": return toast(`Marked as not sure again: ${entryRangeWords(note.entry)}`, true);
    case "setAside": return toast(note.choice === "skipped" ? "Last year’s entries are set aside" : "Marked as empty all year", true);
    case "yearFull": return toast("The 12 months are full. Change the dates of a crop first.");
    case "entryLimit": return toast(`You can add up to ${inputLimits.historyEntries} entries. Remove one first.`);
    case "listedInstead": return toast(`${names.crop(note.id)} is on our list, so it was added from the list.`);
    case "entryAdded": {
      const entry = names.entryById(note.entryId);
      return entry === null ? null : said(`${names.entry(entry)} added. ${entryWords(entry)}.`);
    }
    case "datesSaved": {
      const entry = names.entryById(note.entryId);
      return entry === null ? null : said(`${names.entry(entry)}: ${entryWords(entry)}.`);
    }
    case "stepped": {
      const entry = names.entryById(note.entryId);
      return note.stop === null || entry === null ? null : said(stopWords(note.stop, entry, names));
    }
    case "listRetried": return said(note.loaded ? crops.loaded : crops.stillFailed);
  }
}

/** What the status line says when a drag ends: why it stopped short, if it did, then the bar's dates. */
export function dropWords(entry: Entry, stop: Stop | null, names: CropNames): string {
  const dates = `${names.entry(entry)}: ${entryWords(entry)}.`;
  return stop === null ? dates : `${stopWords(stop, entry, names)} ${dates}`;
}

export function stopWords(stop: Stop, entry: Entry, names: CropNames): string {
  const name = names.entry(entry);
  if (stop.kind === "edge") return `${name} stays inside the 12 months shown.`;
  if (stop.kind === "short") return `${name} needs at least one day in the field.`;
  return stop.with.kind === "fallow"
    ? `${name} can’t overlap the empty time.`
    : `${name} can’t overlap ${names.entry(stop.with).toLocaleLowerCase()}. One crop at a time.`;
}

export function datesProblemWords(problem: DatesProblem, names: CropNames): string {
  switch (problem.kind) {
    case "order": return "The harvest date must be on or after the planting date.";
    case "window": return `Choose dates from ${rangeWords(problem.first, problem.last)}.`;
    case "overlap": {
      const other = problem.with.kind === "fallow" ? "the empty time" : `your ${names.entry(problem.with).toLocaleLowerCase()}`;
      return `This overlaps ${other} (${entryRangeWords(problem.with)}). One crop at a time: choose other dates.`;
    }
    case "name": return sheets.nameMissing;
    case "nameLong": return sheets.nameLong;
  }
}

/** A calendar date as the farmer's phone writes it, with a short month. */
export function dateWords(date: IsoDate): string {
  return formatDay(date, "short");
}

export function rangeWords(first: IsoDate, last: IsoDate): string {
  return `${dateWords(first)} to ${dateWords(last)}`;
}

/** The days an entry covers, last day included: a crop's harvest day, or the day before a fallow's exclusive end. */
export function entryRangeWords(entry: Entry): string {
  return entry.kind === "crop" ? rangeWords(entry.planted, entry.harvested) : rangeWords(entry.start, addDays(entry.endExclusive, -1));
}

/** "Planted about 1 Jul 2025, harvested 4 Jul 2025" for a crop; the range for an empty time. */
function entryWords(entry: Entry): string {
  return entry.kind === "crop" ? barWords(entry) : entryRangeWords(entry);
}

export function barWords(entry: CropEntry): string {
  return rotation.bar(
    rotation.about(dateWords(entry.planted), entry.plantedPrecision === "approximate"),
    rotation.about(dateWords(entry.harvested), entry.harvestedPrecision === "approximate"),
  );
}

/** "rice", "rice and maize", "rice, maize and beans". */
export function listWords(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function dayWord(n: number): string {
  return n + (n === 1 ? " day" : " days");
}

function endsBeforeStart(entry: Entry): boolean {
  return entry.kind === "crop" ? entry.harvested < entry.planted : entry.endExclusive <= entry.start;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function progressIndex(progress: Progress): 0 | 1 | 2 {
  return progress === "queued" ? 0 : progress === "fetching" ? 1 : 2;
}
