// The farmer's answers, and every way they can change. Pure.
//
// The draft IS the contract's own Partial<FarmInput> (minus schemaVersion), so it goes to storage with no converter
// and no cast. Text that is not yet a valid value (a half-typed crop name, a date sheet being edited) stays in the
// control that owns it until it parses.
//
// Invariants every edit keeps:
//  I1. A recorded history always has both ends, and when planningStart is present its window is the 12 months before
//      it. Clearing the date keeps the old window, so the stored history is never half built.
//  I2. history.entries are sorted by start day (ties by id), so a contract issue index i is the i-th lane on screen.
//  I3. Entry ids are distinct.
//  I4. cropPurposeIds is absent or non-empty, distinct, and at most inputLimits.selectedCrops.
//  I5. A recorded history with no entries is stored as no history, so the farmer must choose bars,
//      "My field was empty all year" or "I don't remember".
//  I6. A water edit changes only `water`.
import { inputLimits } from "@/contracts";
import type { Catalogue, CropPurposeId, FarmInput, IsoDate, WaterAnswer } from "@/contracts";
import { addDays, daysBetween, isoDate } from "./dates";
import { policy } from "./policy";
import {
  coverageFor,
  isEmptyAllYear,
  moveWindow,
  nextEntryId,
  placeNew,
  sortEntries,
  spanOf,
  stepEntry,
} from "./timeline";
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
  /** One control per bar sets both precisions. */
  readonly approximate: boolean;
  readonly label?: string;
}

/** Why the date sheet or the add sheet cannot save. Shown softly while typing, as an alert after Save is tried. */
export type DatesProblem =
  | { readonly kind: "order" }                               // harvest before planting
  | { readonly kind: "window"; readonly first: IsoDate; readonly last: IsoDate }
  | { readonly kind: "overlap"; readonly with: Entry }
  | { readonly kind: "name" }                                // unsupported crop with a blank name
  | { readonly kind: "nameLong" };                           // longer than policy.history.nameMaxChars

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

const none: EditNote = { kind: "none" };
const answerKeys = ["field", "cropPurposeIds", "water", "planningStart", "history"] as const;
type AnswerKey = (typeof answerKeys)[number];

/**
 * The one way the answers change. Total: every edit returns an editor that keeps I1 to I6.
 * `catalogue` is used only to turn a typed crop name that matches a listed label into a listed crop.
 */
