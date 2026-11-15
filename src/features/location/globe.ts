// The MapLibre globe behind startGlobe, show, zoomBy and destroy. The only file that loads maplibre-gl at run time, and
// it does so inside startGlobe, so server rendering and page 1's first paint carry none of its 1 MB. No React.
//
// It keeps no field state. Every farmer gesture becomes one SurfaceAction for the picker, and the next show(scene)
// redraws from the picker, so a refused drag snaps back with no code here.
// The base style needs no network and no key, so the globe turns, zooms and takes an outline offline. The pictures are
// optional raster layers on top.
import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import { radians, round6, unwrapNear, wrapLng } from "./outline";
import type { Corner, LngLat, Marked } from "./outline";
import type { Scene, SurfaceAction } from "./picker";
import type { Pictures } from "./provider";
import { map as mapWords } from "./words";

/** Colours for the map, read once from F1's tokens on the container, so light, dark and high contrast all follow. */
export interface Palette {
  readonly ocean: string;
  readonly grid: string;
  readonly sky: string;
  readonly edge: string;
  readonly under: string;
  readonly fill: string;
  readonly pin: string;
  /** F1's --map-mode: "dark" turns the atmosphere down. */
  readonly mode: "day" | "dark";
}

function paletteOf(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    ocean: token("--water-soft"),
    grid: token("--line"),
    sky: token("--bg"),
    edge: token("--mint-pill"),
    under: token("--night"),
    fill: token("--leaf"),
    pin: token("--pin"),
    mode: token("--map-mode") === "dark" ? "dark" : "day",
  };
}

export interface GlobeOptions {
  readonly container: HTMLElement;
  readonly pictures: Pictures;
  /** prefers-reduced-motion: the camera jumps instead of flying. */
  readonly reducedMotion: boolean;
  /** Aborted on unmount. The globe removes itself. */
  readonly signal: AbortSignal;
  send(action: SurfaceAction): void;
}

export interface Globe {
  /**
   * Draw the scene. Idempotent: the same scene twice changes nothing.
   *  - pin: one DOM marker, not interactive.
   *  - outline: one GeoJSON source in drawing space: a fill, a dark under-stroke, a light edge, and a dot at the lookup.
   *    Land outside the field is not dimmed: a world-sized polygon with a hole breaks at 180°.
   *  - corner handles: one draggable 48 px marker per corner, only when scene.handles. Pointer only and hidden from
   *    screen readers, because the corner list is the keyboard and screen-reader way to edit, and the canvas's name
   *    says so. A tap sends select; a drag moves the drawn line only; the drop sends one move.
   *  - camera: moves only when scene.look.seq changed, so dragging a corner never moves the map.
   */
  show(scene: Scene): void;
  zoomBy(step: 1 | -1): void;
  destroy(): void;
}

export type GlobeStart =
  | { readonly kind: "globe"; readonly globe: Globe }
  /** no_webgl: the browser gave no WebGL2 context. failed: the import or anything else. The flat plan stands in. */
  | { readonly kind: "none"; readonly why: "no_webgl" | "failed" };

const defaultCenter: LngLat = [100, 5];
const placeZoom = 7;
/** Where MapTiler's close-up pictures take over from NASA's far-out ones. */
const nearFrom = 5;
const farUntil = 7;
const fieldLayer = "field-fill";

/**
 * Start the globe. Never throws. A failure after the start (the worker or the style does not load) and a lost WebGL
 * context arrive later through `send`, as a plan surface, and the globe goes quiet.
 */
