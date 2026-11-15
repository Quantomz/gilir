// Playwright helpers for F3. Not a spec. They reach Results inside F1's real AppFrame on "/": F1's development seed
// opens the answers, stubbed /api routes answer through the real HTTP client, and four taps make the plan. The snapshot
// served can be any strict CompletedSnapshot, a shared fixture or an F3 variant. Storage and the PDF are F4's real
// ports in Chromium: F1 saves the finished plan, and Results reads it. Everything seen this way is fixture evidence
// (synthetic snapshots through a stubbed API), not live end-to-end evidence.
import { expect } from "@playwright/test";
import type { Locator, Page, Route } from "@playwright/test";
import { catalogueSchema, completedSnapshotSchema, farmInputSchema } from "@/contracts";
import type { Catalogue, CompletedSnapshot, FarmInput, JobCapability, JobState, Submission } from "@/contracts";
import { syntheticRegistryFixture } from "@/fixtures/science";

const blankTile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

/** The real client turns a 202 whose jobId is not a UUID into `unavailable`. */
const capability: JobCapability = { jobId: "5d7c2b9e-3f41-4a8b-9c6d-2e1f0a7b8c93", token: "stub-capability-token-for-fixture-runs-only" };

const nextTaps = ["Next: crops", "Next: water", "Next: your rotation", "Make my plan"] as const;

export interface Walk {
  /** Each POST /api/plans body, in order: the answers F1 sent. */
  readonly submitted: readonly unknown[];
  /** Uncaught page errors and console errors, so a test can require none. */
  readonly errors: readonly string[];
  /** Answer every later plan request with this snapshot instead. */
  serve(next: CompletedSnapshot): void;
}

/**
 * Open "/" seeded with `seed` (the snapshot's own input unless given), answer every plan request with `snapshot`, tap
 * through F1's four pages and wait until the result's actions card shows. The seed is given to the first load only,
 * so a reload opens what storage holds, as it would for a farmer. `beforeStart` runs on a first visit to "/", so it
 * can write storage that F1 then opens.
 */
export async function openResult(
  page: Page,
  snapshot: CompletedSnapshot,
  seed: FarmInput = snapshot.input,
  beforeStart?: (page: Page) => Promise<void>,
): Promise<Walk> {
  const answers = farmInputSchema.parse(seed);
  const walk = await stubApi(page, completedSnapshotSchema.parse(snapshot), answers);
  await hideDevIndicator(page);
  if (beforeStart !== undefined) {
    await page.goto("/");
    await beforeStart(page);
  }
  await page.addInitScript(value => {
    if (sessionStorage.getItem("f3-seeded") !== null) return;
    sessionStorage.setItem("f3-seeded", "yes");
    Reflect.set(window, "__gilirDevInput", value);
  }, answers);
  await page.goto("/");
  await makePlan(page);
  return walk;
}

/** From F1's first page, tap the four "Next step" buttons and wait for the result. */
export async function makePlan(page: Page): Promise<void> {
  for (const name of nextTaps) await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("region", { name: "What you can do" })).toBeVisible({ timeout: 30_000 });
  // The pointer would otherwise rest where Make my plan was, over whichever result button now sits there.
  await page.mouse.move(0, 0);
}

async function stubApi(page: Page, first: CompletedSnapshot, seed: FarmInput): Promise<Walk> {
  let snapshot = first;
  const submitted: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const catalogue = catalogueSchema.parse(catalogueFor(first, [seed, first.input]));
  // Page 1's globe draws NASA GIBS tiles, which this machine cannot reach. A blank tile keeps the console clean.
  await page.route("https://gibs.earthdata.nasa.gov/**", route => route.fulfill({ status: 200, contentType: "image/png", body: blankTile }));
  await page.route("**/api/catalogue", route => fulfil(route, 200, catalogue));
  await page.route("**/api/plans", route => {
    if (route.request().method() !== "POST") return route.fallback();
    submitted.push(route.request().postDataJSON());
    return fulfil(route, 202, { kind: "accepted", capability } satisfies Submission);
  });
  await page.route("**/api/plans/*", route => {
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204 });
    return fulfil(route, 200, { state: "completed", snapshot } satisfies JobState);
  });
  return {
    submitted,
    errors,
    serve: next => {
      snapshot = completedSnapshotSchema.parse(next);
    },
  };
}

