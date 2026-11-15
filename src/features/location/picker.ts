// The picker as one value and one pure function: update(picker, action) -> { picker, emit, focus }. No React, no
// MapLibre, no network and no key. The globe, the flat plan and the corner list are three views of one Picker and send
// the same Actions. A keystroke is not an action, so nothing can be sent while the farmer types.
// `emit` and `focus` are derived after each transition, never set branch by branch, so a new action cannot forget to
// emit. controller.ts calls onChange inside the farmer's own event, never from an effect.
// Invariants (tests/frontend/location/picker.test.ts):
//  P1 Marking always holds a valid outline. A refused edit keeps the same outline object and the note says why, so the
//     map, the plan, the corner list and the parent's value always show the same field.
//  P2 emit is the outline's field exactly when an action other than adopt left a different field there.
//  P3 Adopting the field the picker already holds returns the same picker, so a parent's echo causes nothing.
//  P4 "Search again" keeps the outline, and so does the parent, until "Mark my field" or typed corners replace it.
//  P5 look.seq rises only when the camera should move: adopt, pick, a tap while finding, mark, back, resize, typed.
//  P6 No action reads the key, a URL or the map.
import { boxAround, insertCorner, markOutline, markSaved, moveCorner, removeCorner, sameField, stepSize, withinPolicy } from "./outline";
import type { BoxSize, Corners, Field, LngLat, LookupRule, Marked, MarkResult, ShapeProblem } from "./outline";
import { labelFor } from "./words";

// ---------------------------------------------------------------------------------------------------------------------
// The place and the outline
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Where the farmer said the farm is. The kind decides the precision words and the label. No kind is ever sent to a
 * geocoder: there is no reverse lookup of a tapped, typed, located or saved point.
 */
export type Place =
  /** A search row: the middle of a named place, from MapTiler. */
  | { readonly kind: "found"; readonly name: string; readonly where: string; readonly at: LngLat }
  /** Typed in the search box, such as "-6.326, 108.32". Needs no key and no network. */
  | { readonly kind: "position"; readonly at: LngLat }
  /** A tap on the globe. */
  | { readonly kind: "tapped"; readonly at: LngLat }
  /** The phone's location, once, with the accuracy it reported. */
  | { readonly kind: "gps"; readonly at: LngLat; readonly accuracyM: number }
  /** The value prop's label and lookup. */
  | { readonly kind: "saved"; readonly label: string; readonly at: LngLat };

export type FoundPlace = Extract<Place, { readonly kind: "found" }>;

/** Why the phone's location could not be read. */
export type LocateFailure = "denied" | "timeout" | "unavailable" | "unsupported";

/** How the outline on screen came to be. Decides the heading, the tools, what a tap does and the precision sentence. */
export type Made =
  /** The starting box. `on`: still on the place's point, or moved by a tap. A tap moves it; Smaller and Bigger resize it. */
  | { readonly kind: "box"; readonly hectares: BoxSize; readonly on: "place" | "tap" }
  /** The farmer moved, added or removed a corner on the map. The corners are theirs now: taps and size buttons stop. */
  | { readonly kind: "drawn" }
  /** "Use these corners". */
  | { readonly kind: "typed" }
  /** It arrived through `value` (a saved draft, Change inputs, the fixture lab). */
  | { readonly kind: "saved" };