export function applyEdit(editor: Editor, edit: DraftEdit, catalogue: Catalogue | null): EditResult {
  const { draft } = editor;
  const keep = (note: EditNote = none): EditResult => ({ editor, note });
  const write = (next: Draft, note: EditNote = none, setAside: RecordedHistory | null = editor.setAside): EditResult =>
    ({ editor: { draft: next, setAside }, note });

  switch (edit.kind) {
    case "field":
      return write({ ...draft, field: edit.field });

    case "water":
      return write({ ...draft, water: edit.water });

    case "toggleCrop":
    case "removeCrop": {
      const ids = draft.cropPurposeIds ?? [];
      if (ids.includes(edit.id)) {
        const undo: DraftEdit = { kind: "restoreCrops", ids };
        return write(withCrops(draft, ids.filter(id => id !== edit.id)), { kind: "cropRemoved", id: edit.id, undo });
      }
      if (edit.kind === "removeCrop") return keep();
      if (ids.length >= inputLimits.selectedCrops) return keep({ kind: "cropLimit" });
      return write(withCrops(draft, [...ids, edit.id]));
    }

    case "restoreCrops":
      return write(withCrops(draft, [...new Set(edit.ids)].slice(0, inputLimits.selectedCrops)));

    case "planningStart": {
      const date = edit.date === null ? null : isoDate(edit.date);
      if (date === null) return write(without(draft, "planningStart"));
      const moved = draft.history === undefined ? {} : { history: moveWindow(draft.history, date) };
      return write({ ...draft, planningStart: date, ...moved });
    }

    case "addCrop": {
      if (draft.planningStart === undefined) return keep({ kind: "needDate" });
      const coverage = coverageFor(draft.planningStart);
      const entries = recordedEntries(draft);
      if (entries.length >= inputLimits.historyEntries) return keep({ kind: "entryLimit" });
      let crop: CropRef = edit.crop;
      if (edit.crop.kind === "unsupported") {
        const problem = nameProblem(edit.crop.label);
        if (problem !== null) return keep({ kind: "datesRefused", problem });
        crop = listedOrNamed(edit.crop.label, catalogue);
      }
      const within = edit.within !== null && isFreeSpan(edit.within, entries, coverage) ? edit.within : null;
      const span = placeNew(entries, coverage, policy.history.newCropDays, within);
      if (span === null) return keep({ kind: "yearFull" });
      const entry: Entry = {
        kind: "crop",
        id: nextEntryId(entries, "crop"),
        crop,
        planted: addDays(coverage.start, span.a),
        harvested: addDays(coverage.start, span.b - 1),
        plantedPrecision: "approximate",
        harvestedPrecision: "approximate",
      };
      const note: EditNote = edit.crop.kind === "unsupported" && crop.kind === "catalogue"
        ? { kind: "listedInstead", id: crop.cropPurposeId, entryId: entry.id }
        : { kind: "entryAdded", entryId: entry.id };
      return write({ ...draft, history: recordedOver(coverage, [...entries, entry]) }, note);
    }

    case "step": {
      if (draft.planningStart === undefined || draft.history?.kind !== "recorded") return keep();
      const stepped = stepEntry(draft.history.entries, edit.entryId, edit.end, edit.targetDay, coverageFor(draft.planningStart));
      const note: EditNote = { kind: "stepped", entryId: edit.entryId, stop: stepped.stop };
      if (stepped.entries === draft.history.entries) return keep(note);
      return write({ ...draft, history: { ...draft.history, entries: stepped.entries } }, note);
    }

    case "saveDates": {
      const history = draft.history;
      const entry = history?.kind === "recorded" ? history.entries.find(other => other.id === edit.entryId) : undefined;
      if (history?.kind !== "recorded" || entry?.kind !== "crop") return keep();
      const problem = datesProblem(editor, edit.entryId, edit.dates);
      if (problem !== null) return keep({ kind: "datesRefused", problem });
      const precision = edit.dates.approximate ? "approximate" : "exact";
      const crop: CropRef = entry.crop.kind === "unsupported"
        ? { kind: "unsupported", label: cleanName(edit.dates.label ?? entry.crop.label) }
        : entry.crop;
      const saved: Entry = {
        ...entry,
        crop,
        planted: edit.dates.planted,
        harvested: edit.dates.harvested,
        plantedPrecision: precision,
        harvestedPrecision: precision,
      };
      const entries = sortEntries(history.entries.map(other => (other.id === entry.id ? saved : other)));
      return write({ ...draft, history: { ...history, entries } }, { kind: "datesSaved", entryId: entry.id });
    }

    case "markEmpty": {
      if (draft.planningStart === undefined || draft.history?.kind === "skipped") return keep();
      const coverage = coverageFor(draft.planningStart);
      const entries = recordedEntries(draft);
      if (!isFreeSpan(edit.gap, entries, coverage) || entries.length >= inputLimits.historyEntries) return keep();
      const entry: Entry = {
        kind: "fallow",
        id: nextEntryId(entries, "empty"),
        start: addDays(coverage.start, edit.gap.a),
        endExclusive: addDays(coverage.start, edit.gap.b),
      };
      const undo: DraftEdit = { kind: "restoreHistory", history: draft.history ?? null };
      return write({ ...draft, history: recordedOver(coverage, [...entries, entry]) }, { kind: "markedEmpty", entry, undo });
    }

    case "removeEntry": {
      const history = draft.history;
      const entry = history?.kind === "recorded" ? history.entries.find(other => other.id === edit.entryId) : undefined;
      if (history?.kind !== "recorded" || entry === undefined) return keep();
      const undo: DraftEdit = { kind: "restoreHistory", history };
      const entries = history.entries.filter(other => other.id !== entry.id);
      const next = entries.length === 0 ? without(draft, "history") : { ...draft, history: { ...history, entries } };
      return write(next, entry.kind === "fallow" ? { kind: "markedUnsure", entry, undo } : { kind: "entryRemoved", entry, undo });
    }

    case "alternative": {
      const mode = historyMode(draft);
      if (mode === edit.choice) return write(withHistory(draft, editor.setAside), none, null);
      let history: History;
      if (edit.choice === "skipped") history = { kind: "skipped" };
      else if (draft.planningStart === undefined) return keep({ kind: "needDate" });
      else history = wholeYearEmpty(coverageFor(draft.planningStart));
      if (mode !== "recorded" || draft.history?.kind !== "recorded") return write({ ...draft, history });
      const undo: DraftEdit = { kind: "restoreHistory", history: draft.history };
      return write({ ...draft, history }, { kind: "setAside", choice: edit.choice, undo }, draft.history);
    }

    case "restoreHistory":
      return write(withHistory(draft, edit.history), none, null);
  }
}

