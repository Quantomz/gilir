// Playwright, Chromium, on "/" with F1's development seed and a stubbed /api (support/walk.ts), so Results is seen
// inside F1's real AppFrame with the real HTTP client and F4's real storage and PDF ports. Every shared state and every
// variant at 360x740 and 1280x800. FIXTURE EVIDENCE: synthetic snapshots through a stubbed API, not live end-to-end.
// F1 saves each finished result in IndexedDB, so a walk opens on the saved line. Screenshots, the PDF, the Tab-order
// logs and the states table go to docs/evidence/F3/ only when F3_EVIDENCE=1 (support/evidence.ts).
// Run on the card's port: PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test -c tests/frontend/results/playwright.config.ts
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { farmInputSchema } from "@/contracts";
import type { CompletedSnapshot } from "@/contracts";
import { evidencePath, expectRows, noteFailure, stageRow, stageText } from "./support/evidence";
import { holdsSetAside, storeNewerState, storeState, storeUnreadablePlan, storedSnapshotId, storedVersion } from "./support/shelf";
import { everySnapshot, shared, variant } from "./support/variants";
import { focusedStop, highContrast, largestText, makePlan, openResult, scrollsSideways, tabOrder, tabTo, targets } from "./support/walk";
import type { Stop, Walk } from "./support/walk";

const sandboxChromium = "/opt/pw-browsers/chromium";
test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined) } });
test.afterEach(({}, info) => noteFailure(info));

const viewports = [{ width: 360, height: 740 }, { width: 1280, height: 800 }] as const;
const matrix = everySnapshot();
const sharedStates = ["plan", "plan_with_warnings", "insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"];

const kept = "Keep last year’s rotation";
const passed = "This order passed every check we could run.";
const heads: Readonly<Record<string, readonly [title: string, status: string]>> = {
  plan: [kept, passed],
  plan_with_warnings: ["Your plan, with warnings", "With warnings."],
  insufficient_data: ["We can’t make a plan yet", "No plan yet."],
  no_calendar_fit: ["Your crops don’t all fit in one year", "No plan."],
  search_incomplete: ["We couldn’t finish the search", "No plan yet."],
  service_error: ["Something went wrong while making your plan", "No new plan."],
  changed: ["Your plan", passed],
  skipped: ["Your plan", passed],
  no_recommendation: ["Your plan", passed],
  several_crops: ["Your plan", passed],
  temperature: ["Your plan, with warnings", "With warnings."],
  context: [kept, passed],
  insights: ["We can’t make a plan yet", "No plan yet."],
  structural: ["Your crops don’t all fit in one year", "No plan."],
  fatal: ["Something went wrong while making your plan", "No new plan."],
  run_provenance: [kept, passed],
  no_preparation: [kept, passed],
  limit_plan: [kept, passed],
  no_fit_assessed: ["Your crops don’t all fit in one year", "No plan."],
  labels_several: ["Your plan", passed],
  labels_changed: ["Your plan", passed],
  labels_warnings: ["Your plan, with warnings", "With warnings."],
};
const timelines = ["When to plant and harvest", "Your rotation, kept"];
const planOnly = [...timelines, "Why this plan ranked first", "Why your rotation ranked first", "Get ready"];
const reportedYear = "What you told us about last year (not scored)";
const actionsTitle = "What you can do";
const detailsTitle = "How this result was made";
const notSaving = "This browser isn’t saving here, so this plan stays only while this page is open. Download the PDF to keep a copy.";
const pdfFailed = "We couldn’t make the PDF. Your plan is still here on this page. You can try again.";
const pdfMade = "The PDF was made. Look in your downloads.";
const savedLine = "Saved on this device.";
const clearedLine = "Your saved answers and plan are cleared. This plan stays on this page until you leave it.";
const clearedSetAsideLine = `${clearedLine} Saved data this version of Gilir couldn’t open was cleared too. Undo can’t bring that back.`;
const newerLine = "Gilir has a newer version. Close this page and open Gilir again to see what you saved. This plan stays here while this page is open. Download the PDF to keep a copy.";
const undoKeptNewer = "Something was saved on this device after you cleared it. We kept it, so your earlier answers and plan were not put back.";
const notSavedLine = "This plan isn’t saved on this device.";
const earlierLine = /^This result isn’t saved\. Your earlier plan, made .+, is still saved on this device\.$/;

const snapshotNamed = (name: string): CompletedSnapshot => {
  const found = matrix.find(entry => entry.name === name);
  if (found === undefined) throw new Error(`No snapshot named ${name}.`);
  return found.snapshot;
};
/**
 * The seed only gets past F1's pages: the result drawn is always the served snapshot, its own answers included. The
 * changed variants' last year starts 16 days before the 12 months F1's page 4 shows, so F1 asks to fix it first; those
 * walks send the same answers with last year skipped.
 */