/** The field the picker holds: a valid outline, its name, and where it came from. */
export interface Outline {
  readonly marked: Marked;
  /** "Field near …" or "Field at …" (words.ts labelFor), or a saved label exactly as given. */
  readonly label: string;
  readonly made: Made;
  /** Where the farmer said the farm is when this outline began. Names typed-corner labels and the precision words. */
  readonly place: Place | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The rest of the state
// ---------------------------------------------------------------------------------------------------------------------

/** What the map area is. A plan never turns back into a globe in one visit. */
export type Surface =
  | { readonly kind: "starting" }
  /** pictures: "none" when no picture source is configured; "failed" when the pictures did not load. */
  | { readonly kind: "globe"; readonly pictures: "none" | "loading" | "shown" | "failed" }
  /** The flat plan stands in: no WebGL2, the WebGL context was lost, or the map could not start. */
  | { readonly kind: "plan"; readonly why: "no_webgl" | "lost" | "failed" };

/** The last thing the picker said. Shown where it belongs and in the live region, until the farmer acts again. */
export type Note =
  | { readonly kind: "place"; readonly place: Place }
  | { readonly kind: "marked" }
  | { readonly kind: "typed"; readonly corners: number }
  | { readonly kind: "size_end"; readonly step: -1 | 1 }
  | { readonly kind: "refused"; readonly from: "map" | "typed"; readonly problem: ShapeProblem; readonly corner: number | null }
  | { readonly kind: "saved_unusable"; readonly problem: ShapeProblem };

/** Where the camera should be. A surface moves its camera when `seq` changes, never otherwise (P5). */
export interface Look {
  readonly seq: number;
  readonly at: "world" | "place" | "field";
}

interface Shared {
  readonly surface: Surface;
  /** The corner list is open. With the flat plan it always shows (listShown). */
  readonly listOpen: boolean;
  readonly note: Note | null;
  readonly look: Look;
}

export type Picker = Shared & (
  /** Searching. `outline`: the field still marked (the parent holds it too). `candidate`: a new place, not yet marked. */
  | { readonly stage: "finding"; readonly outline: Outline | null; readonly candidate: Place | null }
  /** Marking. `selected`: the corner chosen by a tap, for "Remove corner N" and "Add a corner" after it. */
  | { readonly stage: "marking"; readonly outline: Outline; readonly selected: number | null }
);

// ---------------------------------------------------------------------------------------------------------------------
// Actions: the one vocabulary of every view
// ---------------------------------------------------------------------------------------------------------------------

export type Action =
  /** `value` changed, or the picker mounted. Never emits (P3). */
  | { readonly kind: "adopt"; readonly field: Field | null }
  /** A search row, a position typed in the search box, or a GPS fix. Finding only. */
  | { readonly kind: "pick"; readonly place: Place }
  /** The globe: picks the spot while finding; moves the starting box while marking a box; else clears the choice. */
  | { readonly kind: "tap"; readonly at: LngLat }
  /** "Mark my field": a 1 hectare box at the candidate. It replaces the field that was marked. */
  | { readonly kind: "mark" }
  /** "Back to my field": marking the held outline again, unchanged. */
  | { readonly kind: "back" }
  /** "Search again": finding. The field stays marked (P4). */
  | { readonly kind: "again" }
  /** "Smaller", "Bigger": the starting box only. */
  | { readonly kind: "resize"; readonly step: -1 | 1 }
  /** A tap on a corner handle, or away from the corners (null). */
  | { readonly kind: "select"; readonly corner: number | null }
  /** A corner dropped on the map. `to` may be wrapped or not. */
  | { readonly kind: "move"; readonly corner: number; readonly to: LngLat }
  /** "Add a corner": after the chosen corner, else on the longest side. */
  | { readonly kind: "insert" }
  /** "Remove corner N". */
  | { readonly kind: "remove"; readonly corner: number }
  /** "Use these corners": the list, already parsed. */
  | { readonly kind: "typed"; readonly corners: Corners }
  /** "Type the corners" or "Type your field’s corners instead" (true), "Close" (false). */
  | { readonly kind: "list"; readonly open: boolean }
  | { readonly kind: "surface"; readonly surface: Surface }
  | { readonly kind: "pictures"; readonly state: "shown" | "failed" };

/** What the globe sends. A subset of Action, so the map has no events of its own to translate. */
export type SurfaceAction = Extract<Action, { readonly kind: "tap" | "select" | "move" | "pictures" | "surface" }>;

/** Where focus goes after a step. The controller holds the elements. */
export type Focus =
  | "heading"       // the slot's h2 while marking
  | "search"        // the search input, back in finding
  | "list"          // the corner list's heading, when it opens
  | "list_opener"   // the button that opened the list, when it closes
  | "problem";      // the typed shape's problem (role="alert")

export interface Step {
  readonly picker: Picker;
  /** The field for onChange, or null (P2). */
  readonly emit: Field | null;
  readonly focus: Focus | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The picker as it opens. A saved value that can be drawn is marked exactly as given and never emitted. One that cannot
 * be drawn leaves the parent's value alone: its place becomes the candidate, so "Mark my field" puts a box there.
 */
export function openPicker(value: Field | null): Picker {
  return opened(value, { surface: { kind: "starting" }, listOpen: false }, 0);
}

/** Every transition, plus the two derived outputs. Pure and total. */
export function update(picker: Picker, action: Action): Step {
  const changed = transition(picker, action);
  const next = sameEntries(picker, changed) ? picker : changed;
  return { picker: next, emit: emitted(picker, next, action), focus: focusAfter(picker, next, action) };
}

type Finding = Extract<Picker, { readonly stage: "finding" }>;
type Marking = Extract<Picker, { readonly stage: "marking" }>;

/**
 * An action that does not apply in the current stage returns the same picker, so a late or doubled action (Strict
 * Mode, a drag that ends after "Search again") changes nothing. A farmer's action clears the note unless it sets one.
 * A surface or pictures report keeps it: the map finishing loading must not hide why the last edit was refused.
 */
function transition(picker: Picker, action: Action): Picker {
  switch (action.kind) {
    case "adopt":
      return adopt(picker, action.field);
    case "pick":
      if (picker.stage !== "finding") return picker;
      return finding(picker, picker.outline, action.place, { kind: "place", place: action.place }, moved(picker, "place"));
    case "tap":
      return tap(picker, action.at);
    case "mark":
      return picker.stage === "finding" && picker.candidate ? markAt(picker, picker.candidate) : picker;
    case "back":
      return picker.stage === "finding" && picker.outline ? marking(picker, picker.outline, null, moved(picker, "field")) : picker;
    case "again":
      return picker.stage === "marking" ? finding(picker, picker.outline, null, null, picker.look) : picker;
    case "resize":
      return picker.stage === "marking" ? resize(picker, action.step) : picker;
    case "select":
      if (picker.stage !== "marking") return picker;
      return { ...picker, selected: action.corner !== null && holds(picker, action.corner) ? action.corner : null, note: null };
    case "move":
      if (picker.stage !== "marking" || !holds(picker, action.corner)) return picker;
      return drawn(picker, moveCorner(picker.outline.marked.corners, action.corner, action.to), picker.selected);
    case "insert": {
      if (picker.stage !== "marking") return picker;
      const inserted = insertCorner(picker.outline.marked.corners, picker.selected);
      return drawn(picker, inserted.corners, inserted.index);
    }
    case "remove":
      if (picker.stage !== "marking" || !holds(picker, action.corner)) return picker;
      return drawn(picker, removeCorner(picker.outline.marked.corners, action.corner), null);
    case "typed":
      return typed(picker, action.corners);
    case "list":
      return { ...picker, listOpen: action.open, note: null };
    case "surface":
      if (picker.surface.kind === "plan" && action.surface.kind !== "plan") return picker;
      return sameEntries(picker.surface, action.surface) ? picker : { ...picker, surface: action.surface };
    case "pictures":
      if (picker.surface.kind !== "globe" || picker.surface.pictures === action.state) return picker;
      return { ...picker, surface: { kind: "globe", pictures: action.state } };
  }
}

function opened(value: Field | null, keep: Pick<Picker, "surface" | "listOpen">, seq: number): Picker {
  const { surface, listOpen } = keep;
  if (value === null) {
    return { surface, listOpen, note: null, look: { seq, at: "world" }, stage: "finding", outline: null, candidate: null };
  }
  const place: Place = { kind: "saved", label: value.label, at: value.lookup };
  const result = markSaved(value);
  if (!result.ok) {
    const note: Note = { kind: "saved_unusable", problem: result.problem };
    return { surface, listOpen, note, look: { seq, at: "place" }, stage: "finding", outline: null, candidate: place };
  }
  const outline: Outline = { marked: result.marked, label: value.label, made: { kind: "saved" }, place };
  return { surface, listOpen, note: null, look: { seq, at: "field" }, stage: "marking", outline, selected: null };
}

/** A null value drops only what came from a value: the farmer's own new place survives it. */
function adopt(picker: Picker, field: Field | null): Picker {
  if (field === null && picker.stage === "finding" && !picker.outline && picker.candidate?.kind !== "saved") return picker;
  if (field !== null && picker.outline !== null && sameField(field, fieldOf(picker.outline))) return picker;
  return opened(field, picker, picker.look.seq + 1);
}

function tap(picker: Picker, at: LngLat): Picker {
  if (picker.stage === "finding") {
    const place: Place = { kind: "tapped", at };
    return finding(picker, picker.outline, place, { kind: "place", place }, moved(picker, "place"));
  }
  const { outline } = picker;
  if (outline.made.kind !== "box") return { ...picker, selected: null, note: null };
  const made: Made = { ...outline.made, on: "tap" };
  const result = judged(boxAround(at, outline.made.hectares), { kind: "keep", at });
  if (!result.ok) return { ...picker, note: refusal("map", result) };
  const label = labelFor(outline.place, result.marked.lookup);
  return marking(picker, { ...outline, marked: result.marked, label, made }, { kind: "marked" }, picker.look, null);
}

function markAt(picker: Finding, place: Place): Picker {
  const result = judged(boxAround(place.at, 1), { kind: "keep", at: place.at });
  if (!result.ok) return { ...picker, note: refusal("map", result) };
  const { marked } = result;
  const outline: Outline = { marked, label: labelFor(place, marked.lookup), made: { kind: "box", hectares: 1, on: "place" }, place };
  return marking(picker, outline, { kind: "marked" }, moved(picker, "field"));
}

/** Smaller and Bigger. At an end the button still answers, in words, instead of being disabled. */
function resize(picker: Marking, step: -1 | 1): Picker {
  const { outline } = picker;
  if (outline.made.kind !== "box") return picker;
  const hectares = stepSize(outline.made.hectares, step);
  if (hectares === null) return { ...picker, note: { kind: "size_end", step } };
  const at = outline.marked.lookup;
  const result = judged(boxAround(at, hectares), { kind: "keep", at });
  if (!result.ok) return { ...picker, note: refusal("map", result) };
  const made: Made = { ...outline.made, hectares };
  return marking(picker, { ...outline, marked: result.marked, made }, { kind: "marked" }, moved(picker, "field"), picker.selected);
}

/** A corner moved, added or removed on the map. From then on the corners are the farmer's, so taps and sizes stop. */
function drawn(picker: Marking, corners: Corners, selected: number | null): Picker {
  const { outline } = picker;
  const result = judged(corners, { kind: "keep", at: outline.marked.lookup });
  if (!result.ok) return { ...picker, note: refusal("map", result) };
  return marking(picker, { ...outline, marked: result.marked, made: { kind: "drawn" } }, { kind: "marked" }, picker.look, selected);
}

function typed(picker: Picker, corners: Corners): Picker {
  const result = judged(corners, { kind: "choose" });
  if (!result.ok) return { ...picker, note: refusal("typed", result) };
  const place = picker.stage === "finding" ? picker.candidate ?? picker.outline?.place ?? null : picker.outline.place;
  const outline: Outline = { marked: result.marked, label: labelFor(place, result.marked.lookup), made: { kind: "typed" }, place };
  return marking({ ...picker, listOpen: false }, outline, { kind: "typed", corners: corners.length }, moved(picker, "field"));
}

/** markOutline, then F2's own size policy: every outline the farmer makes goes through both. */
function judged(corners: Corners, rule: LookupRule): MarkResult {
  const result = markOutline(corners, rule);
  if (!result.ok) return result;
  const problem = withinPolicy(result.marked);
  return problem ? { ok: false, problem, corner: null } : result;
}

function refusal(from: "map" | "typed", result: Extract<MarkResult, { ok: false }>): Note {
  return { kind: "refused", from, problem: result.problem, corner: result.corner };
}

function finding(from: Picker, outline: Outline | null, candidate: Place | null, note: Note | null, look: Look): Finding {
  return { surface: from.surface, listOpen: from.listOpen, note, look, stage: "finding", outline, candidate };
}

function marking(from: Picker, outline: Outline, note: Note | null, look: Look, selected: number | null = null): Marking {
  return { surface: from.surface, listOpen: from.listOpen, note, look, stage: "marking", outline, selected };
}

function moved(picker: Picker, at: Look["at"]): Look {
  return { seq: picker.look.seq + 1, at };
}

function holds(picker: Marking, corner: number): boolean {
  return Number.isInteger(corner) && corner >= 0 && corner < picker.outline.marked.corners.length;
}

function sameEntries<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]));
}

