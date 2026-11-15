// Playwright, Chromium with WebGL2: headless Chromium renders the MapLibre globe here.
// Surfaces: /dev/fixtures, the development-only lab, whose first slot is the picker seeded with inputFixture.field, and
// F1's page 1 at "/". The lab also renders Onboarding, whose page 1 holds a second picker, so lab locators are scoped
// to the first one.
// FIXTURE EVIDENCE, named so in the PR. No key and no network: MapTiler is unreachable and NASA GIBS answers one
// synthetic tile (support/providers.ts). The field on the page is judged in Node by the contract's parser, the
// server's request handler and an independent strict-inside test.
// It skips when NEXT_PUBLIC_MAPTILER_KEY is set, and provider.spec.ts runs only with the dummy key, because the key is
// inlined when the dev server starts: no single run covers both.
// Run with the key unset, and with `next dev` kept from the agent variables that make it rewrite AGENTS.md:
//   CI=1 PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY \
//     npx playwright test tests/frontend/location/lab.spec.ts
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { inputFixture } from "@/fixtures/input";
import { readingKey } from "@/features/onboarding/services/reading";
import { routeProviders } from "./support/providers";
import type { ProviderPlan } from "./support/providers";
import { good, strictlyInside } from "./support/shapes";
import {
  betweenBars, centreOf, centresOf, cornersOnPage, distance, drag, dragHandle, expectFieldOnPage, firstPicker,
  focusableUnderDock, handBack, handles, handlesInMap, isConcave, layoutProblems, lookupOf, mapArea, openPageOne, pixelsAt,
  retype, settledCentre, shoot, swipe, tabTo, typeCorners,
} from "./support/slot";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } });
test.describe.configure({ timeout: 120_000 });
test.skip(Boolean(process.env.NEXT_PUBLIC_MAPTILER_KEY), "runs with NEXT_PUBLIC_MAPTILER_KEY unset: this is the no-key lab");

async function openLab(page: Page, plan: Partial<ProviderPlan> = {}): Promise<Locator> {
  await routeProviders(page, plan);
  await page.goto("/dev/fixtures");
  const root = firstPicker(page);
  await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
  return root;
}

/** Loses the first picker's WebGL context, as a phone's browser does under memory pressure, and gives it back after `restoreMs`. */
async function loseContext(page: Page, restoreMs: number | null): Promise<void> {
  await page.evaluate(restore => {
    const canvas = document.querySelector<HTMLCanvasElement>(".fp canvas.maplibregl-canvas");
    const lose = canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!lose) throw new Error("no WebGL2 context to lose");
    lose.loseContext();
    if (restore !== null) setTimeout(() => lose.restoreContext(), restore);
  }, restoreMs);
}

async function setTextSize(page: Page, textSize: "normal" | "large" | "largest"): Promise<void> {
  await page.addInitScript(([key, size]) => localStorage.setItem(key, JSON.stringify({ textSize: size })), [readingKey, textSize] as const);
}

