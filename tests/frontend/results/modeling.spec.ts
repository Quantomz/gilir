import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { completedSnapshotSchema } from "@/contracts/result";
import { modeledNoCalendarFitFixture, modeledSnapshotFixture } from "@/fixtures/model-result";
import { readPdf } from "../pdf/support/read-pdf";
import { storeState } from "./support/shelf";

const capturedPath = process.env.GILIR_MODEL_SNAPSHOT;
const cases = [
  { name: "synthetic", snapshot: modeledSnapshotFixture },
  ...(capturedPath ? [{ name: "captured-weather", snapshot: completedSnapshotSchema.parse(JSON.parse(readFileSync(capturedPath, "utf8"))) }] : []),
];
test.use({
  locale: "en-GB",
  timezoneId: "UTC",
  launchOptions: { executablePath: process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) },
});

for (const { name, snapshot } of cases) {
  for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
    test(`${name} modeled snapshot restores with API blocked and exports offline at ${viewport.width}px`, async ({ page, context }) => {
      await page.setViewportSize(viewport);
      const api: string[] = [];
      await context.route("**/api/**", route => {
        api.push(route.request().url());
        return route.abort("failed");
      });
      await page.goto("/");
      await page.locator("#main").waitFor();
      await storeState(page, { draft: snapshot.input, step: 4, activeJob: null, snapshot });
      await page.reload();
      await expect(page.getByText("Estimated crop development from historical weather", { exact: true })).toBeVisible();
      await expect(page.getByText("These estimates have not been checked for your area.", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Planting dates and estimated harvest ranges" })).toBeVisible();
      await expect(page.locator(".rs-year").first()).toContainText("Estimated harvest");
      await expect(page.locator(".rs-year").first()).toContainText("set aside through");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${name}-${viewport.width}-result.png`), fullPage: true });

      await page.getByRole("button", { name: "View details", exact: true }).click();
      await expect(page.getByRole("heading", { name: "How this result was made" })).toBeVisible();
      await expect(page.getByText(/Local checks remain unavailable for frost/)).toBeVisible();
      await expect(page.getByText(/Reference cultivar assumption/).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${name}-${viewport.width}-details.png`), fullPage: true });
      await page.getByRole("button", { name: "Back to the result", exact: true }).first().click();

      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download PDF", exact: true }).click();
      const download = await downloaded;
      expect(await download.failure()).toBeNull();
      const path = test.info().outputPath(`${name}-${viewport.width}.pdf`);
      await download.saveAs(path);
      const pdf = await readPdf(new Blob([readFileSync(path)], { type: "application/pdf" }));
      const text = pdf.pages.map(page => page.text).join(" ").replace(/\s+/g, " ");
      expect(text).toContain("Estimated crop development from historical weather");
      expect(text).toContain("Earlier modeled harvests can leave waiting time");
      expect(text).toContain(snapshot.result.details.modeling?.modelReleaseVersion);
      expect(pdf.active).toEqual({ Annots: 0, URI: 0, JavaScript: 0, Launch: 0, EmbeddedFile: 0 });
      expect(api).toEqual([]);
    });
  }
}

test("modeled noncompletion restores with its explanation and no generated timeline", async ({ page, context }) => {
  await context.route("**/api/**", route => route.abort("failed"));
  await page.goto("/");
  await page.locator("#main").waitFor();
  await storeState(page, { draft: modeledNoCalendarFitFixture.input, step: 4, activeJob: null, snapshot: modeledNoCalendarFitFixture });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No calendar fits this development model");
  await expect(page.getByText(modeledNoCalendarFitFixture.result.details.explanation, { exact: true })).toBeVisible();
  await expect(page.locator(".rs-year")).toHaveCount(0);
});