/** The emission rule, in one place (P2). */
function emitted(before: Picker, after: Picker, action: Action): Field | null {
  if (action.kind === "adopt" || after.outline === null || after.outline === before.outline) return null;
  const field = fieldOf(after.outline);
  return before.outline !== null && sameField(field, fieldOf(before.outline)) ? null : field;
}

/** Focus follows the farmer's place on the page; adopt never moves it. */
function focusAfter(before: Picker, after: Picker, action: Action): Focus | null {
  if (action.kind === "adopt" || after === before) return null;
  if (after.note !== before.note && after.note?.kind === "refused" && after.note.from === "typed") return "problem";
  if (action.kind === "typed" || (before.stage === "finding" && after.stage === "marking")) return "heading";
  if (before.stage === "marking" && after.stage === "finding") return "search";
  if (action.kind === "list" && after.listOpen !== before.listOpen) return action.open ? "list" : "list_opener";
  return null;
}

/** The wire value of an outline. The only place a FarmInput["field"] is assembled. */
export function fieldOf(outline: Outline): Field {
  return { ring: outline.marked.ring, lookup: outline.marked.lookup, label: outline.label };
}

// ---------------------------------------------------------------------------------------------------------------------
// Derived, never stored
// ---------------------------------------------------------------------------------------------------------------------

