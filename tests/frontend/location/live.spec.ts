// Playwright, Chromium, against the REAL providers. This is the card's live criterion: "Globe rotation, submitted place
// search, zoom, polygon edit, and fallback controls work in a real configured browser. A mocked search alone does not
// pass."
//
// BLOCKED in the build container: the proxy refuses api.maptiler.com and gibs.earthdata.nasa.gov and no key is set.
// It runs only when someone supplies a key restricted to the test origin and a network that reaches both hosts, and
// says so with F2_LIVE=1:
//   CI=1 F2_LIVE=1 NEXT_PUBLIC_MAPTILER_KEY=<the key> PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT \
//     npx playwright test tests/frontend/location/live.spec.ts
// Until then the PR records each case below as BLOCKED, never as passed.
//
// The key is in every MapTiler URL. So traces and video are off here, no HAR is saved, screenshots are of the page
// only, nothing prints a URL, and no assertion message carries one.
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { picturesFor, readProvider } from "@/features/location/provider";
import { good } from "./support/shapes";
import {
  drag, dragHandle, expectFieldOnPage, firstPicker, handles, lookupOf, mapArea, pixelsAt,
  settledCentre, shoot, typeCorners,
} from "./support/slot";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }, trace: "off", video: "off", screenshot: "off" });
test.describe.configure({ timeout: 180_000 });
test.skip(process.env.F2_LIVE !== "1" || !process.env.NEXT_PUBLIC_MAPTILER_KEY, "BLOCKED: needs NEXT_PUBLIC_MAPTILER_KEY and network access to api.maptiler.com and gibs.earthdata.nasa.gov");

async function openLab(page: Page, surface: "globe" | "plan" = "globe"): Promise<Locator> {
  await page.goto("/dev/fixtures");
  const root = firstPicker(page);
  await expect(root).toHaveAttribute("data-surface", surface, { timeout: 60_000 });
  return root;
}

const searchBox = (root: Locator) => root.getByRole("searchbox", { name: "Village, town or area" });
const places = (root: Locator) => root.getByRole("list", { name: "Places" }).getByRole("button");

