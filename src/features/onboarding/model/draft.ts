// The farmer's answers, and every way they can change. Pure.
//
// Load-bearing decision: the draft IS the contract's own Partial<FarmInput> (minus schemaVersion). There is no second
// "UI draft" in plain strings or day numbers, and no converter between two shapes. Each key that is present already
// holds a valid, branded value, so the draft goes to localPlans.save as it is (src/client/storage.ts:3) with no cast.
// Text that is not yet a valid value (a half-typed crop name, a date sheet being edited) lives in the control that
// owns it until it parses. `<input type="date">` gives "" or a real date, parsed by model/dates.ts `isoDate`.
//
// Invariants every function below keeps (tests/frontend/onboarding/model/draft.test.ts):
//  I1. A recorded history always has both ends: start < endExclusive, and when planningStart is present,
//      endExclusive === planningStart and start === addYears(planningStart, -1). Clearing the date keeps the old
//      window, so the stored history is never half built (known issue 24).
//  I2. history.entries are sorted by start day (ties by id), so a contract issue index i is the i-th lane on screen
//      and the i-th submitted entry (src/contracts/input.ts:69, :85).
//  I3. Entry ids are distinct (nextEntryId).
//  I4. cropPurposeIds is absent or non-empty, distinct, and at most inputLimits.selectedCrops.
//  I5. A recorded history with no entries is stored as "no history" (key absent), so the farmer must choose bars,
//      "My field was empty all year" or "I don't remember" (all three candidates agree; open decision in rationale.md).
//  I6. A water edit changes only `water` (docs/cards/F1.md:43).
import type { Catalogue, CropPurposeId, FarmInput, IsoDate, WaterAnswer } from "@/contracts";
import type { Coverage, CropRef, End, Entry, History, RecordedHistory, Span, Stop } from "./timeline";

export type Draft = Readonly<Partial<Omit<FarmInput, "schemaVersion">>>;

/** The draft plus what the editor sets aside when "empty all year" or "I don't remember" replaces recorded bars. */
export interface Editor {
  readonly draft: Draft;
  /** Not saved. Restored by pressing the active alternative again, or by "Show last year’s entries again". */
  readonly setAside: RecordedHistory | null;
}

export type DraftEdit =
  | { readonly kind: "field"; readonly field: FarmInput["field"] }
  | { readonly kind: "toggleCrop"; readonly id: CropPurposeId }
  | { readonly kind: "removeCrop"; readonly id: CropPurposeId }             // a saved crop that is not on the list now
  | { readonly kind: "restoreCrops"; readonly ids: readonly CropPurposeId[] } // Undo
  | { readonly kind: "water"; readonly water: WaterAnswer }
  | { readonly kind: "planningStart"; readonly date: IsoDate | null }         // null: the date input was cleared
  | { readonly kind: "addCrop"; readonly crop: CropRef; readonly within: Span | null }
  | { readonly kind: "step"; readonly entryId: string; readonly end: End; readonly targetDay: number }
  | { readonly kind: "saveDates"; readonly entryId: string; readonly dates: DatesInput }
  | { readonly kind: "markEmpty"; readonly gap: Span }
  | { readonly kind: "removeEntry"; readonly entryId: string }
  | { readonly kind: "alternative"; readonly choice: "empty" | "skipped" }
  | { readonly kind: "restoreHistory"; readonly history: History | null };   // Undo, and "Show last year’s entries again"

/** What the date sheet hands back. `label` only for an unsupported crop. */
export interface DatesInput {
  readonly planted: IsoDate;
  readonly harvested: IsoDate;
  /** One control per bar sets both precisions (spec.md:46). */
  readonly approximate: boolean;
  readonly label?: string;
}

/** Why the date sheet cannot save. Shown softly while typing, as an alert after Save is tried. */
export type DatesProblem =
  | { readonly kind: "order" }                               // harvest before planting
  | { readonly kind: "window"; readonly first: IsoDate; readonly last: IsoDate }
  | { readonly kind: "overlap"; readonly with: Entry }
  | { readonly kind: "name" };                               // unsupported crop with a blank name

/** What happened, for the controller to toast, announce or focus. Words live in model/words.ts. */
export type EditNote =
  | { readonly kind: "none" }
  | { readonly kind: "cropLimit" }
  | { readonly kind: "cropRemoved"; readonly id: CropPurposeId; readonly undo: DraftEdit }
  | { readonly kind: "entryAdded"; readonly entryId: string }
  | { readonly kind: "listedInstead"; readonly id: CropPurposeId; readonly entryId: string } // typed name is on the list
  | { readonly kind: "yearFull" }
  | { readonly kind: "entryLimit" }                                         // inputLimits.historyEntries reached
  | { readonly kind: "entryRemoved"; readonly entry: Entry; readonly undo: DraftEdit }
  | { readonly kind: "markedEmpty"; readonly entry: Entry; readonly undo: DraftEdit }
  | { readonly kind: "markedUnsure"; readonly entry: Entry; readonly undo: DraftEdit }
  | { readonly kind: "stepped"; readonly entryId: string; readonly stop: Stop | null }
  | { readonly kind: "datesSaved"; readonly entryId: string }
  | { readonly kind: "datesRefused"; readonly problem: DatesProblem }
  | { readonly kind: "setAside"; readonly choice: "empty" | "skipped"; readonly undo: DraftEdit }
  | { readonly kind: "needDate" };                                          // "empty all year" before a date