/** The date sheet's own check, shared with applyEdit so the sheet and the reducer can never disagree. */
export function datesProblem(editor: Editor, entryId: string, dates: DatesInput): DatesProblem | null {
  const history = editor.draft.history;
  if (history?.kind !== "recorded") return null;
  const entry = history.entries.find(other => other.id === entryId);
  if (entry === undefined) return null;
  if (entry.kind === "crop" && entry.crop.kind === "unsupported") {
    const problem = nameProblem(dates.label ?? entry.crop.label);
    if (problem !== null) return problem;
  }
  if (dates.harvested < dates.planted) return { kind: "order" };
  const coverage = editor.draft.planningStart === undefined ? coverageOf(history) : coverageFor(editor.draft.planningStart);
  const last = addDays(coverage.endExclusive, -1);
  if (dates.planted < coverage.start || dates.harvested > last) return { kind: "window", first: coverage.start, last };
  const span = { a: daysBetween(coverage.start, dates.planted), b: daysBetween(coverage.start, dates.harvested) + 1 };
  const hit = history.entries.find(other => other.id !== entryId && sharesDays(span, spanOf(other, coverage)));
  return hit === undefined ? null : { kind: "overlap", with: hit };
}

/** Why a typed crop name cannot be used: blank, or longer than policy.history.nameMaxChars letters. */
export function nameProblem(raw: string): DatesProblem | null {
  const name = cleanName(raw);
  if (name === "") return { kind: "name" };
  return [...name].length > policy.history.nameMaxChars ? { kind: "nameLong" } : null;
}

/** A typed crop name as it is stored: trimmed, with runs of spaces made one. */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** The draft an initialInput seeds: every answer, without schemaVersion, entries sorted (I2). */
export function draftOf(input: FarmInput): Draft {
  return normalizeDraft(input);
}

/** True when the farmer has given at least one answer. */
export function hasAnswers(draft: Draft | null | undefined): draft is Draft {
  return draft !== null && draft !== undefined && answerKeys.some(key => draft[key] !== undefined);
}

/** True when two drafts hold the same answers, whatever their key order. Drives the Change inputs rule. */
export function sameAnswers(a: Draft, b: Draft): boolean {
  return canonical(normalizeDraft(a)) === canonical(normalizeDraft(b));
}

/**
 * Repair a draft read from storage so I1 to I5 hold: re-derive the window from planningStart, sort entries, drop an
 * empty recorded history, drop an empty or repeated crop. Never drops a picked crop or an entry. Pure and idempotent.
 * F4 validates the stored envelope, so this trusts the port's type and repairs only F1's own invariants.
 */
