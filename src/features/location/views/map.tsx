"use client";
// The map area: the globe when it can start, the flat plan when it cannot. Both draw sceneOf(c.picker) and both send
// the picker's actions, so nothing else knows which one is on screen.
import type { ReactElement } from "react";
import type { Controller } from "../controller";
import type { Scene } from "../picker";

/**
 * <div class="fp-map"> with a fixed height (the smaller of 55svh and 28rem, at least 15rem), so a thumb can still
 * scroll the page beside it and the map never sits under F1's sticky dock.
 *
 * Effect 1, once per mount: startGlobe({ container, pictures: picturesFor(c.provider), reducedMotion, signal, send }).
 *   globe -> keep the handle; send surface { kind: "globe", pictures: "loading" }
 *   none  -> send surface { kind: "plan", why }
 *   cleanup: abort the signal and destroy the globe (Strict Mode mounts twice, G11).
 * Effect 2, on every picker change: globe.show(sceneOf(c.picker)).
 *
 * Children: the globe's container, or <FlatPlan>; the two round buttons "Zoom in" and "Zoom out" at the top right
 * (a 48 px circle with the word under it, globe only); "Loading the globe…" while starting; then <Credits> under it.
 * Until the surface is known the box shows the --water-soft background, so the layout does not jump.
 */
export function MapArea(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * The 2D fallback (candidate 2's view-only plan): an SVG drawing of the outline from planOf(scene.outline, width,
 * height). North up, a scale bar, each corner numbered as in the corner list, the selected corner larger, the weather
 * point as a small dot, and the tag "A drawing, not a photo". role="img", aria-label map.plan, aria-describedby the
 * corner list. It is a picture only: with no pictures under it, dragging a corner would match nothing on the ground,
 * so the corner list, the box size buttons, the search and the GPS fix are the ways to change it. With no outline yet
 * it shows an empty grid and the pin's coordinates, never an invented landscape.
 */
export function FlatPlan(props: { readonly scene: Scene; readonly labelledBy: string }): ReactElement {
  throw new Error("not implemented");
}

/**
 * <p class="fp-credits">: credits[c.provider.kind].lead, then creditsFor(c.provider) (links where confirmed), at --fs-s
 * (18 px), always visible, never behind an "i" toggle. Shown on the globe and with the flat plan alike, so search
 * results always have their credit. Then, muted, credits[c.provider.kind].privacy.
 */
export function Credits(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}
