// Stand-ins for NASA GIBS and MapTiler, so a browser run sends nothing off this machine. Every request to another host
// is answered here, or aborted. Fixture and mocked evidence only, named so: never the card's live criterion.
//
// The key rides in every MapTiler URL. The log keeps URLs in memory for assertions and nothing here prints one.
import type { BrowserContext, Page, Route } from "@playwright/test";
import { placesOfResponse, providerPolicy } from "@/features/location/provider";
import type { SearchFailure } from "@/features/location/provider";
import { syntheticTile } from "./tile";

/** How one provider answers: normally, or with one of the failures a farmer can meet. */
export type Answer = "answer" | SearchFailure;

export interface ProviderPlan {
  /** NASA GIBS tiles. */
  gibs: Answer;
  /** MapTiler's satellite TileJSON and its tiles. */
  maptiler: Answer;
  /** MapTiler geocoding. "answer" looks the query up in `places`; a function answers any query its own way. */
  search: Answer | ((query: string) => GeocodingAnswer);
}

export type RequestKind = "gibs" | "tilejson" | "tile" | "search" | "maptiler_other" | "elsewhere";

export interface ProviderRequest {
  readonly kind: RequestKind;
  readonly url: URL;
  /** The decoded search text, for a search. */
  readonly query: string | null;
}

export interface ProviderRoutes {
  /** Mutable: a test may change how a provider answers between steps. */
  readonly plan: ProviderPlan;
  readonly requests: readonly ProviderRequest[];
  of(kind: RequestKind): readonly ProviderRequest[];
}

/** No key: NASA answers, MapTiler is unreachable. */
export const offlineMapTiler: ProviderPlan = { gibs: "answer", maptiler: "offline", search: "offline" };

/** Everything answers, as with a working key. */
export const allAnswer: ProviderPlan = { gibs: "answer", maptiler: "answer", search: "answer" };

/** Answer every request that leaves this machine. Install before page.goto. */
export async function routeProviders(target: Page | BrowserContext, plan: Partial<ProviderPlan> = {}): Promise<ProviderRoutes> {
  const live: ProviderPlan = { ...offlineMapTiler, ...plan };
  const requests: ProviderRequest[] = [];
  await target.route(url => !isLocal(url), async route => {
    const request = route.request();
    const url = new URL(request.url());
    const kind = kindOf(url);
    const query = kind === "search" ? decodeURIComponent(url.pathname.slice("/geocoding/".length, -".json".length)) : null;
    requests.push({ kind, url, query });
    if (request.method() === "OPTIONS") return fulfil(route, 204, "");
    switch (kind) {
      case "gibs": return answerWith(route, live.gibs, () => tile(route));
      case "tilejson": return answerWith(route, live.maptiler, () => fulfil(route, 200, tileJson(url), "application/json"));
      case "tile": return answerWith(route, live.maptiler, () => tile(route));
      case "search": {
        const search = live.search;
        const body = typeof search === "function" ? search(query ?? "") : places[(query ?? "").trim().toLowerCase()] ?? noPlaces;
        return answerWith(route, typeof search === "function" ? "answer" : search, () => fulfil(route, 200, JSON.stringify(body), "application/json"));
      }
      case "maptiler_other": return fulfil(route, 404, JSON.stringify({ message: "Not found" }), "application/json");
      case "elsewhere": return route.abort("blockedbyclient");
    }
  });
  return {
    plan: live,
    requests,
    of: kind => requests.filter(request => request.kind === kind),
  };
}

const localHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function isLocal(url: URL): boolean {
  return !url.protocol.startsWith("http") || localHosts.has(url.hostname);
}

function kindOf(url: URL): RequestKind {
  if (url.hostname === "gibs.earthdata.nasa.gov") return "gibs";
  if (url.hostname !== "api.maptiler.com") return "elsewhere";
  if (url.pathname.startsWith("/geocoding/") && url.pathname.endsWith(".json")) return "search";
  if (/^\/tiles\/[^/]+\/tiles\.json$/.test(url.pathname)) return "tilejson";
  if (/^\/tiles\/[^/]+\/\d+\/\d+\/\d+\.\w+$/.test(url.pathname)) return "tile";
  return "maptiler_other";
}

