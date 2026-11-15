// Playwright, Chromium, against the REAL providers. This is the card's live criterion (docs/cards/F2.md:40): "Globe
// rotation, submitted place search, zoom, polygon edit, and fallback controls work in a real configured browser. A
// mocked search alone does not pass."
//
// BLOCKED in the build container: api.maptiler.com and gibs.earthdata.nasa.gov are refused by the proxy and no key is
// configured (grounding section 5). It runs only when someone supplies a key restricted to the test origin and a
// network that reaches both hosts, and says so with F2_LIVE=1:
//   CI=1 F2_LIVE=1 NEXT_PUBLIC_MAPTILER_KEY=<the key> PW_CHROMIUM=/opt/pw-browsers/chromium env -u CLAUDECODE -u AI_AGENT \
//     npx playwright test tests/frontend/location/live.spec.ts
// Until then the PR records each case below as BLOCKED, never as passed.
//
// The key is in every MapTiler URL. So traces and video are off here, no HAR is saved, screenshots are of the page
// only, and nothing prints a URL. Screenshots go to docs/evidence/F2/live-*.png.
import { test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM }, trace: "off", video: "off" });
test.skip(process.env.F2_LIVE !== "1" || !process.env.NEXT_PUBLIC_MAPTILER_KEY, "BLOCKED: needs a real NEXT_PUBLIC_MAPTILER_KEY and a network that reaches api.maptiler.com and gibs.earthdata.nasa.gov");

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test.describe(`live at ${viewport.width}px`, () => {
    test.use({ viewport });

    test.fixme("[R19][R3] the globe shows NASA's Blue Marble far out and turns when dragged", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19][R6] a submitted search for 'Indramayu' returns real places; choosing one moves the camera there", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19][R1] submitted searches for 'Labasa' (Fiji) and 'Ushuaia' each return a place on the right side of the world", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19][R3] 'Mark my field', then zoom to where single fields show in MapTiler's satellite pictures", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19][R7] drag a corner, add a corner, remove a corner: the size words and data-lookup follow", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19][R15] with the globe showing, the corner list still marks a typed field", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19][R5] the credits line holds every name in each provider's own TileJSON attribution, and MapTiler's logo rule is checked against its terms", async ({ page }) => {
      await page.goto("/dev/fixtures");
    });
    test.fixme("[R19] the satellite TileJSON path in provider.ts answers 200, and its tile size and zoom range are what the map uses", async ({ page }) => {
      await page.goto("/dev/fixtures");
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
  test.fixme("[R19][R14] with WebGL off, a real submitted search still names the place, and 'Mark my field' plus the corner list mark a field on the drawing", async ({ page }) => {
    await page.goto("/dev/fixtures");
  });
});