export async function startGlobe(options: GlobeOptions): Promise<GlobeStart> {
  const { container, signal } = options;
  const gl = await import("maplibre-gl").catch(() => null);
  if (gl === null || signal.aborted) return { kind: "none", why: "failed" };
  // Under webpack MapLibre cannot find its own worker, and without it no GeoJSON source loads.
  gl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
  const palette = paletteOf(container);
  let map: MapLibreMap;
  try {
    map = new gl.Map({
      container,
      style: baseStyle(palette),
      attributionControl: false,
      center: [...defaultCenter],
      zoom: worldZoom(shortSideOf(container), defaultCenter[1]),
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // Copies of the world let a field across 180° draw whole.
      renderWorldCopies: true,
    });
  } catch (error) {
    return { kind: "none", why: error instanceof gl.GPUInitializationError ? "no_webgl" : "failed" };
  }
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // The canvas is transparent around the sphere.
  map.getCanvas().style.backgroundColor = palette.sky;

  let alive = true;
  let removed = false;
  let loaded = false;
  let pictures: "waiting" | "shown" | "failed" = "waiting";
  let latest: Scene | null = null;
  let cameraSeq: number | null = null;
  let drawn: Marked | null = null;
  let dragging: number | null = null;
  // After a drop the line and the handle show a spot the picker has not judged yet, so the next scene redraws both.
  let stale = false;
  let pin: Marker | null = null;
  const handles: Marker[] = [];
  const pictureIds = new Set(options.pictures.near ? ["far", "near"] : ["far"]);

  const report = (action: SurfaceAction) => {
    if (alive) options.send(action);
  };
  const giveUp = (why: "lost" | "failed") => {
    report({ kind: "surface", surface: { kind: "plan", why } });
    alive = false;
  };

  const fieldSource = () => (loaded ? map.getSource<GeoJSONSource>("field") : undefined);

  const moveCamera = (scene: Scene, first: boolean) => {
    const target = cameraFor(scene, map, container);
    if (target === null) return;
    if (first || options.reducedMotion) map.jumpTo(target);
    else map.flyTo(target);
  };

  const newHandle = (index: number, at: Corner) => {
    const element = document.createElement("div");
    element.className = "fp-handle";
    element.setAttribute("aria-hidden", "true");
    const marker = new gl.Marker({ element, draggable: true, opacityWhenCovered: "0" });
    marker.on("click", () => report({ kind: "select", corner: index }));
    marker.on("dragstart", () => {
      dragging = index;
    });
    marker.on("drag", () => {
      const outline = latest?.outline;
      if (!outline) return;
      const { lng, lat } = marker.getLngLat();
      const corners = outline.corners.map((corner, i): Corner => (i === index ? [unwrapNear(lng, corner[0]), lat] : corner));
      fieldSource()?.setData(fieldData(corners, outline.lookup));
    });
    marker.on("dragend", () => {
      dragging = null;
      stale = true;
      const { lng, lat } = marker.getLngLat();
      report({ kind: "move", corner: index, to: [lng, lat] });
    });
    return marker.setLngLat([...at]).addTo(map);
  };

  const render = () => {
    const scene = latest;
    if (scene === null || !alive || dragging !== null) return;
    map.getCanvas().setAttribute("aria-label", !scene.handles ? mapWords.globe : scene.boxFollowsTap ? mapWords.box : mapWords.corners);
    if (scene.look.seq !== cameraSeq) {
      moveCamera(scene, cameraSeq === null);
      cameraSeq = scene.look.seq;
    }

    if (scene.pin === null) {
      pin?.remove();
      pin = null;
    } else if (pin === null) {
      pin = new gl.Marker({ element: pinElement(), anchor: "bottom", opacityWhenCovered: "0" }).setLngLat([...scene.pin]).addTo(map);
    } else {
      pin.setLngLat([...scene.pin]);
    }

    const corners = scene.handles ? scene.outline?.corners ?? [] : [];
    while (handles.length > corners.length) handles.pop()?.remove();
    while (handles.length < corners.length) handles.push(newHandle(handles.length, corners[handles.length]));
    corners.forEach((corner, index) => {
      handles[index].setLngLat([...corner]);
      handles[index].getElement().toggleAttribute("data-selected", index === scene.selected);
    });

    const source = fieldSource();
    if (source && (scene.outline !== drawn || stale)) {
      source.setData(scene.outline ? fieldData(scene.outline.corners, scene.outline.lookup) : emptyField);
      drawn = scene.outline;
      stale = false;
    }
  };

  map.on("load", () => {
    loaded = true;
    map.addSource("far", options.pictures.far);
    // With no close-up source, NASA's picture stays on, blurred, so a field is never drawn on what looks like sea.
    map.addLayer({ id: "far", type: "raster", source: "far", ...(options.pictures.near ? { maxzoom: farUntil } : {}) }, fieldLayer);
    if (options.pictures.near) {
      map.addSource("near", options.pictures.near);
      map.addLayer({ id: "near", type: "raster", source: "near", minzoom: nearFrom }, fieldLayer);
    }
    render();
  });
  map.on("sourcedata", event => {
    if (event.tile && pictureIds.has(event.sourceId) && pictures !== "shown") {
      pictures = "shown";
      report({ kind: "pictures", state: "shown" });
    }
  });
  // A missing picture tile never breaks the page. Before the first frame, any other error means the globe cannot work.
  map.on("error", event => {
    const sourceId: unknown = (event as { sourceId?: unknown }).sourceId;
    if (typeof sourceId === "string" && pictureIds.has(sourceId)) {
      if (pictures !== "waiting") return;
      pictures = "failed";
      report({ kind: "pictures", state: "failed" });
    } else if (!loaded) {
      giveUp("failed");
    }
  });
  map.on("webglcontextlost", () => giveUp("lost"));
  map.on("click", event => {
    const target = event.originalEvent.target;
    if (target instanceof Node && handles.some(handle => handle.getElement().contains(target))) return;
    // A click beside the sphere comes back as the nearest point on its horizon, which projects somewhere else.
    const back = map.project(event.lngLat);
    if (Math.hypot(back.x - event.point.x, back.y - event.point.y) > 2) return;
    report({ kind: "tap", at: [round6(wrapLng(event.lngLat.lng)), round6(event.lngLat.lat)] });
  });

  const destroy = () => {
    alive = false;
    if (removed) return;
    removed = true;
    signal.removeEventListener("abort", destroy);
    map.remove();
  };
  signal.addEventListener("abort", destroy, { once: true });

  return {
    kind: "globe",
    globe: {
      show(scene) {
        latest = scene;
        render();
      },
      zoomBy(step) {
        if (alive) map.zoomTo(map.getZoom() + step, { animate: !options.reducedMotion });
      },
      destroy,
    },
  };
}