async function searchPosition(root: Locator, text: string): Promise<void> {
  await root.getByRole("button", { name: "Search again" }).click();
  const box = root.getByRole("searchbox", { name: "Position of your farm" });
  await box.fill(text);
  await box.press("Enter");
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`the globe at ${viewport.width}px`, () => {
    test.use({ viewport });
    const w = viewport.width;

    test("[R2] on F1's page 1 with no field yet, the slot reports data-surface='globe' and the canvas shows the whole sphere: a corner pixel of the map differs from its centre pixel", async ({ page }, testInfo) => {
      await routeProviders(page);
      const root = await openPageOne(page);
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      await expect(root.locator("canvas.maplibregl-canvas")).toBeVisible();
      await mapArea(root).scrollIntoViewIfNeeded();
      await expect.poll(async () => {
        const box = (await mapArea(root).boundingBox())!;
        const [corner, centre] = await pixelsAt(page, [{ x: box.x + 4, y: box.y + 4 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
        return corner.join() !== centre.join();
      }, { timeout: 20_000 }).toBe(true);
      await shoot(page, testInfo, `globe-${w}`, mapArea(root));
    });

    test("[R18][R23] the NORMAL fixture: 'Fit the corners to your field', 4 corner handles, 'About 119 hectares', data-lookup strictly inside the fixture ring", async ({ page }, testInfo) => {
      const root = await openLab(page);
      await expect(root.getByRole("heading", { name: "Fit the corners to your field" })).toBeVisible();
      await expect(handles(root)).toHaveCount(4);
      await expect(root.getByText(/about 119 hectares/i).first()).toBeVisible();
      await shoot(page, testInfo, `lab-normal-${w}`, mapArea(root));
      const field = await expectFieldOnPage(root, good.square);
      expect(field.ring).toEqual(inputFixture.field.ring);
      expect(field.lookup).toEqual(inputFixture.field.lookup);
    });

    test("[R18][R12] the CONCAVE fixture: type the U shape's 8 corners in the list, 'Use these corners': 8 handles, data-lookup strictly inside the U, not in its gap", async ({ page }, testInfo) => {
      const root = await openLab(page);
      await typeCorners(root, good.u);
      await expect(handles(root)).toHaveCount(8);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      await shoot(page, testInfo, `lab-concave-${w}`, mapArea(root));
      const field = await expectFieldOnPage(root, good.u);
      expect(strictlyInside(field.lookup, [[0.01, 0.01], [0.02, 0.01], [0.02, 0.03], [0.01, 0.03]])).toBe(false);
    });

    test("[R18][R11] the DATELINE fixture: type the Fiji corners: the outline is one small rectangle near the map's centre (its handles' boxes span under three quarters of the map width), data-lookup within 0.01° of ±180 and strictly inside", async ({ page }, testInfo) => {
      const root = await openLab(page);
      await typeCorners(root, good.fiji);
      await expect(handles(root)).toHaveCount(4);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      const map = (await mapArea(root).boundingBox())!;
      const boxes = await Promise.all((await handles(root).all()).map(async handle => (await handle.boundingBox())!));
      const left = Math.min(...boxes.map(box => box.x));
      const right = Math.max(...boxes.map(box => box.x + box.width));
      expect(right - left).toBeLessThan(map.width * 0.75);
      const centres = await centresOf(handles(root));
      const middle = { x: centres.reduce((sum, p) => sum + p.x, 0) / 4, y: centres.reduce((sum, p) => sum + p.y, 0) / 4 };
      expect(Math.abs(middle.x - (map.x + map.width / 2))).toBeLessThan(map.width / 4);
      expect(Math.abs(middle.y - (map.y + map.height / 2))).toBeLessThan(map.height / 4);
      await shoot(page, testInfo, `lab-dateline-${w}`, mapArea(root));
      const field = await expectFieldOnPage(root, good.fiji);
      expect(180 - Math.abs(field.lookup[0])).toBeLessThan(0.01);
    });

    test("[R3] 'Search again', type '-0.3, 36.07', Enter: the pin shows; dragging the globe moves the pin on screen; 'Zoom in' then 'Zoom out' move it back and forth, by mouse and by keyboard", async ({ page }) => {
      const root = await openLab(page);
      await searchPosition(root, "-0.3, 36.07");
      const pin = root.locator(".fp-pin");
      await expect(pin).toBeVisible();
      await mapArea(root).scrollIntoViewIfNeeded();
      // Measured from the map's corner: a click may scroll the page a few pixels to reach a button.
      const pinInMap = async () => {
        const at = await settledCentre(pin);
        const map = (await mapArea(root).boundingBox())!;
        return { x: at.x - map.x, y: at.y - map.y };
      };
      const placed = await pinInMap();
      const map = (await mapArea(root).boundingBox())!;
      const centre = { x: map.x + map.width / 2, y: map.y + map.height / 2 };
      await drag(page, centre, { x: centre.x - 60, y: centre.y + 40 });
      const turned = await pinInMap();
      expect(distance(placed, turned)).toBeGreaterThan(30);

      const zoomIn = root.getByRole("button", { name: "Zoom in" });
      const zoomOut = root.getByRole("button", { name: "Zoom out" });
      await zoomIn.click();
      expect(distance(turned, await pinInMap())).toBeGreaterThan(10);
      await zoomOut.click();
      expect(distance(turned, await pinInMap())).toBeLessThan(3);

      await zoomIn.focus();
      await page.keyboard.press("Enter");
      expect(distance(turned, await pinInMap())).toBeGreaterThan(10);
      await zoomOut.focus();
      await page.keyboard.press("Space");
      expect(distance(turned, await pinInMap())).toBeLessThan(3);
    });

    test("[R3] a click in space beside the sphere picks no place, and never moves a marked box; a click on the sphere still does both", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await routeProviders(page);
      const root = await openPageOne(page);
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      await mapArea(root).scrollIntoViewIfNeeded();
      const map = async () => (await mapArea(root).boundingBox())!;
      const besideTheSphere = async () => {
        const { x, y, height } = await map();
        await page.mouse.click(x + 12, y + height - 12);
      };
      const onTheSphere = async () => {
        const { x, y, width, height } = await map();
        await page.mouse.click(x + width / 2 + 30, y + height / 2);
      };
      const mark = root.getByRole("button", { name: "Mark my field" });

      await besideTheSphere();
      await page.waitForTimeout(500);
      await expect(root).toHaveAttribute("data-phase", "finding");
      await expect(root.locator(".fp-pin")).toHaveCount(0);
      await expect(mark).toHaveCount(0);

      await onTheSphere();
      await expect(mark).toBeVisible();
      await mark.click();
      await expect(root).toHaveAttribute("data-phase", "box");
      const marked = await lookupOf(root);
      const label = await root.locator(".fp-place-line p > span:not(.i)").textContent();
      await mapArea(root).scrollIntoViewIfNeeded();
      for (let i = 0; i < 20; i++) await root.getByRole("button", { name: "Zoom out" }).click();
      for (let i = 0; i < 2; i++) await root.getByRole("button", { name: "Zoom in" }).click();
      await besideTheSphere();
      await page.waitForTimeout(500);
      expect(await lookupOf(root)).toEqual(marked);
      await expect(root.locator(".fp-place-line p > span:not(.i)")).toHaveText(label ?? "");

      await onTheSphere();
      await expect.poll(() => lookupOf(root)).not.toEqual(marked);
      await expect(root).toHaveAttribute("data-phase", "box");
    });

    test("[R22] on F1's page 1 each next step is in view between F1's top bar and dock: 'Mark my field' after a tap, the box and its 4 corners after marking, and a refused drag's reason on the map", async ({ page }, testInfo) => {
      await routeProviders(page);
      const root = await openPageOne(page);
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      const inView = (locator: Locator) => betweenBars(page, locator);
      await mapArea(root).scrollIntoViewIfNeeded();
      const map = (await mapArea(root).boundingBox())!;
      await page.mouse.click(map.x + map.width / 2 + 20, map.y + map.height / 2);
      const mark = root.getByRole("button", { name: "Mark my field" });
      await expect.poll(() => inView(mark)).toBe(true);

      await mark.click();
      await expect(root.getByRole("heading", { name: "Put your field in the box" })).toBeFocused();
      await expect(handles(root)).toHaveCount(4);
      await settledCentre(handles(root).first());
      expect(await inView(mapArea(root))).toBe(true);
      for (const handle of await handles(root).all()) expect(await inView(handle)).toBe(true);
      await shoot(page, testInfo, `page-one-marked-${w}`);

      const [a, b, , d] = await centresOf(handles(root));
      const across = { x: a.x + (a.x - b.x) * 0.5 + (d.x - a.x) * 0.5, y: a.y + (a.y - b.y) * 0.5 + (d.y - a.y) * 0.5 };
      await drag(page, b, across);
      const refused = root.getByRole("alert").filter({ hasText: "Two sides would cross, so the corner went back." });
      await expect(refused).toBeVisible();
      expect(await inView(refused)).toBe(true);
      await shoot(page, testInfo, `page-one-refused-${w}`);
    });

    test("[R7] 'Mark my field' draws the 1 ha box; dragging corner 2 changes 'Your field is marked: …' and the list's numbers for corner 2 only", async ({ page }) => {
      const root = await openLab(page);
      await searchPosition(root, "-0.3, 36.07");
      await root.getByRole("button", { name: "Mark my field" }).click();
      await expect(handles(root)).toHaveCount(4);
      const status = root.getByText(/^Your field is marked: /).first();
      await expect(status).toHaveText("Your field is marked: about 1 hectare, 4 corners.");
      const before = await cornersOnPage(root);
      await dragHandle(page, root, 1, from => ({ x: from.x + 25, y: from.y + 25 }));
      await expect(status).not.toHaveText("Your field is marked: about 1 hectare, 4 corners.");
      const after = await cornersOnPage(root);
      expect(after).toHaveLength(4);
      for (const index of [0, 2, 3]) expect(after[index]).toEqual(before[index]);
      expect(after[1]).not.toEqual(before[1]);
      await expectFieldOnPage(root);
    });

    test("[R7][R12] tap corner 2, 'Add a corner', then drag the new corner inward: a concave field, 5 handles, data-lookup still strictly inside", async ({ page }) => {
      const root = await openLab(page);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      const old = await handlesInMap(root);
      await handles(root).nth(1).click();
      await root.getByRole("button", { name: "Add a corner" }).click();
      await expect(handles(root)).toHaveCount(5);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      const added = (await handlesInMap(root)).findIndex(point => old.every(corner => distance(point, corner) > 5));
      expect(added).toBeGreaterThanOrEqual(0);
      const map = (await mapArea(root).boundingBox())!;
      const middle = { x: map.x + old.reduce((sum, p) => sum + p.x, 0) / 4, y: map.y + old.reduce((sum, p) => sum + p.y, 0) / 4 };
      const from = await centreOf(handles(root).nth(added));
      await drag(page, from, { x: from.x + (middle.x - from.x) * 0.6, y: from.y + (middle.y - from.y) * 0.6 });
      const field = await expectFieldOnPage(root);
      expect(field.ring).toHaveLength(6);
      expect(isConcave(field.ring)).toBe(true);
    });

    test("[R7] dragging corner 2 across the opposite side puts it back and shows 'Two sides would cross, so the corner went back.'", async ({ page }) => {
      const root = await openLab(page);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      const [a, b, , d] = await centresOf(handles(root));
      const across = { x: a.x + (a.x - b.x) * 0.5 + (d.x - a.x) * 0.5, y: a.y + (a.y - b.y) * 0.5 + (d.y - a.y) * 0.5 };
      await dragHandle(page, root, 1, () => across);
      await expect(root.getByRole("alert").filter({ hasText: "Two sides would cross, so the corner went back." })).toBeVisible();
      expect(distance(await settledCentre(handles(root).nth(1)), b)).toBeLessThan(2);
      expect(await lookupOf(root)).toEqual(inputFixture.field.lookup);
      expect((await expectFieldOnPage(root)).ring).toEqual(inputFixture.field.ring);
    });

    test("[R11] dragging a Fiji corner across 180° keeps every number in the list within [-180, 180]", async ({ page }) => {
      const root = await openLab(page);
      await typeCorners(root, good.fiji);
      await expect(handles(root)).toHaveCount(4);
      await mapArea(root).scrollIntoViewIfNeeded();
      const [west, east] = await Promise.all([settledCentre(handles(root).nth(0)), settledCentre(handles(root).nth(1))]);
      await dragHandle(page, root, 0, from => ({ x: from.x + (east.x - west.x) * 0.75, y: from.y + (east.y - west.y) * 0.75 }));
      const corners = await cornersOnPage(root);
      expect(corners[0]).not.toEqual(good.fiji[0]);
      for (const [lng, lat] of corners) {
        expect(Math.abs(lng)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      }
      expect(corners[0][0]).toBeLessThan(0);
      await expectFieldOnPage(root);
    });

    test("[R22] no horizontal scroll; every button, link, input and corner handle in the slot is at least 48 by 48 CSS px; no text under 18 px; nothing focusable sits under F1's dock", async ({ page }) => {
      const root = await openLab(page);
      expect(await layoutProblems(page, root)).toEqual([]);
      await root.getByRole("button", { name: "Type the corners" }).click();
      expect(await layoutProblems(page, root)).toEqual([]);
      await root.getByRole("button", { name: "Search again" }).click();
      expect(await layoutProblems(page, root)).toEqual([]);
      const inOnboarding = page.locator("[data-phase]").nth(1);
      await expect(inOnboarding).toBeVisible();
      expect(await focusableUnderDock(page, inOnboarding)).toEqual([]);
    });

    test("[R15][R22] Tab only: type a position, Enter, 'Mark my field', 'Type the corners', change corner 3's latitude, 'Use these corners': focus is always visible", async ({ page }) => {
      const root = await openLab(page);
      await tabTo(page, root.getByRole("button", { name: "Search again" }));
      await page.keyboard.press("Enter");
      await tabTo(page, root.getByRole("searchbox", { name: "Position of your farm" }));
      await page.keyboard.type("-0.3, 36.07");
      await page.keyboard.press("Enter");
      await tabTo(page, root.getByRole("button", { name: "Mark my field" }));
      await page.keyboard.press("Enter");
      await expect(handles(root)).toHaveCount(4);
      const boxLookup = await lookupOf(root);
      await tabTo(page, root.getByRole("button", { name: "Type the corners" }));
      await page.keyboard.press("Enter");
      const latitude = root.getByRole("group", { name: "Corner 3" }).getByRole("textbox", { name: /latitude/i });
      const moved = Math.round((Number(await latitude.inputValue()) + 0.0003) * 1e6) / 1e6;
      await tabTo(page, latitude);
      await retype(page, String(moved));
      await tabTo(page, root.getByRole("button", { name: "Use these corners" }));
      await page.keyboard.press("Enter");
      await expect.poll(() => lookupOf(root)).not.toEqual(boxLookup);
      const field = await expectFieldOnPage(root);
      expect(field.ring[2][1]).toBe(moved);
    });

    test("[R16][R20] with no key the slot says so, a typed name sends nothing and says why, and a typed position still marks a field", async ({ page }) => {
      const routes = await routeProviders(page);
      await page.goto("/dev/fixtures");
      const root = firstPicker(page);
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      await expect(root.getByText("Search by name and close-up pictures aren’t set up on this site. Type a position, use your location, or type your field’s corners.")).toBeVisible();
      await searchPosition(root, "Indramayu");
      await expect(root.getByText("Searching by name isn’t set up on this site. Type a position, like -6.326, 108.32, or your field’s corners.")).toBeVisible();
      const box = root.getByRole("searchbox", { name: "Position of your farm" });
      await box.fill("-6.326, 108.32");
      await box.press("Enter");
      await root.getByRole("button", { name: "Mark my field" }).click();
      const field = await expectFieldOnPage(root);
      expect(Math.abs(field.lookup[0] - 108.32)).toBeLessThan(0.001);
      expect(Math.abs(field.lookup[1] + 6.326)).toBeLessThan(0.001);
      expect(routes.requests.filter(request => request.kind !== "gibs")).toEqual([]);
    });

    test("[R5] the credits line under the map is visible without a press and names NASA EOSDIS GIBS", async ({ page }) => {
      const root = await openLab(page);
      const credits = root.locator(".fp-credits");
      await expect(credits).toBeVisible();
      await expect(credits).toContainText("NASA EOSDIS GIBS");
      await expect(credits).not.toContainText("MapTiler");
      expect(parseFloat(await credits.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(18);
    });

    test("[R16] with GIBS aborted too, 'The map pictures didn’t load. …' shows and the corner list still marks a field", async ({ page }, testInfo) => {
      const root = await openLab(page, { gibs: "offline" });
      await expect(root.getByText(/^The map pictures didn’t load\./)).toBeVisible({ timeout: 30_000 });
      await typeCorners(root, good.l);
      await expect(handles(root)).toHaveCount(6);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      await shoot(page, testInfo, `lab-no-pictures-${w}`, mapArea(root));
      await expectFieldOnPage(root, good.l);
    });

    test("[R23] on F1's page 1 at '/', a typed U field reaches F1's draft: 'Next: crops' opens page 2, Back shows the same field, and after a reload that hands it back to F1 it shows again unchanged", async ({ page }, testInfo) => {
      await routeProviders(page);
      const root = await openPageOne(page);
      await expect(root).toHaveCount(1);
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      await typeCorners(root, good.u);
      await expect(handles(root)).toHaveCount(8);
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      await shoot(page, testInfo, `page-one-${w}`, mapArea(root));
      const marked = await expectFieldOnPage(root, good.u);

      await page.getByRole("button", { name: "Next: crops" }).click();
      await expect(page.getByRole("heading", { name: "Which crops do you want to grow?" })).toBeVisible();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Where is your farm?" })).toBeVisible();
      await expect(root).toHaveAttribute("data-lookup", marked.lookup.join(","));
      expect(await expectFieldOnPage(root, good.u)).toEqual(marked);

      await handBack(page, { ...inputFixture, field: marked });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Where is your farm?" })).toBeVisible({ timeout: 60_000 });
      await expect(root).toHaveAttribute("data-lookup", marked.lookup.join(","), { timeout: 60_000 });
      await expect(root.getByRole("heading", { name: "Fit the corners to your field" })).toBeVisible();
      await expect(handles(root)).toHaveCount(8);
      expect(await expectFieldOnPage(root, good.u)).toEqual(marked);
    });

    test("[R17] the two pickers on the page each draw their own globe and share no id", async ({ page }) => {
      await openLab(page);
      const pickers = page.locator("[data-phase]");
      await expect(pickers).toHaveCount(2);
      for (const picker of await pickers.all()) {
        await expect(picker).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
        await expect(picker.locator("canvas.maplibregl-canvas")).toHaveCount(1);
      }
      const repeated = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      });
      expect(repeated).toEqual([]);
    });
  });
}

const textSizes = [
  { textSize: "normal", width: 900, height: 700 },
  { textSize: "large", width: 1280, height: 800 },
  { textSize: "largest", width: 900, height: 700 },
  { textSize: "largest", width: 1280, height: 800 },
] as const;

for (const { textSize, width, height } of textSizes) {
  test.describe(`${textSize} text at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test("[R22] on F1's page 1 with a field, the map is at least 480 px wide and no zoom button covers a corner handle", async ({ page }) => {
      await routeProviders(page);
      await setTextSize(page, textSize);
      const root = (await openPageOne(page, inputFixture)).first();
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      await mapArea(root).scrollIntoViewIfNeeded();
      await settledCentre(handles(root).first());
      expect((await mapArea(root).boundingBox())!.width).toBeGreaterThanOrEqual(480);
      const covered = await root.evaluate((element: HTMLElement) => [...element.querySelectorAll(".fp-handle")].flatMap((handle, index) => {
        const box = handle.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit && handle.contains(hit) ? [] : [`corner ${index + 1}`];
      }));
      expect(covered).toEqual([]);
      expect(await layoutProblems(page, root)).toEqual([]);
    });
  });
}

test.describe("the globe on a 360x740 phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("[R14] when the page comes back to the foreground MapLibre restarts its busy workers, and a lost WebGL context comes back: the globe stays, keeps the field and still draws", async ({ page }) => {
    const root = await openLab(page);
    await expect(handles(root)).toHaveCount(4);
    for (const worker of page.workers()) {
      void worker.evaluate(() => {
        const end = Date.now() + 2000;
        while (Date.now() < end);
      }).catch(() => undefined);
    }
    await page.waitForTimeout(100);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(5000);
    await expect(root).toHaveAttribute("data-surface", "globe");

    await loseContext(page, 500);
    await page.waitForTimeout(5000);
    await expect(root).toHaveAttribute("data-surface", "globe");
    await expect(handles(root)).toHaveCount(4);
    expect(await lookupOf(root)).toEqual(inputFixture.field.lookup);
    await mapArea(root).scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const box = (await mapArea(root).boundingBox())!;
      const [corner, centre] = await pixelsAt(page, [{ x: box.x + 4, y: box.y + box.height - 4 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
      return corner.join() !== centre.join();
    }, { timeout: 10_000 }).toBe(true);
  });

  test("[R14][R15] a lost WebGL context that does not come back becomes the drawing after a short wait, and focus on 'Zoom in' moves to the corner list's heading", async ({ page }) => {
    const root = await openLab(page);
    await root.getByRole("button", { name: "Zoom in" }).focus();
    await loseContext(page, null);
    await expect(root).toHaveAttribute("data-surface", "plan", { timeout: 10_000 });
    await expect(root.getByText(/^The globe stopped working on this phone\./)).toBeVisible();
    await expect(root.getByRole("heading", { name: "Type the corners of your field" })).toBeFocused();
    expect(await lookupOf(root)).toEqual(inputFixture.field.lookup);
  });

  for (const textSize of ["large", "largest"] as const) {
    test(`[R20][R22] ${textSize} text: the no-key search box shows the whole of a typed position, which is also its example`, async ({ page }) => {
      await routeProviders(page);
      await setTextSize(page, textSize);
      const root = (await openPageOne(page)).first();
      const box = root.getByRole("searchbox", { name: "Position of your farm" });
      await expect(box).toHaveAttribute("placeholder", "-6.326, 108.32");
      await box.fill("-6.326, 108.32");
      expect(await box.evaluate((input: HTMLInputElement) => input.scrollWidth <= input.clientWidth), "the typed position fits in the box").toBe(true);
    });
  }

  for (const textSize of ["normal", "largest"] as const) {
    test(`[R16][R22] ${textSize} text: on F1's page 1 the answer to Search comes into view above F1's dock, for a name with no key and for a position out of range`, async ({ page }, testInfo) => {
      await routeProviders(page);
      await setTextSize(page, textSize);
      const root = (await openPageOne(page)).first();
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      const box = root.getByRole("searchbox", { name: "Position of your farm" });
      const answers = [
        { typed: "Indramayu", answer: "Searching by name isn’t set up on this site. Type a position, like -6.326, 108.32, or your field’s corners." },
        { typed: "-6.326, 200", answer: "Longitude goes from -180 to 180." },
      ];
      for (const { typed, answer } of answers) {
        await box.fill(typed);
        await box.press("Enter");
        const line = root.getByText(answer);
        await expect(line).toBeVisible();
        await expect.poll(() => betweenBars(page, line), { message: `"${answer}" is between F1's bar and dock` }).toBe(true);
      }
      await shoot(page, testInfo, `page-one-search-answer-${textSize}-360`);
    });
  }
});