/**
 * The synthetic catalogue plus every crop the answers name, so F1's pages accept each seed as it is. A version 2
 * snapshot's frozen labels replace the synthetic ones, so F1 shows the farmer the same names Results does.
 */
function catalogueFor(snapshot: CompletedSnapshot, inputs: readonly FarmInput[]): Catalogue {
  const frozen = snapshot.schemaVersion === 2 ? snapshot.catalogue.entries : [];
  const listed = new Map([...syntheticRegistryFixture.catalogue.entries, ...frozen].map(entry => [entry.id, entry]));
  for (const input of inputs) {
    const reported = input.history.kind === "recorded"
      ? input.history.entries.flatMap(entry => (entry.kind === "crop" && entry.crop.kind === "catalogue" ? [entry.crop.cropPurposeId] : []))
      : [];
    for (const id of [...input.cropPurposeIds, ...reported]) {
      if (!listed.has(id)) listed.set(id, { id, label: id.replaceAll("-", " "), purpose: "food" });
    }
  }
  return { version: syntheticRegistryFixture.catalogue.version, entries: [...listed.values()] };
}

async function fulfil(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Hide the Next dev indicator (nextjs-portal), which would sit in every screenshot. next.config.ts is not F3's file. */
async function hideDevIndicator(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
}

export interface Stop {
  readonly role: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Inside #main, the page the farmer reads, or in the frame around it. */
  readonly inMain: boolean;
}

/** Press Tab `steps` times from the element that has focus now, and record each stop. */
export async function tabOrder(page: Page, steps: number): Promise<readonly Stop[]> {
  const stops: Stop[] = [];
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("Tab");
    stops.push(await focusedStop(page));
  }
  return stops;
}

/** The focused element's role, accessible name and box, read from the accessibility tree. */
export async function focusedStop(page: Page): Promise<Stop> {
  const focused = page.locator(":focus");
  if ((await focused.count()) === 0) return { role: "none", name: "", width: 0, height: 0, inMain: false };
  const [line = ""] = (await focused.ariaSnapshot()).split("\n");
  const box = await focused.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height), inMain: element.closest("#main") !== null };
  });
  return { ...roleAndName(line), ...box };
}

/** The role and name from the first line of an aria snapshot, which YAML quotes when the name has a colon. */
function roleAndName(line: string): { readonly role: string; readonly name: string } {
  const node = line.replace(/^- /, "");
  const quoted = /^'((?:[^']|'')*)'/.exec(node);
  const named = /^([a-z]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(quoted ? (quoted[1] ?? "").replace(/''/g, "'") : node);
  return { role: named?.[1] ?? "generic", name: (named?.[2] ?? "").replace(/\\(.)/g, "$1") };
}

/** Press Tab until the focused element has this role and name, at most `limit` times. */
export async function tabTo(page: Page, role: string, name: string, limit = 12): Promise<Stop> {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    const stop = await focusedStop(page);
    if (stop.role === role && stop.name === name) return stop;
  }
  throw new Error(`Tab did not reach ${role} "${name}" in ${limit} presses.`);
}

/** True when the page scrolls sideways. */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

export interface Target {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** Every visible button, link and summary inside #main, with its box. */
export async function targets(page: Page): Promise<readonly Target[]> {
  return page.locator("#main").evaluate(main =>
    Array.from(main.querySelectorAll("button, a[href], summary")).flatMap(element => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(element).visibility === "hidden") return [];
      const name = `${element.tagName.toLowerCase()} ${(element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)}`;
      return [{ name, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 }];
    }),
  );
}

/** F1's Text size sheet set to Largest, through its own controls. */
export async function largestText(page: Page): Promise<void> {
  await readingSheet(page, async sheet => sheet.getByRole("radio", { name: "Largest" }).check());
}

/** F1's High contrast switch, in the same sheet. */
export async function highContrast(page: Page): Promise<void> {
  await readingSheet(page, async sheet => sheet.getByRole("switch", { name: /High contrast/ }).check());
}

async function readingSheet(page: Page, choose: (sheet: Locator) => Promise<void>): Promise<void> {
  await page.getByRole("button", { name: "Text size", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Text size" });
  await choose(sheet);
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toBeHidden();
}
