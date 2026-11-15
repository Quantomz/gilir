// Playwright, Chromium launched with WebGL off, so the real MapLibre throws GPUInitializationError, as on a phone
// without WebGL2. FIXTURE EVIDENCE, no key, provider hosts answered by support/providers.ts.
// It skips when NEXT_PUBLIC_MAPTILER_KEY is set, and provider.spec.ts runs only with the dummy key, because the key is
// inlined when the dev server starts: no single run covers both.
// Run: CI=1 PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY \
//        npx playwright test tests/frontend/location/no-webgl.spec.ts
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readingKey } from "@/features/onboarding/services/reading";
import { inputFixture } from "@/fixtures/input";
import { routeProviders } from "./support/providers";
import { good } from "./support/shapes";
import {
  cornerList, expectFieldOnPage, firstPicker, layoutProblems, lookupOf, openPageOne, retype, shoot, tabTo, typeCornersByKeyboard,
} from "./support/slot";

test.use({
  launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--disable-webgl", "--disable-3d-apis"] },
  viewport: { width: 360, height: 740 },
});
test.describe.configure({ timeout: 120_000 });
test.skip(Boolean(process.env.NEXT_PUBLIC_MAPTILER_KEY), "runs with NEXT_PUBLIC_MAPTILER_KEY unset: this is the no-key fallback");

async function openLab(page: Page): Promise<Locator> {
  await routeProviders(page);
  await page.goto("/dev/fixtures");
  const root = firstPicker(page);
  await expect(root).toHaveAttribute("data-surface", "plan", { timeout: 60_000 });
  return root;
}

const drawingOf = (root: Locator) => root.getByRole("img", { name: "Drawing of your field, north at the top. It is a drawing, not a photo." });

async function cornerNumbers(root: Locator): Promise<string[]> {
  return (await drawingOf(root).locator("text").allTextContents()).map(text => text.trim()).filter(text => /^\d+$/.test(text)).sort((a, b) => Number(a) - Number(b));
}

test("[R14][R16] the slot reports data-surface='plan', shows 'This phone can’t show the moving globe. …' and a drawing of the fixture with 4 numbered corners", async ({ page }, testInfo) => {
  const root = await openLab(page);
  await expect(root.getByText(/^This phone can’t show the moving globe\./)).toBeVisible();
  await expect(drawingOf(root)).toBeVisible();
  expect(await cornerNumbers(root)).toEqual(["1", "2", "3", "4"]);
  await expect(root.locator("canvas.maplibregl-canvas")).toHaveCount(0);
  await shoot(page, testInfo, "no-webgl-fixture-360", drawingOf(root));
  await expectFieldOnPage(root, good.square);
});

test("[R14][R15] Tab only: change corner 3's latitude, 'Use these corners': the drawing redraws and data-lookup changes", async ({ page }) => {
  const root = await openLab(page);
  const before = { drawing: await drawingOf(root).innerHTML(), lookup: await lookupOf(root) };
  const latitude = cornerList(root).getByRole("group", { name: "Corner 3" }).getByRole("textbox", { name: /latitude/i });
  const moved = Math.round((Number(await latitude.inputValue()) + 0.002) * 1e6) / 1e6;
  await tabTo(page, latitude);
  await retype(page, String(moved));
  await tabTo(page, cornerList(root).getByRole("button", { name: "Use these corners" }));
  await page.keyboard.press("Enter");
  await expect.poll(() => lookupOf(root)).not.toEqual(before.lookup);
  expect(await drawingOf(root).innerHTML()).not.toEqual(before.drawing);
  const field = await expectFieldOnPage(root);
  expect(field.ring[2][1]).toBe(moved);
});

test("[R14][R12][R11] Tab only: the U shape, then the Fiji corners, each marked with data-lookup strictly inside", async ({ page }, testInfo) => {
  const root = await openLab(page);
  await typeCornersByKeyboard(page, root, good.u);
  await expect.poll(() => cornerNumbers(root)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  await shoot(page, testInfo, "no-webgl-concave-360", drawingOf(root));
  await expectFieldOnPage(root, good.u);

  await typeCornersByKeyboard(page, root, good.fiji);
  await expect.poll(() => cornerNumbers(root)).toEqual(["1", "2", "3", "4"]);
  await shoot(page, testInfo, "no-webgl-dateline-360", drawingOf(root));
  const field = await expectFieldOnPage(root, good.fiji);
  expect(180 - Math.abs(field.lookup[0])).toBeLessThan(0.01);
});

test("[R14][R20] 'Search again', type '-6.326, 108.32', Enter, 'Mark my field': a 1 ha box on the drawing; Smaller and Bigger change it", async ({ page }) => {
  const root = await openLab(page);
  await root.getByRole("button", { name: "Search again" }).click();
  const box = root.getByRole("searchbox", { name: "Position of your farm" });
  await box.fill("-6.326, 108.32");
  await box.press("Enter");
  await root.getByRole("button", { name: "Mark my field" }).click();
  const status = root.getByText(/^Your field is marked: /).first();
  await expect(status).toHaveText("Your field is marked: about 1 hectare, 4 corners.");
  expect(await cornerNumbers(root)).toEqual(["1", "2", "3", "4"]);
  const [lng, lat] = (await lookupOf(root))!;
  expect(Math.abs(lng - 108.32)).toBeLessThan(0.001);
  expect(Math.abs(lat + 6.326)).toBeLessThan(0.001);
  const drawing = await drawingOf(root).innerHTML();

  await root.getByRole("button", { name: "Smaller" }).click();
  await expect(status).not.toHaveText("Your field is marked: about 1 hectare, 4 corners.");
  expect(await drawingOf(root).innerHTML()).not.toEqual(drawing);
  await root.getByRole("button", { name: "Bigger" }).click();
  await expect(status).toHaveText("Your field is marked: about 1 hectare, 4 corners.");
  await expectFieldOnPage(root);
});

test("[R22] at 360 px on F1's page 1, the drawing, the list and every control fit with no horizontal scroll, at Normal text and with the big-text class", async ({ page }, testInfo) => {
  await routeProviders(page);
  const root = await openPageOne(page, inputFixture);
  await expect(root).toHaveAttribute("data-surface", "plan", { timeout: 60_000 });
  await expect(drawingOf(root)).toBeVisible();
  await expect(cornerList(root)).toBeVisible();
  expect(await layoutProblems(page, root)).toEqual([]);
  await shoot(page, testInfo, "no-webgl-normal-text-360", drawingOf(root));

  await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ textSize: "largest" })), [readingKey]);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bbig-text\b/);
  await expect(root).toHaveAttribute("data-surface", "plan", { timeout: 60_000 });
  await expect(drawingOf(root)).toBeVisible();
  await expect(cornerList(root)).toBeVisible();
  expect(await layoutProblems(page, root)).toEqual([]);
  await shoot(page, testInfo, "no-webgl-largest-text-360", drawingOf(root));
});