for (const textSize of ["normal", "large", "largest"] as const) {
  test.describe(`${textSize} text on a 360x740 touch phone`, () => {
    test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

    test("[R22] with a field marked and the map at the top, a strip at least 48 px tall stays between the map and F1's dock, and a swipe there scrolls the page", async ({ page }, testInfo) => {
      await routeProviders(page);
      await setTextSize(page, textSize);
      const root = (await openPageOne(page)).first();
      await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
      const box = root.getByRole("searchbox", { name: "Position of your farm" });
      await box.fill("-6.326, 108.32");
      await box.press("Enter");
      await root.getByRole("button", { name: "Mark my field" }).click();
      await expect(handles(root)).toHaveCount(4);
      await mapArea(root).evaluate(element => element.scrollIntoView({ block: "start" }));
      await settledCentre(handles(root).first());
      const [map, dock] = await Promise.all([mapArea(root).boundingBox(), page.locator(".dock").first().boundingBox()]);
      const strip = dock!.y - (map!.y + map!.height);
      expect(strip, `the strip between the map and F1's dock at ${textSize} text`).toBeGreaterThanOrEqual(48);
      if (textSize === "largest") await shoot(page, testInfo, "page-one-largest-marked-360");
      const before = await page.evaluate(() => window.scrollY);
      const from = { x: 180, y: map!.y + map!.height + strip / 2 };
      await swipe(page, from, { x: from.x, y: from.y - 150 });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 30);
    });
  });
}

test.describe("the globe at 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("[R22] in two columns the map stays in view beside the corner list while the farmer types corner 3", async ({ page }, testInfo) => {
    await routeProviders(page);
    const root = (await openPageOne(page, inputFixture)).first();
    await expect(root).toHaveAttribute("data-surface", "globe", { timeout: 60_000 });
    await root.getByRole("button", { name: "Type the corners" }).click();
    const latitude = root.getByRole("group", { name: "Corner 3" }).getByRole("textbox", { name: /latitude/i });
    await latitude.click();
    await page.keyboard.press("End");
    await page.keyboard.type("1");
    await expect(latitude).toBeFocused();
    await expect.poll(() => betweenBars(page, mapArea(root))).toBe(true);
    await expect.poll(() => betweenBars(page, latitude)).toBe(true);
    await shoot(page, testInfo, "page-one-typing-1280");
  });
});
