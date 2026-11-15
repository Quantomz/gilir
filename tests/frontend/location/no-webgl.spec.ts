// Playwright, Chromium launched with WebGL off, so the real MapLibre throws GPUInitializationError (grounding probe
// run.log), as on a phone without WebGL2. FIXTURE EVIDENCE, no key, provider hosts aborted.
// Run: CI=1 PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY \
//        npx playwright test tests/frontend/location/no-webgl.spec.ts
import { test } from "@playwright/test";

test.use({
  launchOptions: { executablePath: process.env.PW_CHROMIUM, args: ["--disable-webgl", "--disable-3d-apis"] },
  viewport: { width: 360, height: 740 },
});

test.fixme("[R14][R16] the slot reports data-surface='plan', shows 'This phone can’t show the moving globe. …' and a drawing of the fixture with 4 numbered corners", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R14][R15] Tab only: change corner 3's latitude, 'Use these corners': the drawing redraws and data-lookup changes", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R14][R12][R11] Tab only: the U shape, then the Fiji corners, each marked with data-lookup strictly inside", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R14][R20] 'Search again', type '-6.326, 108.32', Enter, 'Mark my field': a 1 ha box on the drawing; Smaller and Bigger change it", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R22] at 360 px the drawing, the list and every control fit with no horizontal scroll, at Normal text and with the big-text class", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
