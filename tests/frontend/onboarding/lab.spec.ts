// Playwright, Chromium. Surface: /dev/fixtures, the development-only lab that renders
// <Onboarding client={fixtureClient} initialInput={inputFixture} />. Fixture evidence, named so in the PR.
// The lab shows a second field picker stub and its own <main> and Results stubs, so page selectors are scoped to
// Onboarding's own <main id="main">.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { recordTitles, titlesSeen } from "./support/api";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } });

/** inputFixture's history covers 2025-07-01 up to 2026-07-01. */
const days = 365;

const app = (page: Page) => page.locator("#main");
const title = (page: Page, name: string) => app(page).getByRole("heading", { level: 1, name, exact: true });
const button = (page: Page, name: string) => app(page).getByRole("button", { name, exact: true });
const plantingDay = (page: Page) => app(page).getByRole("slider", { name: "Synthetic crop: planting day" });
const harvestDay = (page: Page) => app(page).getByRole("slider", { name: "Synthetic crop: harvest day, the last day in the field" });
const laneDates = (page: Page) => app(page).locator(".ly-row .ly-dates");
const valueOf = async (slider: Locator) => Number(await slider.getAttribute("aria-valuenow"));

async function openLab(page: Page) {
  await recordTitles(page);
  await page.goto("/dev/fixtures");
  await expect(title(page, "Where is your farm?")).toBeVisible();
}

async function toRotation(page: Page) {
  await button(page, "Next: crops").click();
  await expect(title(page, "Which crops do you want to grow?")).toBeVisible();
  await button(page, "Next: water").click();
  await expect(title(page, "Where does your water come from?")).toBeVisible();
  await button(page, "Next: your rotation").click();
  await expect(title(page, "Your rotation")).toBeVisible();
}

async function trackWidth(page: Page): Promise<number> {
  return app(page).locator(".ly-track").first().evaluate(element => element.getBoundingClientRect().width);
}

/** A real mouse drag from a point, in small steps, as a finger or mouse would move. */
async function dragFrom(page: Page, x: number, y: number, dx: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
}

async function dragHandle(page: Page, handle: Locator, dx: number) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (box === null) throw new Error("The handle is not on screen.");
  await dragFrom(page, box.x + box.width / 2, box.y + box.height / 2, dx);
}

