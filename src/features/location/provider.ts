// Every outside map service, and nothing else: the MapTiler key, place search, the map pictures and their credits.
// The only file in src/ that reads NEXT_PUBLIC_MAPTILER_KEY, names a provider host, or calls fetch. Wire shapes stay in
// here: the rest of the folder sees FoundPlace, SearchAnswer, MapLibre raster sources and Credits.
//
// What leaves the browser: the typed text, on Search or Enter only, and picture tile requests for the area on screen.
// The ring, a corner, the lookup, a GPS fix and the label never do, and there is no reverse geocoding.
// The key is public by design and rides in every MapTiler URL, so no URL is ever put in an answer or an error.
//
// The geocoding request comes from MapTiler's own client source. The satellite TileJSON path, its tile size and its
// attribution text are unverified until a live run with a key.
import type { RasterSourceSpecification } from "maplibre-gl";
import { z } from "zod";
import { round6, wrapLng } from "./outline";
import type { FoundPlace } from "./picker";

declare const keyBrand: unique symbol;
/** The public browser key. Branded, so only readProvider makes one and no URL builder runs without it. */
export type BrowserKey = string & { readonly [keyBrand]: true };

export type Provider =
  /** No key: no search by name and no close-up pictures. Typed positions, GPS, the far-out globe and the corner list work. */
  | { readonly kind: "missing" }
  | { readonly kind: "ready"; readonly key: BrowserKey };

/** Next inlines only the literal `process.env.NEXT_PUBLIC_MAPTILER_KEY`. Unset, empty or only spaces -> missing. */
export function readProvider(): Provider {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim();
  return key ? { kind: "ready", key: key as BrowserKey } : { kind: "missing" };
}

export const providerPolicy = {
  searchLimit: 6,
  /** 3.5 s was enough on a good line. A slow phone line gets longer. */
  searchTimeoutMs: 8000,
  language: "en",
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Place search
// ---------------------------------------------------------------------------------------------------------------------

/**
 * `autocomplete=false` because the API treats the query as a prefix by default, and this one was submitted.
 * No `country`, `bbox` or `proximity`: worldwide, and nothing about the farmer's position or view is sent.
 */
export function searchUrl(key: BrowserKey, query: string): URL {
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", String(providerPolicy.searchLimit));
  url.searchParams.set("language", providerPolicy.language);
  return url;
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
 * One submitted search. Never throws and never rejects. An aborted call (a newer search, or unmount) resolves failed
 * "offline", and the search box drops it by its sequence number.
 */
export async function searchPlaces(key: BrowserKey, query: string, signal: AbortSignal): Promise<SearchAnswer> {
  const request = new AbortController();
  const stop = () => request.abort();
  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    request.abort();
  }, providerPolicy.searchTimeoutMs);
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    const response = await fetch(searchUrl(key, query), { method: "GET", signal: request.signal });
    if (!response.ok) return failed(failureOfStatus(response.status));
    const features = featuresOf(await response.json());
    if (features === null) return failed("offline");
    const places = features.flatMap(placeOfFeature).slice(0, providerPolicy.searchLimit);
    return places.length > 0 ? { kind: "found", places } : { kind: "none" };
  } catch {
    return failed(slow ? "slow" : "offline");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

const failed = (why: SearchFailure): SearchAnswer => ({ kind: "failed", why });

function failureOfStatus(status: number): SearchFailure {
  if (status === 429) return "busy";
  if (status === 400 || status === 401 || status === 403) return "refused";
  return "offline";
}

const answerSchema = z.object({ features: z.array(z.unknown()) });

const featureSchema = z.object({
  center: z.tuple([z.number(), z.number()]),
  text: z.string().optional(),
  place_name: z.string().optional(),
  context: z.array(z.object({ text: z.string().optional() })).optional(),
});

/** null when the body is not a geocoding answer at all. */
function featuresOf(body: unknown): readonly unknown[] | null {
  const parsed = answerSchema.safeParse(body);
  return parsed.success ? parsed.data.features : null;
}

/**
 * The provider's answer into places. A feature without a usable `center` or name is skipped, never guessed, and one bad
 * feature does not hide the rest. `bbox` is never read: across 180° its west can be greater than its east.
 */
export function placesOfResponse(body: unknown): readonly FoundPlace[] {
  return (featuresOf(body) ?? []).flatMap(placeOfFeature).slice(0, providerPolicy.searchLimit);
}

function placeOfFeature(feature: unknown): FoundPlace[] {
  const parsed = featureSchema.safeParse(feature);
  if (!parsed.success) return [];
  const { center: [lng, lat], text, place_name, context } = parsed.data;
  const name = text?.trim() || place_name?.split(",")[0].trim();
  if (!name || Math.abs(lat) > 90) return [];
  const parts = context ? context.map(entry => entry.text ?? "") : (place_name ?? "").split(",");
  const where = [...new Set(parts.map(part => part.trim()))].filter(part => part !== "" && part !== name).join(", ");
  return [{ kind: "found", name, where, at: [round6(wrapLng(lng)), round6(lat)] }];
}

// ---------------------------------------------------------------------------------------------------------------------
// Pictures and credits
// ---------------------------------------------------------------------------------------------------------------------

/** The map pictures as MapLibre raster sources, laid over globe.ts's built-in base, which needs no network. */
export interface Pictures {
  /** NASA GIBS Blue Marble, no key, 256 px tiles to zoom 8, {y} before {x}: the Earth to tap near the farm. */
  readonly far: RasterSourceSpecification;
  /** MapTiler satellite from its TileJSON, close up. Only with a key. */
  readonly near: RasterSourceSpecification | null;
}

export function picturesFor(provider: Provider): Pictures {
  const far: RasterSourceSpecification = {
    type: "raster",
    tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"],
    tileSize: 256,
    maxzoom: 8,
  };
  if (provider.kind === "missing") return { far, near: null };
  const tileJson = new URL("https://api.maptiler.com/tiles/satellite-v2/tiles.json");
  tileJson.searchParams.set("key", provider.key);
  return { far, near: { type: "raster", url: tileJson.href, tileSize: 256 } };
}

/** One visible credit. `href` null where no link has been confirmed yet. */
export interface Credit {
  readonly text: string;
  readonly href: string | null;
}

/**
 * The credits for what is configured, shown as F2's own always-visible line under the map, because MapLibre's control
 * is 12 px and collapses. The line also covers search results, so the flat plan has credits too.
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
