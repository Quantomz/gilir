import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { renderPdf } from "@/client/pdf/render";
import { completedSnapshotsByState } from "@/fixtures/results";
import { openHarness, sandboxedHarness, test } from "../persistence/support/harness";

const reader = { locale: "en-GB", timeZone: "UTC" } as const;
test.use({ locale: reader.locale, timezoneId: reader.timeZone });

async function untilNetworkQuiet(page: Page, trigger: () => Promise<unknown>): Promise<number> {
  let inFlight = 0;
  let seen = 0;
  let last = Date.now();
  const started = () => { inFlight += 1; seen += 1; last = Date.now(); };
  const ended = () => { inFlight -= 1; last = Date.now(); };
  page.on("request", started);
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  try {
    await trigger();
    await expect.poll(() => seen > 0 && inFlight === 0 && Date.now() - last > 500, { timeout: 30_000 }).toBe(true);
    return seen;
  } finally {
    page.off("request", started);
    page.off("requestfinished", ended);
    page.off("requestfailed", ended);
  }
}

/** Chromium's PDF viewer leaves the tab title empty; its toolbar holds the file's title and page count once parsed. */
async function viewerShows(viewer: Page): Promise<{ title: string; pages: number }> {
  let shown = { title: "", pages: 0 };
  await expect.poll(async () => {
    const frame = viewer.frames().find(candidate => candidate.url().startsWith("chrome-extension://"));
    if (frame !== undefined) {
      shown = await frame.evaluate(() => {
        const toolbar = document.querySelector("pdf-viewer")?.shadowRoot?.querySelector("viewer-toolbar") as (Element & { docTitle?: string; docLength?: number }) | null | undefined;
        return { title: toolbar?.docTitle ?? "", pages: toolbar?.docLength ?? 0 };
      }).catch(() => shown);
    }
    return shown.pages;
  }, { timeout: 15_000 }).toBeGreaterThan(0);
  return shown;
}

const pdfBytes = (page: Page, state: keyof typeof completedSnapshotsByState) => page.evaluate(async state => {
  const blob = await window.gilirF4.exportPdf(window.gilirF4.snapshots[state]);
  return { type: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}, state);

test.describe("Download PDF", () => {
  const titles = {
    plan: "Gilir crop plan, made 1 Jul 2026",
    plan_with_warnings: "Gilir crop plan, made 1 Jul 2026",
    insufficient_data: "Gilir status report, made 1 Jul 2026",
  } as const;
  for (const state of ["plan", "plan_with_warnings", "insufficient_data"] as const) {
    test(`${state} gives a download event with a .pdf name and a %PDF- file, byte-identical to the node render, that Chromium's own viewer opens with the network off`, async ({ page, context, harness }) => {
      await openHarness(page, `${harness.origin}/`);
      const [download, name] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(state => window.gilirF4.download(state), state),
      ]);
      expect(download.suggestedFilename()).toBe(name);
      expect(name).toBe("gilir-plan-2026-07-01.pdf");
      expect(await download.failure()).toBeNull();

      const file = test.info().outputPath(`fixture-${state}.pdf`);
      await download.saveAs(file);
      const saved = await readFile(file);
      expect(saved.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const expected = new Uint8Array(await (await renderPdf(completedSnapshotsByState[state], reader)).arrayBuffer());
      expect(new Uint8Array(saved)).toEqual(expected);

      await context.setOffline(true);
      expect(await page.evaluate(() => fetch("/index.html").then(() => "online", () => "offline"))).toBe("offline");
      const viewer = await context.newPage();
      await viewer.goto(pathToFileURL(file).href);
      const pages = (await PDFDocument.load(expected, { updateMetadata: false })).getPageCount();
      expect(await viewerShows(viewer)).toEqual({ title: titles[state], pages });
      await viewer.screenshot({ path: test.info().outputPath(`viewer-${state}.png`) });
    });
  }

  test("once the code is loaded, making a file sends no request", async ({ page, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    const requests: string[] = [];
    page.on("request", request => requests.push(request.url()));

    expect((await pdfBytes(page, "plan")).type).toBe("application/pdf");
    expect(requests.some(url => url.includes("/src/client/pdf/render.ts"))).toBe(true);

    requests.length = 0;
    for (const state of ["plan", "plan_with_warnings", "insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const) {
      const { type, bytes } = await pdfBytes(page, state);
      expect(type).toBe("application/pdf");
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    }
    expect(requests).toEqual([]);
  });

  test("after preparePdf and with the context offline, the download still happens", async ({ page, context, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    expect(await untilNetworkQuiet(page, () => page.evaluate(() => window.gilirF4.preparePdf()))).toBeGreaterThan(0);

    await context.setOffline(true);
    expect(await page.evaluate(() => fetch("/index.html").then(() => "online", () => "offline"))).toBe("offline");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(() => window.gilirF4.download("plan_with_warnings")),
    ]);
    expect(await download.failure()).toBeNull();
    const saved = await readFile(await download.path());
    expect(saved.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(saved.length).toBeGreaterThan(1_000);
  });

  test("without preparePdf and offline, exportPdf rejects: the reason to call preparePdf when a result shows", async ({ page, context, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    await context.setOffline(true);
    const offline = await page.evaluate(() => window.gilirF4.exportPdf(window.gilirF4.snapshots.plan).then(() => "resolved", () => "rejected"));
    expect(offline).toBe("rejected");
  });

  test("with storage denied (the sandboxed frame), exportPdf still resolves a Blob", async ({ page, harness }) => {
    const frame = await sandboxedHarness(page, harness.origin);
    const outcome = await frame.evaluate(async () => {
      const { exportPdf, localPlans, snapshots, storageProblem } = window.gilirF4;
      const storage = await localPlans.load().then(() => "resolved", error => storageProblem(error).reason);
      const blob = await exportPdf(snapshots.plan);
      const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).subarray(0, 5));
      return { storage, type: blob.type, head };
    });
    expect(outcome).toEqual({ storage: "unavailable", type: "application/pdf", head: "%PDF-" });
  });
});
