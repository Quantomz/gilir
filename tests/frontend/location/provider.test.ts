// Node environment. fetch is stubbed with vi.stubGlobal and the key with vi.stubEnv: no network and no real key, so the
// file passes with NEXT_PUBLIC_MAPTILER_KEY unset. No case prints a URL, because a real key would ride in it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { creditsFor, logoFor, picturesFor, placesOfResponse, providerPolicy, readProvider, searchPlaces, searchUrl } from "@/features/location/provider";
import type { BrowserKey, SearchAnswer } from "@/features/location/provider";

const dummyKey = "dummy-key-0123";

function keyOf(raw: string = dummyKey): BrowserKey {
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", raw);
  const provider = readProvider();
  if (provider.kind !== "ready") throw new Error("expected a key");
  return provider.key;
}

function stubFetch(answer: (url: string, init: RequestInit) => Promise<Response>) {
  const fetch = vi.fn((input: URL | string, init: RequestInit = {}) => answer(String(input), init));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

/** Like the real fetch: never settles by itself, and rejects with an AbortError when its signal aborts. */
const hanging = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
  const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
  if (init.signal?.aborted) fail();
  init.signal?.addEventListener("abort", fail);
});

function feature(text: string, center: unknown, context: readonly string[] = []) {
  return { type: "Feature", text, place_name: [text, ...context].join(", "), center, context: context.map(part => ({ text: part })) };
}

const search = (key: BrowserKey, signal = new AbortController().signal) => searchPlaces(key, "Indramayu", signal);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the key", () => {
  it("[R4][R20] readProvider is missing when the variable is unset, empty or only spaces", () => {
    for (const value of [undefined, "", "   \t "]) {
      vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", value);
      expect(readProvider()).toEqual({ kind: "missing" });
    }
  });

  it("[R4] readProvider is ready with the trimmed key when it is set", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", `  ${dummyKey}\n`);
    expect(readProvider()).toEqual({ kind: "ready", key: dummyKey });
  });
});

