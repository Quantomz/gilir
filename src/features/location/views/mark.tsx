"use client";
// Marking the field: the heading and lead, the tools under the map, the corner list and the precision note.
import type { ReactElement } from "react";
import type { Controller } from "../controller";

/**
 * Over the map while marking:
 *   <h2 class="section-t" id={idOf("heading")} tabIndex={-1} ref={focusRef("heading")}>{heading[phase]}</h2>
 *   <p class="muted">{lead.box | lead.corners | lead.plan (with the flat plan)}</p>
 *   the place line: a pin icon and outline.label
 *   <button class="btn btn-quiet btn-small">Search again</button>  (send again; always shown: page 1 has no Back)
 *   <button class="btn btn-quiet btn-small" ref={focusRef("list_opener")}>Type the corners</button>
 *     (send list open; hidden while the list shows)
 */
export function MarkHead(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * Under the map while marking:
 *   <p class="fp-status">Your field is marked: about 1 hectare, 4 corners.</p> with a tick icon (text, not colour)
 *   box phase     : [Smaller] "About 1 hectare / 100 m across" [Bigger]  (prototype SizeCtl). At an end the button
 *                   stays enabled and the press is answered in words (note size_end), as F1's Next never disables.
 *   corners phase : [Add a corner] and [Remove corner N] for the chosen corner, or the muted line "Tap a corner to
 *                   choose it.". Not with the flat plan: the corner list has its own Add and Remove.
 */
export function MarkTools(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * The keyboard and screen-reader way to do everything the map does (spec.md:50), and the coordinate entry. A section
 * in the page flow, under the map, so the farmer sees the drawing while typing. Not a modal: no second dialog system
 * beside F1's private Sheet.
 *   <section aria-labelledby={idOf("list")} class="fp-list">
 *     <div class="sheet-head"><h3 id={idOf("list")} tabIndex={-1} ref={focusRef("list")}>Type the corners of your field</h3>
 *       <button class="btn btn-close">Close</button></div>   (no Close with the flat plan, where the list always shows)
 *     <p id={idOf("list-hint")} class="hint">Go round the field in order. …</p>
 *     <form noValidate onSubmit>
 *       per row: <fieldset class="fp-corner"><legend>Corner N</legend>
 *                  Latitude and Longitude (type="text" inputMode="decimal" autoComplete="off" spellCheck={false},
 *                  64 px, aria-describedby the hint or the row's error, aria-invalid) and, from 4 rows up,
 *                  <button class="btn btn-quiet btn-small">Remove corner N</button></fieldset>
 *       <button type="button" class="btn btn-sub">Add a corner</button>  (at 256 rows it adds nothing and says list.atMost)
 *       the typed shape's problem: <p id={idOf("problem")} class="error-text" role="alert" tabIndex={-1}
 *         ref={focusRef("problem")}> from a note refused "typed"
 *       <button class="btn btn-primary btn-block" type="submit">Use these corners</button>
 *     </form>
 *   </section>
 * Rows are TEXT held here (coordinates.ts CornerRow). Seeded from rowsOfPoints(the outline's ring without its closing
 * point), else rowsOfPoints(boxAround(candidate.at, 1)) (prototype prefill), else 4 empty rows. Re-seeded only when
 * the outline changes from outside the list (a drag, Smaller, a new place), never on an unrelated render, so
 * half-typed text survives.
 * Submit: cornersOfRows(rows). Per-number errors show under each input and focus goes to the first. Otherwise send
 * { kind: "typed", corners }: the picker is the only judge of the shape. Nothing is sent while typing.
 * Removing row N moves focus to row N's latitude (or the last row); adding focuses the new row's latitude.
 */
export function CornerList(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * <div class="note">: precisionWords(outline), then weatherGrid. How the outline got where it is, and that weather
 * records come from a grid much larger than a field. No grid cell is drawn: the backend's products have different
 * grids (spec.md:93) and F2 may not import them (G19).
 */
export function Precision(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}
