"use client";
// Page 4, "Your rotation": the field-ready date first, then last year's 12 months, then the two alternatives.
import type { ReactElement } from "react";
import type { Controller } from "../controller";
import type { Coverage, CropEntry, Entry, Span } from "../model/timeline";

/**
 * Top to bottom (prototype Rotation, read by function name):
 *  1. "Fix these first" (only after a blocked Make my plan): <section id="err-sum" tabIndex={-1}> with buttons
 *     "Fix on page N: …" (c.go(N, the issue's control)) and "On this page: …". Page-null issues ("unreadable",
 *     "too_large") are listed here without a button.
 *  2. Submit failure panel (send.unavailable): title (id="submit-fail", tabIndex -1) + body + "When you’re ready, tap
 *     Make my plan again." for retryable failures. No second button (known issue 9).
 *  3. A running request (editing.job): "A plan is being made from your answers. See how it’s going" (c.showMaking).
 *  4. Date card: <label for="ready-date">When is your field ready to plant?</label>, hint, <input type="date"
 *     id="ready-date" required> with no default value (no invented date, docs/F1-CHECK.md), its issue, the soft
 *     past-date note (todayLocal), and "Your plan covers {start} to {planLastDay}" (aria-live polite).
 *     The date input wrapper has the solid focus ring (known issue 18).
 *  5. History card: HistoryEditor, or the empty-all-year / skipped panel with "Show last year’s entries again" or
 *     "Add last year’s crops instead", or "The timeline appears after you choose the date your field is ready."
 *  6. "Or, instead": two toggle buttons (aria-pressed) "My field was empty all year" and "I don’t remember", and the
 *     note "Skipping is not the same as an empty field…". "Empty all year" without a date focuses the date input.
 *  dock: the one-line failure or issue count, then "Make my plan" (aria-busy and "Sending your answers…" while sending).
 *        The dock is at most half the screen and scrolls inside itself (known issue 14).
 */
export function RotationPage(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * The timeline (prototype Overview + lanes + spots). Rendered only with a window and the recorded mode.
 *  - Overview strip (aria-hidden, pointer only): months (Intl short or narrow by width), year marks, hatched Not sure
 *    gaps, outlined empty times, crop segments. Every tap here has a button twin below (spec.md:46).
 *  - Lanes <ol class="ly-rows" role="list" aria-label="Crops in those 12 months">, one per crop entry, in draft order
 *    (= planting order, I2): name, "Planted [about] {date}, harvested [about] {date}", "Not on our list: shown, but not
 *    scored" for unsupported crops, the track with grid lines, the bar (aria-hidden), two Handles, the lane's issue,
 *    "Change dates" (sr: " for {crop}").
 *  - sr-only keys help (id="ly-keys"), "Add a crop" (id="ly-add").
 *  - "Not sure and empty times": each gap "Not sure · {range} · {n} days" + "The field was empty then"; each fallow
 *    "Empty · {first} to {endExclusive - 1}" + "Mark as not sure". A fallow end shows as its last empty day, so farmers
 *    never see the exclusive end (grounding.md gotcha 6).
 */
export function HistoryEditor(props: { readonly c: Controller; readonly coverage: Coverage }): ReactElement {
  throw new Error("not implemented");
}

/**
 * One end of a crop bar. role="slider", tabIndex 0, a 48px hit area with a 16px visible grip, touch-action none.
 * Placement (graft from candidate 2): each handle sits OUTSIDE its bar end. The planting handle's hit area ends where
 * the bar starts; the harvest handle's starts where the bar ends. The track is inset by one handle width on each side
 * (terrace.css .ly-track). So a one-day bar at 360px still has two separate 48px targets, and the 4-day inputFixture
 * bar can be grabbed at both ends (grounding.md gotcha 22). Each crop has its own lane, so handles never meet another bar's.
 *  aria-label     "{crop}: planting day" | "{crop}: harvest day, the last day in the field"
 *  aria-valuemin  0, aria-valuemax days - 1, aria-valuenow the day offset
 *  aria-valuetext "[about ]{long date}, {n} days in the field"; aria-describedby "ly-keys"
 *  id             domIdOf({ kind: "handle", entryId, end }) so Escape from its date sheet returns here (known issue 20)
 * Keys: ArrowRight/ArrowUp +1, ArrowLeft/ArrowDown -1, PageUp +7, PageDown -7, Home/End window edges -> c.edit(step);
 *       Enter/Space -> the date sheet for this end. A stop announces its reason in the status line.
 * Pointer: pointerdown captures (setPointerCapture when present, jsdom has none); travel under
 *       policy.history.dragThresholdPx is a tap and opens the date sheet for this end; beyond it each move dispatches
 *       step to dayAtPointer(clientX, track, days); pointerup announces the result (the persist effect saves).
 */
export function Handle(props: {
  readonly c: Controller;
  readonly entry: CropEntry;
  readonly end: "start" | "end";
  readonly coverage: Coverage;
  readonly track: () => DOMRect | null;
}): ReactElement {
  throw new Error("not implemented");
}

/** The bar body: drag to move the whole bar (pointer only; the date sheet is its keyboard twin). aria-hidden. */
export function Bar(props: { readonly c: Controller; readonly entry: Entry; readonly coverage: Coverage; readonly visible: Span }): ReactElement {
  throw new Error("not implemented");
}
