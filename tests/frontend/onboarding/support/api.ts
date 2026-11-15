// Playwright helpers. Stand-ins for /api/catalogue and /api/plans answer through the REAL HTTP client
// (src/client/planner.ts), which parses them exactly as it would parse the server. This is fixture evidence.
// Every answer is parsed with the contract schema before it is sent, so a stale fixture fails the test, not the app.
import type { Page, Route } from "@playwright/test";
import { completedSnapshotSchema, farmInputSchema, releasedRegistrySchema, serviceFailureSchema } from "@/contracts";
import type { Catalogue, FarmInput, InputIssue, JobCapability, JobState, ServiceFailure, Submission } from "@/contracts";

const catalogueSchema = releasedRegistrySchema.unwrap().shape.catalogue;

/** The real client turns a 202 whose jobId is not a UUID into `unavailable`. */
export const stubCapability: JobCapability = { jobId: "8b0f6a3e-2f8e-4b51-9a57-1f0c1b7c2d10", token: "stub-capability-token-for-fixture-runs-only" };

export interface ApiScript {
  readonly catalogue: Catalogue | { readonly status: 503; readonly failure: ServiceFailure };
  /** POST /api/plans answers in order; the last repeats. */
  readonly submit: readonly (
    | { readonly kind: "accepted" }
    | { readonly kind: "invalid"; readonly issues: readonly InputIssue[] }
    | { readonly kind: "unavailable"; readonly failure: ServiceFailure }
    | { readonly kind: "status"; readonly status: 413 | 429; readonly failure: ServiceFailure }
  )[];
  /** GET /api/plans/{id} answers in order; the last repeats. A status is an error with its failure envelope. */
  readonly reads: readonly (JobState | { readonly status: 404 | 429 | 503; readonly failure: ServiceFailure })[];
}

export interface ApiLog {
  /** Each POST /api/plans body, as sent. */
  readonly submitted: unknown[];
  /** The Authorization header of each request to /api/plans/{id}. */
  readonly authHeaders: string[];
  /** Every URL the page requested, the app's own files included. */
  readonly urls: string[];
  readonly reads: number;
  readonly deletes: number;
}

/** Install the routes. Returns the log, so a test can check the POST body keys and that no token is in any URL. */
export async function stubApi(page: Page, script: ApiScript): Promise<ApiLog> {
  const submitted: unknown[] = [];
  const authHeaders: string[] = [];
  const urls: string[] = [];
  let posts = 0;
  let reads = 0;
  let deletes = 0;
  page.on("request", request => urls.push(request.url()));

  await page.route("**/api/catalogue", async route => {
    const catalogue = script.catalogue;
    if ("status" in catalogue) await fulfil(route, catalogue.status, { error: serviceFailureSchema.parse(catalogue.failure) });
    else await fulfil(route, 200, catalogueSchema.parse(catalogue));
  });

  await page.route("**/api/plans", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    submitted.push(route.request().postDataJSON());
    const answer = nth(script.submit, posts);
    posts += 1;
    switch (answer.kind) {
      case "accepted":
        return fulfil(route, 202, { kind: "accepted", capability: stubCapability } satisfies Submission);
      case "invalid":
        return fulfil(route, 400, { kind: "invalid", issues: answer.issues } satisfies Submission);
      case "unavailable":
        return fulfil(route, 503, { kind: "unavailable", failure: serviceFailureSchema.parse(answer.failure) } satisfies Submission);
      case "status":
        return fulfil(route, answer.status, { error: serviceFailureSchema.parse(answer.failure) });
    }
  });

  await page.route("**/api/plans/*", async route => {
    const request = route.request();
    authHeaders.push((await request.headerValue("authorization")) ?? "");
    if (request.method() === "DELETE") {
      deletes += 1;
      return route.fulfill({ status: 204 });
    }
    const answer = nth(script.reads, reads);
    reads += 1;
    if ("status" in answer) return fulfil(route, answer.status, { error: serviceFailureSchema.parse(answer.failure) });
    return fulfil(route, 200, jobBody(answer));
  });

  return {
    submitted,
    authHeaders,
    urls,
    get reads() {
      return reads;
    },
    get deletes() {
      return deletes;
    },
  };
}

function jobBody(state: JobState): JobState {
  switch (state.state) {
    case "completed":
      return { state: "completed", snapshot: completedSnapshotSchema.parse(state.snapshot) };
    case "failed":
      return { state: "failed", failure: serviceFailureSchema.parse(state.failure) };
    default:
      return { state: state.state };
  }
}

function nth<T>(answers: readonly T[], index: number): T {
  const answer = answers[Math.min(index, answers.length - 1)];
  if (answer === undefined) throw new Error("The script has no answer for this request.");
  return answer;
}

async function fulfil(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** The development-only seed read by src/app/page.tsx: opens "/" with this initialInput. */
export async function seedInput(page: Page, input: FarmInput): Promise<void> {
  const seed = farmInputSchema.parse(input);
  await page.addInitScript(value => {
    Reflect.set(window, "__gilirDevInput", value);
  }, seed);
}

/** Every h1 the page shows, in order, however briefly, so a test can see a screen that was up for a moment. */
export async function recordTitles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Reflect.set(window, "__titles", seen);
    const note = () => {
      const text = document.querySelector("#main-title")?.textContent?.trim() ?? "";
      if (text !== "" && seen[seen.length - 1] !== text) seen.push(text);
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

export async function titlesSeen(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const seen: unknown = Reflect.get(window, "__titles");
    return Array.isArray(seen) ? seen.map(String) : [];
  });
}