const seedFor = (name: string, snapshot: CompletedSnapshot) =>
  name === "changed" || name === "labels_changed" ? farmInputSchema.parse({ ...snapshot.input, history: { kind: "skipped" } }) : snapshot.input;
const planned = (snapshot: CompletedSnapshot) => snapshot.result.state === "plan" || snapshot.result.state === "plan_with_warnings";
const resultTitle = (page: Page) => page.locator("#main").getByRole("heading", { level: 1 });
const actions = (page: Page) => page.getByRole("region", { name: actionsTitle });

/** Each year line in #main, named by its section and then by its own caption or the heading just above it. */
async function yearLines(page: Page): Promise<readonly string[]> {
  return page.locator("#main .rs-year").evaluateAll(lines =>
    lines.map(line => {
      const section = line.closest("section")?.querySelector("h2")?.textContent ?? "no section";
      const above = line.previousElementSibling;
      const label = line.querySelector(".rs-track-l")?.textContent ?? (above?.tagName === "H3" ? above.textContent : null);
      return label === null ? section : `${section}: ${label}`;
    }),
  );
}

async function sectionTitles(page: Page): Promise<readonly string[]> {
  return page.locator("#main").getByRole("heading", { level: 2 }).allTextContents();
}

async function actionNames(page: Page): Promise<readonly string[]> {
  return actions(page).getByRole("button").allTextContents();
}

/** The saved line of the actions card: its text without the button inside it. */
async function keptText(page: Page): Promise<string> {
  return actions(page).locator(".rs-st > span:not(.i)").innerText();
}

/** A browser that will not hand a file to a download, so Download PDF fails after the PDF is made. */
async function refuseDownloads(page: Page): Promise<void> {
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("This browser refused the download.");
    };
  });
}

function noErrors(walk: Walk): void {
  expect(walk.errors, "page errors and console errors").toEqual([]);
}

const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

// For a capture taller than the window, where F1's sticky top bar would be drawn across the middle of it.
const hideTopbar = ".topbar { visibility: hidden; }";

