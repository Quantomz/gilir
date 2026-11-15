// Node environment, fetch stubbed with vi.stubGlobal and the key with vi.stubEnv. The provider boundary: what is sent,
// and what comes back as domain values. No network and no key: the file passes with NEXT_PUBLIC_MAPTILER_KEY unset
// (docs/cards/F2.md:41). No case prints a URL: a real key would ride in it.
import { describe, it } from "vitest";

describe("the key", () => {
  it.todo("[R4][R20] readProvider is missing when the variable is unset, empty or only spaces");
  it.todo("[R4] readProvider is ready with the trimmed key when it is set");
});

describe("the search request", () => {
  it.todo("[R4][R6] searchUrl is https://api.maptiler.com/geocoding/Indramayu.json with key, autocomplete=false, limit=6 and language=en, and nothing else");
  it.todo("[R1] searchUrl sends no country, bbox, proximity or types filter");
  it.todo("searchUrl percent-encodes the query: 'São Tomé / x?y' stays one path segment");
  it.todo("[R6] searchPlaces calls fetch exactly once, with GET and a signal");
  it.todo("[R25] no value searchPlaces returns, and no error it could throw, contains the key or a URL");
});

describe("the search answer", () => {
  it.todo("200 with features -> found, at most 6 places, each with name, where and at");
  it.todo("200 with no features -> none");
  it.todo("[R16] 400, 401 and 403 -> failed refused; 429 -> failed busy; 500 -> failed offline; fetch rejecting -> failed offline");
  it.todo("[R16] no answer within providerPolicy.searchTimeoutMs -> failed slow, and the timer is cleared after a fast answer (fake timers)");
  it.todo("an aborted call resolves failed offline and never rejects");
  it.todo("a 200 body that is not JSON, or JSON of another shape -> failed offline, never a throw");
});

describe("placesOfResponse", () => {
  it.todo("builds where 'West Java, Indonesia' from the context, without repeats or empty parts");
  it.todo("[R11] a feature whose bbox has west > east (Fiji) is read by its center alone, longitude wrapped into [-180, 180]");
  it.todo("a feature with no center, or a center outside ±90 latitude, is skipped");
  it.todo("a 300-letter name still gives a place (the label is cut later, by labelFor)");
});

describe("pictures and credits", () => {
  it.todo("[R2] picturesFor(missing).far is the GIBS Blue Marble source: 256 px tiles, maxzoom 8, {y} before {x}, no key; near is null");
  it.todo("[R4] picturesFor(ready).near is a raster source whose TileJSON url is on api.maptiler.com and carries the key; far has no key");
  it.todo("[R5] creditsFor(missing) names NASA EOSDIS GIBS; creditsFor(ready) adds © MapTiler and © OpenStreetMap contributors, each with an https link");
});