export interface FocusStop {
  readonly role: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** What sits on the centre of the focused element once the browser scrolled to it: "itself", or what covers it. */
  readonly onTop: string;
  readonly area: FocusArea;
}

/** The parts of a screen in the order a farmer meets them from the top. */
export const focusAreas = ["skip link", "notice", "top bar", "page", "dock", "toast", "sheet", "other"] as const;
export type FocusArea = (typeof focusAreas)[number];

/**
 * Tab through the page and record each focused element's role, name and box, until focus wraps or reaches the
 * development tools of `next dev`. It starts from the top of the page, or with `fromFocused` from the element that has
 * focus now (a sheet focuses its first control).
 * `pauseMs` holds each stop, so a recording shows the focus ring move.
 */
export async function focusOrder(page: Page, maxSteps: number, options: { readonly pauseMs?: number; readonly fromFocused?: boolean } = {}): Promise<readonly FocusStop[]> {
  const { pauseMs = 0, fromFocused = false } = options;
  await page.evaluate(keep => {
    Reflect.set(window, "__focusSeen", new Set());
    Reflect.set(window, "__focusLast", null);
    if (keep) return;
    const root = document.documentElement;
    root.tabIndex = -1;
    root.focus({ preventScroll: true });
    root.removeAttribute("tabindex");
  }, fromFocused);
  const stops: FocusStop[] = [];
  for (let step = 0; step < maxSteps; step += 1) {
    if (step > 0 || !fromFocused) await page.keyboard.press("Tab");
    const fresh = await page.evaluate(() => {
      const element = document.activeElement;
      const seen: Set<Element> = Reflect.get(window, "__focusSeen");
      // A date input keeps focus while Tab moves through its day, month and year.
      if (element !== null && element === Reflect.get(window, "__focusLast")) return "same";
      Reflect.set(window, "__focusLast", element);
      if (element === null || element === document.body || element === document.documentElement || seen.has(element)) return false;
      // `next dev` adds its own tools button after the app; it is not in a production build.
      if (element.tagName.toLowerCase() === "nextjs-portal") return false;
      seen.add(element);
      return true;
    });
    if (fresh === "same") continue;
    if (!fresh) break;
    if (pauseMs > 0) await page.waitForTimeout(pauseMs);
    const focused = page.locator(":focus");
    const [line = ""] = (await focused.ariaSnapshot()).split("\n");
    const box = await focused.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const cover = hit === null ? "nothing" : element.contains(hit) ? "itself" : `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(" ").join(".")}` : ""}`;
      const areas: readonly [string, string][] = [
        ["[role=dialog]", "sheet"], [".toast", "toast"], [".dock", "dock"], ["#main", "page"], ["header", "top bar"], [".notice-bar", "notice"], ["a.skip", "skip link"],
      ];
      const area = areas.find(([selector]) => element.closest(selector) !== null)?.[1] ?? "other";
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, onTop: cover, area };
    });
    const area = focusAreas.find(known => known === box.area) ?? "other";
    stops.push({ ...roleAndName(line), ...rounded(box), area });
  }
  return stops;
}

/** The role and name from the first line of an aria snapshot, which YAML quotes when the name has a colon. */
function roleAndName(line: string): { readonly role: string; readonly name: string } {
  const node = line.replace(/^- /, "");
  const quoted = /^'((?:[^']|'')*)'/.exec(node);
  const named = /^([a-z]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(quoted ? (quoted[1] ?? "").replace(/''/g, "'") : node);
  return { role: named?.[1] ?? "generic", name: (named?.[2] ?? "").replace(/\\(.)/g, "$1") };
}

function rounded<T extends { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>(box: T): T {
  return { ...box, x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
}

/** True when the page, or an open sheet, scrolls sideways. */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const dialog = document.querySelector("[role=dialog]");
    return root.scrollWidth > root.clientWidth || (dialog !== null && dialog.scrollWidth > dialog.clientWidth);
  });
}

/** The smallest visible bounding box among buttons, links, inputs, sliders and summaries, in the open sheet if any. */
export async function smallestTarget(page: Page): Promise<{ readonly width: number; readonly height: number; readonly name: string }> {
  return page.evaluate(() => {
    const scope = document.querySelector("[role=dialog]") ?? document;
    const targets = Array.from(scope.querySelectorAll("button, a[href], input, select, textarea, summary, [role=slider]")).flatMap(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || style.display === "none") return [];
      const name = (element.getAttribute("aria-label") ?? element.textContent ?? element.id).trim().replace(/\s+/g, " ").slice(0, 60);
      return [{ width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10, name: `${element.tagName.toLowerCase()} ${name}` }];
    });
    const smallest = targets.reduce<{ width: number; height: number; name: string } | null>(
      (least, target) => (least === null || Math.min(target.width, target.height) < Math.min(least.width, least.height) ? target : least),
      null,
    );
    return smallest ?? { width: Infinity, height: Infinity, name: "no target" };
  });
}
