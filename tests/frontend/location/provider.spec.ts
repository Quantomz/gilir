// Playwright, Chromium, against a MOCKED MapTiler: every request to api.maptiler.com is answered by
// support/providers.ts with a canned TileJSON, a synthetic tile and a canned search answer; GIBS gets the same tile.
// MOCKED EVIDENCE. It proves the wiring: what is asked, when, and what the farmer then sees. It does NOT pass the card's
// live criterion ("A mocked search alone does not pass"): live.spec.ts does, and it is BLOCKED here.
// The dev server must start with a dummy key so the key is inlined; without it this file skips:
//   CI=1 NEXT_PUBLIC_MAPTILER_KEY=pw-dummy-key PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT \
//     npx playwright test tests/frontend/location/provider.spec.ts
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { providerPolicy } from "@/features/location/provider";
import { readingKey } from "@/features/onboarding/services/reading";
import { inputFixture } from "@/fixtures/input";
import { allAnswer, routeProviders } from "./support/providers";
import type { ProviderPlan, ProviderRoutes } from "./support/providers";
import { good } from "./support/shapes";
import {
  betweenBars, centresOf, distance, drag, dragHandle, expectFieldOnPage, firstPicker, handles, layoutProblems, lookupOf, mapArea,
  openPageOne, settledCentre, shoot, typeCorners,
} from "./support/slot";
import type { Point } from "./support/slot";

const dummyKey = "pw-dummy-key";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }, viewport: { width: 360, height: 740 } });
test.describe.configure({ timeout: 120_000 });
test.skip(process.env.NEXT_PUBLIC_MAPTILER_KEY !== dummyKey, `needs the dev server started with NEXT_PUBLIC_MAPTILER_KEY=${dummyKey}`);

async function openLab(page: Page, plan: Partial<ProviderPlan> = {}): Promise<{ root: Locator; routes: ProviderRoutes }> {
  const routes = await routeProviders(page, { ...allAnswer, ...plan });
  await page.goto("/dev/fixtures");
  const root = firstPicker(page);
  await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
  return { root, routes };
}

const searchBox = (root: Locator) => root.getByRole("searchbox", { name: "Village, town or area" });

async function search(root: Locator, text: string): Promise<void> {
  await root.getByRole("button", { name: "Search again" }).click();
  await searchBox(root).fill(text);
  await searchBox(root).press("Enter");
}

const placeRow = (root: Locator, name: string) => root.getByRole("list", { name: "Places" }).getByRole("button", { name: new RegExp(`^${name}\\b`) });