async function search(root: Locator, text: string): Promise<void> {
  await root.getByRole("button", { name: "Search again" }).click();
  await searchBox(root).fill(text);
  await searchBox(root).press("Enter");
  await expect(places(root).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * The satellite TileJSON, fetched with the key. A failure says what failed and never carries the URL, which holds
 * the key.
 */
async function satelliteTileJson(request: APIRequestContext): Promise<{ status: number; body: Record<string, unknown> }> {
  const near = picturesFor(readProvider()).near;
  expect(near !== null && typeof near.url === "string", "provider.ts names a satellite TileJSON").toBe(true);
  try {
    const response = await request.get(near!.url!);
    return { status: response.status(), body: response.ok() ? await response.json() as Record<string, unknown> : {} };
  } catch {
    throw new Error("The satellite TileJSON request failed.");
  }
}

/** The lookup of the field marked on the first search result for `text`. */
async function markFirstResult(root: Locator, text: string): Promise<readonly [number, number]> {
  await search(root, text);
  await places(root).first().click();
  await root.getByRole("button", { name: "Mark my field" }).click();
  await expect(handles(root)).toHaveCount(4);
  return (await lookupOf(root))!;
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`live at ${viewport.width}px`, () => {
    test.use({ viewport });
    const w = viewport.width;

    test("[R19][R3] the globe shows NASA's Blue Marble far out and turns when dragged", async ({ page }, testInfo) => {
      const root = await openLab(page);
      await root.getByRole("button", { name: "Search again" }).click();
      for (let press = 0; press < 18; press++) await root.getByRole("button", { name: "Zoom out" }).click();
      await mapArea(root).scrollIntoViewIfNeeded();
      await page.waitForTimeout(3000);
      const box = (await mapArea(root).boundingBox())!;
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const [before] = await pixelsAt(page, [centre]);
      await shoot(page, testInfo, `live-blue-marble-${w}`);
      await drag(page, centre, { x: centre.x - box.width / 3, y: centre.y });
      await page.waitForTimeout(2000);
      const [after] = await pixelsAt(page, [centre]);
      expect(after).not.toEqual(before);
    });

    test("[R19][R6] a submitted search for 'Indramayu' returns real places; choosing one moves the camera there", async ({ page }) => {
      const root = await openLab(page);
      await search(root, "Indramayu");
      await expect(places(root).first()).toContainText("Indramayu");
      await places(root).first().click();
      const pin = root.locator(".fp-pin");
      await expect(pin).toBeVisible();
      await mapArea(root).scrollIntoViewIfNeeded();
      const tip = await settledCentre(pin);
      const box = (await mapArea(root).boundingBox())!;
      expect(Math.abs(tip.x - (box.x + box.width / 2))).toBeLessThan(40);
      expect(Math.abs(tip.y - (box.y + box.height / 2))).toBeLessThan(80);
    });

    test("[R19][R1] submitted searches for 'Labasa' (Fiji) and 'Ushuaia' each return a place on the right side of the world", async ({ page }) => {
      const root = await openLab(page);
      const [fijiLng, fijiLat] = await markFirstResult(root, "Labasa");
      expect(Math.abs(fijiLng)).toBeGreaterThan(177);
      expect(fijiLat).toBeLessThan(-15);
      expect(fijiLat).toBeGreaterThan(-18);
      const [southLng, southLat] = await markFirstResult(root, "Ushuaia");
      expect(southLng).toBeGreaterThan(-70);
      expect(southLng).toBeLessThan(-67);
      expect(southLat).toBeLessThan(-54);
      expect(southLat).toBeGreaterThan(-56);
    });

    test("[R19][R3] 'Mark my field', then zoom to where single fields show in MapTiler's satellite pictures", async ({ page }, testInfo) => {
      const root = await openLab(page);
      await markFirstResult(root, "Indramayu");
      for (let press = 0; press < 3; press++) await root.getByRole("button", { name: "Zoom in" }).click();
      await page.waitForTimeout(4000);
      await shoot(page, testInfo, `live-field-zoom-${w}`);
      await expect(root.getByText(/^The map pictures didn’t load\./)).toHaveCount(0);
      await expectFieldOnPage(root);
    });

    test("[R19][R7] drag a corner, add a corner, remove a corner: the size words and data-lookup follow", async ({ page }) => {
      const root = await openLab(page);
      await markFirstResult(root, "Indramayu");
      const status = root.getByText(/^Your field is marked: /).first();
      const marked = await status.textContent();
      await dragHandle(page, root, 1, from => ({ x: from.x + 30, y: from.y + 30 }));
      await expect(status).not.toHaveText(marked ?? "");
      await handles(root).nth(1).click();
      await root.getByRole("button", { name: "Add a corner" }).click();
      await expect(handles(root)).toHaveCount(5);
      await expect(status).toContainText("5 corners");
      await handles(root).nth(2).click();
      await root.getByRole("button", { name: "Remove corner 3" }).click();
      await expect(handles(root)).toHaveCount(4);
      await expect(status).toContainText("4 corners");
      await expectFieldOnPage(root);
    });

    test("[R19][R15] with the globe showing, the corner list still marks a typed field", async ({ page }) => {
      const root = await openLab(page);
      await typeCorners(root, good.south);
      await expect(handles(root)).toHaveCount(4);
      await expectFieldOnPage(root, good.south);
    });

    test("[R19][R5] the credits line holds every name in each provider's own TileJSON attribution, and MapTiler's logo rule is checked against its terms", async ({ page, request }, testInfo) => {
      const root = await openLab(page);
      const tileJson = (await satelliteTileJson(request)).body as { attribution?: string; logo?: string };
      const names = [...(tileJson.attribution ?? "").replace(/<[^>]+>/g, "\n").replace(/&copy;/g, "©").split("\n")].map(name => name.trim()).filter(Boolean);
      expect(names.length).toBeGreaterThan(0);
      const credits = root.locator(".fp-credits");
      for (const name of names) await expect(credits).toContainText(name);
      await shoot(page, testInfo, `live-credits-${w}`);
      testInfo.annotations.push({ type: "logo", description: tileJson.logo ? "the TileJSON names a logo: check MapTiler's terms for the free plan by hand" : "the TileJSON names no logo" });
    });

    test("[R19] the satellite TileJSON path in provider.ts answers 200, and its tile size and zoom range are what the map uses", async ({ request }) => {
      const near = picturesFor(readProvider()).near!;
      const { status, body } = await satelliteTileJson(request);
      expect(status).toBe(200);
      const tileJson = body as { tiles?: string[]; tileSize?: number; maxzoom?: number };
      expect(tileJson.tiles?.length ?? 0).toBeGreaterThan(0);
      expect(tileJson.tileSize ?? 256).toBe(near.tileSize ?? 512);
      expect(tileJson.maxzoom ?? 0).toBeGreaterThanOrEqual(16);
      if (near.maxzoom !== undefined) expect(near.maxzoom).toBeLessThanOrEqual(tileJson.maxzoom ?? 0);
    });
  });
}

test.describe("live, no WebGL2", () => {
  // launchOptions cannot change inside a describe (it forces a new worker), so this phone without WebGL2 is made per
  // page: getContext("webgl2") answers null, and MapLibre throws GPUInitializationError as it does on such a phone.
  test.use({ viewport: { width: 360, height: 740 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return kind === "webgl2" ? null : (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
      } as typeof original;
    });
  });
  test("[R19][R14] with WebGL off, a real submitted search still names the place, and 'Mark my field' plus the corner list mark a field on the drawing", async ({ page }, testInfo) => {
    const root = await openLab(page, "plan");
    await search(root, "Indramayu");
    await expect(places(root).first()).toContainText("Indramayu");
    await places(root).first().click();
    await root.getByRole("button", { name: "Mark my field" }).click();
    await expect(root.getByRole("img", { name: "Drawing of your field, north at the top. It is a drawing, not a photo." })).toBeVisible();
    const field = await expectFieldOnPage(root);
    expect(field.label).toMatch(/^Field near Indramayu/);
    await typeCorners(root, good.north);
    await expect.poll(() => lookupOf(root)).not.toEqual(field.lookup);
    await expectFieldOnPage(root, good.north);
    await shoot(page, testInfo, "live-no-webgl-360");
  });
});
