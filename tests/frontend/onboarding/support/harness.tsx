// Shared Vitest helpers for F1. Not a test file: Vitest includes only *.test.ts(x).
// Test files may import src/fixtures, because the boundary script scans only src.
// Rules every jsdom file follows:
//  - first line `// @vitest-environment jsdom`;
//  - cleanup() in afterEach, because Testing Library's auto cleanup needs Vitest globals, which are off;
//  - plain expect, because jest-dom is not installed;
//  - with fake timers, advance(ms) then getBy*, because findBy* hangs on its own faked timers.
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { LocalPlans, LocalState, StorageNotice } from "@/client/storage";
import { parseCropPurposeId } from "@/contracts";
import type { Catalogue, FarmInput, JobCapability, JobState, PlannerClient, ServiceFailure, Submission } from "@/contracts";
import type { FieldPickerProps, ResultsProps } from "@/features/ports";
import { completedSnapshotFixture, jobFixtures } from "@/fixtures/results";

/** A capability whose jobId is a UUID, like the real server's. */
export const capability: JobCapability = { jobId: "8b0f6a3e-2f8e-4b51-9a57-1f0c1b7c2d10", token: "t".repeat(43) };

/**
 * A PlannerClient that plays a script and records every call. The fixture client cannot step through states, reject,
 * or return `invalid`, so polling, failure and rejected-submission tests use this.
 *  read items: a JobState["state"] name (uses jobFixtures), a JobState, { reject: ServiceFailure | Error } or "hang".
 *  The last item repeats. "completed" carries the last submitted input, as the server's snapshot does.
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
      const input = submitted.at(-1);
      if (item === "completed" && input !== undefined) return play<JobState>({ state: "completed", snapshot: { ...completedSnapshotFixture, input } });
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
 * An in-memory LocalPlans that records every save. Mode "ok" works; "throws" rejects every call like a browser that
 * blocks storage; "loadThrows" rejects load only; "saveThrows" rejects save only; "full" rejects save with the
 * browser's QuotaExceededError; "newer" rejects every call with VersionError, as when a newer Gilir upgraded the
 * database; "hangs" never settles load. `external(state)` simulates F3 writing between two F1 writes.
 * `setAside` is the text readStorageNotice gives until a dismiss removes it.
 */
export interface MemoryPlans extends LocalPlans {
  readonly saves: readonly LocalState[];
  latest(): LocalState | null;
  external(state: LocalState | null): void;
  readNotice(): Promise<StorageNotice | null>;
  readonly noticeReads: number;
  readonly setAside: string | null;
}
export function memoryPlans(
  initial: LocalState | null,
  mode: "ok" | "throws" | "loadThrows" | "saveThrows" | "full" | "newer" | "hangs" = "ok",
  setAside: string | null = null,
): MemoryPlans {
  let stored = initial;
  let notice = setAside;
  let noticeReads = 0;
  const saves: LocalState[] = [];
  const refuse = () => Promise.reject(mode === "newer" ? new DOMException("", "VersionError") : new Error("Local storage is not available."));
  return {
    saves,
    latest: () => stored,
    external(state) {
      stored = state;
    },
    get noticeReads() {
      return noticeReads;
    },
    get setAside() {
      return notice;
    },
    readNotice() {
      noticeReads += 1;
      const text = notice;
      if (text === null) return Promise.resolve(null);
      return Promise.resolve({
        text,
        async dismiss() {
          if (notice === text) notice = null;
        },
      });
    },
    load() {
      if (mode === "hangs") return new Promise<LocalState | null>(() => undefined);
      return mode === "throws" || mode === "loadThrows" || mode === "newer" ? refuse() : Promise.resolve(stored);
    },
    save(state) {
      if (mode === "full") return Promise.reject(new DOMException("", "QuotaExceededError"));
      if (mode === "throws" || mode === "saveThrows" || mode === "newer") return refuse();
      saves.push(state);
      stored = state;
      return Promise.resolve();
    },
    clear() {
      if (mode === "throws" || mode === "newer") return refuse();
      stored = null;
      return Promise.resolve();
    },
  };
}

/**
 * vi.mock factory for "@/client/storage". It forwards to whatever `current()` returns at call time, so one mock
 * serves every test in a file: set the plans in each test. readStorageNotice reads a MemoryPlans' set-aside text, and
 * storageProblem is F4's own, so a test sees the words a farmer would.
 */
