// Browser helpers for the F2 slot. They read only what a farmer can see or a caller receives: the corner list's numbers,
// the place line, the root's data attributes, positions on screen and pixels. The judges are the outside ones from
// shapes.ts: the contract's own parser, the server's own request handler and an independent strict-inside test.
import { expect } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { FarmInput, LngLat } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { fieldIssues, serverStatus, strictlyInside } from "./shapes";

type Field = FarmInput["field"];
type Ring = readonly LngLat[];
export interface Point { readonly x: number; readonly y: number }

/** The lab's own picker. The lab also renders Onboarding, whose page 1 holds a second one. */
export const firstPicker = (page: Page): Locator => page.locator("[data-phase]").first();

/**
 * F1's page 1 at "/", where the slot lives in the product. `seed` reaches F1 as its initialInput through F1's
 * development-only window.__gilirDevInput, which is how a draft comes back into page 1 until local storage exists.
 */
export async function openPageOne(page: Page, seed: FarmInput | null = null): Promise<Locator> {
  if (seed !== null) await handBack(page, seed);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where is your farm?" })).toBeVisible({ timeout: 60_000 });
  return page.locator("[data-phase]");
}

/** Makes every later load of "/" open with `input` as F1's initialInput. */
export async function handBack(page: Page, input: FarmInput): Promise<void> {
  await page.addInitScript(seed => Reflect.set(window, "__gilirDevInput", seed), input);
}

export const handles = (root: Locator): Locator => root.locator(".fp-handle");

export const mapArea = (root: Locator): Locator => root.locator(".fp-map");

export const cornerList = (root: Locator): Locator => root.getByRole("region", { name: "Type the corners of your field" });

/** The labels F2 writes: the fixture's own, "Field near …" after a search, or "Field at …" anywhere else. */
const labelOnPage = new RegExp(`^(Field (near|at) .+|${inputFixture.field.label})$`);

export async function lookupOf(root: Locator): Promise<LngLat | null> {
  const text = await root.getAttribute("data-lookup");
  if (!text) return null;
  const [lng, lat] = text.split(",").map(Number);
  return [lng, lat];
}

/** Opens the corner list where the farmer would, unless it already shows. */
export async function openCornerList(root: Locator): Promise<Locator> {
  const list = cornerList(root);
  if (!(await list.isVisible())) {
    await root.getByRole("button", { name: /^Type (the corners|your field’s corners instead)$/ }).click();
  }
  await expect(list).toBeVisible();
  return list;
}

/** The corners as the list shows them, in wire space and in order. */
export async function cornersOnPage(root: Locator): Promise<LngLat[]> {
  const list = await openCornerList(root);
  const rows = list.getByRole("group", { name: /^Corner \d+$/ });
  const corners: LngLat[] = [];
  for (const row of await rows.all()) {
    const lat = Number(await row.getByRole("textbox", { name: /latitude/i }).inputValue());
    const lng = Number(await row.getByRole("textbox", { name: /longitude/i }).inputValue());
    corners.push([lng, lat]);
  }
  return corners;
}

/**
 * The field the picker holds, put together from what the page shows: the corner list's numbers closed into a ring,
 * the root's data-lookup and the place line. Opens the corner list when it is closed.
 */
export async function fieldOnPage(root: Locator): Promise<Field> {
  const corners = await cornersOnPage(root);
  const lookup = await lookupOf(root);
  expect(lookup, "the picker holds a field").not.toBeNull();
  const label = (await root.getByText(labelOnPage).first().textContent())?.trim() ?? "";
  return { ring: [...corners, corners[0]], lookup: lookup as LngLat, label };
}

/**
 * The field on the page passes the contract's parser and the server's request handler, and its lookup is strictly
 * inside `inside` (the ring the test knows), or inside its own corners when the test knows none.
 */
export async function expectFieldOnPage(root: Locator, inside?: Ring): Promise<Field> {
  const field = await fieldOnPage(root);
  expect(fieldIssues(field)).toEqual([]);
  expect(await serverStatus(field)).toBe(202);
  expect(strictlyInside(field.lookup, inside ?? field.ring.slice(0, -1))).toBe(true);
  return field;
}

