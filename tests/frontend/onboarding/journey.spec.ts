// Playwright, Chromium. Surface: "/" with the REAL HTTP client (src/client/planner.ts) on a stubbed network
// (support/api.ts stubApi) and the development-only seed (support/api.ts seedInput), because the field picker slot
// cannot emit a field yet and every storage call rejects. It is the only surface that can show a rejected
// submission, a failed job, polling that moves, and a 404 on read.
// Fixture evidence of F1 alone: the catalogue and the plan routes are stubs. Not live end-to-end evidence.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { farmInputSchema } from "@/contracts";
import type { ServiceFailure } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { jobFixtures } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { readCatalogue } from "@/registry";
import { recordTitles, seedInput, stubApi, stubCapability, titlesSeen } from "./support/api";
import type { ApiScript } from "./support/api";
import { launchOptions } from "./support/launch";

test.use({ launchOptions });

const catalogue = syntheticRegistryFixture.catalogue;
const stubFailure = (code: ServiceFailure["code"], retryable: boolean): ServiceFailure => ({ code, message: "Stub failure for a fixture run.", retryable });
const fixtureBody = JSON.parse(JSON.stringify(inputFixture));

const title = (page: Page, name: string) => page.getByRole("heading", { level: 1, name, exact: true });
const plantingDay = (page: Page) => page.getByRole("slider", { name: "Synthetic crop: planting day" });
const harvestDay = (page: Page) => page.getByRole("slider", { name: "Synthetic crop: harvest day, the last day in the field" });
const readyDate = (page: Page) => page.getByRole("textbox", { name: "When is your field ready to plant?" });
const resultsSlot = (page: Page) => page.getByRole("region", { name: "Results implementation slot" });

async function open(page: Page, script: ApiScript, seeded = true) {
  if (seeded) await seedInput(page, inputFixture);
  await recordTitles(page);
  const log = await stubApi(page, script);
  await page.goto("/");
  await expect(title(page, "Where is your farm?")).toBeVisible();
  return log;
}

async function toRotation(page: Page) {
  await page.getByRole("button", { name: "Next: crops" }).click();
  await expect(page.getByRole("checkbox", { name: "Synthetic crop" })).toBeChecked();
  await page.getByRole("button", { name: "Next: water" }).click();
  await expect(title(page, "Where does your water come from?")).toBeVisible();
  await page.getByRole("button", { name: "Next: your rotation" }).click();
  await expect(title(page, "Your rotation")).toBeVisible();
}