export function normalizeDraft(draft: Partial<FarmInput>): Draft {
  const planningStart = draft.planningStart === undefined ? null : isoDate(draft.planningStart);
  let next: Draft = {
    ...(draft.field === undefined ? {} : { field: draft.field }),
    ...(draft.water === undefined ? {} : { water: draft.water }),
    ...(planningStart === null ? {} : { planningStart }),
  };
  next = withCrops(next, [...new Set(draft.cropPurposeIds ?? [])]);
  return withHistory(next, draft.history ?? null);
}

/** The window of the draft, or null before a field-ready date. While the date is cleared, the stored window stands in. */
export function windowOf(draft: Draft): Coverage | null {
  if (draft.planningStart !== undefined) return coverageFor(draft.planningStart);
  return draft.history?.kind === "recorded" ? coverageOf(draft.history) : null;
}

/** "recorded" | "empty" (one fallow over the whole window) | "skipped" | "none". Drives page 4's three modes. */
export function historyMode(draft: Draft): "recorded" | "empty" | "skipped" | "none" {
  const history = draft.history;
  if (history === undefined) return "none";
  if (history.kind === "skipped") return "skipped";
  return isEmptyAllYear(history) ? "empty" : "recorded";
}

export function recordedEntries(draft: Draft): readonly Entry[] {
  return draft.history?.kind === "recorded" ? draft.history.entries : [];
}

function withCrops(draft: Draft, ids: readonly CropPurposeId[]): Draft {
  return ids.length === 0 ? without(draft, "cropPurposeIds") : { ...draft, cropPurposeIds: ids };
}

/** Set the history so I1, I2 and I5 hold: follow the date's window, sort, and store no empty recorded history. */
function withHistory(draft: Draft, history: History | null): Draft {
  if (history === null) return without(draft, "history");
  if (history.kind === "skipped") return { ...draft, history };
  if (history.entries.length === 0) return without(draft, "history");
  const moved = draft.planningStart === undefined ? history : moveWindow(history, draft.planningStart);
  if (moved.kind === "skipped") return { ...draft, history: moved };
  const entries = sortEntries(moved.entries);
  const same = entries.every((entry, i) => entry === moved.entries[i]);
  return { ...draft, history: same ? moved : { ...moved, entries } };
}

function without(draft: Draft, key: AnswerKey): Draft {
  if (draft[key] === undefined) return draft;
  const { [key]: _removed, ...rest } = draft;
  return rest;
}

function recordedOver(coverage: Coverage, entries: readonly Entry[]): RecordedHistory {
  return { kind: "recorded", start: coverage.start, endExclusive: coverage.endExclusive, entries: sortEntries(entries) };
}

function wholeYearEmpty(coverage: Coverage): RecordedHistory {
  return recordedOver(coverage, [{ kind: "fallow", id: "empty-1", start: coverage.start, endExclusive: coverage.endExclusive }]);
}

function coverageOf(history: RecordedHistory): Coverage {
  return { start: history.start, endExclusive: history.endExclusive, days: daysBetween(history.start, history.endExclusive) };
}

/** A typed name as a crop: the listed crop when the name is a listed label (any case), else an unsupported crop. */
function listedOrNamed(raw: string, catalogue: Catalogue | null): CropRef {
  const label = cleanName(raw);
  const listed = catalogue?.entries.find(entry => entry.label.toLocaleLowerCase() === label.toLocaleLowerCase());
  return listed === undefined ? { kind: "unsupported", label } : { kind: "catalogue", cropPurposeId: listed.id };
}

/** A tapped gap is used only while it is still inside the window and free, so a stale tap cannot make an overlap. */
function isFreeSpan(span: Span, entries: readonly Entry[], coverage: Coverage): boolean {
  return span.a >= 0 && span.b <= coverage.days && span.a < span.b && !entries.some(entry => sharesDays(span, spanOf(entry, coverage)));
}

function sharesDays(p: Span, q: Span): boolean {
  return Math.max(p.a, q.a) < Math.min(p.b, q.b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)))
      : inner);
}
