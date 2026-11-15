// Steps of the farmer's journey on "/", shared by the fixture phase and the live phase.
// Every step uses the names a farmer or a screen reader meets, so a renamed control fails here first.
import { expect } from "@playwright/test";
import type { Download, Page } from "@playwright/test";

export const sizes = [
  { name: "phone 360x740", key: "360", viewport: { width: 360, height: 740 } },
  { name: "desktop 1280x800", key: "1280", viewport: { width: 1280, height: 800 } },
] as const;

export type Water = "Rain only" | "Rain + water when it’s dry" | "I’m not sure";

export interface Answers {
  /** Typed into the position box, like "13.75, 100.50". */
  readonly position: string;
  /** Catalogue labels, as the crop list shows them. */
  readonly crops: readonly string[];
  readonly water: Water;
  /** YYYY-MM-DD. */
  readonly ready: string;
  readonly lastYear: { readonly kind: "skipped" } | { readonly kind: "crops"; readonly crops: readonly string[] };
}

export const title = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name, exact: typeof name === "string" });
export const actions = (page: Page) => page.getByRole("region", { name: "What you can do" });
export const timeline = (page: Page) => page.getByRole("region", { name: "When to plant and harvest" });

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(title(page, "Where is your farm?")).toBeVisible({ timeout: 30_000 });
}

export async function markField(page: Page, position: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Position of your farm" }).fill(position);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Mark my field" }).click();
  await expect(page.getByText(/^Your field is marked: about .+, 4 corners\.$/).first()).toBeVisible();
}

export async function pickCrops(page: Page, crops: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Next: crops" }).click();
  await expect(title(page, "Which crops do you want to grow?")).toBeVisible();
  for (const crop of crops) await page.getByRole("checkbox", { name: crop, exact: true }).check();
}

export async function pickWater(page: Page, water: Water): Promise<void> {
  await page.getByRole("button", { name: "Next: water" }).click();
  await expect(title(page, "Where does your water come from?")).toBeVisible();
  await page.getByRole("radio", { name: water, exact: true }).check();
}

export async function fillRotation(page: Page, answers: Pick<Answers, "ready" | "lastYear">): Promise<void> {
  await page.getByRole("button", { name: "Next: your rotation" }).click();
  await expect(title(page, "Your rotation")).toBeVisible();
  await page.getByRole("textbox", { name: "When is your field ready to plant?" }).fill(answers.ready);
  if (answers.lastYear.kind === "skipped") {
    await page.getByRole("button", { name: /^I don’t remember/ }).click();
    await expect(page.getByText("That’s fine. We make your plan without last year.")).toBeVisible();
    return;
  }
  for (const crop of answers.lastYear.crops) {
    await page.getByRole("button", { name: "Add a crop" }).click();
    await page.getByRole("dialog", { name: "Which crop grew here?" }).getByRole("button", { name: crop, exact: true }).click();
    await expect(page.getByRole("slider", { name: `${crop}: planting day` })).toBeVisible();
  }
}

export async function answerAll(page: Page, answers: Answers): Promise<void> {
  await markField(page, answers.position);
  await pickCrops(page, answers.crops);
  await pickWater(page, answers.water);
  await fillRotation(page, answers);
}

export async function makePlan(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Make my plan" }).click();
  await expect(title(page, "Making your plan")).toBeVisible();
}

/** Waits for Results, whichever of its six states it shows, and returns its h1. */
export async function resultTitle(page: Page, timeout = 240_000): Promise<string> {
  await expect(actions(page)).toBeVisible({ timeout });
  return (await page.getByRole("heading", { level: 1 }).innerText()).trim();
}

export async function downloadPdf(page: Page): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  return download;
}

/** Presses Tab until `name` holds focus, so a control that the keyboard can't reach fails the test. */
export async function tabTo(page: Page, role: Parameters<Page["getByRole"]>[0], name: string | RegExp, limit = 80): Promise<void> {
  const target = page.getByRole(role, { name, exact: typeof name === "string" }).first();
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate(node => node === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached the ${role} "${String(name)}" in ${limit} presses.`);
}

/** Page errors and console errors that are the app's own; blocked map tiles are the network's, not the app's. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`page error: ${error.message}`));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|ERR_TUNNEL|ERR_INTERNET_DISCONNECTED|ERR_FAILED|net::/.test(text)) return;
    errors.push(`console error: ${text}`);
  });
  return errors;
}