for (const viewport of viewports) {
  const width = viewport.width;

  test.describe(`results at ${width}px`, () => {
    test.use({ viewport });

    for (const { name, snapshot } of matrix) {
      test(`[R1][R35] ${name}: its title and status show, the first screen and the full page are captured, and the page does not scroll sideways at Normal and Largest text`, async ({ page }, info) => {
        const [title, status] = heads[name] ?? ["", ""];
        expectRows(info, viewports.flatMap(each => matrix.map(entry => `${entry.name}-${each.width}`)));
        const walk = await openResult(page, snapshot, seedFor(name, snapshot));
        const main = page.locator("#main");

        await expect(resultTitle(page)).toHaveText([title]);
        await expect(main.getByText(status, { exact: true })).toBeVisible();
        const sections = await sectionTitles(page);
        const lines = await yearLines(page);
        if (planned(snapshot)) {
          const timeline = sections.filter(section => timelines.includes(section));
          expect(timeline, "one plan timeline").toHaveLength(1);
          expect(await page.getByRole("region", { name: timeline[0] }).locator(".rs-bar").count(), "the plan has bars").toBeGreaterThan(0);
        } else {
          expect(sections.filter(section => planOnly.includes(section)), "no plan-only section").toEqual([]);
          expect(lines.filter(line => !line.endsWith(`: ${reportedYear}`)), "only the reported year, never a plan or a scored baseline").toEqual([]);
        }
        const sidewaysAtNormal = await scrollsSideways(page);
        expect(sidewaysAtNormal, "sideways at Normal").toBe(false);
        expect(await drawnOverlaps(page), "no bar covers another, and every number disc is inside its lane").toEqual([]);
        const committed = sharedStates.includes(name);
        const full = `shots/${name}-${width}-full.jpg`;
        await page.screenshot({ path: evidencePath(info, `shots/${name}-${width}-top.png`, false) });
        await page.screenshot({ path: evidencePath(info, full, committed), fullPage: true, type: "jpeg", quality: 60 });
        const normalHeight = await pageHeight(page);

        await largestText(page);
        await expect(resultTitle(page)).toHaveText([title]);
        await expect(main.getByText(status, { exact: true })).toBeVisible();
        const sidewaysAtLargest = await scrollsSideways(page);
        expect(sidewaysAtLargest, "sideways at Largest").toBe(false);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: evidencePath(info, `shots/${name}-${width}-largest-top.png`, name === "plan_with_warnings" && width === 360) });
        noErrors(walk);

        stageRow(info, {
          name,
          state: snapshot.result.state,
          width,
          title,
          status,
          sections,
          yearLines: lines,
          kept: await keptText(page),
          actions: await actionNames(page),
          sideways: { normal: sidewaysAtNormal, largest: sidewaysAtLargest },
          height: { normal: normalHeight, largest: await pageHeight(page) },
          shot: committed ? full : null,
        });
      });
    }

    test("[R2] insufficient_data and no_calendar_fit show no When to plant and harvest card and no plan or baseline bars", async ({ context }) => {
      const control = await context.newPage();
      const controlWalk = await openResult(control, shared("plan"));
      const keptLine = control.getByRole("region", { name: "Your rotation, kept" });
      expect(await keptLine.locator(".rs-year .rs-bar").count(), "the check can see a plan's bars").toBeGreaterThan(0);
      noErrors(controlWalk);

      for (const state of ["insufficient_data", "no_calendar_fit"] as const) {
        const page = await context.newPage();
        const walk = await openResult(page, shared(state));
        await expect(resultTitle(page)).toHaveText([heads[state]?.[0] ?? ""]);
        for (const heading of planOnly) await expect(page.getByRole("heading", { name: heading, exact: true }), `${state}: ${heading}`).toHaveCount(0);
        expect(await yearLines(page), state).toEqual([`Compared with last year: ${reportedYear}`]);
        noErrors(walk);
      }
    });

    test("[R3][R8] plan_with_warnings shows the risk words and the search-limit note above the timeline, before View details", async ({ page }) => {
      const walk = await openResult(page, shared("plan_with_warnings"));
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"]);
      await expect(page.getByText("In past seasons, rain fell short of what the crops need in about 5 in 10 weeks.")).toBeVisible();
      const timeline = await page.getByRole("heading", { level: 2, name: "When to plant and harvest" }).boundingBox();
      if (timeline === null) throw new Error("No timeline heading.");
      for (const words of [
        "Rain fell short of what synthetic crop needs in past seasons",
        "Example rainfall warning.",
        "The search stopped at its limit",
        "Example search stopped at its scoring budget.",
      ]) {
        const box = await page.getByText(words, { exact: true }).boundingBox();
        expect(box, words).not.toBeNull();
        expect((box?.y ?? Infinity) + (box?.height ?? 0), `${words} sits above the timeline`).toBeLessThanOrEqual(timeline.y);
      }
      const ranking = page.getByRole("region", { name: "Why this plan ranked first" });
      await expect(ranking.getByText("We stopped at our search limit.")).toBeVisible();
      await expect(ranking.getByText(/This is the best plan we found, not proven to be the best\./)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: detailsTitle })).toHaveCount(0);
      noErrors(walk);
    });

    test("[R1] a version 2 snapshot shows its frozen crop labels in the head and the year line; a version 1 snapshot shows readable ids", async ({ context }, info) => {
      const labelled = await context.newPage();
      const labelledWalk = await openResult(labelled, variant("labels_several"));
      const main = labelled.locator("#main");
      await expect(main.getByText("Maize (grain), Rice (paddy) and Common bean (dry grain)", { exact: true })).toBeVisible();
      const timeline = labelled.getByRole("region", { name: "When to plant and harvest" });
      expect(await timeline.locator(".rs-step-t").allTextContents()).toEqual(expect.arrayContaining(["Maize (grain)", "Common bean (dry grain)", "Rice (paddy)"]));
      await timeline.screenshot({ path: evidencePath(info, `shots/labels_several-${width}-timeline.jpg`, width === 360), type: "jpeg", quality: 70, style: hideTopbar });
      noErrors(labelledWalk);

      const readable = await context.newPage();
      const readableWalk = await openResult(readable, variant("several_crops"));
      await expect(readable.locator("#main").getByText("Maize grain, rice paddy and common bean dry", { exact: true })).toBeVisible();
      noErrors(readableWalk);
    });

    test("[R11] the plan fixture is titled Keep last year’s rotation", async ({ page }) => {
      const walk = await openResult(page, shared("plan"));
      await expect(resultTitle(page)).toHaveText([kept]);
      const compared = page.getByRole("region", { name: "Compared with last year" });
      await expect(compared.getByText("Last year’s rotation ranked first, so we suggest keeping it.")).toBeVisible();
      await expect(compared.getByText("No changes: the same crops, order and dates as last year.")).toBeVisible();
      noErrors(walk);
    });

    test("[R4] a pointer drag across a crop bar and the year line changes no text and moves no focus", async ({ page }) => {
      const walk = await openResult(page, shared("plan_with_warnings"));
      const main = page.locator("#main");
      const timeline = page.getByRole("region", { name: "When to plant and harvest" });
      const bar = timeline.locator(".rs-bar.rs-look-crop").first();
      const reported = page.getByRole("region", { name: "Compared with last year" }).locator(".rs-year");
      await page.evaluate(() => Reflect.set(window, "__focusBefore", document.activeElement));
      const textBefore = await main.innerText();
      const barBefore = await bar.boundingBox();

      for (const line of [timeline.locator(".rs-year"), reported]) {
        await line.scrollIntoViewIfNeeded();
        const lane = await line.locator(".rs-lane").boundingBox();
        if (lane === null) throw new Error("No year line on screen.");
        const y = lane.y + lane.height / 2;
        await page.mouse.move(lane.x + 4, y);
        await page.mouse.down();
        await page.mouse.move(lane.x + lane.width - 4, y, { steps: 12 });
        await page.mouse.up();
        await page.mouse.click(lane.x + lane.width / 2, y);
      }

      expect(await main.innerText(), "no text changed").toBe(textBefore);
      expect(await page.evaluate(() => document.activeElement === Reflect.get(window, "__focusBefore")), "focus did not move").toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await bar.boundingBox(), "the bar did not move").toEqual(barBefore);
      noErrors(walk);
    });

    test("[R35] every button, link and summary in the result is at least 48 by 48 CSS px, at Normal and Largest text", async ({ context }) => {
      for (const name of ["plan_with_warnings", "service_error", "run_provenance"]) {
        const page = await context.newPage();
        const walk = await openResult(page, snapshotNamed(name));
        const tooSmall = async (where: string) => {
          const all = await targets(page);
          expect(all.length, `${name} ${where}: targets found`).toBeGreaterThan(0);
          return all.filter(target => target.width < 48 || target.height < 48).map(target => `${where}: ${target.name} ${target.width}x${target.height}`);
        };
        const small: string[] = [];
        for (const size of ["Normal", "Largest"]) {
          if (size === "Largest") await largestText(page);
          small.push(...(await tooSmall(`${size} result`)));
          await page.getByRole("button", { name: "View details" }).click();
          await expect(resultTitle(page)).toHaveText([detailsTitle]);
          small.push(...(await tooSmall(`${size} details`)));
          await page.getByRole("button", { name: "Back to the result" }).first().click();
        }
        expect(small, name).toEqual([]);
        noErrors(walk);
      }
    });

    test("[R34] keyboard only: Tab reaches View details, Enter opens it with focus on its h1, Back to the result returns focus to View details", async ({ page }, info) => {
      const walk = await openResult(page, shared("plan_with_warnings"));
      expect(await page.evaluate(() => document.activeElement?.id), "AppFrame focuses #main when Results appears").toBe("main");
      const isFocused = (role: string, name: string) => expect.poll(() => focusedStop(page).then(stop => `${stop.role} ${stop.name}`)).toBe(`${role} ${name}`);

      await tabTo(page, "button", "View details");
      await page.keyboard.press("Enter");
      await expect(resultTitle(page)).toHaveText([detailsTitle]);
      await isFocused("heading", detailsTitle);
      expect(await page.evaluate(() => window.scrollY), "details open at the top").toBe(0);
      await page.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-details-top.jpg`, true), type: "jpeg", quality: 70 });

      await page.keyboard.press("Shift+Tab");
      await isFocused("button", "Back to the result");
      await page.keyboard.press("Enter");
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"]);
      await isFocused("button", "View details");

      const left = await page.evaluate(() => window.scrollY);
      await page.keyboard.press("Enter");
      await isFocused("heading", detailsTitle);
      const bottomBack = await tabTo(page, "button", "Back to the result", 80);
      expect(bottomBack.inMain).toBe(true);
      expect(await page.evaluate(() => window.scrollY), "the bottom Back is below the first screen").toBeGreaterThan(0);
      await page.keyboard.press("Space");
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"]);
      await isFocused("button", "View details");
      await expect.poll(() => page.evaluate(() => window.scrollY), "the page is back where View details was pressed").toBe(left);
      noErrors(walk);
    });

    test("[R34] the phone’s Back on View details returns to the result where the farmer left it, with focus on View details", async ({ page }) => {
      const walk = await openResult(page, shared("plan_with_warnings"));
      const url = page.url();
      const viewDetails = actions(page).getByRole("button", { name: "View details" });
      await page.evaluate(() => window.scrollTo(0, 900));
      await viewDetails.scrollIntoViewIfNeeded();
      const left = await page.evaluate(() => window.scrollY);
      await viewDetails.click();
      await expect(resultTitle(page)).toHaveText([detailsTitle]);

      await page.goBack();
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"]);
      await expect.poll(() => focusedStop(page).then(stop => `${stop.role} ${stop.name}`)).toBe("button View details");
      await expect.poll(() => page.evaluate(() => window.scrollY), "where the farmer left it").toBe(left);
      expect(page.url(), "still on Results").toBe(url);
      noErrors(walk);
    });

    test("[R34] the Tab order of plan and of insufficient_data is written to docs/evidence/F3/tab-order-<width>.md", async ({ context }, info) => {
      const expected: Readonly<Record<string, readonly string[]>> = {
        plan: ["Download PDF", "View details", "Change my answers", "Clear saved data"],
        insufficient_data: ["Change my answers", "Download PDF", "View details", "Clear saved data"],
      };
      const tables: string[] = [];
      for (const state of ["plan", "insufficient_data"] as const) {
        const page = await context.newPage();
        const walk = await openResult(page, shared(state));
        await page.locator("#main").focus();
        const stops = await tabOrder(page, 6);
        const inMain = stops.slice(0, stops.findIndex(stop => !stop.inMain));
        expect(inMain.map(stop => `${stop.role} ${stop.name}`), state).toEqual(expected[state]?.map(name => `button ${name}`));
        tables.push(stopTable(`${state}: from #main, where AppFrame puts focus when the result appears`, stops));

        await page.getByRole("button", { name: "View details" }).click();
        await expect(resultTitle(page)).toHaveText([detailsTitle]);
        tables.push(stopTable(`${state}: View details, from its h1`, await tabOrder(page, 8)));
        noErrors(walk);
      }
      const text = [
        `# Tab order at ${width}x${viewport.height}`,
        "",
        "Fixture evidence: Chromium on `/` with F1's development seed and a stubbed `/api`, Results inside F1's `AppFrame`. Written by `results.spec.ts` with `F3_EVIDENCE=1`. Each table presses Tab six or eight times. A stop outside `#main` is the frame around the result (F1's skip link and top bar), which shows that Tab has left the result.",
        "",
        "F1 saved each result in the browser's real storage when it finished, so Clear saved data is the last action. Save on this device shows only for a result that is not saved, so it is absent here.",
        "",
        ...tables,
      ].join("\n");
      stageText(info, `tab-order-${width}.md`, text);
    });

    test("[R25][R26] real storage: the plan reads Saved on this device., Clear saved data empties it with Undo, and Undo saves it back for a reload to open", async ({ page }, info) => {
      const snapshot = shared("plan_with_warnings");
      const walk = await openResult(page, snapshot);
      const card = actions(page);
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      expect(await storedSnapshotId(page), "F1 saved the finished plan").toBe(snapshot.id);
      expect(await actionNames(page)).toEqual(["Download PDF", "View details", "Change my answers", "Clear saved data"]);
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-saved.png`, true) });

      await tabTo(page, "button", "Clear saved data", 20);
      await page.keyboard.press("Enter");
      await expect(card.getByText(clearedLine, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.textContent ?? ""), "focus is on the saved line").toContain(clearedLine);
      expect(await storedSnapshotId(page), "nothing is stored").toBeNull();
      const undo = card.getByRole("button", { name: "Undo" });
      const undoBox = await undo.boundingBox();
      expect(Math.min(undoBox?.width ?? 0, undoBox?.height ?? 0), "Undo is at least 48 by 48").toBeGreaterThanOrEqual(48);
      await expect(card.getByRole("button", { name: "Clear saved data" })).toHaveCount(0);
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"]);
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-cleared.png`, true) });

      await tabTo(page, "button", "Undo", 3);
      await page.keyboard.press("Enter");
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      expect(await storedSnapshotId(page), "the plan is stored again").toBe(snapshot.id);

      await page.reload();
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"], { timeout: 30_000 });
      await expect(actions(page).getByText(savedLine, { exact: true })).toBeVisible();
      noErrors(walk);
    });

    test("[R28] real storage: a service_error after a saved plan keeps that plan, says so with its date, and Open my earlier plan shows it", async ({ page }, info) => {
      const earlier = shared("plan");
      const walk = await openResult(page, earlier);
      await expect(actions(page).getByText(savedLine, { exact: true })).toBeVisible();

      walk.serve(shared("service_error"));
      await actions(page).getByRole("button", { name: "Change my answers" }).click();
      await expect(resultTitle(page)).toHaveText(["Where is your farm?"]);
      await makePlan(page);
      await expect(resultTitle(page)).toHaveText(["Something went wrong while making your plan"]);
      await expect.poll(() => keptText(page)).toMatch(earlierLine);
      expect(await storedSnapshotId(page), "F1 kept the earlier plan").toBe(earlier.id);
      expect(await actionNames(page)).toEqual(["Change my answers", "Open my earlier plan", "Download PDF", "View details", "Clear saved data"]);
      await actions(page).screenshot({ path: evidencePath(info, `shots/service_error-${width}-earlier.png`, true) });

      await actions(page).getByRole("button", { name: "Open my earlier plan" }).click();
      await expect(resultTitle(page)).toHaveText([kept]);
      await expect.poll(() => focusedStop(page).then(stop => `${stop.role} ${stop.name}`)).toBe(`heading ${kept}`);
      await expect(actions(page).getByText(savedLine, { exact: true })).toBeVisible();
      noErrors(walk);
    });

    test("[R23] the real PDF: with the network off after the result shows, Download PDF downloads a %PDF- file named gilir-plan-<day>.pdf and says it was made", async ({ page, context }, info) => {
      const fetched: string[] = [];
      page.on("requestfinished", request => fetched.push(request.url()));
      const walk = await openResult(page, shared("plan_with_warnings"));
      await expect.poll(() => fetched.filter(url => /pdf/i.test(url)).length, "preparePdf fetched the PDF code").toBeGreaterThan(0);
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);

      await tabTo(page, "button", "Download PDF", 20);
      const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
      expect(download.suggestedFilename()).toMatch(/^gilir-plan-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(await download.failure()).toBeNull();
      const file = evidencePath(info, `plan_with_warnings-${width}.pdf`, width === 360);
      await download.saveAs(file);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(1_000);
      await expect(page.getByRole("status")).toHaveText(pdfMade);
      await expect(actions(page).getByRole("alert")).toHaveText("");
      await context.setOffline(false);
      noErrors(walk);
    });

    test("[R25] with IndexedDB taken away, the not-saving note shows, nothing offers Save or Clear, and Download PDF still makes the file", async ({ page }, info) => {
      await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true }));
      const walk = await openResult(page, shared("plan_with_warnings"));
      const card = actions(page);
      await expect(card.getByText(notSaving, { exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveText(notSaving);
      expect(await actionNames(page)).toEqual(["Download PDF", "View details", "Change my answers"]);
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-not-saving.png`, true) });

      const [download] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Download PDF" }).click()]);
      expect(await download.failure()).toBeNull();
      await expect(page.getByRole("status")).toHaveText(pdfMade);
      noErrors(walk);
    });

    test("[R25] real storage holding a newer Gilir’s record: the saved line says so in F4’s words, nothing offers Save or Clear, and the record is left as it was", async ({ page }, info) => {
      const walk = await openResult(page, shared("plan_with_warnings"), undefined, storeNewerState);
      const card = actions(page);
      await expect(card.getByText(newerLine, { exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveText(newerLine);
      expect(await actionNames(page)).toEqual(["Download PDF", "View details", "Change my answers"]);
      expect(await storedVersion(page), "the newer record is untouched").toBe(2);
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-newer.png`, width === 360) });
      noErrors(walk);
    });

    test("[R26] real storage with a saved plan this version cannot open: F4 sets it aside, Clear saved data removes it too and says Undo can’t bring it back, and Undo still puts the plan back", async ({ page }, info) => {
      const snapshot = shared("plan_with_warnings");
      const walk = await openResult(page, snapshot, undefined, storeUnreadablePlan);
      const card = actions(page);
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      expect(await holdsSetAside(page), "F4 set the unreadable plan aside").toBe(true);

      await card.getByRole("button", { name: "Clear saved data" }).click();
      await expect(card.getByText(clearedSetAsideLine, { exact: true })).toBeVisible();
      expect(await holdsSetAside(page), "the clear removed it").toBe(false);
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-cleared-set-aside.png`, width === 360) });

      await card.getByRole("button", { name: "Undo" }).click();
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      expect(await storedSnapshotId(page), "Undo put the plan back").toBe(snapshot.id);
      expect(await holdsSetAside(page), "Undo did not bring the set-aside data back").toBe(false);
      noErrors(walk);
    });

    test("[R26] real storage: Undo after another tab saved since the clear keeps what that tab saved, says so, and moves focus to the saved line", async ({ page }, info) => {
      const other = shared("plan");
      const walk = await openResult(page, shared("plan_with_warnings"));
      const card = actions(page);
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      await card.getByRole("button", { name: "Clear saved data" }).click();
      await expect(card.getByText(clearedLine, { exact: true })).toBeVisible();

      await storeState(page, { draft: null, step: 1, activeJob: null, snapshot: other });
      await card.getByRole("button", { name: "Undo" }).click();
      await expect(card.getByRole("alert")).toHaveText(undoKeptNewer);
      await expect(card.getByText(notSavedLine, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.textContent ?? ""), "focus is on the saved line").toContain(notSavedLine);
      expect(await storedSnapshotId(page), "the other tab’s plan is kept").toBe(other.id);
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-undo-kept.png`, width === 360), style: hideTopbar });
      noErrors(walk);
    });

    test("[R24] a browser that refuses the download: the alert shows, focus stays on Download PDF, and the result is still readable", async ({ page }, info) => {
      const walk = await openResult(page, shared("plan_with_warnings"));
      const card = actions(page);
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      await refuseDownloads(page);

      await tabTo(page, "button", "Download PDF", 20);
      await page.keyboard.press("Enter");
      await expect(card.getByRole("alert")).toHaveText(pdfFailed);
      await expect(card.getByRole("alert")).toBeVisible();
      expect((await focusedStop(page)).name, "focus stays on the button").toBe("Download PDF");
      await expect(resultTitle(page)).toHaveText(["Your plan, with warnings"]);
      await expect(page.getByRole("heading", { level: 2, name: "When to plant and harvest" })).toBeVisible();
      await expect(page.getByRole("region", { name: "What we flagged" })).toBeVisible();
      await card.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-pdf-failed.png`, true) });

      await page.evaluate(() => {
        const alert = document.querySelector("[role=alert]");
        const seen: string[] = [];
        Reflect.set(window, "__alertSeen", seen);
        if (alert !== null) new MutationObserver(() => seen.push(alert.textContent ?? "")).observe(alert, { childList: true, subtree: true, characterData: true });
      });
      await page.keyboard.press("Space");
      await expect.poll(() => page.evaluate(() => Reflect.get(window, "__alertSeen")), "a second try empties the alert, then fails again").toEqual(["", pdfFailed]);
      await expect(card.getByText(savedLine, { exact: true })).toBeVisible();
      expect(await page.locator("body").innerText()).not.toContain("refused the download");
      noErrors(walk);
    });

    test("[R22] Change my answers opens Where is your farm? with the result’s answers, and Make my plan sends them again", async ({ page }) => {
      const snapshot = shared("plan");
      const walk = await openResult(page, snapshot);
      expect(walk.submitted.map(body => farmInputSchema.parse(body))).toEqual([snapshot.input]);

      await tabTo(page, "button", "Change my answers");
      await page.keyboard.press("Enter");
      await expect(resultTitle(page)).toHaveText(["Where is your farm?"]);
      await makePlan(page);
      expect(walk.submitted.map(body => farmInputSchema.parse(body)), "the second plan is made from the shown result’s answers").toEqual([snapshot.input, snapshot.input]);
      noErrors(walk);
    });

    test("[R33] plan_with_warnings in high contrast and in dark mode (emulated) is captured, and its status reads by its word", async ({ context }, info) => {
      const dark = await context.newPage();
      await dark.emulateMedia({ colorScheme: "dark" });
      const darkWalk = await openResult(dark, shared("plan_with_warnings"));
      expect(await dark.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
      await expect(dark.locator("#main").getByText("With warnings.", { exact: true })).toBeVisible();
      await dark.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-dark-top.png`, width === 360) });
      noErrors(darkWalk);

      const contrast = await context.newPage();
      const contrastWalk = await openResult(contrast, shared("plan_with_warnings"));
      await highContrast(contrast);
      expect(await contrast.evaluate(() => document.documentElement.getAttribute("data-contrast"))).toBe("high");
      await expect(contrast.locator("#main").getByText("With warnings.", { exact: true })).toBeVisible();
      await contrast.evaluate(() => window.scrollTo(0, 0));
      await contrast.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-contrast-top.png`, width === 360) });
      noErrors(contrastWalk);
    });

    test("from 1024px the actions card is a second column beside the timeline and stays in view while the page scrolls", async ({ page }, info) => {
      const walk = await openResult(page, shared("plan_with_warnings"));
      const card = await actions(page).boundingBox();
      const timeline = await page.getByRole("region", { name: "When to plant and harvest" }).boundingBox();
      if (card === null || timeline === null) throw new Error("No actions card or timeline.");
      if (width < 1024) {
        expect(Math.abs(card.x - timeline.x), "one column on a phone").toBeLessThan(2);
        expect(card.y, "the actions card follows the timeline").toBeGreaterThan(timeline.y + timeline.height);
        noErrors(walk);
        return;
      }
      expect(card.x, "beside the timeline").toBeGreaterThanOrEqual(timeline.x + timeline.width);
      expect(card.y, "level with the top of the lead column").toBeLessThan(timeline.y);
      const viewportHeight = viewport.height;
      expect(await pageHeight(page), "the page is long enough to scroll").toBeGreaterThan(viewportHeight * 2);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(viewportHeight);
      const scrolled = await actions(page).boundingBox();
      expect(scrolled?.y ?? -1, "the card's top is on screen").toBeGreaterThanOrEqual(0);
      expect((scrolled?.y ?? 0) + (scrolled?.height ?? Infinity), "the card's bottom is on screen").toBeLessThanOrEqual(viewportHeight);
      await page.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-${width}-scrolled.jpg`, true), type: "jpeg", quality: 70 });
      noErrors(walk);
    });
  });
}