/** Where the drag lands, from the requirement: whole days of pointer travel across the 12-month track. */
const landed = (from: number, dx: number, width: number) => from + Math.round((dx / width) * days);

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`fixture lab at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("[M1][A3] completes all four pages with the fixture client: one primary button per page, then Making, then the completed job returns page 4 with no failure", async ({ page }) => {
      await openLab(page);
      const pages = [
        { title: "Where is your farm?", step: "Step 1 of 4 · Your farm", primary: "Next: crops", back: false },
        { title: "Which crops do you want to grow?", step: "Step 2 of 4 · Crops", primary: "Next: water", back: true },
        { title: "Where does your water come from?", step: "Step 3 of 4 · Water", primary: "Next: your rotation", back: true },
        { title: "Your rotation", step: "Step 4 of 4 · Your rotation", primary: "Make my plan", back: true },
      ];
      for (const expected of pages) {
        await expect(title(page, expected.title)).toBeVisible();
        await expect(app(page).getByText(expected.step)).toBeVisible();
        const dock = app(page).getByRole("region", { name: "Next step" });
        await expect(dock.getByRole("button")).toHaveCount(1);
        await expect(dock.getByRole("button")).toHaveText(expected.primary);
        await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(expected.back ? 1 : 0);
        await dock.getByRole("button").click();
      }
      await expect(title(page, "Your rotation")).toBeFocused({ timeout: 10_000 });
      expect(await titlesSeen(page)).toEqual(["Opening Gilir…", ...pages.map(expected => expected.title), "Making your plan", "Your rotation"]);
      await expect(app(page).locator("#submit-fail")).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Results implementation slot" }).first()).toBeVisible();
    });

    test("[M1][H4] resizes both crop endpoints by dragging: the harvest handle first (the 4-day fixture bar), then the planting handle; aria-valuenow changes", async ({ page }) => {
      await openLab(page);
      await toRotation(page);
      const width = await trackWidth(page);
      const before = await laneDates(page).textContent();
      await expect(plantingDay(page)).toHaveAttribute("aria-valuenow", "0");
      await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", "3");

      const harvestDx = Math.round(width * 0.35);
      const harvest = landed(3, harvestDx, width);
      await dragHandle(page, harvestDay(page), harvestDx);
      await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", String(harvest));
      await expect(plantingDay(page)).toHaveAttribute("aria-valuenow", "0");
      await expect(harvestDay(page)).toHaveAttribute("aria-valuetext", new RegExp(`, ${harvest + 1} days in the field$`));
      await expect(harvestDay(page)).toBeFocused();

      const plantDx = Math.round(width * 0.12);
      const planting = landed(0, plantDx, width);
      await dragHandle(page, plantingDay(page), plantDx);
      await expect(plantingDay(page)).toHaveAttribute("aria-valuenow", String(planting));
      await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", String(harvest));
      await expect(plantingDay(page)).toHaveAttribute("aria-valuetext", new RegExp(`, ${harvest - planting + 1} days in the field$`));
      await expect(laneDates(page)).not.toHaveText(before ?? "");
      await expect(page.getByRole("status").filter({ hasText: "Synthetic crop: Planted about" })).toHaveCount(1);
    });

    test("[H3] drags the bar body to move it; the lane dates change and keep the length", async ({ page }) => {
      await openLab(page);
      await toRotation(page);
      const width = await trackWidth(page);
      const widen = Math.round(width * 0.45);
      await dragHandle(page, harvestDay(page), widen);
      const start = await valueOf(plantingDay(page));
      const end = await valueOf(harvestDay(page));
      expect(end - start).toBe(landed(3, widen, width));
      const before = await laneDates(page).textContent();

      const bar = app(page).locator(".ly-bar");
      const [barBox, plantBox, harvestBox] = await Promise.all([bar.boundingBox(), plantingDay(page).boundingBox(), harvestDay(page).boundingBox()]);
      if (barBox === null || plantBox === null || harvestBox === null) throw new Error("The bar is not on screen.");
      const x = (plantBox.x + plantBox.width + harvestBox.x) / 2;
      const y = barBox.y + barBox.height / 2;
      expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest(".ly-bar") !== null, [x, y])).toBe(true);

      const dx = Math.round(width * 0.25);
      await dragFrom(page, x, y, dx);
      const moved = landed(start, dx, width);
      await expect(plantingDay(page)).toHaveAttribute("aria-valuenow", String(moved));
      await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", String(moved + end - start));
      await expect(laneDates(page)).not.toHaveText(before ?? "");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("[M1][C1] goes back from page 4 to page 1 and forward again with every answer kept", async ({ page }) => {
      await openLab(page);
      await button(page, "Next: crops").click();
      await button(page, "Next: water").click();
      await app(page).getByRole("radio", { name: "Rain + water when it’s dry" }).check();
      await button(page, "Next: your rotation").click();
      await expect(title(page, "Your rotation")).toBeVisible();
      await dragHandle(page, harvestDay(page), Math.round((await trackWidth(page)) * 0.3));
      const harvest = await valueOf(harvestDay(page));
      expect(harvest).toBeGreaterThan(3);

      for (const previous of ["Where does your water come from?", "Which crops do you want to grow?", "Where is your farm?"]) {
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(title(page, previous)).toBeVisible();
      }
      await button(page, "Next: crops").click();
      await expect(app(page).getByRole("checkbox", { name: "Synthetic crop" })).toBeChecked();
      await button(page, "Next: water").click();
      await expect(app(page).getByRole("radio", { name: "Rain + water when it’s dry" })).toBeChecked();
      await button(page, "Next: your rotation").click();
      await expect(app(page).getByRole("textbox", { name: "When is your field ready to plant?" })).toHaveValue("2026-07-01");
      await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", String(harvest));
      await expect(plantingDay(page)).toHaveAttribute("aria-valuenow", "0");
    });

    test("[C1] phone Back (page.goBack) moves one page back with every answer kept and no reload; on page 1 it leaves", async ({ page }) => {
      await page.goto("data:text/html,<title>Before</title><p>Before Gilir</p>");
      await openLab(page);
      await button(page, "Next: crops").click();
      await button(page, "Next: water").click();
      await app(page).getByRole("radio", { name: "I’m not sure" }).check();
      await page.evaluate(() => Reflect.set(window, "__sameDocument", true));

      await page.goBack();
      await expect(title(page, "Which crops do you want to grow?")).toBeVisible();
      await expect(app(page).getByRole("checkbox", { name: "Synthetic crop" })).toBeChecked();
      await page.goBack();
      await expect(title(page, "Where is your farm?")).toBeVisible();
      expect(await page.evaluate(() => Reflect.get(window, "__sameDocument"))).toBe(true);
      expect(new URL(page.url()).pathname).toBe("/dev/fixtures");

      await button(page, "Next: crops").click();
      await button(page, "Next: water").click();
      await expect(app(page).getByRole("radio", { name: "I’m not sure" })).toBeChecked();
      await page.goBack();
      await page.goBack();
      await expect(title(page, "Where is your farm?")).toBeVisible();
      await page.goBack();
      await page.waitForURL(url => url.protocol === "data:");
      await expect(page.getByText("Before Gilir")).toBeVisible();
    });

    test("[M1][H1] skips history with I don’t remember and still reaches a completed job", async ({ page }) => {
      await openLab(page);
      await toRotation(page);
      const skip = app(page).getByRole("button", { name: /I don’t remember/ });
      await skip.click();
      await expect(skip).toHaveAttribute("aria-pressed", "true");
      await expect(app(page).getByText("We make your plan without last year.")).toBeVisible();
      await expect(app(page).getByRole("slider")).toHaveCount(0);
      await button(page, "Make my plan").click();
      await expect(title(page, "Your rotation")).toBeFocused({ timeout: 10_000 });
      expect((await titlesSeen(page)).slice(-2)).toEqual(["Making your plan", "Your rotation"]);
      await expect(app(page).locator("#submit-fail")).toHaveCount(0);
      await expect(skip).toHaveAttribute("aria-pressed", "true");
    });
  });
}