async function mapCentre(root: Locator): Promise<Point> {
  await mapArea(root).scrollIntoViewIfNeeded();
  const box = (await mapArea(root).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const average = (points: readonly Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

test("[R6] typing 'Indramayu' sends no request to the provider; Enter sends exactly one geocoding request", async ({ page }) => {
  const { root, routes } = await openLab(page);
  await root.getByRole("button", { name: "Search again" }).click();
  await searchBox(root).pressSequentially("Indramayu", { delay: 50 });
  await page.waitForTimeout(1000);
  expect(routes.of("search")).toHaveLength(0);
  await searchBox(root).press("Enter");
  await expect(placeRow(root, "Indramayu").first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(routes.of("search")).toHaveLength(1);
  expect(routes.of("search")[0].query).toBe("Indramayu");
});

test("[R4][R1] that request has key=pw-dummy-key, autocomplete=false, and no proximity, bbox or country", async ({ page }) => {
  const { root, routes } = await openLab(page);
  await search(root, "Indramayu");
  await expect(placeRow(root, "Indramayu").first()).toBeVisible();
  const [request] = routes.of("search");
  expect(request.url.searchParams.get("key")).toBe(dummyKey);
  expect(request.url.searchParams.get("autocomplete")).toBe("false");
  for (const name of ["proximity", "bbox", "country"]) expect(request.url.searchParams.has(name)).toBe(false);
});

test("[R4] tile requests that carry the key go to api.maptiler.com only; GIBS requests carry no key", async ({ page }) => {
  const { root, routes } = await openLab(page);
  // The lab opens close to its field, where only MapTiler's pictures show. NASA's show further out.
  const zoomOut = root.getByRole("button", { name: "Zoom out" });
  for (let press = 0; press < 14 && routes.of("gibs").length === 0; press++) {
    await zoomOut.click();
    await page.waitForTimeout(400);
  }
  expect(routes.of("gibs").length).toBeGreaterThan(0);
  await search(root, "Indramayu");
  await placeRow(root, "Indramayu").first().click();
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect.poll(() => routes.of("tile").length, { timeout: 30_000 }).toBeGreaterThan(0);
  for (const request of routes.requests) {
    if (request.url.href.includes(dummyKey)) expect(request.url.hostname).toBe("api.maptiler.com");
  }
  for (const request of routes.of("gibs")) expect(request.url.searchParams.has("key")).toBe(false);
  expect(routes.of("elsewhere")).toHaveLength(0);
});

test("[R3] choosing 'Indramayu' drops the pin and the camera goes there; 'Mark my field' draws a 1 ha box with its handles apart", async ({ page }, testInfo) => {
  const { root } = await openLab(page);
  await search(root, "Indramayu");
  await placeRow(root, "Indramayu").first().click();
  const pin = root.locator(".fp-pin");
  await expect(pin).toBeVisible();
  const centre = await mapCentre(root);
  const tip = await settledCentre(pin);
  expect(Math.abs(tip.x - centre.x)).toBeLessThan(40);
  expect(Math.abs(tip.y - centre.y)).toBeLessThan(80);
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect(handles(root)).toHaveCount(4);
  await expect(root.getByText(/^Your field is marked: /).first()).toHaveText("Your field is marked: about 1 hectare, 4 corners.");
  await settledCentre(handles(root).first());
  const corners = await centresOf(handles(root));
  for (const [i, a] of corners.entries()) for (const b of corners.slice(i + 1)) expect(distance(a, b)).toBeGreaterThan(24);
  await shoot(page, testInfo, "provider-indramayu-box-360", mapArea(root));
  const field = await expectFieldOnPage(root);
  expect(field.label).toMatch(/^Field near Indramayu, /);
  await expect(root.getByText(/^The map pictures didn’t load\./)).toHaveCount(0);
});

test("tapping the map moves the box to the tap; after dragging a corner a tap no longer moves it", async ({ page }) => {
  const { root } = await openLab(page);
  await search(root, "Indramayu");
  await placeRow(root, "Indramayu").first().click();
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect(handles(root)).toHaveCount(4);
  const centre = await mapCentre(root);
  await settledCentre(handles(root).first());
  // Clear of the corner handles and the zoom buttons.
  const tap = { x: centre.x - 60, y: centre.y + 110 };
  const before = await lookupOf(root);
  await page.mouse.click(tap.x, tap.y);
  await expect.poll(() => lookupOf(root)).not.toEqual(before);
  await settledCentre(handles(root).first());
  expect(distance(average(await centresOf(handles(root))), tap)).toBeLessThan(12);

  await dragHandle(page, root, 2, from => ({ x: from.x + 20, y: from.y + 20 }));
  const drawn = await lookupOf(root);
  const corners = await centresOf(handles(root));
  const elsewhere = await mapCentre(root);
  await page.mouse.click(elsewhere.x + 80, elsewhere.y - 40);
  await page.waitForTimeout(800);
  expect(await lookupOf(root)).toEqual(drawn);
  const after = await centresOf(handles(root));
  for (const [i, corner] of after.entries()) expect(distance(corner, corners[i])).toBeLessThan(2);
});

test("[R11] a canned Fiji answer whose bbox has west > east: the camera goes to its center, and the label is 'Field near Labasa, …', not Tonga", async ({ page }) => {
  const { root } = await openLab(page);
  await search(root, "Labasa");
  await placeRow(root, "Labasa").click();
  const pin = root.locator(".fp-pin");
  await expect(pin).toBeVisible();
  const centre = await mapCentre(root);
  const tip = await settledCentre(pin);
  expect(Math.abs(tip.x - centre.x)).toBeLessThan(40);
  expect(Math.abs(tip.y - centre.y)).toBeLessThan(80);
  await root.getByRole("button", { name: "Mark my field" }).click();
  const field = await expectFieldOnPage(root);
  expect(field.label).toMatch(/^Field near Labasa, Northern Division, Fiji$/);
  expect(Math.abs(field.lookup[0] - 179.3644)).toBeLessThan(0.01);
  expect(Math.abs(field.lookup[1] + 16.4167)).toBeLessThan(0.01);
});

test("[R5] the credits line reads NASA EOSDIS GIBS, © MapTiler and © OpenStreetMap contributors without a press, in text of at least 18 px", async ({ page }, testInfo) => {
  const { root } = await openLab(page);
  const credits = root.locator(".fp-credits");
  const line = credits.locator("p").first();
  await expect(line).toBeVisible();
  for (const name of ["NASA EOSDIS GIBS", "© MapTiler", "© OpenStreetMap contributors"]) await expect(line).toContainText(name);
  const links = [
    { name: "© MapTiler", href: "https://www.maptiler.com/copyright/" },
    { name: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" },
  ];
  for (const { name, href } of links) await expect(credits.getByRole("link", { name })).toHaveAttribute("href", href);
  for (const text of [line, ...links.map(({ name }) => credits.getByRole("link", { name }))]) {
    expect(parseFloat(await text.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(18);
  }
  await shoot(page, testInfo, "provider-credits-360", credits);
});

for (const width of [360, 1280]) {
  test(`[R5][R14] the fallback footer and scale leave all four corner numbers clear at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 740 });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value(this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
          return kind === "webgl2" ? null : Reflect.apply(original, this, [kind, ...args]);
        },
      });
    });
    const routes = await routeProviders(page, allAnswer);
    await page.goto("/dev/fixtures");
    const root = firstPicker(page);
    await expect(root).toHaveAttribute("data-surface", "plan", { timeout: 60_000 });
    await typeCorners(root, good.north);
    const drawing = root.getByRole("img", { name: "Drawing of your field, north at the top. It is a drawing, not a photo." });
    const footer = root.locator(".fp-map-foot");
    await expect(drawing).toBeVisible();
    await expect(footer.getByText("A drawing, not a photo", { exact: true })).toBeVisible();
    const logo = footer.getByRole("link", { name: "MapTiler logo (opens in a new tab)" });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.getByRole("img").evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    await mapArea(root).scrollIntoViewIfNeeded();
    await shoot(page, testInfo, `provider-fallback-footer-${width}`, mapArea(root));
    for (const number of [1, 2, 3, 4]) {
      const label = drawing.locator("text").filter({ hasText: new RegExp(`^${number}$`) });
      await expect(label).toBeVisible();
      const labelBox = await label.boundingBox();
      expect(labelBox).not.toBeNull();
      if (!labelBox) throw new Error("The corner label must be visible.");
      for (const obstacle of [{ name: "fallback footer", element: footer }, { name: "scale label", element: drawing.locator(".fp-plan-scale text") }]) {
        const obstacleBox = await obstacle.element.boundingBox();
        expect(obstacleBox).not.toBeNull();
        if (!obstacleBox) throw new Error(`The ${obstacle.name} must be visible.`);
        const overlaps = labelBox.x < obstacleBox.x + obstacleBox.width && labelBox.x + labelBox.width > obstacleBox.x
          && labelBox.y < obstacleBox.y + obstacleBox.height && labelBox.y + labelBox.height > obstacleBox.y;
        expect(overlaps, `corner ${number} must not overlap the ${obstacle.name}`).toBe(false);
      }
    }
    expect(routes.of("elsewhere")).toHaveLength(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`[R5] the linked provider logo is visible and usable at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme });
      const { root } = await openLab(page);
      const logo = root.getByRole("link", { name: "MapTiler logo (opens in a new tab)" });
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute("href", "https://www.maptiler.com");
      const image = logo.getByRole("img", { name: "MapTiler logo" });
      await expect(image).toHaveAttribute("src", "/maptiler-logo.svg");
      await expect.poll(() => image.evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
      const box = (await logo.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(logo).toHaveCSS("background-color", colorScheme === "dark" ? "rgb(10, 18, 12)" : "rgb(20, 33, 22)");
      await logo.click({ trial: true });
      await root.getByRole("button", { name: "Zoom out" }).focus();
      await page.keyboard.press("Tab");
      await expect(logo).toBeFocused();
    });
  }
}

test("[R16] a 403 to the search shows its explanation; a 429 says the search is busy; 403 to tiles shows 'The map pictures didn’t load. …' and the globe still turns", async ({ page }) => {
  const { root, routes } = await openLab(page, { search: "refused" });
  await search(root, "Indramayu");
  await expect(root.getByText("The place search isn’t working on this site right now. Type a position, like -6.326, 108.32, or your field’s corners.")).toBeVisible();

  routes.plan.search = "busy";
  await searchBox(root).press("Enter");
  await expect(root.getByText("The place search is busy. Wait a moment, then press Search again.")).toBeVisible();

  routes.plan.gibs = "refused";
  routes.plan.maptiler = "refused";
  await page.reload();
  await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
  await expect(root.getByText(/^The map pictures didn’t load\./)).toBeVisible({ timeout: 30_000 });
  await root.getByRole("button", { name: "Search again" }).click();
  await searchBox(root).fill("-0.3, 36.07");
  await searchBox(root).press("Enter");
  const pin = root.locator(".fp-pin");
  await expect(pin).toBeVisible();
  const centre = await mapCentre(root);
  const placed = await settledCentre(pin);
  await drag(page, centre, { x: centre.x - 60, y: centre.y + 40 });
  expect(distance(placed, await settledCentre(pin))).toBeGreaterThan(30);
});

test("[R16] no answer, an answer past the time limit and no place found each say so in the slot; a typed position still marks a field after them", async ({ page }) => {
  const { root, routes } = await openLab(page, { search: "offline" });
  await search(root, "Indramayu");
  await expect(root.getByText("We couldn’t reach the place search. Check your internet connection, then press Search again. You can also type a position or your field’s corners.")).toBeVisible();

  routes.plan.search = "slow";
  await searchBox(root).press("Enter");
  await expect(root.getByText("The place search took too long. Press Search again, or type a position.")).toBeVisible({ timeout: providerPolicy.searchTimeoutMs + 5000 });

  routes.plan.search = "answer";
  await searchBox(root).fill("Atlantis");
  await searchBox(root).press("Enter");
  await expect(root.getByText("No place found. Try the nearest town, or tap the globe.")).toBeVisible();

  await searchBox(root).fill("-6.326, 108.32");
  await searchBox(root).press("Enter");
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expectFieldOnPage(root);
  expect(routes.of("search").map(request => request.query)).toEqual(["Indramayu", "Indramayu", "Atlantis"]);
});

test("[R25] no request to any provider carries a coordinate of the field: only the typed text and tile z, x and y", async ({ page }) => {
  const { root, routes } = await openLab(page);
  await search(root, "Indramayu");
  await placeRow(root, "Indramayu").first().click();
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect(handles(root)).toHaveCount(4);
  await dragHandle(page, root, 1, from => ({ x: from.x + 20, y: from.y - 20 }));
  const field = await expectFieldOnPage(root);
  await expect.poll(() => routes.of("tile").length, { timeout: 30_000 }).toBeGreaterThan(0);

  const numbers = [...field.ring.flat(), ...field.lookup].map(value => String(Math.abs(value)));
  for (const request of routes.requests) {
    expect(request.kind).not.toBe("elsewhere");
    expect(request.kind).not.toBe("maptiler_other");
    const text = decodeURIComponent(request.url.pathname + request.url.search);
    for (const number of numbers) expect(text.includes(number), `a ${request.kind} request carries a field coordinate`).toBe(false);
    const params = [...request.url.searchParams.keys()].sort();
    if (request.kind === "search") {
      expect(request.query).toBe("Indramayu");
      expect(params).toEqual(["autocomplete", "key", "language", "limit"]);
    } else {
      expect(request.url.pathname).toMatch(/(\/\d+\/\d+\/\d+\.\w+|\/tiles\.json)$/);
      expect(params).toEqual(request.kind === "gibs" ? [] : ["key"]);
    }
  }
});

const picturesNotice = (root: Locator) => root.getByText(/^The map pictures didn’t load\./);

/** No two boxes share a pixel. */
const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

const logoViews = [
  { width: 360, height: 740, textSize: "normal" },
  { width: 320, height: 568, textSize: "large" },
  { width: 320, height: 568, textSize: "largest" },
  { width: 1280, height: 600, textSize: "large" },
] as const;

for (const { width, height, textSize } of logoViews) {
  test.describe(`${textSize} text at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    test("[R5][R22] on F1's page 1 MapTiler's linked logo sits in the map's bottom left; once a field is marked every corner handle can be pressed, and no zoom button or logo touches one", async ({ page }, testInfo) => {
      await routeProviders(page, allAnswer);
      await page.addInitScript(([key, size]) => localStorage.setItem(key, JSON.stringify({ textSize: size })), [readingKey, textSize] as const);
      const root = (await openPageOne(page)).first();
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      const link = root.getByRole("link", { name: "MapTiler logo (opens in a new tab)" });
      await expect(link).toBeVisible();
      await searchBox(root).fill("-6.326, 108.32");
      await searchBox(root).press("Enter");
      await root.getByRole("button", { name: "Mark my field" }).click();
      await expect(handles(root)).toHaveCount(4);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      const [map, logo] = [(await mapArea(root).boundingBox())!, (await link.boundingBox())!];
      expect(logo.x - map.x).toBeLessThanOrEqual(16);
      expect(map.y + map.height - (logo.y + logo.height)).toBeLessThanOrEqual(16);
      const zoom = await Promise.all(["Zoom in", "Zoom out"].map(async name => ({ name, box: (await root.getByRole("button", { name }).boundingBox())! })));
      for (const { name, box } of zoom) expect(apart(logo, box), `${name} is clear of the logo`).toBe(true);
      for (const [index, handle] of (await handles(root).all()).entries()) {
        const box = (await handle.boundingBox())!;
        expect(apart(logo, box), `corner ${index + 1} is clear of the logo`).toBe(true);
        for (const button of zoom) expect(apart(button.box, box), `corner ${index + 1} is clear of ${button.name}`).toBe(true);
      }
      const covered = await root.evaluate((element: HTMLElement) => [...element.querySelectorAll(".fp-handle")].flatMap((handle, index) => {
        const box = handle.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit && handle.contains(hit) ? [] : [`corner ${index + 1}`];
      }));
      expect(covered, "a press on each corner's centre reaches its handle").toEqual([]);
      expect(await layoutProblems(page, root)).toEqual([]);
      await shoot(page, testInfo, `provider-logo-${textSize}-${width}`, mapArea(root));
    });
  });
}

test("[R16] on F1's page 1 with MapTiler's pictures refused (a bad key): the world view shows NASA's pictures with no notice; on the marked field 'The map pictures didn’t load. …' shows", async ({ page }, testInfo) => {
  const routes = await routeProviders(page, { ...allAnswer, maptiler: "refused" });
  const root = (await openPageOne(page)).first();
  await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
  await expect.poll(() => routes.of("gibs").length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => routes.of("tilejson").length, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  const notice = picturesNotice(root);
  await expect(notice).toHaveCount(0);
  await searchBox(root).fill("-6.326, 108.32");
  await searchBox(root).press("Enter");
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect(handles(root)).toHaveCount(4);
  await page.waitForTimeout(3000);
  await expect(notice).toBeVisible();
  await shoot(page, testInfo, "provider-close-ups-refused-360", notice);
  expect(routes.of("tile")).toHaveLength(0);
});

test("[R16] on F1's page 1 with NASA's pictures refused and MapTiler's answering: the world view says 'The map pictures didn’t load. …'; on the marked field the close-ups show and the notice goes", async ({ page }) => {
  const routes = await routeProviders(page, { ...allAnswer, gibs: "refused" });
  const root = (await openPageOne(page)).first();
  await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
  const notice = picturesNotice(root);
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await searchBox(root).fill("-6.326, 108.32");
  await searchBox(root).press("Enter");
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect(handles(root)).toHaveCount(4);
  await expect.poll(() => routes.of("tile").length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(notice).toHaveCount(0, { timeout: 15_000 });
});

test("[R14][R16] a lost WebGL context that comes back asks for the pictures again; when they fail then, 'The map pictures didn’t load. …' shows", async ({ page }) => {
  const { root, routes } = await openLab(page);
  await expect(handles(root)).toHaveCount(4);
  await expect.poll(() => routes.of("tile").length, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  const notice = picturesNotice(root);
  await expect(notice).toHaveCount(0);
  const asked = routes.of("tilejson").length;
  routes.plan.maptiler = "offline";
  routes.plan.gibs = "offline";
  await page.evaluate(() => {
    const lose = document.querySelector<HTMLCanvasElement>(".fp canvas.maplibregl-canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!lose) throw new Error("no WebGL2 context to lose");
    lose.loseContext();
    setTimeout(() => lose.restoreContext(), 500);
  });
  await expect.poll(() => routes.of("tilejson").length, { timeout: 15_000 }).toBeGreaterThan(asked);
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(root).toHaveAttribute("data-surface", "globe");
});

test("[R16][R22] on F1's page 1 the answer to Search comes into view above F1's dock: the places found, then a search that could not reach the provider", async ({ page }) => {
  const routes = await routeProviders(page, allAnswer);
  const root = (await openPageOne(page)).first();
  await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
  await searchBox(root).fill("Indramayu");
  await searchBox(root).press("Enter");
  const first = placeRow(root, "Indramayu").first();
  await expect(first).toBeVisible();
  await expect.poll(() => betweenBars(page, first), { message: "the first place is between F1's bar and dock" }).toBe(true);

  routes.plan.search = "offline";
  await page.evaluate(() => window.scrollTo(0, 0));
  await searchBox(root).fill("Ushuaia");
  await searchBox(root).press("Enter");
  const reason = root.getByText("We couldn’t reach the place search. Check your internet connection, then press Search again. You can also type a position or your field’s corners.");
  await expect(reason).toBeVisible();
  await expect.poll(() => betweenBars(page, reason), { message: "the reason is between F1's bar and dock" }).toBe(true);
});

const twoColumns = [
  { width: 1280, height: 720, textSize: "normal" },
  { width: 1280, height: 720, textSize: "large" },
  { width: 1280, height: 800, textSize: "large" },
] as const;

for (const { width, height, textSize } of twoColumns) {
  test.describe(`${textSize} text at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    test("[R22][R5] in two columns the map, the NASA and MapTiler credits and the privacy line stay between F1's bar and dock while the farmer types corner 3", async ({ page }) => {
      await routeProviders(page, allAnswer);
      await page.addInitScript(([key, size]) => localStorage.setItem(key, JSON.stringify({ textSize: size })), [readingKey, textSize] as const);
      const root = (await openPageOne(page, inputFixture)).first();
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      await root.getByRole("button", { name: "Type the corners" }).click();
      const latitude = root.getByRole("group", { name: "Corner 3" }).getByRole("textbox", { name: /latitude/i });
      await latitude.click();
      await page.keyboard.press("End");
      await page.keyboard.type("1");
      await expect(latitude).toBeFocused();
      await expect(root.locator(".fp-credits")).toContainText("MapTiler");
      await expect.poll(() => betweenBars(page, root.locator(".fp-map-wrap")), { message: "the map and its credits are between F1's bar and dock" }).toBe(true);
      await expect.poll(() => betweenBars(page, latitude)).toBe(true);
    });
  });
}
