// The picker as one value and one pure function. No React, no MapLibre, no network.
//
//   update(picker, action) -> { picker, emit, focus }
//
// The globe, the flat plan and the corner list are three views of `Picker`, and all of them send `Action`s. The two
// outputs are derived in one function each, never set branch by branch:
//   emit   `emitted`: a farmer's action left a different field in `outline`. `adopt` never emits.
//   focus  `focusAfter`: the stage changed, the corner list opened or closed, or typed corners were refused.
// controller.ts carries a Step out inside the farmer's own event, so onChange runs once per accepted edit, also in
// React Strict Mode, and never from an effect.
//
// Invariants (tests/frontend/location/picker.test.ts):
//  P1 `stage: "marking"` always holds an Outline: the type says so. An edit that would break it is refused. The outline
//     stays the same object and the note says why, so the map, the plan, the corner list and the parent's value always
//     show the same valid field.
//  P2 `emit` is non-null exactly when an action other than adopt left a different field in `outline`, and it equals
//     fieldOf(outline). Every accepted farmer edit therefore reaches the parent, and nothing else does.
//  P3 Adopting the field the picker already holds returns the same picker object (no echo, no loop).
//  P4 "Search again" keeps the outline. The parent keeps it too, until "Mark my field" or typed corners replace it, and
//     "Back to my field" returns to that same object (Smaller and Bigger still work on a box).
//  P5 look.seq rises only when the camera should move: adopt, pick, a tap while finding, mark, back, resize, typed.
//     Dragging, adding or removing a corner never moves the camera.
//  P6 No action reads the key, a URL or the map. A keystroke in the search box or the corner list is not an action.
import { boxAround, insertCorner, markOutline, markSaved, moveCorner, removeCorner, sameField, stepSize, withinPolicy } from "./outline";
import type { BoxSize, Corners, Field, LngLat, Marked, ShapeProblem } from "./outline";
import { labelFor } from "./words";

// ---------------------------------------------------------------------------------------------------------------------
// The place and the outline
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Where the farmer said the farm is. The kind decides the precision words (docs/cards/F2.md:33) and the label.
 * No kind is ever sent to a geocoder: there is no reverse lookup of a tapped, typed, located or saved point.
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

/** Why the phone's location could not be read. views/find.tsx LocatePanel holds this; words.ts says each. */
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

/** What the map area is. Reported by views/map.tsx and globe.ts. A plan never turns back into a globe in one visit. */
export type Surface =
  | { readonly kind: "starting" }
  /** pictures: "none" when no picture source is configured; "failed" when the pictures did not load. */
  | { readonly kind: "globe"; readonly pictures: "none" | "loading" | "shown" | "failed" }
  /** The flat plan stands in: no WebGL2, the WebGL context was lost, or the map could not start. */
  | { readonly kind: "plan"; readonly why: "no_webgl" | "lost" | "failed" };

/** The last thing the picker said. Shown where it belongs and in the live region. The next action clears or replaces it. */
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
  /** "Use these corners": the list, already parsed (coordinates.ts cornersOfRows). */
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
 * The picker as it opens.
 *  value null      -> finding, nothing marked, the world in view.
 *  value drawable  -> marking it: markSaved keeps ring, lookup and label exactly; made saved; place { saved }. No emit.
 *  value refused   -> finding with candidate { saved, label, at: lookup } and note saved_unusable: the farmer is told,
 *                     "Mark my field" puts a box where the saved field was, and the parent's value is left alone.
 */
export function openPicker(value: Field | null): Picker {
  throw new Error("not implemented");
}

/** Every transition, plus the two derived outputs. Pure and total. */
export function update(picker: Picker, action: Action): Step {
  const next = transition(picker, action);
  return { picker: next, emit: emitted(picker, next, action), focus: focusAfter(picker, next, action) };
}

/**
 * Pure and total. An action that does not apply in the current stage returns the SAME picker object, so a late or
 * doubled action (Strict Mode, a drag that ends after "Search again") changes nothing.
 *
 *  adopt(null)      finding, no outline, no candidate, look world
 *  adopt(field)     outline and sameField(field, fieldOf(outline)): unchanged (P3). Else as openPicker(field), keeping
 *                   surface and listOpen; look field (or place when the value cannot be drawn)
 *  pick(place)      finding: candidate place, note place, look place
 *  tap(at)          finding: candidate { tapped, at }, note place, look place
 *                   marking a box: box at `at` with the same size, made.on "tap", place kept, note marked
 *                   marking anything else: selected null. A tap never moves corners the farmer placed.
 *  mark             finding with a candidate: box(candidate.at, 1 ha), place candidate, label labelFor(candidate,
 *                   lookup) -> marking, note marked, look field. It replaces the held outline.
 *  back             finding with an outline: marking that same Outline object, candidate dropped, look field
 *  again            marking: finding, the same outline, candidate null. The camera stays.
 *  resize(step)     marking a box: stepSize null -> note size_end (the button is never disabled: it says why);
 *                   else box(lookup, next size), label kept, note marked, look field
 *  select(corner)   marking: selected (out of range -> null)
 *  move             marking: markOutline(moveCorner(corners, corner, to), keep lookup), then withinPolicy
 *  insert           marking: at limits.corners refused too_many; else markOutline(insertCorner(corners, selected),
 *                   keep lookup); selected = the new corner
 *  remove(corner)   marking: at 3 corners refused too_few; else markOutline(removeCorner(...), keep lookup); selected null
 *                   move, insert and remove: ok -> made drawn, label kept, note marked; refused -> note refused "map"
 *  typed(corners)   markOutline(corners, choose), then withinPolicy. ok -> marking { made typed, place = candidate ??
 *                   outline?.place ?? null, label labelFor(place, lookup) }, listOpen false, note typed, look field.
 *                   refused -> note refused "typed", nothing else changes
 *  list(open)       listOpen
 *  surface(s)       surface. A plan stays a plan: a "globe" report after "plan" is dropped.
 *  pictures(state)  globe surface: pictures = state; otherwise unchanged
 * A box is markOutline(boxAround(at, hectares), keep at): its lookup is exactly the place's point or the tap.
 * Every applied action clears `note` unless it sets one.
 */
function transition(picker: Picker, action: Action): Picker {
  throw new Error("not implemented");
  // TODO: one exhaustive switch on action.kind with a `never` default. It calls only the outline functions imported
  //       above (boxAround, insertCorner, markOutline, markSaved, moveCorner, removeCorner, stepSize, withinPolicy),
  //       sameField and labelFor.
}

/** The emission rule, in one place (P2). */
function emitted(before: Picker, after: Picker, action: Action): Field | null {
  if (action.kind === "adopt" || after.outline === null || after.outline === before.outline) return null;
  const field = fieldOf(after.outline);
  return before.outline !== null && sameField(field, fieldOf(before.outline)) ? null : field;
}

/**
 * The focus rule, in one place:
 *  typed accepted, or finding -> marking   "heading"
 *  marking -> finding                      "search"
 *  the list opened                         "list"
 *  the list closed by list(false)          "list_opener"
 *  a new note refused from "typed"         "problem"
 *  anything else                           null (focus stays where the farmer put it, also after adopt)
 */
function focusAfter(before: Picker, after: Picker, action: Action): Focus | null {
  throw new Error("not implemented");
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
  throw new Error("not implemented");
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
  throw new Error("not implemented");
}
