// Every outside map service, and nothing else: the MapTiler key, place search, the map pictures and their credits.
// The ONLY file in src/ that reads NEXT_PUBLIC_MAPTILER_KEY, names api.maptiler.com or gibs.earthdata.nasa.gov, or calls
// fetch (docs/cards/F2.md:35; tests/frontend/location/conventions.test.ts holds that). Wire shapes stay in here: the
// rest of the folder sees FoundPlace, SearchAnswer, MapLibre raster sources and Credits.
//
// What leaves the browser:
//   - the typed text, on Search or Enter only (never per keystroke, never with a position, the field or the view);
//   - picture tile requests for the area on screen: NASA GIBS far out (no key), MapTiler close up (with a key).
// What never leaves: the ring, a corner, the lookup, a GPS fix, the label. There is no reverse geocoding.
// The key is public by design and rides in every MapTiler URL, so no URL is ever logged, thrown or put in a message.
//
// Endpoint facts come from MapTiler's own client source (grounding section 4) because docs.maptiler.com and
// api.maptiler.com are unreachable from the build container. The satellite TileJSON path, its tile size and its
// attribution text are UNVERIFIED until the live run (tests/frontend/location/live.spec.ts).
import type { RasterSourceSpecification } from "maplibre-gl";
import { z } from "zod";
import type { FoundPlace } from "./picker";

declare const keyBrand: unique symbol;
/** The public browser key. Branded, so only readProvider makes one and no URL builder runs without it. */
export type BrowserKey = string & { readonly [keyBrand]: true };

export type Provider =
  /** No key: no search by name and no close-up pictures. Typed positions, GPS, the far-out globe and the corner list work. */
  | { readonly kind: "missing" }
  | { readonly kind: "ready"; readonly key: BrowserKey };

/**
 * Read the key. The literal `process.env.NEXT_PUBLIC_MAPTILER_KEY` is required: Next inlines only the literal (G13).
 * Unset, empty or only spaces -> missing. A function, so tests stub it with vi.stubEnv.
 */
export function readProvider(): Provider {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  return key ? { kind: "ready", key: key as BrowserKey } : { kind: "missing" };
}

/** Every number F2 chooses about the provider. */
export const providerPolicy = {
  /** Rows shown. The prototype asked for 6. */
  searchLimit: 6,
  /** The prototype's 3.5 s was on a good line. A slow phone line gets longer. */
  searchTimeoutMs: 8000,
  language: "en",
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Place search
// ---------------------------------------------------------------------------------------------------------------------

/**
 * https://api.maptiler.com/geocoding/{encodeURIComponent(query)}.json?key=…&autocomplete=false&limit=6&language=en
 * `autocomplete=false` because the API defaults to true and the query is a submitted name, not a prefix (G14).
 * No `country`, `bbox` or `proximity`: worldwide, and nothing about the farmer's position or view is sent.
 */
export function searchUrl(key: BrowserKey, query: string): URL {
  throw new Error("not implemented");
}

/** Why a submitted search gave no places. Each has its own words, and each names a way that still works. */
export type SearchFailure =
  | "offline"   // no answer, 5xx, or a body that is not the expected JSON
  | "slow"      // over providerPolicy.searchTimeoutMs
  | "refused"   // 400, 401 or 403: the query or the key was refused
  | "busy";     // 429: the provider's rate limit

export type SearchAnswer =
  | { readonly kind: "found"; readonly places: readonly FoundPlace[] }
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly why: SearchFailure };

/**
 * One submitted search. Never throws and never rejects. An aborted call (a newer search, or unmount) resolves
 * failed "offline", and the search box drops it by its sequence number. The timer is cleared when the request settles
 * (prototype known issue: abort timers left running).
 */
export async function searchPlaces(key: BrowserKey, query: string, signal: AbortSignal): Promise<SearchAnswer> {
  throw new Error("not implemented");
}

const geocodingSchema = z.object({
  features: z.array(z.object({
    center: z.tuple([z.number(), z.number()]).optional(),
    text: z.string().optional(),
    place_name: z.string().optional(),
    context: z.array(z.object({ text: z.string().optional() })).optional(),
  })),
});

/**
 * The provider's answer into places, parsed here because it is a provider shape, not a contract (boundary).
 * A feature without a usable `center` is skipped, never guessed. `at` is the center with its longitude wrapped into
 * [-180, 180]; `name` is `text`; `where` is the context entries (region, country), unique and non-empty, joined by
 * ", ". `bbox` is never read: across 180° it can have west > east (G14), and the camera uses `at` alone.
 */
export function placesOfResponse(body: unknown): readonly FoundPlace[] {
  throw new Error("not implemented");
  // TODO: geocodingSchema.safeParse(body); not ok -> [] (searchPlaces turns an unreadable 200 into "offline")
}

// ---------------------------------------------------------------------------------------------------------------------
// Pictures and credits
// ---------------------------------------------------------------------------------------------------------------------

/** The map pictures as MapLibre raster sources, laid over globe.ts's built-in base (which needs no network). */
export interface Pictures {
  /**
   * NASA GIBS Blue Marble, no key (open decision 3): WMTS EPSG:3857
   * `…/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg` ({y} before {x}),
   * tileSize 256, maxzoom 8. Shown far out only, so a farmer with no key still sees the Earth to tap near the farm.
   */
  readonly far: RasterSourceSpecification;
  /** MapTiler satellite from `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=…` (path UNVERIFIED). Only with a key. */
  readonly near: RasterSourceSpecification | null;
}

export function picturesFor(provider: Provider): Pictures {
  throw new Error("not implemented");
}

/** One visible credit. `href` null where no link has been confirmed yet (the live run checks each). */
export interface Credit {
  readonly text: string;
  readonly href: string | null;
}

/**
 * The credits for what is configured, shown as F2's own line under the map in 18 px text, always visible (views/map.tsx
 * Credits). MapLibre's 12 px collapsible control is off. The line also covers search results, so the plan fallback
 * has credits too. The live run compares these with the TileJSON `attribution` and checks MapTiler's logo rule.
 */
export function creditsFor(provider: Provider): readonly Credit[] {
  const nasa: Credit = { text: "NASA EOSDIS GIBS", href: null };
  if (provider.kind === "missing") return [nasa];
  return [
    nasa,
    { text: "© MapTiler", href: "https://www.maptiler.com/copyright/" },
    { text: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
  ];
}