/** The slot's three screens. "box" and "corners" are both the marking stage, told apart by how the outline was made. */
export type Phase = "finding" | "box" | "corners";

export function phaseOf(picker: Picker): Phase {
  if (picker.stage === "finding") return "finding";
  return picker.outline.made.kind === "box" ? "box" : "corners";
}

/** The corner list shows when the farmer opened it, and always with the flat plan, where it is the way to edit. */
export function listShown(picker: Picker): boolean {
  return picker.listOpen || picker.surface.kind === "plan";
}

/** What a surface draws. The globe and the flat plan both take exactly this. */
export interface Scene {
  /** The candidate place while finding. */
  readonly pin: LngLat | null;
  /** The outline while marking. */
  readonly outline: Marked | null;
  readonly selected: number | null;
  /** Marking a starting box: a tap moves the box instead of clearing the choice. */
  readonly boxFollowsTap: boolean;
  readonly look: Look;
}

export function sceneOf(picker: Picker): Scene {
  if (picker.stage === "finding") {
    return { pin: picker.candidate?.at ?? null, outline: null, selected: null, boxFollowsTap: false, look: picker.look };
  }
  const { outline } = picker;
  return { pin: null, outline: outline.marked, selected: picker.selected, boxFollowsTap: outline.made.kind === "box", look: picker.look };
}