export async function storageMock(current: () => LocalPlans | undefined): Promise<Pick<typeof import("@/client/storage"), "localPlans" | "readStorageNotice" | "storageProblem">> {
  const { storageProblem } = await vi.importActual<typeof import("@/client/storage")>("@/client/storage");
  const plans = () => current() ?? missing("plans");
  return {
    localPlans: { load: () => plans().load(), save: state => plans().save(state), clear: () => plans().clear() },
    readStorageNotice: () => {
      const memory: Partial<MemoryPlans> = plans();
      return memory.readNotice?.() ?? Promise.resolve(null);
    },
    storageProblem,
  };
}

/** vi.mock factory for "@/client/planner", forwarding like storageMock. */
export function plannerMock(current: () => PlannerClient | undefined): { readonly plannerClient: PlannerClient } {
  const client = () => current() ?? missing("client");
  return {
    plannerClient: {
      catalogue: () => client().catalogue(),
      submit: input => client().submit(input),
      read: capability => client().read(capability),
      remove: capability => client().remove(capability),
    },
  };
}

function missing(what: string): never {
  throw new Error(`The test set no ${what} before the code used it.`);
}

/**
 * vi.mock factory for "@/features/location": a FieldPicker stub that shows what it was given and has a "Use this
 * field" button that emits `field`. `data-props` lists the prop names it received.
 */
export function fieldPickerStub(field: FarmInput["field"]): { FieldPicker: (props: FieldPickerProps) => ReactElement } {
  return {
    FieldPicker(props) {
      return (
        <section aria-label="Field picker" data-props={Object.keys(props).sort().join(",")}>
          <p>{props.value === null ? "No field marked" : `Marked: ${props.value.label}`}</p>
          <button type="button" onClick={() => props.onChange(field)}>Use this field</button>
        </section>
      );
    },
  };
}

/** vi.mock factory for "@/features/results": shows the snapshot id and a "Change inputs" button. */
export function resultsStub(): { Results: (props: ResultsProps) => ReactElement } {
  return {
    Results(props) {
      return (
        <section aria-label="Results" data-props={Object.keys(props).sort().join(",")}>
          <h2>{`Plan ${props.snapshot.id}`}</h2>
          <button type="button" onClick={() => props.onChangeInputs(props.snapshot.input)}>Change inputs</button>
        </section>
      );
    },
  };
}

class FakeUtterance {
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

/** Gives jsdom a speechSynthesis that records each utterance, so Listen shows and what it says can be read. */
export function stubSpeech() {
  const spoken: FakeUtterance[] = [];
  const synth = { speak: vi.fn((utterance: FakeUtterance) => void spoken.push(utterance)), cancel: vi.fn() };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return { spoken, synth };
}

/** The phone's Back button: goes back one history entry and returns once the app has handled the popstate. */
export async function phoneBack(): Promise<void> {
  await act(() => new Promise<void>(resolve => {
    window.addEventListener("popstate", () => resolve(), { once: true });
    history.back();
  }));
}

/** Fake-timer step that flushes promises and React updates. */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
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

/**
 * Answers pages 1 to 4 as a farmer would, with the fieldPickerStub on page 1 and a list that has `crop`, and returns
 * when "Make my plan" is on screen. Real timers only.
 */
export async function fillFourPages(options: {
  readonly crop?: string;
  readonly water: "Rain only" | "Rain + water when it’s dry" | "I’m not sure";
  readonly start: string;
  readonly history: "skip" | "empty year";
}): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Use this field" }));
  await user.click(screen.getByRole("button", { name: "Next: crops" }));
  await user.click(await screen.findByRole("checkbox", { name: options.crop ?? "Synthetic crop" }));
  await user.click(screen.getByRole("button", { name: "Next: water" }));
  await user.click(screen.getByRole("radio", { name: options.water }));
  await user.click(screen.getByRole("button", { name: "Next: your rotation" }));
  fireEvent.change(screen.getByLabelText("When is your field ready to plant?", { selector: "input" }), { target: { value: options.start } });
  await user.click(screen.getByRole("button", { name: options.history === "skip" ? /^I don’t remember/ : /^My field was empty all year/ }));
  screen.getByRole("button", { name: "Make my plan" });
}

/** The six FarmInput keys, sorted. A submitted input must have exactly these (Done-when 2). */
export const farmInputKeys = ["cropPurposeIds", "field", "history", "planningStart", "schemaVersion", "water"] as const;
