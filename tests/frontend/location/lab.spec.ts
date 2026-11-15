// Playwright, Chromium with WebGL2 (headless Chromium here renders the MapLibre globe: grounding section 6).
// Surface: /dev/fixtures, the development-only lab, whose first slot is <FieldPicker value={field} onChange={setField} />
// seeded with inputFixture.field (src/app/dev/fixtures/fixture-lab.tsx:16). The lab also renders Onboarding, whose page
// 1 holds a second picker, so every locator is scoped to the first `[data-phase]` root.
// FIXTURE EVIDENCE, named so in the PR. It needs no key and no network: the globe's base style has no URL, MapTiler is
// aborted, and NASA GIBS answers one synthetic 256 px tile from this file, so nothing leaves the machine.
// "Inside" is checked in Node: the root's data-lookup against the ring the test knows (the fixture's, or the corners it
// typed), with support/shapes.ts strictlyInside. Screenshots go to docs/evidence/F2/lab-*.png.
// Run (the pinned Playwright cannot find its own Chromium here; `next dev` must not see the agent variables, G2; a
// server already on port 3000 would be reused, G20):
//   CI=1 PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY \
//     npx playwright test tests/frontend/location/lab.spec.ts
import { test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM } });

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`the globe at ${viewport.width}px`, () => {
    test.use({ viewport });

    test.fixme("[R2] the slot reports data-surface='globe' and the canvas shows a sphere at low zoom: a corner pixel of the map differs from its centre pixel", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R18][R23] the NORMAL fixture: 'Fit the corners to your field', 4 corner handles, 'About 119 hectares', data-lookup strictly inside the fixture ring", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R18][R12] the CONCAVE fixture: type the U shape's 8 corners in the list, 'Use these corners': 8 handles, data-lookup strictly inside the U, not in its gap", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R18][R11] the DATELINE fixture: type the Fiji corners: the outline is one small rectangle near the map's centre (its handles' boxes span under a quarter of the map width), data-lookup within 0.01° of ±180 and strictly inside", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R3] 'Search again', type '-0.3, 36.07', Enter: the pin shows; dragging the globe moves the pin on screen; 'Zoom in' then 'Zoom out' move it back and forth, by mouse and by keyboard", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R7] 'Mark my field' draws the 1 ha box; dragging corner 2 changes 'Your field is marked: …' and the list's numbers for corner 2 only", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R7][R12] tap corner 2, 'Add a corner', then drag the new corner inward: a concave field, 5 handles, data-lookup still strictly inside", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R7] dragging corner 2 across the opposite side puts it back and shows 'Two sides would cross, so the corner went back.'", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R11] dragging a Fiji corner across 180° keeps every number in the list within [-180, 180]", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R22] no horizontal scroll; every button, link, input and corner handle in the slot is at least 48 by 48 CSS px; no text under 18 px; nothing focusable sits under F1's dock", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R15][R22] Tab only: type a position, Enter, 'Mark my field', 'Type the corners', change corner 3's latitude, 'Use these corners': focus is always visible", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R5] the credits line under the map is visible without a press and names NASA EOSDIS GIBS", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R16] with GIBS aborted too, 'The map pictures didn’t load. …' shows and the corner list still marks a field", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R17] the two pickers on the page each draw their own globe and share no id", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
  });
}
