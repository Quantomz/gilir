"use client";
// Finding a place: the search box, "Use my location", and the chosen place with "Mark my field".
// The search box and the location panel own their short-lived state here (candidate 1's split). The picker only hears
// the place they produce, through `pick`. Nothing here computes geometry.
import type { ReactElement } from "react";
import type { Axis, CoordError } from "../coordinates";
import type { Controller } from "../controller";
import type { LocateFailure, Place } from "../picker";
import type { SearchAnswer } from "../provider";

/**
 * The finding panel, top to bottom:
 *   1. SearchBox (always: with no key it still takes a typed position)
 *   2. <button class="btn btn-sub btn-block fp-way">Use my location</button> -> LocatePanel opens under it
 *   3. <p class="muted">Or turn the globe and tap near your farm.</p>   (only while the surface is the globe)
 *   4. <button class="btn btn-quiet" ref={focusRef("list_opener")}>Type your field’s corners instead</button>
 *      -> send list open
 * "Say the place" is not here: no voice (open decision 1).
 */
export function FindPanel(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/** The search box's own state. Module-private: tests see fetch calls, rows and words, never this. */
type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "short" }                                         // "Type at least 2 letters, then Search."
  | { readonly kind: "sending"; readonly seq: number }                 // spinner in the button, "Searching…"
  | { readonly kind: "answered"; readonly answer: SearchAnswer }       // rows, "No place found…", or a failure line
  | { readonly kind: "no_key" }                                        // a name was typed and no key is set
  | { readonly kind: "bad_position"; readonly axis: Axis; readonly error: CoordError };

/**
 * <form role="search" aria-label="Find your village or town" class="fp-search stack-xs" onSubmit>
 *   <label class="label" for={idOf("search")}>Village, town or area</label>
 *   <div class="search-row"><div class="input-wrap">                                (F1's classes)
 *     <input id={idOf("search")} ref={focusRef("search")} type="search" enterKeyHint="search" autoComplete="off"
 *            aria-describedby={idOf("search-hint")} placeholder="For example: Indramayu" />
 *     {text} <button type="button" class="fp-clear" aria-label="Clear">×</button>
 *   </div><button class="btn btn-primary fp-search-go" aria-busy={sending}>Search</button></div>
 *   <p id={idOf("search-hint")} class="hint">{keyed ? search.hint : search.hintNoKey}</p>
 *   rows: <ul id={idOf("results")} class="fp-results" aria-label="Places"> of <li><button class="fp-result"> (56 px):
 *         the name in bold, then "region, country". Tab reaches each row; Enter or a tap picks it (send pick).
 *         A plain list, not a combobox: nothing is suggested while typing, so there is no popup, and a row cannot
 *         close under a slow finger (candidate 2).
 *   one line instead of rows: short, none (none or nonePlan), the failure (searchFailed[why]), no_key (noKeyName),
 *         bad_position (coordError[axis][error])
 *   <p class="sr" role="status" aria-live="polite">Searching… | N places found. Choose one from the list. | No place found.</p>
 * </form>
 * The typed text is this component's own state; a keystroke is not an action, so nothing is ever sent while typing.
 * Submit: classifyQuery(text) ->
 *   short        -> short, nothing sent
 *   position     -> send pick { kind: "position", at } at once, with no request (works with no key)
 *   bad_position -> its words
 *   name         -> no key: no_key. Else abort the running request, seq + 1, sending, then
 *                   searchPlaces(key, text, signal).then(answer => keep it only if seq is still the latest).
 * Unmount aborts the running request. A failure is per request: the next press of Search tries again.
 */
export function SearchBox(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/** The location panel's own state. */
type Locate =
  | { readonly kind: "idle" }
  | { readonly kind: "asking" }                                        // the explanation is open, before the phone asks
  | { readonly kind: "finding" }
  | { readonly kind: "failed"; readonly why: LocateFailure };

export type LocateOutcome =
  | { readonly kind: "found"; readonly place: Extract<Place, { readonly kind: "gps" }> }
  | { readonly kind: "failed"; readonly why: LocateFailure };

/** One fix, high accuracy, the prototype's 15 seconds. */
export const locatePolicy = { timeoutMs: 15_000, highAccuracy: true } as const;

/**
 * The phone's position, once. Never rejects. The fix goes to the picker and nowhere else: no geocoder, no log, so
 * "We use it once, to find your field." stays true.
 *   no navigator.geolocation -> unsupported; PERMISSION_DENIED -> denied; TIMEOUT -> timeout; anything else -> unavailable
 *   found -> { kind: "gps", at: [round6(longitude), round6(latitude)], accuracyM: coords.accuracy }
 */
export function locateOnce(): Promise<LocateOutcome> {
  throw new Error("not implemented");
}

/**
 * "Use my location", in place (the prototype's GPS sheet without a modal):
 *   asking  -> <h3 tabIndex={-1}>Use your location</h3> (takes focus), "Stand in your field if you can.", the Allow
 *              sentence, <button class="btn btn-primary btn-block">Find my location</button>, "Close"
 *   finding -> the button shows a spinner and "Finding you…"; the status line says locate.findingSaid
 *   failed  -> the title, the body and, for "denied", the three numbered steps, then "Try again"
 *   found   -> send pick { gps } then send mark: the box goes straight onto the fix (prototype), and focus moves to
 *              the marking heading.
 */
export function LocatePanel(props: { readonly c: Controller }): ReactElement | null {
  throw new Error("not implemented");
}

/**
 * The chosen place, under the map while finding: the pin on a --warn-soft disc, placeLine(candidate) in bold, then
 * <button class="btn btn-block fp-go">Mark my field</button> (send mark). Nothing renders with no candidate.
 * Not .btn-primary: F1's dock holds the page's one primary button, "Next: crops" (open decision 8).
 */
export function PlaceCard(props: { readonly c: Controller }): ReactElement | null {
  throw new Error("not implemented");
}
