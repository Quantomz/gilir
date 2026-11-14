// Shared Vitest helpers for F1. Not a test file: Vitest includes only *.test.ts(x) (vitest.config.ts:3).
// Test files may import src/fixtures (scripts/check-boundaries.mjs scans only src).
// Rules every jsdom file follows (repo-baseline.md gotchas 38 to 42):
//  - first line `// @vitest-environment jsdom`;
//  - cleanup() in afterEach, because Testing Library's auto cleanup needs Vitest globals, which are off;
//  - plain expect, because jest-dom is not installed;
//  - with fake timers, advance(ms) then getBy*, because findBy* hangs on its own faked timers.
import type { ReactElement } from "react";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { Catalogue, FarmInput, JobCapability, JobState, PlannerClient, ServiceFailure, Submission } from "@/contracts";
import type { FieldPickerProps, ResultsProps } from "@/features/ports";

/** A capability whose jobId is a UUID, like the real server's (src/client/planner.ts:7). */
export const capability: JobCapability = { jobId: "8b0f6a3e-2f8e-4b51-9a57-1f0c1b7c2d10", token: "t".repeat(43) };

/**
 * A PlannerClient that plays a script and records every call. The fixture client cannot step through states, reject,
 * or return `invalid` (src/fixtures/client.ts:11-20), so polling, failure and rejected-submission tests use this.
 *  read items: a JobState["state"] name (uses jobFixtures), a JobState, { reject: ServiceFailure | Error } or "hang".
 *  The last item repeats.
 */
export interface ScriptedClient extends PlannerClient {
  readonly submitted: FarmInput[];
  readonly reads: JobCapability[];
  readonly removed: JobCapability[];
}
export function scriptedClient(script: {
  readonly catalogue?: Catalogue | { readonly reject: Error } | "hang";
  readonly submit?: readonly (Submission | { readonly reject: Error } | "hang")[];
  readonly read?: readonly (JobState["state"] | JobState | { readonly reject: ServiceFailure | Error } | "hang")[];
}): ScriptedClient {
  throw new Error("not implemented");
}

/** An Error carrying `.failure`, shaped like PlannerServiceError (src/client/planner.ts:24-26). */
export function serviceError(failure: ServiceFailure): Error {
  throw new Error("not implemented");
}

/**
 * An in-memory LocalPlans that records every save. Mode "ok" works; "throws" rejects every call like
 * src/client/storage.ts today; "loadThrows" rejects load only; "saveThrows" rejects save only (quota); "hangs" never
 * settles load. `external(state)` simulates F3 writing between two F1 writes.
 */
export interface MemoryPlans extends LocalPlans {
  readonly saves: readonly LocalState[];
  latest(): LocalState | null;
  external(state: LocalState | null): void;
}
export function memoryPlans(
  initial: LocalState | null,
  mode: "ok" | "throws" | "loadThrows" | "saveThrows" | "hangs" = "ok",
): MemoryPlans {
  throw new Error("not implemented");
}

/** vi.mock factory for "@/client/storage": `{ localPlans: plans }`. */
export function storageMock(plans: MemoryPlans): { readonly localPlans: LocalPlans } {
  throw new Error("not implemented");
}

/** vi.mock factory for "@/features/location": a FieldPicker stub with a "Use this field" button that emits `field`. */
export function fieldPickerStub(field: FarmInput["field"]): { FieldPicker: (props: FieldPickerProps) => ReactElement } {
  throw new Error("not implemented");
}

/** vi.mock factory for "@/features/results": shows the snapshot id and a "Change inputs" button. */
export function resultsStub(): { Results: (props: ResultsProps) => ReactElement } {
  throw new Error("not implemented");
}

/** Fake-timer step that flushes promises: `await act(async () => { await vi.advanceTimersByTimeAsync(ms) })`. */
export async function advance(ms: number): Promise<void> {
  throw new Error("not implemented");
}

/** A catalogue with n listed crops "crop-1".."crop-n", the last one a cover crop, for the 12-crop limit. */
export function catalogueOf(n: number): Catalogue {
  throw new Error("not implemented");
}

/** Walks pages 1 to 4 by keyboard and returns when "Make my plan" is on screen. */
export function fillFourPages(options: {
  readonly water: "Rain only" | "Rain + water when it’s dry" | "I’m not sure";
  readonly start: string;
  readonly history: "skip" | "empty year" | "one crop";
}): Promise<void> {
  throw new Error("not implemented");
}

/** The six FarmInput keys, sorted. A submitted input must have exactly these (Done-when 2). */
export const farmInputKeys = ["cropPurposeIds", "field", "history", "planningStart", "schemaVersion", "water"] as const;
