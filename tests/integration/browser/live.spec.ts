// Playwright, Chromium. LIVE phase of card I3: the assembled page on "/" against the real stack. The web server
// answers /api, PostgreSQL holds the job, a worker fetches NASA POWER and runs the released registry and engine,
// and the browser keeps the result in IndexedDB and makes the PDF. Nothing here is stubbed except where a test
// says it cuts the network. See support/stack.ts for how to run it; without the stack every case skips as BLOCKED.
//
// The field is a synthetic 1 hectare box at a public place (central Bangkok), not a farm.
import { spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { renderPdf } from "@/client/pdf/render";
import { completedSnapshotSchema } from "@/contracts";
import type { CompletedSnapshot } from "@/contracts";
import { launchOptions } from "../../frontend/onboarding/support/launch";
import { evidencePath, recording, shot } from "./support/evidence";
import { baseUrl, blocked, live, startWorker, stopWorker } from "./support/stack";
import {
  actions, answerAll, downloadPdf, fieldSearchName, fillRotation, makePlan, markField, openApp, pickCrops, pickWater, resultTitle, sizes,
  tabTo, timeline, title, watchErrors,
} from "./support/walk";
import type { Answers } from "./support/walk";

const reader = { locale: "en-US", timeZone: "UTC" } as const;
test.use({ launchOptions, trace: "off", locale: reader.locale, timezoneId: reader.timeZone, ...(baseUrl === undefined ? {} : { baseURL: baseUrl }) });
test.skip(!live, blocked);

const rice = "Rice (paddy)";
const withLastYear: Answers = {
  position: "13.75, 100.50",
  crops: [rice],
  water: "Rain + water when it’s dry",
  ready: "2027-05-06",
  lastYear: { kind: "crops", crops: [rice] },
};
const skippingLastYear: Answers = { ...withLastYear, water: "Rain only", lastYear: { kind: "skipped" } };
const planTitle = /^(Your plan|Your plan, with warnings|Keep last year’s rotation.*)$/;

let worker: ChildProcess | null = null;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  worker = await startWorker();
});
test.afterAll(async () => {
  await stopWorker(worker);
});

/** The snapshots the real API handed to this page, parsed with the contract. */
function watchSnapshots(page: Page): CompletedSnapshot[] {
  const snapshots: CompletedSnapshot[] = [];
  page.on("response", async response => {
    if (!/\/api\/plans\/[^/]+$/.test(new URL(response.url()).pathname) || response.request().method() !== "GET") return;
    const body = await response.json().catch(() => null);
    if (body?.state === "completed") snapshots.push(completedSnapshotSchema.parse(body.snapshot));
  });
  return snapshots;
}

async function plan(page: Page, answers: Answers): Promise<string> {
  await openApp(page);
  await answerAll(page, answers);
  await makePlan(page);
  return resultTitle(page);
}

const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();