describe("the search request", () => {
  it("[R4][R6] searchUrl is https://api.maptiler.com/geocoding/Indramayu.json with key, autocomplete=false, limit=6 and language=en, and nothing else", () => {
    const url = searchUrl(keyOf(), "Indramayu");
    expect(`${url.origin}${url.pathname}`).toBe("https://api.maptiler.com/geocoding/Indramayu.json");
    expect([...url.searchParams].sort()).toEqual([["autocomplete", "false"], ["key", dummyKey], ["language", "en"], ["limit", "6"]]);
    expect(url.hash).toBe("");
  });

  it("[R1] searchUrl sends no country, bbox, proximity or types filter", () => {
    for (const query of ["Indramayu", "Labasa", "Ushuaia", "Reykjavík", "-6.326, 108.32"]) {
      const names = [...searchUrl(keyOf(), query).searchParams.keys()];
      for (const filter of ["country", "bbox", "proximity", "types", "excludeTypes"]) expect(names).not.toContain(filter);
    }
  });

  it("searchUrl percent-encodes the query: 'São Tomé / x?y' stays one path segment", () => {
    const query = "São Tomé / x?y";
    const url = searchUrl(keyOf(), query);
    const segments = url.pathname.split("/");
    expect(segments).toHaveLength(3);
    expect(segments[1]).toBe("geocoding");
    expect(decodeURIComponent(segments[2])).toBe(`${query}.json`);
    expect([...url.searchParams.keys()].sort()).toEqual(["autocomplete", "key", "language", "limit"]);
  });

  it("[R6] searchPlaces calls fetch exactly once, with GET and a signal", async () => {
    const key = keyOf();
    const fetch = stubFetch(json({ features: [] }));
    await search(key);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(searchUrl(key, "Indramayu").href);
    expect(init?.method).toBe("GET");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("[R6][R20] nothing else in the provider makes a request, and with the key unset nothing names MapTiler", () => {
    const fetch = stubFetch(json({ features: [] }));
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", undefined);
    const provider = readProvider();
    const shown = JSON.stringify([provider, picturesFor(provider), creditsFor(provider, true), creditsFor(provider, false)]);
    expect(shown).not.toMatch(/maptiler/i);
    expect(logoFor(provider)).toBeNull();
    placesOfResponse({ features: [feature("Indramayu", [108.32, -6.33])] });
    searchUrl(keyOf(), "Indramayu");
    picturesFor(readProvider());
    creditsFor(readProvider(), true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("[R25] no value searchPlaces returns, and no error it could throw, contains the key or a URL", async () => {
    const key = keyOf();
    const leaky = new TypeError(`Failed to fetch ${searchUrl(key, "Indramayu").href}`);
    const answers: (() => Promise<Response>)[] = [
      json({ features: [feature("Indramayu", [108.32, -6.33], ["West Java", "Indonesia"])] }),
      json({ features: [] }),
      json({ message: `Invalid key ${key}` }, 403),
      json({}, 429),
      json({}, 500),
      async () => new Response("<html>not json</html>", { status: 200 }),
      async () => { throw leaky; },
    ];
    for (const answer of answers) {
      stubFetch(answer);
      const settled = await search(key).then(value => ({ value }), (error: unknown) => ({ error }));
      expect(settled).toHaveProperty("value");
      expect(JSON.stringify(settled)).not.toContain(key);
      expect(JSON.stringify(settled)).not.toMatch(/https?:|maptiler/i);
    }
  });
});

describe("the search answer", () => {
  it("200 with features -> found, at most 6 places, each with name, where and at", async () => {
    const features = Array.from({ length: 8 }, (_, i) => feature(`Place ${i + 1}`, [100 + i, 10 + i], ["Region", "Country"]));
    stubFetch(json({ features }));
    const answer = await search(keyOf());
    expect(answer.kind).toBe("found");
    const places = answer.kind === "found" ? answer.places : [];
    expect(places).toHaveLength(providerPolicy.searchLimit);
    expect(places[0]).toEqual({ kind: "found", name: "Place 1", where: "Region, Country", at: [100, 10] });
    expect(places.map(place => place.name)).toEqual(["Place 1", "Place 2", "Place 3", "Place 4", "Place 5", "Place 6"]);
  });

  it("200 with no features -> none", async () => {
    stubFetch(json({ type: "FeatureCollection", features: [] }));
    expect(await search(keyOf())).toEqual({ kind: "none" });
  });

  it("[R16] 400, 401 and 403 -> failed refused; 429 -> failed busy; 500 -> failed offline; fetch rejecting -> failed offline", async () => {
    const key = keyOf();
    const expected: [number, SearchAnswer][] = [
      [400, { kind: "failed", why: "refused" }],
      [401, { kind: "failed", why: "refused" }],
      [403, { kind: "failed", why: "refused" }],
      [429, { kind: "failed", why: "busy" }],
      [500, { kind: "failed", why: "offline" }],
      [503, { kind: "failed", why: "offline" }],
    ];
    for (const [status, answer] of expected) {
      stubFetch(json({ message: "no" }, status));
      expect(await search(key), `status ${status}`).toEqual(answer);
    }
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    expect(await search(key)).toEqual({ kind: "failed", why: "offline" });
  });

  it("[R16] no answer within providerPolicy.searchTimeoutMs -> failed slow, and the timer is cleared after a fast answer (fake timers)", async () => {
    vi.useFakeTimers();
    const key = keyOf();
    stubFetch(hanging);
    let settled: SearchAnswer | null = null;
    const answer = search(key).then(value => (settled = value));
    await vi.advanceTimersByTimeAsync(providerPolicy.searchTimeoutMs - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await answer;
    expect(settled).toEqual({ kind: "failed", why: "slow" });
    expect(vi.getTimerCount()).toBe(0);

    stubFetch(json({ features: [] }));
    expect(await search(key)).toEqual({ kind: "none" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an aborted call resolves failed offline and never rejects", async () => {
    const key = keyOf();
    stubFetch(hanging);
    const during = new AbortController();
    const pending = search(key, during.signal);
    during.abort();
    await expect(pending).resolves.toEqual({ kind: "failed", why: "offline" });

    const before = new AbortController();
    before.abort();
    await expect(search(key, before.signal)).resolves.toEqual({ kind: "failed", why: "offline" });
  });

  it("a 200 body that is not JSON, or JSON of another shape -> failed offline, never a throw", async () => {
    const key = keyOf();
    const bodies = [
      async () => new Response("<html>Gateway</html>", { status: 200 }),
      async () => new Response("", { status: 200 }),
      json({ results: [] }),
      json({ features: "none" }),
      json(null),
      json([1, 2]),
    ];
    for (const body of bodies) {
      stubFetch(body);
      await expect(search(key)).resolves.toEqual({ kind: "failed", why: "offline" });
    }
  });
});

describe("placesOfResponse", () => {
  it("builds where 'West Java, Indonesia' from the context, without repeats or empty parts", () => {
    const places = placesOfResponse({
      features: [feature("Indramayu", [108.32, -6.33], ["Indramayu", "West Java", "", "  ", "West Java", "Indonesia"])],
    });
    expect(places).toEqual([{ kind: "found", name: "Indramayu", where: "West Java, Indonesia", at: [108.32, -6.33] }]);
  });

  it("[R11] a feature whose bbox has west > east (Fiji) is read by its center alone, longitude wrapped into [-180, 180]", () => {
    const fiji = (center: readonly number[]) => ({ ...feature("Taveuni", center, ["Northern", "Fiji"]), bbox: [179.8, -17.1, -179.7, -16.6] });
    const [unwrapped, east, west] = placesOfResponse({ features: [fiji([180.2, -16.8]), fiji([179.9, -16.8]), fiji([-180.1, -16.8])] });
    expect(unwrapped.at).toEqual([-179.8, -16.8]);
    expect(east.at).toEqual([179.9, -16.8]);
    expect(west.at).toEqual([179.9, -16.8]);
    expect(unwrapped.where).toBe("Northern, Fiji");
  });

  it("a feature with no center, or a center outside ±90 latitude, is skipped", () => {
    const places = placesOfResponse({
      features: [
        { text: "No centre", place_name: "No centre, Nowhere" },
        feature("Too far north", [10, 90.5]),
        feature("Too far south", [10, -91]),
        feature("Not numbers", ["10", "20"]),
        feature("One number", [10]),
        feature("Kept", [36.07, -0.3], ["Nakuru", "Kenya"]),
      ],
    });
    expect(places).toEqual([{ kind: "found", name: "Kept", where: "Nakuru, Kenya", at: [36.07, -0.3] }]);
  });

  it("a 300-letter name still gives a place (the label is cut later, by labelFor)", () => {
    const name = "Llan".repeat(75);
    const [place] = placesOfResponse({ features: [feature(name, [-3.4, 53.2], ["Wales", "United Kingdom"])] });
    expect(place.name).toBe(name);
    expect(Array.from(place.name)).toHaveLength(300);
  });
});

describe("pictures and credits", () => {
  it("[R2] picturesFor(missing).far is the GIBS Blue Marble source: 256 px tiles, maxzoom 8, {y} before {x}, no key; near is null", () => {
    const pictures = picturesFor({ kind: "missing" });
    expect(pictures.near).toBeNull();
    expect(pictures.far).toMatchObject({ type: "raster", tileSize: 256, maxzoom: 8 });
    expect(pictures.far.tiles).toHaveLength(1);
    const tile = new URL(pictures.far.tiles?.[0] ?? "");
    expect(tile.host).toBe("gibs.earthdata.nasa.gov");
    expect(decodeURI(tile.pathname)).toMatch(/\/BlueMarble_ShadedRelief_Bathymetry\/.*\/GoogleMapsCompatible_Level8\/\{z\}\/\{y\}\/\{x\}\.jpeg$/);
    expect(tile.search).toBe("");
  });

  it("[R4] picturesFor(ready).near is a raster source whose TileJSON url is on api.maptiler.com and carries the key; far has no key", () => {
    const pictures = picturesFor({ kind: "ready", key: keyOf() });
    expect(pictures.near?.type).toBe("raster");
    const tileJson = new URL(pictures.near?.url ?? "");
    expect(tileJson.protocol).toBe("https:");
    expect(tileJson.host).toBe("api.maptiler.com");
    expect(tileJson.pathname).toMatch(/\/tiles\.json$/);
    expect(tileJson.searchParams.get("key")).toBe(dummyKey);
    expect(JSON.stringify(pictures.far)).not.toContain(dummyKey);
    expect(JSON.stringify(pictures.far)).not.toMatch(/maptiler/i);
  });

  it("[R5] with the pictures, creditsFor(missing) names NASA EOSDIS GIBS; creditsFor(ready) adds © MapTiler and © OpenStreetMap contributors, each with an https link", () => {
    expect(creditsFor({ kind: "missing" }, true).map(credit => credit.text)).toEqual(["NASA EOSDIS GIBS"]);
    const ready = creditsFor({ kind: "ready", key: keyOf() }, true);
    expect(ready.map(credit => credit.text)).toEqual(["NASA EOSDIS GIBS", "© MapTiler", "© OpenStreetMap contributors"]);
    for (const credit of ready.slice(1)) expect(new URL(credit.href ?? "").protocol).toBe("https:");
    expect(JSON.stringify(ready)).not.toContain(dummyKey);
  });

  it("[R5] with the flat drawing there are no pictures to credit: nothing with no key, and only the place search's © MapTiler and © OpenStreetMap contributors with one", () => {
    expect(creditsFor({ kind: "missing" }, false)).toEqual([]);
    expect(creditsFor({ kind: "ready", key: keyOf() }, false).map(credit => credit.text)).toEqual(["© MapTiler", "© OpenStreetMap contributors"]);
  });

  it("[R4][R5] with a key logoFor gives MapTiler's logo picture and its link, neither carrying the key", () => {
    expect(logoFor({ kind: "ready", key: keyOf() })).toEqual({ src: "https://api.maptiler.com/resources/logo.svg", href: "https://www.maptiler.com/" });
  });
});
