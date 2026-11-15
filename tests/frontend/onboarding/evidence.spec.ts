// Playwright, Chromium. The browser recording the card asks for: the input flow and focus order at phone and desktop
// widths, written to docs/evidence/F1/ only when F1_EVIDENCE=1 (test-results/ is gitignored).
// Runs on "/" with the development seed and stubbed routes, like journey.spec.ts. The catalogue stub serves the
// released crop list, so page 2 shows the real 40-crop list. Fixture evidence, not live end-to-end evidence.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { parseFarmInput } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, jobFixtures } from "@/fixtures/results";
import { readCatalogue } from "@/registry";
import { focusAreas, focusOrder, scrollsSideways, seedInput, smallestTarget, stubApi } from "./support/api";
import type { ApiScript, FocusStop } from "./support/api";
import { blockStorage, canFillDevice, fillDevice, readRaw, writeRaw } from "./support/idb";
import { launchOptions } from "./support/launch";

test.use({ launchOptions });

const writing = process.env.F1_EVIDENCE === "1";
const catalogue = readCatalogue();
/** inputFixture's field, date and 4-day bar, with its synthetic crop swapped for one on the released list. */
const seed = parseFarmInput({
  ...inputFixture,
  cropPurposeIds: ["maize-grain"],
  history: {
    kind: "recorded",
    start: "2025-07-01",
    endExclusive: "2026-07-01",
    entries: [{
      kind: "crop", id: "synthetic-previous", crop: { kind: "catalogue", cropPurposeId: "maize-grain" },
      planted: "2025-07-01", harvested: "2025-07-04", plantedPrecision: "approximate", harvestedPrecision: "approximate",
    }],
  },
});
const completes: ApiScript = {
  catalogue,
  submit: [{ kind: "accepted" }],
  reads: [jobFixtures.queued, jobFixtures.fetching, jobFixtures.calculating, jobFixtures.completed],
};
const fails: ApiScript = { catalogue, submit: [{ kind: "accepted" }], reads: [jobFixtures.queued, jobFixtures.failed] };

const pageTitles = ["Where is your farm?", "Which crops do you want to grow?", "Where does your water come from?", "Your rotation"] as const;
const primary = ["Next: crops", "Next: water", "Next: your rotation", "Make my plan"] as const;

const title = (page: Page, name: string) => page.getByRole("heading", { level: 1, name, exact: true });
const planting = (page: Page) => page.getByRole("slider", { name: "Maize (grain): planting day" });
const harvest = (page: Page) => page.getByRole("slider", { name: "Maize (grain): harvest day, the last day in the field" });

const staging = (info: TestInfo) => resolve(info.config.rootDir, "../test-results/f1-evidence");

/**
 * Under F1_EVIDENCE=1, files meant for docs/evidence/F1 are staged and copied there after the last test, and only
 * when every test passed. A file written into the repository mid-run makes `next dev` rebuild, and a page loaded
 * during that rebuild can get a 500. Without F1_EVIDENCE, each file stays in its test's own output folder.
 */
function evidencePath(info: TestInfo, name: string): string {
  if (!writing) return info.outputPath(name);
  mkdirSync(staging(info), { recursive: true });
  return resolve(staging(info), name);
}

let failed = false;
test.afterEach(({}, info) => {
  if (info.status !== info.expectedStatus) failed = true;
});
test.afterAll(({}, info) => {
  if (!writing || failed || !existsSync(staging(info))) return;
  cpSync(staging(info), resolve(info.config.rootDir, "../docs/evidence/F1"), { recursive: true });
});

async function open(page: Page, script: ApiScript): Promise<void> {
  await seedInput(page, seed);
  await stubApi(page, script);
  await page.goto("/");
  await expect(title(page, pageTitles[0])).toBeVisible();
}

async function next(page: Page, step: 0 | 1 | 2): Promise<void> {
  await page.getByRole("button", { name: primary[step], exact: true }).click();
  await expect(title(page, pageTitles[step + 1])).toBeVisible();
}

async function readingPage(browser: Browser, viewport: { width: number; height: number }, prefs: { textSize: string; highContrast: boolean }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(value => localStorage.setItem("gilir.reading", JSON.stringify(value)), prefs);
  return context.newPage();
}