export interface EditResult {
  readonly editor: Editor;
  readonly note: EditNote;
}

export const emptyEditor: Editor = { draft: {}, setAside: null };

/**
 * The one way the answers change. Total: every edit returns an editor that keeps I1 to I6.
 * `catalogue` is used only to turn a typed crop name that matches a listed label into a listed crop.
 */
export function applyEdit(editor: Editor, edit: DraftEdit, catalogue: Catalogue | null): EditResult {
  throw new Error("not implemented");
  // TODO, by edit.kind:
  //  field         -> draft.field = edit.field
  //  toggleCrop    -> remove (note cropRemoved, undo restoreCrops(before)) | refuse at 12 (note cropLimit) | append
  //  removeCrop    -> remove without the 12 check, same note as toggleCrop's remove
  //  restoreCrops  -> ids.length ? ids : delete key (I4)
  //  water         -> { ...draft, water } and nothing else (I6)
  //  planningStart -> date null: delete planningStart, keep history as it is (I1, known issue 24)
  //                   date set:  planningStart = date; history = moveWindow(history, date) (I1)
  //  addCrop       -> needs a window (date present). 64 entries -> entryLimit. len = policy.history.newCropDays;
  //                   sp = placeNew(...); null -> yearFull. A typed name equal to a listed label (case-insensitive,
  //                   trimmed) -> the listed crop, note listedInstead. Entry { kind: "crop", id: nextEntryId(.., "crop"),
  //                   crop, planted, harvested, both precisions "approximate" }. History recorded with the window if it
  //                   was absent or skipped. Sort (I2).
  //  step          -> timeline.stepEntry; note stepped with its stop
  //  saveDates     -> datesProblem(...) ? datesRefused : write both dates, both precisions from `approximate`, label; sort
  //  markEmpty     -> fallow { id: nextEntryId(.., "empty"), start: a, endExclusive: b }; undo restoreHistory(before)
  //  removeEntry   -> filter; zero entries left -> delete history (I5); note entryRemoved or markedUnsure (fallow)
  //  alternative   -> port chooseAlt (threefield-web app.js): the same choice again restores setAside; "empty" without
  //                   a date -> needDate; replacing recorded bars stores them in setAside and returns setAside with undo
  //  restoreHistory-> history = edit.history ?? delete key; setAside = null
}

/** The date sheet's own check, shared with applyEdit so the sheet and the reducer can never disagree. */
export function datesProblem(editor: Editor, entryId: string, dates: DatesInput): DatesProblem | null {
  throw new Error("not implemented");
  // TODO: harvested < planted -> order; outside [coverage.start, endExclusive - 1] -> window;
  //       span [planted, harvested + 1) overlaps another entry's span -> overlap; unsupported && !label.trim() -> name
}

/** The draft an initialInput seeds: every answer, without schemaVersion, entries sorted (I2). */
export function draftOf(input: FarmInput): Draft {
  throw new Error("not implemented");
}

/** True when the farmer has given at least one answer. */
export function hasAnswers(draft: Draft | null | undefined): draft is Draft {
  throw new Error("not implemented");
}

/** True when two drafts hold the same answers (canonical JSON, keys in schema order). Drives the Change inputs rule. */
export function sameAnswers(a: Draft, b: Draft): boolean {
  throw new Error("not implemented");
}

/**
 * Repair a draft read from storage so I1 to I5 hold: re-derive the window from planningStart, sort entries, drop an
 * empty recorded history, drop an empty crop list. Never drops a crop id or an entry. Pure and idempotent.
 * F4 validates the stored envelope (docs/cards/F4.md Implement), so this trusts the port's type and repairs only
 * F1's own invariants.
 */
export function normalizeDraft(draft: Partial<FarmInput>): Draft {
  throw new Error("not implemented");
}

/** The window of the draft, or null before a field-ready date. While the date is cleared, the stored window stands in. */
export function windowOf(draft: Draft): Coverage | null {
  throw new Error("not implemented");
}

/** "recorded" | "empty" (one fallow over the whole window) | "skipped" | "none". Drives page 4's three modes. */
export function historyMode(draft: Draft): "recorded" | "empty" | "skipped" | "none" {
  throw new Error("not implemented");
}
