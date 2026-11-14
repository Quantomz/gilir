// Playwright, Chromium. Surface: /dev/fixtures, the development-only lab that renders
// <Onboarding client={fixtureClient} initialInput={inputFixture} /> (src/app/dev/fixtures/fixture-lab.tsx:17).
// Fixture evidence, named so in the PR. The lab shows two FieldPicker stubs and its own <main>, so every selector is
// scoped to the Onboarding region (grounding.md gotchas 20 and 21).
// The pinned Playwright 1.65.1 cannot find its own Chromium here (repo-baseline.md gotcha 44) and F1 cannot edit
// playwright.config.ts, so the path comes from PW_CHROMIUM.
import { test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM } });

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`fixture lab at ${viewport.width}px`, () => {
    test.use({ viewport });

    test.fixme("[M1][A3] completes all four pages with the fixture client and the lab's Results slot shows the completed snapshot", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[M1][H4] resizes both crop endpoints by dragging: the harvest handle first (the 4-day fixture bar), then the planting handle; aria-valuenow changes", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[H3] drags the bar body to move it; the lane dates change and keep the length", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[M1][C1] goes back from page 4 to page 1 and forward again with every answer kept", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[C1] phone Back (page.goBack) moves one page back with every answer kept and no reload; on page 1 it leaves", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[M1][H1] skips history with I don’t remember and still reaches the lab's Results slot", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
  });
}
