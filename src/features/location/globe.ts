// The MapLibre globe behind four functions. The only file that loads maplibre-gl at run time. No React.
//
//   startGlobe(options) -> { kind: "globe", globe } | { kind: "none", why }
//   globe.show(scene)      draw what the picker holds: the pin, the outline, the corner handles, the camera
//   globe.zoomBy(±1)       the round "Zoom in" and "Zoom out" buttons
//   globe.destroy()
//
// It keeps no field state. Every farmer gesture becomes one SurfaceAction for the picker, and the next show(scene)
// redraws from the picker, so a refused drag snaps back with no code here.
//
// Load-bearing facts (grounding section 3 and gotchas):
//  G1  Under Next's webpack the worker does not load by itself. Before the first `new Map`:
//        setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href)
//  G4  MapLibre 6 needs WebGL2. There is no pre-check: `new Map` throws GPUInitializationError, and that is the test.
//  G5  The outline goes to MapLibre in drawing space (Marked.corners), never as the wire ring.
//  G11 React Strict Mode mounts twice in development: startGlobe checks `signal` after each await and removes the map.
//  G22 maplibre-gl is 1.1 MB: it loads with `await import("maplibre-gl")` here, so page 1's first paint has none of it.
// The base style needs no network and no key, so the globe turns, zooms and takes an outline offline. The pictures are
// optional raster layers on top. That is why the browser checks run the real map with no key and no mock.
import type { StyleSpecification } from "maplibre-gl";
import type { Pictures } from "./provider";
import type { Scene, SurfaceAction } from "./picker";
// At run time this file also reads words.ts (the canvas names) and outline.ts (wrapLng, round6).

/** Colours for the map, read once from F1's tokens on the container, so light, dark and high contrast all follow. */
export interface Palette {
  readonly ocean: string;    // --water-soft
  readonly grid: string;     // --line
  readonly sky: string;      // --bg
  readonly edge: string;     // --mint-pill (prototype .ms-edge)
  readonly under: string;    // --night (prototype .ms-under)
  readonly fill: string;     // --leaf, at 30%
  readonly pin: string;      // --pin
  /** F1's --map-mode: "dark" turns the atmosphere down. */
  readonly mode: "day" | "dark";
}

export function paletteOf(element: HTMLElement): Palette {
  throw new Error("not implemented");
  // TODO: getComputedStyle(element).getPropertyValue("--water-soft") and the rest, trimmed
}

export interface GlobeOptions {
  readonly container: HTMLElement;
  readonly pictures: Pictures;
  /** prefers-reduced-motion: jumpTo instead of flyTo, no pin drop. */
  readonly reducedMotion: boolean;
  /** Aborted on unmount. */
  readonly signal: AbortSignal;
  send(action: SurfaceAction): void;
}

export interface Globe {
  /**
   * Draw the scene. Idempotent: the same scene twice changes nothing.
   *  - pin: one DOM marker (the prototype's 48 × 62 pin in --pin), not interactive.
   *  - outline: one GeoJSON source in drawing space with three layers: a 30% --leaf fill, a 7 px --night under-stroke
   *    and a 3 px --mint-pill edge (the prototype's .ms-under and .ms-edge), plus a small "Weather point" dot at the
   *    lookup. The prototype's dimmed land outside the field is not drawn: a world-sized polygon with a hole is a trap
   *    at 180°.
   *  - corner handles: one draggable Marker per corner with a 48 px element and a 14 px square drawn in its middle
   *    (22 px when selected). Pointer only: aria-hidden and tabindex -1, because the corner list is the keyboard and
   *    screen-reader way to edit, and the canvas's name says so.
   *      a tap -> send select;  drag -> move the GeoJSON line only (nothing is sent mid-drag);  dragend -> send move.
   *  - camera: moves only when scene.look.seq changed: "world" fits the globe (radius 44% of the short side),
   *    "place" centres the pin at zoom 7, "field" fits the outline at zoomToFit. jumpTo under reduced motion.
   */
  show(scene: Scene): void;
  zoomBy(step: 1 | -1): void;
  destroy(): void;
}

export type GlobeStart =
  | { readonly kind: "globe"; readonly globe: Globe }
  /** no_webgl: GPUInitializationError. failed: the import, the worker or anything else. The flat plan stands in. */
  | { readonly kind: "none"; readonly why: "no_webgl" | "failed" };

/**
 * Start the globe. Never throws.
 *
 * TODO, in order:
 *   const gl = await import("maplibre-gl")                         // catch -> { kind: "none", why: "failed" }
 *   if (signal.aborted) return none
 *   gl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href)        // G1
 *   try { map = new gl.Map({ container, style: baseStyle(paletteOf(container)), attributionControl: false,
 *           center: [100, 5], zoom: 1.4, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxZoom: 19,
 *           renderWorldCopies: true }) }                          // true: a field across 180° is not cut
 *   catch (error) { return { kind: "none", why: error instanceof gl.GPUInitializationError ? "no_webgl" : "failed" } }
 *   map.touchZoomRotate.disableRotation()
 *   map.on("load"): add pictures.far (layer maxzoom 7) and pictures.near (layer minzoom 5), under the outline layers
 *   map.on("sourcedata"): a picture source loaded a tile          -> send { kind: "pictures", state: "shown" } once
 *   map.on("error"): from a picture source, before any tile       -> send { kind: "pictures", state: "failed" }
 *                    any other error is swallowed: a missing tile never breaks the page (prototype)
 *   map.on("webglcontextlost")                                    -> send { kind: "surface", surface: plan "lost" }
 *   map.on("click"): ignore a click that started on a marker; else send { kind: "tap", at: [round6(wrapLng(lng)), lat] }
 *   the canvas gets aria-label from words.ts map labels (globe, box or corners) on each show()
 * No console call, and no URL in any message: the key is in every MapTiler URL.
 */
export async function startGlobe(options: GlobeOptions): Promise<GlobeStart> {
  throw new Error("not implemented");
}

/**
 * The built-in style: `projection: { type: "globe" }` (MapLibre 6 has no projection map option), an ocean background,
 * a graticule (meridians every 30°, parallels -60° to 60° every 30°) from an inline GeoJSON source, and a sky whose
 * atmosphere fades out between zoom 5 and 7 (prototype map.js). No sprite, no glyphs, no URL.
 */
export function baseStyle(palette: Palette): StyleSpecification {
  throw new Error("not implemented");
}

/**
 * The zoom at which an outline `spanM` metres across fills 42% of the map's short side (prototype zoomFor: between 20%
 * and 72% keeps the 48 px handles apart and inside the map). Clamped to 3..19. Pure, so it is tested without a map.
 */
export function zoomToFit(spanM: number, latitude: number, shortSidePx: number): number {
  throw new Error("not implemented");
}