/** A real mouse drag of a bar handle by a share of the 12-month track. */
async function dragHandle(page: Page, handle: Locator, share: number): Promise<void> {
  const track = await page.locator(".ly-track").first().boundingBox();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (track === null || box === null) throw new Error("The bar is not on screen.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + track.width * share, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
}

/**
 * Every screen of the input flow at one text size: the four pages, the crop finder, the add and date sheets, Making
 * and the failed screen. `visit` measures each.
 */
async function eachScreen(page: Page, visit: (label: string) => Promise<void>): Promise<void> {
  await open(page, fails);
  await visit("page 1");
  await next(page, 0);
  await expect(page.getByRole("checkbox", { name: "Maize (grain)", exact: true })).toBeChecked();
  await visit("page 2, 40 crops");
  await page.getByRole("searchbox", { name: "Find a crop" }).fill("bean");
  await visit("page 2, Find a crop");
  await next(page, 1);
  await visit("page 3");
  await next(page, 2);
  await visit("page 4");
  await page.getByRole("button", { name: "Add a crop" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await visit("Add a crop sheet");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Change dates/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await visit("Change dates sheet");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Make my plan" }).click();
  await expect(title(page, "Making your plan")).toBeVisible();
  await visit("Making");
  await expect(title(page, "We couldn’t get the weather records")).toBeVisible({ timeout: 10_000 });
  await visit("failed job");
}

function focusTable(heading: string, stops: readonly FocusStop[]): string {
  const cell = (text: string) => text.replace(/\|/g, "\\|");
  const rows = stops.map((stop, i) => `| ${i + 1} | ${stop.area} | ${stop.role} | ${cell(stop.name)} | ${stop.width} x ${stop.height} | ${stop.onTop === "itself" ? "yes" : `covered by ${cell(stop.onTop)}`} |`);
  return [`## ${heading}`, "", "| # | Area | Role | Name | Size (CSS px) | Fully visible |", "| --- | --- | --- | --- | --- | --- |", ...rows, ""].join("\n");
}

function luminance(rgb: string): number {
  const [r = 0, g = 0, b = 0] = (rgb.match(/[\d.]+/g) ?? []).map(Number).map(value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  const w = viewport.width;

  test.describe(`evidence at ${w}px`, () => {
    test.use({ viewport });

    test("[L5] records the input flow from page 1 to Results and copies the video to docs/evidence/F1/", async ({ browser }, info) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ viewport, recordVideo: { dir: info.outputPath("video") } });
      const page = await context.newPage();
      await open(page, completes);
      await page.waitForTimeout(600);
      await focusOrder(page, 30, { pauseMs: 200 });
      await next(page, 0);

      await page.waitForTimeout(500);
      await page.getByRole("searchbox", { name: "Find a crop" }).pressSequentially("bean", { delay: 120 });
      await page.waitForTimeout(400);
      await page.getByRole("checkbox", { name: "Common bean (dry grain)" }).check();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Show all crops" }).click();
      await expect(page.getByText("2 picked")).toBeVisible();
      await focusOrder(page, 60, { pauseMs: 90 });
      await next(page, 1);

      await page.waitForTimeout(400);
      await page.getByRole("radio", { name: "Rain + water when it’s dry" }).check();
      await focusOrder(page, 20, { pauseMs: 200 });
      await next(page, 2);

      await page.waitForTimeout(600);
      await focusOrder(page, 40, { pauseMs: 160 });
      await dragHandle(page, harvest(page), 0.3);
      await page.waitForTimeout(500);
      await dragHandle(page, planting(page), 0.08);
      await page.waitForTimeout(500);
      expect(Number(await planting(page).getAttribute("aria-valuenow"))).toBeGreaterThan(0);
      expect(Number(await harvest(page).getAttribute("aria-valuenow"))).toBeGreaterThan(3);
      await page.getByRole("button", { name: "Add a crop" }).click();
      await page.waitForTimeout(700);
      await page.getByRole("dialog").getByRole("button", { name: /Common bean \(dry grain\)/ }).first().click();
      await expect(page.getByRole("slider", { name: "Common bean (dry grain): planting day" })).toBeVisible();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Make my plan" }).click();
      await expect(title(page, "Making your plan")).toBeVisible();
      await expect(page.getByRole("region", { name: "What you can do" })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1000);

      const video = page.video();
      await context.close();
      if (video === null) throw new Error("No video was recorded.");
      const recorded = info.outputPath(`flow-${w}.webm`);
      await video.saveAs(recorded);
      // Playwright records near-lossless; a plain VP9 pass keeps the committed folder small and the words readable.
      if (writing) execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", recorded, "-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-row-mt", "1", "-an", evidencePath(info, `flow-${w}.webm`)]);
    });

    test("[L3][L5] tabs through each page and writes focus-order-<width>.md (role, name, box) to docs/evidence/F1/", async ({ page }, info) => {
      test.setTimeout(90_000);
      await open(page, completes);
      const walks: (readonly FocusStop[])[] = [];
      for (const [i, name] of pageTitles.entries()) {
        await expect(title(page, name)).toBeVisible();
        walks.push(await focusOrder(page, 80));
        if (i < 3) await next(page, i as 0 | 1 | 2);
      }
      await page.getByRole("button", { name: /^Change dates/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const sheet = await focusOrder(page, 30, { fromFocused: true });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Change dates/ })).toBeFocused();

      const intro = [
        `# Focus order at ${w} x ${viewport.height}`,
        "",
        "Generated by tests/frontend/onboarding/evidence.spec.ts (`F1_EVIDENCE=1`). Fixture run: \"/\" in `next dev` with",
        "the development seed (inputFixture with Maize (grain) as its crop), the released crop list served by a route",
        "stub, and stubbed plan routes.",
        "",
        "Each page table is one Tab walk from the top of the page until focus wraps. The walk stops before the `next dev`",
        "tools button, which a production build does not have. \"Fully visible\" means the centre of the focused element",
        "was not covered by another element once the browser scrolled it into view.",
        "",
        "Storage is the browser's real IndexedDB and works in this run, so no storage notice and no \"Got it\" is on screen.",
        "",
      ];
      const tables = [
        ...pageTitles.map((name, i) => focusTable(`Page ${i + 1}: ${name}`, walks[i] ?? [])),
        focusTable("Page 4, Change dates sheet, from its first control until Tab wraps inside it", sheet),
      ];
      writeFileSync(evidencePath(info, `focus-order-${w}.md`), [...intro, ...tables].join("\n"));

      for (const [i, stops] of walks.entries()) {
        expect(stops[0]).toMatchObject({ role: "link", name: "Skip to the main content" });
        const order = stops.map(stop => focusAreas.indexOf(stop.area));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(stops.filter(stop => stop.area === "other")).toEqual([]);
        expect(stops.filter(stop => stop.area === "dock").at(-1)?.name).toBe(primary[i]);
        const bar = stops.filter(stop => stop.area === "top bar").map(stop => stop.name);
        expect(bar[0]).toBe(i > 0 ? "Back" : "Text size");
        expect(bar.includes("Back")).toBe(i > 0);
        expect(stops.filter(stop => stop.onTop !== "itself")).toEqual([]);
      }
      expect(walks[1]?.filter(stop => stop.role === "checkbox")).toHaveLength(catalogue.entries.length);
      const rotation = (walks[3] ?? []).map(stop => stop.name);
      expect(rotation.indexOf("When is your field ready to plant?")).toBeLessThan(rotation.indexOf("Maize (grain): planting day"));
      expect(rotation.indexOf("Maize (grain): planting day")).toBeLessThan(rotation.indexOf("Maize (grain): harvest day, the last day in the field"));
      expect(sheet.map(stop => stop.name)).toContain("Save dates");
      expect(sheet.filter(stop => stop.area !== "sheet")).toEqual([]);
    });

    for (const textSize of ["normal", "largest"] as const) {
      const size = textSize === "normal" ? "Normal" : "Largest";

      test(`[L1] no page scrolls sideways and no month label is cut off at this width, at ${size} text`, async ({ browser }) => {
        test.setTimeout(60_000);
        const page = await readingPage(browser, viewport, { textSize, highContrast: false });
        const sideways: string[] = [];
        const cutMonths: string[] = [];
        const visited: string[] = [];
        await eachScreen(page, async label => {
          visited.push(label);
          if (await scrollsSideways(page)) sideways.push(label);
          const cut = await page.locator(".ly-mon span").evaluateAll(spans => spans.filter(span => span.scrollWidth > span.clientWidth).map(span => span.textContent));
          if (cut.length > 0) cutMonths.push(`${label}: ${cut.join(" ")}`);
        });
        expect(visited).toHaveLength(9);
        expect(sideways).toEqual([]);
        expect(cutMonths).toEqual([]);
        await page.context().close();
      });

      test(`[L2] every button, input, slider and summary is at least 48 by 48 CSS px, at ${size} text`, async ({ browser }) => {
        test.setTimeout(60_000);
        const page = await readingPage(browser, viewport, { textSize, highContrast: false });
        const small: string[] = [];
        const visited: string[] = [];
        await eachScreen(page, async label => {
          visited.push(label);
          const least = await smallestTarget(page);
          if (least.width < 48 || least.height < 48) small.push(`${label}: ${least.name} ${least.width} x ${least.height}`);
        });
        expect(visited).toHaveLength(9);
        expect(small).toEqual([]);
        await page.context().close();
      });
    }

    test("[L1] the note under the top bar never covers the storage notice, and an open sheet covers the note", async ({ page }) => {
      await blockStorage(page);
      await open(page, completes);
      await next(page, 0);
      await next(page, 1);
      await next(page, 2);
      await page.getByRole("button", { name: /^The field was empty then/ }).click();
      const note = page.locator(".toast");
      await expect(note).toContainText("Marked as empty");
      await page.evaluate(() => window.scrollTo(0, 0));
      const notice = await page.locator(".notice-bar").boundingBox();
      if (notice === null) throw new Error("The storage notice is not on screen.");
      await expect.poll(async () => (await note.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(notice.y + notice.height);

      await page.getByRole("button", { name: /^Change dates/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(note).toBeVisible();
      const onTop = await note.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      });
      expect(onTop).toBe(false);
    });

    test("[J3][K5] screenshots of a rejected submission and a failed job, the two ends without a plan", async ({ page }, info) => {
      const rejected: ApiScript = {
        catalogue,
        submit: [{ kind: "invalid", issues: [{ path: ["cropPurposeIds", 0], message: "Unknown crop purpose for this catalogue." }] }, { kind: "accepted" }],
        reads: [jobFixtures.queued, jobFixtures.failed],
      };
      await open(page, rejected);
      await next(page, 0);
      await next(page, 1);
      await next(page, 2);
      await page.getByRole("button", { name: "Make my plan" }).click();
      await expect(title(page, pageTitles[1])).toBeVisible();
      await expect(page.getByText("Maize (grain) is not on the current crop list. Remove it, then pick again.")).toBeVisible();
      const shot = (name: string) => (w === 360 ? evidencePath(info, `${w}-${name}`) : info.outputPath(`${w}-${name}`));
      await page.screenshot({ path: shot("rejected-submission.png"), animations: "disabled" });
      await next(page, 1);
      await next(page, 2);
      await page.getByRole("button", { name: "Make my plan" }).click();
      await expect(title(page, "We couldn’t get the weather records")).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: shot("failed-job.png"), animations: "disabled" });
    });

    test("[L6] screenshots of each page in light, dark (emulated) and high contrast", async ({ browser }, info) => {
      test.setTimeout(90_000);
      const looks = [
        { name: "light", colorScheme: "light", highContrast: false },
        { name: "dark", colorScheme: "dark", highContrast: false },
        { name: "contrast", colorScheme: "light", highContrast: true },
      ] as const;
      const kept = new Set([`${w}-page2-light.png`, `${w}-page4-light.png`, "360-page4-dark.png", "360-page4-contrast.png"]);
      for (const look of looks) {
        const context = await browser.newContext({ viewport, colorScheme: look.colorScheme });
        await context.addInitScript(value => localStorage.setItem("gilir.reading", JSON.stringify(value)), { textSize: "normal", highContrast: look.highContrast });
        const page = await context.newPage();
        await open(page, completes);
        for (const [i, name] of pageTitles.entries()) {
          if (i > 0) await next(page, (i - 1) as 0 | 1 | 2);
          await expect(title(page, name)).toBeVisible();
          const colours = await page.evaluate(() => ({
            text: getComputedStyle(document.getElementById("main-title") ?? document.body).color,
            background: getComputedStyle(document.body).backgroundColor,
          }));
          const background = luminance(colours.background);
          if (look.name === "dark") expect(background).toBeLessThan(0.1);
          else expect(background).toBeGreaterThan(0.8);
          expect(contrast(colours.text, colours.background)).toBeGreaterThanOrEqual(look.highContrast ? 15 : 7);
          expect(await page.locator("html").getAttribute("data-contrast")).toBe(look.highContrast ? "high" : null);
          const file = `${w}-page${i + 1}-${look.name}.png`;
          await page.screenshot({ path: kept.has(file) ? evidencePath(info, file) : info.outputPath(file), animations: "disabled" });
        }
        await context.close();
      }
    });

    test("[F4-D1] screenshots of F4's storage words: saved data set aside, above Results, and a full device on page 2", async ({ page }, info) => {
      const shot = (name: string) => (w === 360 ? evidencePath(info, `${w}-${name}`) : info.outputPath(`${w}-${name}`));
      await stubApi(page, completes);
      await canFillDevice(page);
      await page.goto("/");
      await expect(title(page, pageTitles[0])).toBeVisible();
      const { schemaVersion: _version, ...answers } = seed;
      const job = { jobId: "not-a-job", token: "" };
      await writeRaw(page, "state", { format: "gilir.local-state", version: 1, state: { draft: answers, step: 4, activeJob: job, snapshot: completedSnapshotFixture } });
      await page.reload();
      await expect(page.getByRole("region", { name: "What you can do" })).toBeVisible();
      await expect(page.locator(".notice-bar")).toContainText("The plan that was being made can’t be followed any more.");
      await page.screenshot({ path: shot("set-aside-results.png"), animations: "disabled" });

      await page.locator(".notice-bar").getByRole("button", { name: "Got it" }).click();
      await writeRaw(page, "state", { format: "gilir.local-state", version: 1, state: { draft: answers, step: 1, activeJob: null, snapshot: null } });
      await page.reload();
      await expect(title(page, pageTitles[0])).toBeVisible();
      await expect.poll(() => readRaw(page, "set-aside")).toBeUndefined();
      await fillDevice(page);
      await next(page, 0);
      await expect(page.locator(".notice-bar")).toContainText("This device has no room left to save Gilir.");
      await page.screenshot({ path: shot("no-room-page2.png"), animations: "disabled" });
    });

    test("the saved text size and contrast apply before first paint: the first screenshot is already Largest", async ({ browser }, info) => {
      const normal = await readingPage(browser, viewport, { textSize: "normal", highContrast: false });
      await open(normal, completes);
      const normalSize = await normal.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      await normal.context().close();

      const page = await readingPage(browser, viewport, { textSize: "largest", highContrast: true });
      await page.addInitScript(() => {
        requestAnimationFrame(() => {
          const root = document.documentElement;
          Reflect.set(window, "__firstFrame", { fontSize: parseFloat(getComputedStyle(root).fontSize), contrast: root.getAttribute("data-contrast") });
        });
      });
      await seedInput(page, seed);
      await stubApi(page, completes);
      await page.goto("/", { waitUntil: "commit" });
      await page.waitForFunction(() => Reflect.get(window, "__firstFrame") !== undefined);
      await page.screenshot({ path: w === 360 ? evidencePath(info, "360-first-paint-largest-contrast.png") : info.outputPath("first-paint.png") });
      const first: unknown = await page.evaluate(() => Reflect.get(window, "__firstFrame"));
      expect(first).toEqual({ fontSize: expect.closeTo(normalSize * 1.36, 1), contrast: "high" });
      await page.context().close();
    });
  });
}
