// Playwright, Chromium. Surface: "/" with the REAL HTTP client (src/client/planner.ts) on a stubbed network
// (support/api.ts stubApi) and the development-only seed (support/api.ts seedInput -> src/app/page.tsx devInput),
// because the F2 slot cannot emit a field and every storage call rejects (grounding.md gotcha 1). It is the only
// surface that can show a rejected submission, a failed job, polling that moves, and a 404 on read.
// Fixture evidence of F1 alone, named so in the PR. Not live end-to-end evidence (AGENTS.md:59).
import { test } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM } });

test.describe("journeys on / with stubbed /api routes", () => {
  test.fixme("[A9] with nothing seeded, / opens on Where is your farm? with no landing, sign in or sign up", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[D4] with the seed, page 1 holds the marked field and Next goes to page 2; without it, page 1 waits because the F2 stub cannot emit a field", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[M1][K1][K2] completes the four pages and reaches Results through queued, fetching, calculating, completed", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[A4] the POST body has exactly the six FarmInput keys and no priority", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[M1][J3] a rejected submission (400 invalid on cropPurposeIds 0): page 2 shows the issue, every answer is kept, no Making and no Results", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[J4] a 503 unavailable keeps page 4 with the failure panel and one Make my plan button; a 429 and a 413 show their own words", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[M1][K5] a failed JobState (jobFixtures.failed) shows the failure screen, no Results; Change my answers returns to page 4 with the same answers", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[K6] a 404 not_found on read ends on This plan request has expired, with every answer kept", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[A10] no request URL and no page URL contains the capability token; the token is only in the Authorization header", async ({ page }) => {
    await page.goto("/");
  });
  test.fixme("[E3] the real empty catalogue shape (entries []) shows No crops are available yet and no Next", async ({ page }) => {
    await page.goto("/");
  });
});