/** Types every corner into the list, adding or removing rows first, then presses "Use these corners". */
export async function typeCorners(root: Locator, corners: Ring): Promise<void> {
  const list = await openCornerList(root);
  const rows = list.getByRole("group", { name: /^Corner \d+$/ });
  while ((await rows.count()) < corners.length) await list.getByRole("button", { name: "Add a corner" }).click();
  while ((await rows.count()) > corners.length) {
    const last = await rows.count();
    await list.getByRole("button", { name: `Remove corner ${last}` }).click();
  }
  for (const [index, [lng, lat]] of corners.entries()) {
    const row = rows.nth(index);
    await row.getByRole("textbox", { name: /latitude/i }).fill(String(lat));
    await row.getByRole("textbox", { name: /longitude/i }).fill(String(lng));
  }
  await list.getByRole("button", { name: "Use these corners" }).click();
}

export async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  expect(box, "the element is on screen").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/**
 * Where an element ends up once the camera stops moving: five reads 250 ms apart agree within half a pixel. A flight
 * can hold a point still for one interval where its path turns, so one quiet interval is not enough.
 */
export async function settledCentre(locator: Locator, timeout = 15_000): Promise<Point> {
  let last = await centreOf(locator);
  let still = 0;
  await expect.poll(async () => {
    const now = await centreOf(locator);
    still = Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5 ? still + 1 : 0;
    last = now;
    return still >= 4;
  }, { timeout, intervals: [250] }).toBe(true);
  return last;
}

export async function centresOf(locator: Locator): Promise<Point[]> {
  return Promise.all((await locator.all()).map(centreOf));
}

/** The handles' centres measured from the map's top left corner, so a page scroll between two reads cancels out. */
export async function handlesInMap(root: Locator): Promise<Point[]> {
  const box = (await mapArea(root).boundingBox())!;
  return (await centresOf(handles(root))).map(point => ({ x: point.x - box.x, y: point.y - box.y }));
}

export async function drag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps);
  }
  await page.mouse.up();
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** RGB at viewport points, read from a screenshot: WebGL's own buffer is cleared after each frame. */
export async function pixelsAt(page: Page, points: readonly Point[]): Promise<number[][]> {
  const shot = (await page.screenshot()).toString("base64");
  return page.evaluate(async ({ shot, points }) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const scale = image.width / window.innerWidth;
    return points.map(({ x, y }) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data.slice(0, 3)]);
  }, { shot, points });
}

/**
 * Presses Tab (or Shift+Tab) until `target` has focus, checking at every stop that a ring in the page's focus colour
 * shows on the focused element or a wrapper, and that the element sits in the viewport. The target is checked too, even
 * when it already has focus. Fails after `max` presses.
 */
export async function tabTo(page: Page, target: Locator, options: { readonly back?: boolean; readonly max?: number } = {}): Promise<void> {
  const max = options.max ?? 80;
  for (let press = 0; !(await target.evaluate(element => element === document.activeElement)); press++) {
    if (press === max) throw new Error(`Tab did not reach the target in ${max} presses.`);
    await page.keyboard.press(options.back ? "Shift+Tab" : "Tab");
    await expectVisibleFocus(page);
  }
  await expectVisibleFocus(page);
}

async function expectVisibleFocus(page: Page): Promise<void> {
  const stop = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return { ring: true, onScreen: true, what: "body" };
    const probe = document.createElement("i");
    probe.style.color = "var(--focus)";
    document.body.append(probe);
    const focusColour = getComputedStyle(probe).color;
    probe.remove();
    // F1's inputs show focus on their .input-wrap (:focus-within) and the map canvas on its frame's ::after.
    const ringOn = (at: Element, pseudo?: string) => {
      const style = getComputedStyle(at, pseudo);
      return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && style.outlineColor === focusColour)
        || style.boxShadow.includes(focusColour)
        || (parseFloat(style.borderTopWidth) > 0 && style.borderTopColor === focusColour && (!pseudo || style.content !== "none"));
    };
    const wrappers: Element[] = [];
    for (let at = element.parentElement; at && wrappers.length < 3; at = at.parentElement) wrappers.push(at);
    const ring = ringOn(element) || wrappers.some(at => ringOn(at) || ringOn(at, "::after"));
    const box = element.getBoundingClientRect();
    const onScreen = box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
    return { ring, onScreen, what: `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"` };
  });
  expect(stop.ring, `focus is visible on ${stop.what}`).toBe(true);
  expect(stop.onScreen, `${stop.what} is on screen when focused`).toBe(true);
}