test.describe("the actions card under Text size", () => {
  const layouts = [
    { viewport: { width: 1024, height: 768 }, largest: false, columns: 2 },
    { viewport: { width: 1024, height: 768 }, largest: true, columns: 1 },
    { viewport: { width: 1280, height: 800 }, largest: true, columns: 1 },
  ] as const;
  for (const { viewport, largest, columns } of layouts) {
    test(`at ${viewport.width}x${viewport.height} ${largest ? "Largest" : "Normal"} text the actions card is ${columns === 2 ? "a second column" : "under the timeline, in one column"}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const walk = await openResult(page, shared("plan_with_warnings"));
      if (largest) await largestText(page);
      const card = await actions(page).boundingBox();
      const timeline = await page.getByRole("region", { name: "When to plant and harvest" }).boundingBox();
      if (card === null || timeline === null) throw new Error("No actions card or timeline.");
      if (columns === 2) expect(card.x, "beside the timeline").toBeGreaterThanOrEqual(timeline.x + timeline.width);
      else expect(card.y, "after the timeline").toBeGreaterThan(timeline.y + timeline.height);
      noErrors(walk);
    });
  }

  for (const size of ["Large", "Largest"] as const) {
    test(`at 1366x650 ${size} text with a failed PDF, each actions button is inside the window when Tab reaches it`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1366, height: 650 });
      const walk = await openResult(page, shared("plan_with_warnings"));
      await readingSize(page, size);
      await refuseDownloads(page);
      const card = actions(page);
      const timeline = await page.getByRole("region", { name: "When to plant and harvest" }).boundingBox();
      expect((await card.boundingBox())?.x ?? 0, "still a sticky second column").toBeGreaterThanOrEqual((timeline?.x ?? 0) + (timeline?.width ?? 0));
      await tabTo(page, "button", "Download PDF", 20);
      await page.keyboard.press("Enter");
      await expect(card.getByRole("alert")).toHaveText(pdfFailed);
      for (const name of ["Download PDF", "View details", "Change my answers", "Clear saved data"]) {
        if (name !== "Download PDF") await tabTo(page, "button", name, 3);
        const box = await card.getByRole("button", { name }).evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        });
        expect(box.top, `${name} top`).toBeGreaterThanOrEqual(0);
        expect(box.bottom, `${name} bottom`).toBeLessThanOrEqual(650);
      }
      await page.screenshot({ path: evidencePath(info, `shots/plan_with_warnings-1366x650-${size.toLowerCase()}-pdf-failed.png`, false) });
      noErrors(walk);
    });
  }
});

/** F1's Text size sheet set to Large or Largest, through its own controls. */
async function readingSize(page: Page, size: "Large" | "Largest"): Promise<void> {
  if (size === "Largest") return largestText(page);
  await page.getByRole("button", { name: "Text size", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Text size" });
  await sheet.getByRole("radio", { name: "Large", exact: true }).check();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toBeHidden();
}

/** Bars in one lane that cover each other by more than 1px, and number discs outside their lane. */
async function drawnOverlaps(page: Page): Promise<readonly string[]> {
  return page.locator("#main .rs-lane").evaluateAll(lanes => lanes.flatMap((lane, laneIndex) => {
    const edges = lane.getBoundingClientRect();
    const bars = Array.from(lane.querySelectorAll(".rs-bar"), bar => bar.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    const covered = bars.slice(1).flatMap((bar, index) => {
      const overlap = (bars[index]?.right ?? 0) - bar.left;
      return overlap > 1 ? [`lane ${laneIndex}: bars ${index + 1} and ${index + 2} overlap by ${overlap.toFixed(1)}px`] : [];
    });
    const outside = Array.from(lane.querySelectorAll(".rs-mark"), mark => mark.getBoundingClientRect()).flatMap((mark, index) =>
      mark.left < edges.left - 0.5 || mark.right > edges.right + 0.5 ? [`lane ${laneIndex}: disc ${index + 1} outside the lane`] : []);
    return [...covered, ...outside];
  }));
}

function stopTable(heading: string, stops: readonly Stop[]): string {
  return [
    `## ${heading}`,
    "",
    "| Tab | Role | Name | Size (CSS px) | Where |",
    "| --- | --- | --- | --- | --- |",
    ...stops.map((stop, index) => `| ${index + 1} | ${stop.role} | ${stop.name.replaceAll("|", "\\|")} | ${stop.width} x ${stop.height} | ${stop.inMain ? "the result" : "the frame"} |`),
    "",
  ].join("\n");
}

