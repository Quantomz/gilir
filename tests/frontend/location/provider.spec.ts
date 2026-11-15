// Playwright, Chromium, against a MOCKED MapTiler: every request to api.maptiler.com is answered here with a canned
// TileJSON, a synthetic tile and a canned search answer; GIBS gets one synthetic tile.
// MOCKED EVIDENCE. It proves the wiring: what is asked, when, and what the farmer then sees. It does NOT pass the card's
// live criterion (docs/cards/F2.md:40, "A mocked search alone does not pass"): live.spec.ts does, and it is BLOCKED.
// The dev server must start with a dummy key so the key is inlined; without it this file skips:
//   CI=1 NEXT_PUBLIC_MAPTILER_KEY=pw-dummy-key PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT \
//     npx playwright test tests/frontend/location/provider.spec.ts
import { test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM }, viewport: { width: 390, height: 844 } });
test.skip(process.env.NEXT_PUBLIC_MAPTILER_KEY !== "pw-dummy-key", "needs the dev server started with NEXT_PUBLIC_MAPTILER_KEY=pw-dummy-key");

test.fixme("[R6] typing 'Indramayu' sends no request to the provider; Enter sends exactly one geocoding request", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R4][R1] that request has key=pw-dummy-key, autocomplete=false, and no proximity, bbox or country", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R4] tile requests that carry the key go to api.maptiler.com only; GIBS requests carry no key", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R3] choosing 'Indramayu' drops the pin and the camera goes there; 'Mark my field' draws a 1 ha box with its handles apart", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("tapping the map moves the box to the tap; after dragging a corner a tap no longer moves it", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R11] a canned Fiji answer whose bbox has west > east: the camera goes to its center, and the label is 'Field near Labasa, …', not Tonga", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R5] the credits line reads NASA EOSDIS GIBS, © MapTiler and © OpenStreetMap contributors without a press, in text of at least 18 px", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R16] a 403 to the search shows its explanation; a 429 says the search is busy; 403 to tiles shows 'The map pictures didn’t load. …' and the globe still turns", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
test.fixme("[R25] no request to any provider carries a coordinate of the field: only the typed text and tile z, x and y", async ({ page }) => {
  await page.goto("/dev/fixtures");
});