async function expectAnswersKept(page: Page) {
  await expect(title(page, "Your rotation")).toBeVisible();
  await expect(readyDate(page)).toHaveValue("2026-07-01");
  await expect(plantingDay(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", "3");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("radio", { name: "Rain only" })).toBeChecked();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("checkbox", { name: "Synthetic crop" })).toBeChecked();
}

test.describe("journeys on / with stubbed /api routes", () => {
  test("[A9] with nothing seeded, / opens on Where is your farm? with no landing, sign in or sign up", async ({ page }) => {
    const prerendered = await (await page.request.get("/")).text();
    expect(prerendered).toContain("Opening Gilir…");
    expect(prerendered).not.toContain("Where is your farm?");

    await open(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued] }, false);
    expect(await titlesSeen(page)).toEqual(["Opening Gilir…", "Where is your farm?"]);
    await expect(page.getByText("Step 1 of 4 · Your farm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
    for (const role of ["button", "link"] as const) {
      await expect(page.getByRole(role, { name: /sign ?in|sign ?up|log ?in|register|get started|welcome/i })).toHaveCount(0);
    }
  });

  test("[D4] with the seed, page 1 holds the marked field and Next goes to page 2; without it, page 1 waits because the F2 stub cannot emit a field", async ({ page, browser }) => {
    const errors: string[] = [];
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    const log = await open(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued] });
    await page.getByRole("button", { name: "Next: crops" }).click();
    await expect(title(page, "Which crops do you want to grow?")).toBeVisible();
    await page.getByRole("button", { name: "Next: water" }).click();
    await page.getByRole("button", { name: "Next: your rotation" }).click();
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(title(page, "Making your plan")).toBeVisible();
    expect(log.submitted).toHaveLength(1);
    expect(farmInputSchema.parse(log.submitted[0]).field).toEqual(inputFixture.field);
    expect(errors.filter(text => /hydrat|did not match/i.test(text))).toEqual([]);

    const bare = await browser.newPage();
    await open(bare, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued] }, false);
    await bare.getByRole("button", { name: "Next: crops" }).click();
    await expect(bare.getByRole("alert").filter({ hasText: "Mark your field to go on." })).toBeVisible();
    await expect(title(bare, "Where is your farm?")).toBeVisible();
    await bare.close();
  });

  test("[M1][K1][K2] completes the four pages and reaches Results through queued, fetching, calculating, completed", async ({ page }) => {
    test.setTimeout(60_000);
    const log = await open(page, {
      catalogue,
      submit: [{ kind: "accepted" }],
      reads: [jobFixtures.queued, jobFixtures.fetching, jobFixtures.calculating, jobFixtures.completed],
    });
    await toRotation(page);
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(title(page, "Making your plan")).toBeVisible();
    const working = page.locator(".task[data-state=now] .task-t");
    for (const step of ["Waiting for a free place in line", "Getting NASA weather records for your area", "Comparing orders and planting dates"]) {
      await expect(working).toHaveText(step, { timeout: 10_000 });
    }
    await expect(resultsSlot(page)).toBeVisible({ timeout: 10_000 });
    await expect(title(page, "Making your plan")).toHaveCount(0);
    expect(log.submitted).toEqual([fixtureBody]);
    expect(log.reads).toBe(4);
    expect(await titlesSeen(page)).toEqual([
      "Opening Gilir…", "Where is your farm?", "Which crops do you want to grow?", "Where does your water come from?", "Your rotation", "Making your plan",
    ]);
  });

  test("[A4][F2] with each of the three water answers, the POST body has exactly the six FarmInput keys, no priority, and differs only in water", async ({ page }) => {
    const log = await open(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued] });
    await toRotation(page);
    for (const answer of ["Rain only", "Rain + water when it’s dry", "I’m not sure"]) {
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("radio", { name: answer }).check();
      await page.getByRole("button", { name: "Next: your rotation" }).click();
      await page.getByRole("button", { name: "Make my plan" }).click();
      await expect(title(page, "Making your plan")).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(title(page, "Your rotation")).toBeVisible();
    }
    expect(log.submitted).toHaveLength(3);
    const waters = ["rain_only", "rain_plus_backup", "unsure"];
    log.submitted.forEach((body, i) => {
      expect(Object.keys(farmInputSchema.parse(body)).sort()).toEqual(["cropPurposeIds", "field", "history", "planningStart", "schemaVersion", "water"]);
      expect(JSON.stringify(body)).not.toMatch(/priorit/i);
      expect(body).toEqual({ ...fixtureBody, water: waters[i] });
    });
    await expect.poll(() => log.deletes).toBe(3);
  });

  test("[H1] I don’t remember sends history { kind: \"skipped\" } and Show last year’s entries again brings the bar back", async ({ page }) => {
    const log = await open(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued] });
    await toRotation(page);
    const skip = page.getByRole("button", { name: /I don’t remember/ });
    await skip.click();
    await expect(skip).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("We make your plan without last year.")).toBeVisible();
    await expect(page.getByRole("slider")).toHaveCount(0);
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(title(page, "Making your plan")).toBeVisible();
    expect(log.submitted).toEqual([{ ...fixtureBody, history: { kind: "skipped" } }]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Show last year’s entries again" }).click();
    await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", "3");
  });

  test("[M1][J3] a rejected submission (400 invalid on cropPurposeIds 0): page 2 shows the issue, every answer is kept, no Making and no Results", async ({ page }) => {
    const log = await open(page, {
      catalogue,
      submit: [{ kind: "invalid", issues: [{ path: ["cropPurposeIds", 0], message: "Unknown crop purpose for this catalogue." }] }],
      reads: [jobFixtures.queued],
    });
    await toRotation(page);
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(title(page, "Which crops do you want to grow?")).toBeVisible();
    const issue = page.getByText("Synthetic crop is not on the current crop list. Remove it, then pick again.");
    await expect(issue).toBeVisible();
    await expect(page.locator("#main .issues")).toBeFocused();
    await expect(page.getByRole("checkbox", { name: "Synthetic crop" })).toBeChecked();
    await page.getByRole("button", { name: "Next: water" }).click();
    await expect(page.getByRole("radio", { name: "Rain only" })).toBeChecked();
    await page.getByRole("button", { name: "Next: your rotation" }).click();
    await expect(readyDate(page)).toHaveValue("2026-07-01");
    await expect(harvestDay(page)).toHaveAttribute("aria-valuenow", "3");
    expect(log.submitted).toEqual([fixtureBody]);
    expect(log.reads).toBe(0);
    expect(await titlesSeen(page)).not.toContain("Making your plan");
    await expect(resultsSlot(page)).toHaveCount(0);
  });

  test("[J4] a 503 unavailable keeps page 4 with the failure panel and one Make my plan button; a 429 and a 413 show their own words", async ({ page }) => {
    const log = await open(page, {
      catalogue,
      submit: [
        { kind: "unavailable", failure: stubFailure("temporarily_unavailable", true) },
        { kind: "status", status: 429, failure: stubFailure("rate_limited", true) },
        { kind: "status", status: 413, failure: stubFailure("payload_too_large", false) },
      ],
      reads: [jobFixtures.queued],
    });
    await toRotation(page);
    const make = page.getByRole("button", { name: "Make my plan" });
    for (const words of ["The planning service isn’t available right now", "Too many plan requests right now", "Your answers are too large to send"]) {
      await make.click();
      await expect(page.locator("#submit-fail")).toHaveText(words);
      await expect(title(page, "Your rotation")).toBeVisible();
      await expect(make).toHaveCount(1);
      await expect(page.getByText("Your answers weren’t sent. See the note at the top.")).toBeVisible();
    }
    expect(log.submitted).toEqual([fixtureBody, fixtureBody, fixtureBody]);
    expect(log.reads).toBe(0);
    await expectAnswersKept(page);
  });

  test("[M1][K5] a failed JobState (jobFixtures.failed) shows the failure screen, no Results; Change my answers returns to page 4 with the same answers", async ({ page }) => {
    const log = await open(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued, jobFixtures.failed] });
    await toRotation(page);
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(title(page, "We couldn’t get the weather records")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("No plan was made.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(resultsSlot(page)).toHaveCount(0);
    await expect.poll(() => log.deletes).toBe(1);
    await page.getByRole("button", { name: "Change my answers" }).click();
    await expectAnswersKept(page);
    expect(log.reads).toBe(2);
  });

  test("[K6] a 404 not_found on read ends on This plan request has expired, with every answer kept", async ({ page }) => {
    const log = await open(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued, { status: 404, failure: stubFailure("not_found", false) }] });
    await toRotation(page);
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(title(page, "This plan request has expired")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Make my plan again" })).toBeVisible();
    await expect(resultsSlot(page)).toHaveCount(0);
    expect(log.reads).toBe(2);
    await page.getByRole("button", { name: "Change my answers" }).click();
    await expectAnswersKept(page);
  });

  test("[A10] no request URL and no page URL contains the capability token; the token is only in the Authorization header", async ({ page }) => {
    const pageUrls: string[] = [];
    page.on("framenavigated", frame => pageUrls.push(frame.url()));
    const log = await open(page, {
      catalogue,
      submit: [{ kind: "accepted" }],
      reads: [jobFixtures.queued, jobFixtures.fetching, jobFixtures.completed],
    });
    await toRotation(page);
    await page.getByRole("button", { name: "Make my plan" }).click();
    await expect(resultsSlot(page)).toBeVisible({ timeout: 15_000 });
    pageUrls.push(page.url());
    expect(log.reads).toBe(3);
    expect(log.authHeaders.length).toBeGreaterThanOrEqual(3);
    expect(new Set(log.authHeaders)).toEqual(new Set([`Bearer ${stubCapability.token}`]));
    expect(log.urls.length).toBeGreaterThan(5);
    expect(log.urls.filter(url => url.includes(stubCapability.token))).toEqual([]);
    expect(pageUrls.filter(url => url.includes(stubCapability.token))).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(stubCapability.token);
  });

  test("[E3] the real empty catalogue shape (entries []) shows No crops are available yet and no Next", async ({ page }) => {
    const empty = readCatalogue("v1-empty");
    expect(empty.entries).toEqual([]);
    await open(page, { catalogue: empty, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued] });
    await page.getByRole("button", { name: "Next: crops" }).click();
    await expect(page.getByText("No crops are available yet")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Next/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(title(page, "Where is your farm?")).toBeVisible();
  });
});
