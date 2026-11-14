// Playwright helpers. Stand-ins for /api/catalogue and /api/plans that answer with contract-shaped fixtures, so the
// REAL HTTP client (src/client/planner.ts) parses them exactly as it would parse the server. Fixture evidence, named so.
// Each body is checked with the contract schema before it is sent, so a stale fixture fails the test, not the app.
// The 202 capability carries a UUID jobId, or the real client turns it into `unavailable` (planner.ts:7, :53-56).
import type { Page, Route } from "@playwright/test";
import type { Catalogue, FarmInput, JobState, ServiceFailure } from "@/contracts";

export interface ApiScript {
  readonly catalogue: Catalogue | { readonly status: 503; readonly failure: ServiceFailure };
  /** POST /api/plans answers in order; the last repeats. */
  readonly submit: readonly (
    | { readonly kind: "accepted" }                                                                    // 202
    | { readonly kind: "invalid"; readonly issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[] } // 400
    | { readonly kind: "unavailable"; readonly failure: ServiceFailure }                               // 503
    | { readonly kind: "status"; readonly status: 413 | 429; readonly failure: ServiceFailure }
  )[];
  /** GET /api/plans/{id} answers in order; the last repeats. A status is an error with its failure envelope. */
  readonly reads: readonly (JobState | { readonly status: 404 | 429 | 503; readonly failure: ServiceFailure })[];
}

export interface ApiLog {
  readonly submitted: unknown[];
  readonly authHeaders: string[];
  readonly urls: string[];
  readonly deletes: number;
}

/** Install the routes. Returns the log, so a test can check the POST body keys and that no token is in any URL. */
export async function stubApi(page: Page, script: ApiScript): Promise<ApiLog> {
  throw new Error("not implemented");
}

export async function fulfil(route: Route, status: number, body: unknown): Promise<void> {
  throw new Error("not implemented");
}

/** The development-only seed read by src/app/page.tsx devInput(): opens "/" with this initialInput. */
export async function seedInput(page: Page, input: FarmInput): Promise<void> {
  throw new Error("not implemented");
  // TODO: await page.addInitScript(value => { Reflect.set(window, "__gilirDevInput", value) }, input)
}

/** Tab through the page and record each focused element's role, name and box, for docs/evidence/F1/focus-order-*.md. */
export async function focusOrder(page: Page, maxSteps: number): Promise<readonly { readonly role: string; readonly name: string; readonly width: number; readonly height: number }[]> {
  throw new Error("not implemented");
}

/** True when the page scrolls sideways. */
export async function scrollsSideways(page: Page): Promise<boolean> {
  throw new Error("not implemented");
}

/** The smallest bounding box among buttons, inputs, sliders and summaries on the page. */
export async function smallestTarget(page: Page): Promise<{ readonly width: number; readonly height: number; readonly name: string }> {
  throw new Error("not implemented");
}
