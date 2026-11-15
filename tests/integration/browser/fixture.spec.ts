// Playwright, Chromium. FIXTURE phase of card I3: the assembled page on "/" with every card's real code (the field
// picker, the input flow, Results, IndexedDB and the PDF) and a stand-in for /api only. It needs no database, so it
// runs anywhere. The catalogue and the results are synthetic fixtures: this is fixture evidence, not live evidence.
// live.spec.ts is the same journey against the real stack.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { JobState } from "@/contracts";
import { completedSnapshotsV2ByState, jobFixtures } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { stubApi } from "../../frontend/onboarding/support/api";
import { launchOptions } from "../../frontend/onboarding/support/launch";
import { shot } from "./support/evidence";
import { baseUrl } from "./support/stack";
import { actions, answerAll, downloadPdf, makePlan, openApp, resultTitle, sizes, timeline, title, watchErrors } from "./support/walk";
import type { Answers } from "./support/walk";

test.use({ launchOptions, locale: "en-US", timezoneId: "UTC", ...(baseUrl === undefined ? {} : { baseURL: baseUrl }) });

const catalogue = syntheticRegistryFixture.catalogue;
const crop = catalogue.entries[0]!.label;
const answers: Answers = { position: "-6.326, 108.32", crops: [crop], water: "Rain only", ready: "2026-07-01", lastYear: { kind: "skipped" } };
const completed = (state: keyof typeof completedSnapshotsV2ByState): JobState => ({ state: "completed", snapshot: completedSnapshotsV2ByState[state] });

for (const size of sizes) {
  test.describe(`fixture, ${size.name}`, () => {
    test.use({ viewport: size.viewport });
    test.beforeEach(() => {
      test.setTimeout(120_000);
    });

    test("[I3-F1] a typed position, a crop, water and the rotation page reach a fixture plan with warnings; it is saved, opens details, downloads a PDF and reopens after a reload", async ({ page }) => {
      const errors = watchErrors(page);
      const log = await stubApi(page, {
        catalogue,
        submit: [{ kind: "accepted" }],
        reads: [jobFixtures.queued, jobFixtures.fetching, jobFixtures.calculating, completed("plan_with_warnings")],
      });
      await openApp(page);
      await answerAll(page, answers);
      await makePlan(page);
      expect(await resultTitle(page, 60_000)).toBe("Your plan, with warnings");
      expect(log.submitted).toHaveLength(1);
      for (const url of log.urls) expect(new URL(url).search).not.toMatch(/token/i);
      await expect(page.getByText("With warnings.", { exact: true })).toBeVisible();
      await expect(timeline(page)).toBeVisible();
      await expect(actions(page).getByText("Saved on this device.", { exact: true })).toBeVisible();
      await shot(page, `fixture-${size.key}-plan-with-warnings`);

      await page.getByRole("button", { name: "View details" }).click();
      await expect(title(page, "How this result was made")).toBeVisible();
      await page.getByRole("button", { name: "Back to the result" }).first().click();

      const download = await downloadPdf(page);
      const path = test.info().outputPath(download.suggestedFilename());
      await download.saveAs(path);
      expect((await readFile(path)).subarray(0, 5).toString()).toBe("%PDF-");

      await page.reload();
      await expect(title(page, "Your plan, with warnings")).toBeVisible({ timeout: 30_000 });
      expect(errors).toEqual([]);
    });

    test("[I3-F2] a fixture result with missing evidence shows its report with no timeline", async ({ page }) => {
      await stubApi(page, { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued, completed("insufficient_data")] });
      await openApp(page);
      await answerAll(page, answers);
      await makePlan(page);
      expect(await resultTitle(page, 60_000)).toBe("We can’t make a plan yet");
      await expect(timeline(page)).toHaveCount(0);
      await shot(page, `fixture-${size.key}-insufficient-data`);
    });
  });
}