/** Replaces the text of the focused input, as a farmer does with select-all and typing. */
export async function retype(page: Page, text: string): Promise<void> {
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

/** The corner list with the keyboard alone: rows added or removed, each number retyped, then "Use these corners". */
export async function typeCornersByKeyboard(page: Page, root: Locator, corners: Ring): Promise<void> {
  const list = cornerList(root);
  await expect(list).toBeVisible();
  const rows = list.getByRole("group", { name: /^Corner \d+$/ });
  while ((await rows.count()) < corners.length) {
    await tabTo(page, list.getByRole("button", { name: "Add a corner" }));
    await page.keyboard.press("Enter");
  }
  while ((await rows.count()) > corners.length) {
    await tabTo(page, list.getByRole("button", { name: `Remove corner ${await rows.count()}` }));
    await page.keyboard.press("Enter");
  }
  await tabTo(page, rows.first().getByRole("textbox", { name: /latitude/i }), { back: true });
  for (const [index, [lng, lat]] of corners.entries()) {
    await tabTo(page, rows.nth(index).getByRole("textbox", { name: /latitude/i }));
    await retype(page, String(lat));
    await tabTo(page, rows.nth(index).getByRole("textbox", { name: /longitude/i }));
    await retype(page, String(lng));
  }
  await tabTo(page, list.getByRole("button", { name: "Use these corners" }));
  await page.keyboard.press("Enter");
}

/** Drags corner handle `index` (0-based) to a point on screen, scrolling the map into view first. */
export async function dragHandle(page: Page, root: Locator, index: number, to: (from: Point) => Point): Promise<void> {
  await mapArea(root).scrollIntoViewIfNeeded();
  const from = await settledCentre(handles(root).nth(index));
  await drag(page, from, to(from));
}

/**
 * A screenshot of the viewport, never a trace or a HAR, with `show` scrolled into view first and Next's development
 * badge hidden. It goes to the test's output folder: a new file inside the project makes `next dev` rebuild and
 * refresh every open page, so evidence is copied into docs/evidence/F2/ after the run.
 */
export async function shoot(page: Page, testInfo: TestInfo, name: string, show?: Locator): Promise<void> {
  if (show) await show.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), style: "nextjs-portal { display: none !important; }" });
}

/**
 * What breaks the phone rules inside `root`: a page wider than the viewport, a control or corner handle under 48 by 48
 * CSS px, or visible text under 18 px. Empty when nothing does.
 */
export async function layoutProblems(page: Page, root: Locator): Promise<string[]> {
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const inside = await root.evaluate((rootElement: HTMLElement) => {
    const problems: string[] = [];
    const shown = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const name = (element: Element) => `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"`;
    for (const element of rootElement.querySelectorAll("button, a[href], input, select, textarea, .fp-handle")) {
      if (!shown(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.width < 48 || box.height < 48) problems.push(`${name(element)} is ${Math.round(box.width)} by ${Math.round(box.height)} px`);
    }
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || !shown(parent) || parent.closest(".sr, svg")) continue;
      const size = parseFloat(getComputedStyle(parent).fontSize);
      if (size < 18) problems.push(`"${node.textContent.trim().slice(0, 40)}" is ${size} px`);
    }
    return problems;
  });
  return sideways ? ["the page scrolls sideways", ...inside] : inside;
}

/** Focusable elements inside `root` that F1's dock covers once each has focus. */
export async function focusableUnderDock(page: Page, root: Locator): Promise<string[]> {
  const dock = page.locator(".dock").first();
  if ((await dock.count()) === 0) return [];
  const covered: string[] = [];
  const focusable = root.locator("button:visible, a[href]:visible, input:visible, select:visible, textarea:visible");
  for (const element of await focusable.all()) {
    await element.focus();
    const [box, under] = await Promise.all([element.boundingBox(), dock.boundingBox()]);
    if (box && under && box.y + box.height > under.y && box.y < under.y + under.height) {
      covered.push((await element.getAttribute("aria-label")) ?? (await element.textContent())?.trim() ?? "");
    }
  }
  return covered;
}

/** True when the ring has a corner that turns the other way from the rest. */
export function isConcave(ring: Ring): boolean {
  const corners = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  const turns = corners.map((b, i) => {
    const a = corners[(i + corners.length - 1) % corners.length];
    const c = corners[(i + 1) % corners.length];
    return Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
  }).filter(turn => turn !== 0);
  return turns.some(turn => turn !== turns[0]);
}