for (const size of sizes) {
  test.describe(`live, ${size.name}`, () => {
    test.use({ viewport: size.viewport });
    test.beforeEach(() => {
      test.setTimeout(360_000);
    });

    test("[I3-1] field, crops, water and last year's crop lead to one real result through the API, with details and the comparison with last year", async ({ page }) => {
      const errors = watchErrors(page);
      const snapshots = watchSnapshots(page);
      const requests: { method: string; url: string; auth: string | null }[] = [];
      page.on("request", request => {
        if (request.url().includes("/api/plans")) requests.push({ method: request.method(), url: request.url(), auth: request.headers().authorization ?? null });
      });

      await openApp(page);
      await shot(page, `${size.key}-1-farm`, "window");
      await markField(page, withLastYear.position);
      await shot(page, `${size.key}-2-field-marked`, "window");
      await pickCrops(page, withLastYear.crops);
      await expect(page.getByText("1 picked", { exact: false })).toBeVisible();
      await shot(page, `${size.key}-3-crops`, "window");
      await pickWater(page, withLastYear.water);
      await fillRotation(page, withLastYear);

      const harvest = page.getByRole("slider", { name: `${rice}: harvest day, the last day in the field` });
      const before = Number(await harvest.getAttribute("aria-valuenow"));
      await harvest.focus();
      await page.keyboard.press("ArrowRight");
      await expect(harvest).toHaveAttribute("aria-valuenow", String(before + 1));
      await shot(page, `${size.key}-4-rotation`, "window");

      await makePlan(page);
      await expect(page.getByRole("list", { name: "Steps" })).toBeVisible();
      await shot(page, `${size.key}-5-making`, "window");

      const heading = await resultTitle(page);
      expect(heading, "this field, crop and date gave a plan when the evidence was recorded").toMatch(planTitle);
      await expect.poll(() => snapshots.length).toBe(1);
      const snapshot = snapshots[0]!;
      expect(snapshot.schemaVersion).toBe(2);
      expect(snapshot.input.cropPurposeIds).toEqual(["rice-paddy"]);
      expect(["plan", "plan_with_warnings"]).toContain(snapshot.result.state);

      const submitted = requests.filter(request => request.method === "POST");
      expect(submitted).toHaveLength(1);
      const reads = requests.filter(request => request.method === "GET");
      expect(reads.length).toBeGreaterThan(0);
      for (const read of reads) {
        expect(/^Bearer .{20,}/.test(read.auth ?? ""), "the capability token travels in a header").toBe(true);
        expect(new URL(read.url).search, "and never in the address").toBe("");
      }

      await expect(timeline(page).getByText(rice).first()).toBeVisible();
      await expect(timeline(page).getByText(/^Plant .+ · Harvest .+$/).first()).toBeVisible();
      await expect(page.getByText(/Checked against \d+ past seasons, .+ to .+\. From past seasons, not a prediction\. Checked with rain alone\./)).toBeVisible();
      await expect(actions(page).getByText("Saved on this device.", { exact: true })).toBeVisible();
      const compared = page.getByRole("region", { name: "Compared with last year" });
      await expect(compared.getByText(rice).first()).toBeVisible();
      await shot(page, `${size.key}-6-result`);

      await page.getByRole("button", { name: "View details" }).click();
      await expect(title(page, "How this result was made")).toBeVisible();
      const numbers = page.getByRole("region", { name: "The numbers behind the ranking" });
      await expect(numbers.getByText("Method version").first()).toBeVisible();
      await expect(numbers.getByText(/^\d+ seasons$/).first()).toBeVisible();
      await shot(page, `${size.key}-7-details`, "window");
      await page.getByRole("button", { name: "Back to the result" }).first().click();
      await expect(title(page, heading)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("[I3-2] a refresh while the plan is being made keeps the job, and a refresh after completion reopens the saved result with the server cut off", async ({ page }) => {
      const submissions: string[] = [];
      const reads: string[] = [];
      page.on("request", request => {
        const path = new URL(request.url()).pathname;
        if (request.method() === "POST" && path === "/api/plans") submissions.push(path);
        if (request.method() === "GET" && /^\/api\/plans\/[^/]+$/.test(path)) reads.push(path);
      });
      await openApp(page);
      await answerAll(page, skippingLastYear);
      await makePlan(page);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^(Making your plan|${planTitle.source.slice(1, -1)})$`), { timeout: 30_000 });
      const heading = await resultTitle(page);
      expect(heading).toMatch(planTitle);
      expect(submissions).toHaveLength(1);
      expect(reads.length).toBeGreaterThan(0);
      expect(new Set(reads).size, "reload must keep the original job").toBe(1);
      const year = await timeline(page).getByText(/^Your year: /).innerText();

      await page.route("**/api/**", route => route.abort("connectionrefused"));
      await page.reload();
      await expect(title(page, heading)).toBeVisible({ timeout: 30_000 });
      await expect(timeline(page).getByText(year, { exact: true })).toBeVisible();
      await expect(actions(page).getByText("Saved on this device.", { exact: true })).toBeVisible();
      await shot(page, `${size.key}-8-reopened-with-server-cut-off`, "window");
    });

    test("[I3-3] Clear saved data with Undo, then Change my answers keeps the answers and makes a new plan", async ({ page }) => {
      const snapshots = watchSnapshots(page);
      const heading = await plan(page, skippingLastYear);
      expect(heading).toMatch(planTitle);

      await page.getByRole("button", { name: "Clear saved data" }).click();
      await expect(actions(page).getByText(/^Your saved answers and plan are cleared\./)).toBeVisible();
      await actions(page).scrollIntoViewIfNeeded();
      await shot(page, `${size.key}-9-cleared`, "window");
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(actions(page).getByText("Saved on this device.", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Change my answers" }).click();
      await expect(title(page, "Where is your farm?")).toBeVisible();
      await expect(page.getByText("This is the field you marked before.")).toBeVisible();
      await page.getByRole("button", { name: "Next: crops" }).click();
      await expect(page.getByRole("checkbox", { name: rice, exact: true })).toBeChecked();
      await page.getByRole("button", { name: "Next: water" }).click();
      await expect(page.getByRole("radio", { name: "Rain only", exact: true })).toBeChecked();
      await page.getByRole("button", { name: "Next: your rotation" }).click();
      const ready = page.getByRole("textbox", { name: "When is your field ready to plant?" });
      await expect(ready).toHaveValue(skippingLastYear.ready);
      await ready.fill("2027-06-01");
      await makePlan(page);
      await resultTitle(page);
      await expect(page.getByText(/Your year: Jun 1, 2027 to May 31, 2028/).first()).toBeVisible();
      await expect.poll(() => snapshots.length).toBe(2);
      expect(snapshots[1]!.id).not.toBe(snapshots[0]!.id);
      expect(snapshots[1]!.input.planningStart).toBe("2027-06-01");

      await page.getByRole("button", { name: "Clear saved data" }).click();
      await expect(actions(page).getByText(/^Your saved answers and plan are cleared\./)).toBeVisible();
      await page.reload();
      await expect(title(page, "Where is your farm?")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Mark my field" })).toHaveCount(0);
      await expect(page.getByText("This is the field you marked before.")).toHaveCount(0);
    });

    test("[I3-4] the PDF downloads with the network off, is the file made from the API's snapshot, and says what the screen says", async ({ page, context }) => {
      const snapshots = watchSnapshots(page);
      const heading = await plan(page, withLastYear);
      expect(heading).toMatch(planTitle);
      await expect.poll(() => snapshots.length).toBe(1);

      const year = squeeze(await page.getByText(/^Your year: .+ to .+\. One crop at a time\.$/).innerText()).replace(/\. One crop at a time\.$/, "");
      const dates = squeeze(await timeline(page).getByText(/^Plant .+ · Harvest .+$/).first().innerText());
      const cohort = squeeze(await page.getByText(/Checked against \d+ past seasons, .+ to .+\./).innerText()).match(/Checked against \d+ past seasons, [^.]+\./)![0];
      const flagged = page.getByRole("region", { name: "What we flagged" });
      const warnings = (await flagged.getByRole("list").first().getByRole("listitem").allInnerTexts()).map(squeeze);
      const notes = await flagged.getByRole("list").nth(1).getByRole("listitem").allInnerTexts();
      const noteBodies = notes.map(text => squeeze(text.split("\n").slice(1).join(" "))).filter(body => body !== "");

      await context.setOffline(true);
      const download = await downloadPdf(page);
      await context.setOffline(false);
      expect(download.suggestedFilename()).toMatch(/^gilir-plan-\d{4}-\d{2}-\d{2}\.pdf$/);
      const path = recording ? evidencePath(`live-${size.key}.pdf`) : test.info().outputPath(download.suggestedFilename());
      await download.saveAs(path);
      const bytes = await readFile(path);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

      const fromSnapshot = Buffer.from(await (await renderPdf(snapshots[0]!, reader)).arrayBuffer());
      expect(bytes.equals(fromSnapshot), "the download is byte for byte the PDF of the snapshot the API returned").toBe(true);

      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(0);
      expect(pdf.getTitle()).toMatch(/^Gilir crop plan, made /);

      const poppler = spawnSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
      expect(poppler.error, "pdftotext must be installed for the screen-to-PDF comparison").toBeUndefined();
      expect(poppler.status, "pdftotext must successfully read the downloaded PDF").toBe(0);
      const words = squeeze(poppler.stdout);
      expect(words).toContain(heading);
      expect(words).toContain(year);
      expect(words).toContain(dates);
      expect(words).toContain(cohort);
      expect(words).toContain("Checked with rain alone");
      expect(words).toContain("not a prediction");
      expect(warnings.length).toBeGreaterThan(0);
      for (const warning of warnings) expect(words).toContain(warning);
      for (const body of noteBodies) expect(words).toContain(body);
      if (recording) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(evidencePath(`live-${size.key}.pdf.txt`), poppler.stdout);
      }
    });

    test("[I3-5] the keyboard alone marks the field, answers every page, makes the plan, opens details and downloads the PDF", async ({ page }) => {
      await openApp(page);
      await tabTo(page, "searchbox", fieldSearchName);
      await page.keyboard.type(skippingLastYear.position);
      await page.keyboard.press("Enter");
      await tabTo(page, "button", "Mark my field");
      await page.keyboard.press("Enter");
      await tabTo(page, "button", "Type the corners");
      await page.keyboard.press("Enter");
      const corners = page.getByRole("region", { name: "Type the corners of your field" });
      await expect(corners.getByRole("group", { name: "Corner 4" }).getByRole("textbox", { name: "Latitude" })).toHaveValue(/^13\.7/);
      await tabTo(page, "button", "Use these corners");
      await page.keyboard.press("Enter");
      await tabTo(page, "button", "Next: crops");
      await page.keyboard.press("Enter");
      await expect(title(page, "Which crops do you want to grow?")).toBeVisible();

      await tabTo(page, "checkbox", rice);
      await page.keyboard.press("Space");
      await tabTo(page, "button", "Next: water");
      await page.keyboard.press("Enter");
      await expect(title(page, "Where does your water come from?")).toBeVisible();

      await tabTo(page, "radio", "Rain only");
      await page.keyboard.press("Space");
      await expect(page.getByRole("radio", { name: "Rain only", exact: true })).toBeChecked();
      await tabTo(page, "button", "Next: your rotation");
      await page.keyboard.press("Enter");
      await expect(title(page, "Your rotation")).toBeVisible();

      await tabTo(page, "textbox", "When is your field ready to plant?");
      await page.keyboard.type("05062027");
      await expect(page.getByRole("textbox", { name: "When is your field ready to plant?" })).toHaveValue(skippingLastYear.ready);
      await tabTo(page, "button", /^I don’t remember/);
      await page.keyboard.press("Enter");
      await tabTo(page, "button", "Make my plan");
      await page.keyboard.press("Enter");
      await expect(title(page, "Making your plan")).toBeVisible();

      const heading = await resultTitle(page);
      expect(heading).toMatch(planTitle);
      await tabTo(page, "button", "View details");
      await page.keyboard.press("Enter");
      await expect(title(page, "How this result was made")).toBeVisible();
      await tabTo(page, "button", "Back to the result");
      await page.keyboard.press("Enter");
      await expect(title(page, heading)).toBeVisible();
      await tabTo(page, "button", "Download PDF");
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.keyboard.press("Enter")]);
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      await tabTo(page, "button", "Change my answers");
      await page.keyboard.press("Enter");
      await expect(title(page, "Where is your farm?")).toBeVisible();
    });

    test("[I3-6] a phone with no WebGL2 has no globe, and the drawing with the corner list still leads to a real result", async ({ page }) => {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
          return kind === "webgl2" || kind === "webgl" ? null : (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
        } as typeof original;
      });
      await openApp(page);
      await expect(page.getByText(/^This phone can’t show the moving globe\./)).toBeVisible();
      await expect(page.getByRole("region", { name: /^Globe\./ })).toHaveCount(0);
      await answerAll(page, skippingLastYear);
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByText("A drawing, not a photo")).toBeVisible();
      await page.getByText("A drawing, not a photo").scrollIntoViewIfNeeded();
      await shot(page, `${size.key}-10-no-webgl-drawing`, "window");
      await page.getByRole("button", { name: "Next: crops" }).click();
      await page.getByRole("button", { name: "Next: water" }).click();
      await page.getByRole("button", { name: "Next: your rotation" }).click();
      await makePlan(page);
      expect(await resultTitle(page)).toMatch(planTitle);
    });

    test("[I3-7] a crop with no growing details for this place gets a report that says so, with no timeline, and its PDF", async ({ page }) => {
      const snapshots = watchSnapshots(page);
      const heading = await plan(page, { ...skippingLastYear, crops: ["Maize (grain)"] });
      expect(heading).toBe("We can’t make a plan yet");
      await expect.poll(() => snapshots.length).toBe(1);
      expect(snapshots[0]!.result.state).toBe("insufficient_data");
      await expect(timeline(page)).toHaveCount(0);
      await expect(page.getByText("Growing details for Maize (grain) in this place")).toBeVisible();
      await expect(page.getByText(/maize-grain/)).toHaveCount(0);
      await shot(page, `${size.key}-11-no-growing-details`);
      const download = await downloadPdf(page);
      const path = test.info().outputPath(download.suggestedFilename());
      await download.saveAs(path);
      expect((await readFile(path)).subarray(0, 5).toString()).toBe("%PDF-");
    });

    test("[I3-8] when the planning service can't be reached the answers are kept, and Make my plan works once it is back", async ({ page }) => {
      await openApp(page);
      await answerAll(page, skippingLastYear);
      await page.route("**/api/plans", route => route.abort("connectionrefused"));
      await page.getByRole("button", { name: "Make my plan" }).click();
      await expect(page.getByText("The planning service isn’t available right now")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Your answers are kept. Try again in a few minutes.")).toBeVisible();
      await expect(title(page, "Your rotation")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "When is your field ready to plant?" })).toHaveValue(skippingLastYear.ready);
      await shot(page, `${size.key}-12-service-unreachable`, "window");
      await page.unroute("**/api/plans");
      await makePlan(page);
      expect(await resultTitle(page)).toMatch(planTitle);
    });
  });
}

test.describe("live, a short recording of the real journey", () => {
  test.skip(!recording, "Recorded only with I3_EVIDENCE=1.");
  test("[I3-demo] phone width: field, crop, water, rotation, the real result, details and the PDF", async ({ browser }) => {
    test.setTimeout(420_000);
    const context = await browser.newContext({
      viewport: sizes[0].viewport,
      locale: reader.locale,
      timezoneId: reader.timeZone,
      baseURL: baseUrl ?? test.info().project.use.baseURL,
      recordVideo: { dir: test.info().outputPath("video"), size: sizes[0].viewport },
    });
    const page = await context.newPage();
    const pause = () => page.waitForTimeout(1200);
    await openApp(page);
    await pause();
    await markField(page, withLastYear.position);
    await pause();
    await pickCrops(page, withLastYear.crops);
    await pause();
    await pickWater(page, withLastYear.water);
    await pause();
    await fillRotation(page, withLastYear);
    await pause();
    await makePlan(page);
    await resultTitle(page);
    await pause();
    for (const region of ["What we flagged", "When to plant and harvest", "Why this plan ranked first", "Compared with last year"]) {
      await page.getByRole("region", { name: region }).scrollIntoViewIfNeeded();
      await pause();
    }
    await page.getByRole("button", { name: "View details" }).click();
    await pause();
    await page.getByRole("button", { name: "Back to the result" }).first().click();
    await downloadPdf(page);
    await pause();
    const video = page.video();
    await context.close();
    await video?.saveAs(evidencePath("demo-360.webm"));
  });
});
