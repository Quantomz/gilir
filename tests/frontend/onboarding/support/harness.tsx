// Shared Vitest helpers for F1. Not a test file: Vitest includes only *.test.ts(x).
// Test files may import src/fixtures, because the boundary script scans only src.
// Rules every jsdom file follows:
//  - first line `// @vitest-environment jsdom`;
//  - cleanup() in afterEach, because Testing Library's auto cleanup needs Vitest globals, which are off;
//  - plain expect, because jest-dom is not installed;
//  - with fake timers, advance(ms) then getBy*, because findBy* hangs on its own faked timers.
import type { ReactElement } from "react";
import type { LocalPlans, LocalState } from "@/client/storage";
import { parseCropPurposeId } from "@/contracts";
import type { Catalogue, FarmInput, JobCapability, JobState, PlannerClient, ServiceFailure, Submission } from "@/contracts";
import type { FieldPickerProps, ResultsProps } from "@/features/ports";
import { jobFixtures } from "@/fixtures/results";

/** A capability whose jobId is a UUID, like the real server's. */
export const capability: JobCapability = { jobId: "8b0f6a3e-2f8e-4b51-9a57-1f0c1b7c2d10", token: "t".repeat(43) };

/**
 * A PlannerClient that plays a script and records every call. The fixture client cannot step through states, reject,
 * or return `invalid`, so polling, failure and rejected-submission tests use this.
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
  const submitted: FarmInput[] = [];
  const reads: JobCapability[] = [];
  const removed: JobCapability[] = [];
  const cursor = { submit: 0, read: 0 };
  const hang = <T,>(): Promise<T> => new Promise<T>(() => undefined);
  const play = <T,>(item: T | { readonly reject: ServiceFailure | Error } | "hang"): Promise<T> => {
    if (item === "hang") return hang();
    if (typeof item === "object" && item !== null && "reject" in item) {
      const reason = item.reject;
      return Promise.reject(reason instanceof Error ? reason : serviceError(reason));
    }
    return Promise.resolve(item);
  };
  const take = <T,>(items: readonly T[] | undefined, key: "submit" | "read"): T => {
    if (items === undefined || items.length === 0) throw new Error(`scriptedClient has no ${key} script`);
    const item = items[Math.min(cursor[key], items.length - 1)];
    cursor[key] += 1;
    return item;
  };
  return {
    submitted,
    reads,
    removed,
    catalogue() {
      const item = script.catalogue;
      if (item === undefined) return Promise.reject(new Error("scriptedClient has no catalogue script"));
      return play<Catalogue>(item);
    },
    submit(input) {
      submitted.push(input);
      return play<Submission>(take(script.submit, "submit"));
    },
    read(capability) {
      reads.push(capability);
      const item = take(script.read, "read");
      return play<JobState>(typeof item === "string" && item !== "hang" ? jobFixtures[item] : item);
    },
    async remove(capability) {
      removed.push(capability);
    },
  };
}

/** An Error carrying `.failure`, shaped like PlannerServiceError (src/client/planner.ts). */
export function serviceError(failure: ServiceFailure): Error {
  return Object.assign(new Error(failure.message), { name: "PlannerServiceError", failure });
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
  let stored = initial;
  const saves: LocalState[] = [];
  const refuse = () => Promise.reject(new Error("Local storage is not available."));
  return {
    saves,
    latest: () => stored,
    external(state) {
      stored = state;
    },
    load() {
      if (mode === "hangs") return new Promise<LocalState | null>(() => undefined);
      return mode === "throws" || mode === "loadThrows" ? refuse() : Promise.resolve(stored);
    },
    save(state) {
      if (mode === "throws" || mode === "saveThrows") return refuse();
      saves.push(state);
      stored = state;
      return Promise.resolve();
    },
    clear() {
      if (mode === "throws") return refuse();
      stored = null;
      return Promise.resolve();
    },
  };
}

/** vi.mock factory for "@/client/storage": `{ localPlans: plans }`. */
export function storageMock(plans: MemoryPlans): { readonly localPlans: LocalPlans } {
  return { localPlans: plans };
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
  return {
    version: `test-${n}`,
    entries: Array.from({ length: n }, (_, i) => ({
      id: parseCropPurposeId(`crop-${i + 1}`),
      label: `Crop ${i + 1}`,
      purpose: i === n - 1 ? "cover" : "food",
    })),
  };
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
