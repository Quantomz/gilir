// Playwright, Chromium. The browser recording the card asks for (docs/cards/F1.md:44): the input flow and focus order
// at phone and desktop widths, written to docs/evidence/F1/ only when F1_EVIDENCE=1 (test-results/ is gitignored).
// Runs on "/" with the seed and stubbed API (support/api.ts), like journey.spec.ts.
import { test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM }, video: "on" });

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`evidence at ${viewport.width}px`, () => {
    test.use({ viewport });

    test.fixme("[L5] records the input flow from page 1 to Results and copies the video to docs/evidence/F1/", async ({ page }) => {
      await page.goto("/");
    });
    test.fixme("[L3][L5] tabs through each page and writes focus-order-<width>.md (role, name, box) to docs/evidence/F1/", async ({ page }) => {
      await page.goto("/");
    });
    test.fixme("[L1] no page scrolls sideways at this width, at Normal and at Largest text", async ({ page }) => {
      await page.goto("/");
    });
    test.fixme("[L2] every button, input, slider and summary is at least 48 by 48 CSS px, at Normal and at Largest text", async ({ page }) => {
      await page.goto("/");
    });
    test.fixme("[L6] screenshots of each page in light, dark (emulated) and high contrast", async ({ page }) => {
      await page.goto("/");
    });
    test.fixme("the saved text size and contrast apply before first paint: the first screenshot is already Largest", async ({ page }) => {
      await page.goto("/");
    });
  });
}