/**
 * The built-in style: the globe projection, an ocean background, a graticule from an inline source, the field's empty
 * source and layers, and a sky whose atmosphere fades out between zoom 5 and 7. No sprite, no glyphs, no URL.
 */
export function baseStyle(palette: Palette): StyleSpecification {
  const atmosphere = palette.mode === "dark" ? 0.5 : 1;
  return {
    version: 8,
    projection: { type: "globe" },
    sky: {
      "sky-color": palette.sky,
      "horizon-color": palette.ocean,
      "fog-color": palette.sky,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, atmosphere, 5, atmosphere, 7, 0],
    },
    sources: {
      grid: { type: "geojson", data: graticule() },
      field: { type: "geojson", data: emptyField },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": palette.ocean } },
      { id: "grid", type: "line", source: "grid", paint: { "line-color": palette.grid, "line-width": 1 } },
      { id: fieldLayer, type: "fill", source: "field", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": palette.fill, "fill-opacity": 0.3 } },
      { id: "field-under", type: "line", source: "field", filter: ["==", ["geometry-type"], "Polygon"], layout: { "line-join": "round" }, paint: { "line-color": palette.under, "line-width": 7 } },
      { id: "field-edge", type: "line", source: "field", filter: ["==", ["geometry-type"], "Polygon"], layout: { "line-join": "round" }, paint: { "line-color": palette.edge, "line-width": 3 } },
      {
        id: "weather-point",
        type: "circle",
        source: "field",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 6, "circle-color": palette.pin, "circle-stroke-color": palette.edge, "circle-stroke-width": 2 },
      },
    ],
  };
}

/**
 * The zoom at which an outline `spanM` metres across fills 42% of the map's short side: between 20% and 72% the 48 px
 * handles stay apart and inside the map. Mercator scale, which the globe matches at its centre. Clamped to 3..19.
 */
export function zoomToFit(spanM: number, latitude: number, shortSidePx: number): number {
  const metresAcrossTheWorld = 40_075_016.686 * Math.cos(radians(latitude));
  const zoom = Math.log2((metresAcrossTheWorld * 0.42 * shortSidePx) / (512 * spanM));
  return Math.min(19, Math.max(3, zoom));
}

/** The zoom at which the globe's radius is 44% of the map's short side. The globe grows by 1/cos(latitude). */
function worldZoom(shortSidePx: number, latitude: number): number {
  const radiusAtZoomZero = 512 / (2 * Math.PI);
  const zoom = Math.log2((0.44 * shortSidePx * Math.cos(radians(latitude))) / radiusAtZoomZero);
  return Math.min(3, Math.max(0, zoom));
}

function cameraFor(scene: Scene, map: MapLibreMap, container: HTMLElement): { center?: [number, number]; zoom: number } | null {
  switch (scene.look.at) {
    case "world":
      return { zoom: worldZoom(shortSideOf(container), map.getCenter().lat) };
    case "place":
      return scene.pin ? { center: [...scene.pin], zoom: Math.max(map.getZoom(), placeZoom) } : null;
    case "field": {
      if (!scene.outline) return null;
      const lngs = scene.outline.corners.map(([lng]) => lng);
      const lats = scene.outline.corners.map(([, lat]) => lat);
      const middle: [number, number] = [wrapLng((Math.min(...lngs) + Math.max(...lngs)) / 2), (Math.min(...lats) + Math.max(...lats)) / 2];
      return { center: middle, zoom: zoomToFit(scene.outline.spanM, middle[1], shortSideOf(container)) };
    }
  }
}

const emptyField: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Drawing space: the dot sits beside the corners, not a world away across 180°. */
function fieldData(corners: readonly Corner[], lookup: LngLat): GeoJSON.FeatureCollection {
  const ring = [...corners, corners[0]].map(([lng, lat]) => [lng, lat]);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [unwrapNear(lookup[0], corners[0][0]), lookup[1]] } },
    ],
  };
}

function graticule(): GeoJSON.Feature {
  const steps = (from: number, to: number, by: number) => Array.from({ length: (to - from) / by + 1 }, (_, i) => from + i * by);
  const meridians = steps(-180, 150, 30).map(lng => steps(-80, 80, 5).map(lat => [lng, lat]));
  const parallels = steps(-60, 60, 30).map(lat => steps(-180, 180, 5).map(lng => [lng, lat]));
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [...meridians, ...parallels] } };
}

function pinElement(): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = '<svg class="fp-pin" viewBox="0 0 48 62" aria-hidden="true" style="display: block"><path d="M24 60S4 39 4 22a20 20 0 0 1 40 0c0 17-20 38-20 38z" fill="currentColor" stroke-width="3" style="stroke: var(--mint-pill)"/><circle cx="24" cy="22" r="7.5" style="fill: var(--mint-pill)"/></svg>';
  return element;
}

const shortSideOf = (element: HTMLElement) => Math.min(element.clientWidth, element.clientHeight);