async function answerWith(route: Route, answer: Answer, normal: () => Promise<void>): Promise<void> {
  switch (answer) {
    case "answer": return normal();
    case "offline": return route.abort("internetdisconnected");
    case "refused": return fulfil(route, 403, JSON.stringify({ message: "Invalid key" }), "application/json");
    case "busy": return fulfil(route, 429, JSON.stringify({ message: "Too many requests" }), "application/json");
    case "slow":
      await new Promise(resolve => setTimeout(resolve, providerPolicy.searchTimeoutMs + 2000));
      return normal();
  }
}

/** The page may have dropped the request (a newer search, an unmounted map) before the answer is ready. */
async function fulfil(route: Route, status: number, body: string | Buffer, contentType = "text/plain"): Promise<void> {
  await route.fulfill({
    status,
    body,
    contentType,
    headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "cache-control": "no-store" },
  }).catch(() => undefined);
}

function tile(route: Route): Promise<void> {
  return fulfil(route, 200, syntheticTile(), "image/png");
}

/** The satellite TileJSON as MapTiler shapes it, pointing back at api.maptiler.com with the same key. */
function tileJson(request: URL): string {
  const tiles = new URL(request.pathname.replace(/tiles\.json$/, "{z}/{x}/{y}.jpg"), request.origin);
  const key = request.searchParams.get("key");
  if (key !== null) tiles.searchParams.set("key", key);
  return JSON.stringify({
    tilejson: "2.2.0",
    name: "Synthetic satellite",
    tiles: [decodeURI(tiles.href)],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 20,
    scheme: "xyz",
    format: "jpg",
    bounds: [-180, -85.0511, 180, 85.0511],
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
  });
}

// Canned place search answers. Synthetic, shaped like MapTiler's geocoding GeoJSON.
export interface GeocodingFeature {
  readonly type: "Feature";
  readonly id: string;
  readonly text: string;
  readonly place_name: string;
  readonly place_type: readonly string[];
  readonly relevance: number;
  readonly center: readonly [number, number];
  readonly bbox: readonly [number, number, number, number];
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: Record<string, unknown>;
  readonly context: readonly { readonly id: string; readonly text: string }[];
}

export interface GeocodingAnswer {
  readonly type: "FeatureCollection";
  readonly features: readonly GeocodingFeature[];
  readonly query: readonly string[];
}

function feature(id: string, text: string, region: string, country: string, center: readonly [number, number], bbox: GeocodingFeature["bbox"]): GeocodingFeature {
  return {
    type: "Feature",
    id,
    text,
    place_name: `${text}, ${region}, ${country}`,
    place_type: ["municipality"],
    relevance: 1,
    center,
    bbox,
    geometry: { type: "Point", coordinates: center },
    properties: {},
    context: [{ id: `region.${id}`, text: region }, { id: `country.${id}`, text: country }],
  };
}

function answer(query: string, ...features: GeocodingFeature[]): GeocodingAnswer {
  return { type: "FeatureCollection", features, query: [query] };
}

export const noPlaces: GeocodingAnswer = answer("");

/** Keyed by the lower-case query. */
export const places: Readonly<Record<string, GeocodingAnswer>> = {
  indramayu: answer(
    "indramayu",
    feature("indramayu-town", "Indramayu", "West Java", "Indonesia", [108.32, -6.326], [108.28, -6.36, 108.36, -6.29]),
    feature("indramayu-regency", "Indramayu Regency", "West Java", "Indonesia", [108.17, -6.45], [107.85, -6.67, 108.55, -6.21]),
  ),
  /** Its bbox crosses 180°, so its west is greater than its east. */
  labasa: answer("labasa", feature("labasa", "Labasa", "Northern Division", "Fiji", [179.3644, -16.4167], [178.3, -17.1, -179.7, -15.7])),
  ushuaia: answer("ushuaia", feature("ushuaia", "Ushuaia", "Tierra del Fuego", "Argentina", [-68.303, -54.8019], [-68.4, -54.86, -68.2, -54.76])),
};

// A canned answer that provider.ts would not read as the same places would test the stand-in, not the app.
for (const [query, body] of Object.entries(places)) {
  const parsed = placesOfResponse(body);
  if (parsed.length !== body.features.length || parsed.some((place, i) => place.name !== body.features[i].text)) {
    throw new Error(`The canned answer for "${query}" no longer matches the shape provider.ts reads.`);
  }
}