/** A visible explanation. Derived from the state, so a notice can never outlive its cause. */
export type Notice =
  /** No key: search by name and close-up pictures are not set up. */
  | { readonly kind: "no_key" }
  | { readonly kind: "no_globe"; readonly why: "no_webgl" | "lost" | "failed" }
  /** The map pictures did not load. */
  | { readonly kind: "no_pictures" }
  /** Finding while a field is still marked: its label, and "Back to my field". */
  | { readonly kind: "still_marked"; readonly label: string }
  /** From the note: a map edit was refused, or the saved value cannot be drawn. */
  | { readonly kind: "refused"; readonly problem: ShapeProblem }
  | { readonly kind: "saved_unusable"; readonly problem: ShapeProblem };

/** Every explanation that applies now, most important first. `keyed`: the provider key is set (provider.ts). */
export function noticesOf(picker: Picker, keyed: boolean): readonly Notice[] {
  const { surface, note } = picker;
  const notices: Notice[] = [];
  if (!keyed) notices.push({ kind: "no_key" });
  if (surface.kind === "plan") notices.push({ kind: "no_globe", why: surface.why });
  if (surface.kind === "globe" && surface.pictures === "failed") notices.push({ kind: "no_pictures" });
  if (note?.kind === "saved_unusable") notices.push({ kind: "saved_unusable", problem: note.problem });
  if (note?.kind === "refused" && note.from === "map") notices.push({ kind: "refused", problem: note.problem });
  if (picker.stage === "finding" && picker.outline) notices.push({ kind: "still_marked", label: picker.outline.label });
  return notices;
}
