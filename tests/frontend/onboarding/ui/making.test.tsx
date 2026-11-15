// @vitest-environment jsdom
// Making and the failed screen, through the public Onboarding component, with fake timers and a scripted client.
// findBy* waits on timers that are faked here, so each step advances the clock with advance(ms), then uses getBy*.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot, JobCapability, JobState, ServiceFailure } from "@/contracts";
import { Onboarding } from "@/features/onboarding";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, completedSnapshotsByState, jobFixtures } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { advance, capability, memoryPlans, scriptedClient } from "../support/harness";
import type { MemoryPlans, ScriptedClient } from "../support/harness";

const live = vi.hoisted(() => ({ plans: undefined as LocalPlans | undefined }));

vi.mock("@/client/storage", async () => (await import("../support/harness")).storageMock(() => live.plans));
vi.mock("@/features/location", async () => (await import("../support/harness")).fieldPickerStub((await import("@/fixtures/input")).inputFixture.field));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  history.replaceState(null, "");
});

const { schemaVersion: _version, ...answers } = inputFixture;
const second: JobCapability = { jobId: "1d4f1c7a-5b2e-4e8a-9f0b-6c3d2a1e0f99", token: "s".repeat(43) };
const down: ServiceFailure = { code: "temporarily_unavailable", message: "Down.", retryable: true };
const expired: ServiceFailure = { code: "not_found", message: "No such job.", retryable: false };
const reaching = "We can’t reach the planning service right now. We keep trying.";
type Read = JobState["state"] | JobState | { readonly reject: ServiceFailure } | "hang";

interface Opened {
  readonly plans: MemoryPlans;
  readonly client: ScriptedClient;
  readonly onCompleted: ReturnType<typeof vi.fn>;
  /** What storage held each time onCompleted was called. */
  readonly savedAtCompletion: (LocalState | null)[];
  readonly unmount: () => void;
}

/** Opens with `saved` in storage: a draft at page 4 by default, or a running job. */
async function open(read: readonly Read[], options: { readonly saved?: Partial<LocalState>; readonly mode?: "ok" | "saveThrows"; readonly submit?: readonly JobCapability[] } = {}): Promise<Opened> {
  vi.useFakeTimers();
  const plans = memoryPlans({ draft: answers, step: 4, activeJob: null, snapshot: null, ...options.saved }, options.mode);
  live.plans = plans;
  const client = scriptedClient({
    catalogue: syntheticRegistryFixture.catalogue,
    submit: (options.submit ?? [capability]).map(job => ({ kind: "accepted", capability: job })),
    read,
  });
  const savedAtCompletion: (LocalState | null)[] = [];
  const onCompleted = vi.fn(() => {
    savedAtCompletion.push(plans.latest());
  });
  const view = render(<Onboarding client={client} initialInput={null} onCompleted={onCompleted} />);
  await settle();
  return { plans, client, onCompleted, savedAtCompletion, unmount: view.unmount };
}

const restoring: Partial<LocalState> = { activeJob: capability };
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const status = () => screen.getByRole("status").textContent;
/** The screen commits, then the read Making makes at once runs. */
async function settle(): Promise<void> {
  await advance(0);
  await advance(0);
}
const press = async (name: string | RegExp) => {
  fireEvent.click(screen.getByRole("button", { name }));
  await settle();
};
const steps = () => within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
const main = () => within(screen.getByRole("main"));

describe("Making", () => {
  it("a note with Undo goes when Making opens, because answers cannot change there", async () => {
    await open(["hang"]);
    await press(/I don’t remember/);
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    await press("Make my plan");
    expect(heading()).toBe("Making your plan");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await press("Cancel");
    expect(heading()).toBe("Your rotation");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("[J2] accepted saves activeJob at once (storageMock records it) and shows Making your plan", async () => {
    const { plans } = await open(["hang"]);
    await press("Make my plan");
    expect(heading()).toBe("Making your plan");
    expect(plans.latest()?.activeJob).toEqual(capability);
  });

  it("[K2] queued, fetching and calculating each change the one role=status sentence; the visible step list is not a live region", async () => {
    await open(["queued", "fetching", "calculating", "hang"]);
    await press("Make my plan");
    expect(status()).toBe("Step 1 of 3: Waiting for a free place in line.");
    await advance(2500);
    expect(status()).toBe("Step 2 of 3: Getting NASA weather records for your area.");
    await advance(2500);
    expect(status()).toBe("Step 3 of 3: Comparing orders and planting dates.");
    const list = screen.getByRole("list", { name: "Steps" });
    expect(list.closest("[aria-live], [role=status], [role=alert], [role=log]")).toBeNull();
  });

  it("[K2] Making promises no time, because how long a plan takes has not been measured", async () => {
    await open(["queued"]);
    await press("Make my plan");
    expect(heading()).toBe("Making your plan");
    expect(screen.getByRole("main").textContent).not.toMatch(/minute|second|hour|quick|soon/i);
    expect(screen.getByText(/^Keep this page open while we work\./)).toBeTruthy();
  });

  it("[L4] each step shows a word (Done, Working on it, Waiting), never colour alone", async () => {
    await open(["fetching", "hang"]);
    await press("Make my plan");
    expect(steps().map(step => step.textContent)).toEqual([
      "Waiting for a free place in lineDone",
      "Getting NASA weather records for your areaWorking on it",
      "3Comparing orders and planting datesWaiting",
    ]);
  });

  it("[K6] three failed reads show We can’t reach the planning service right now. We keep trying.; a good read hides it", async () => {
    const { client } = await open([{ reject: down }, { reject: down }, { reject: down }, "fetching", "hang"]);
    await press("Make my plan");
    await advance(2500);
    expect(main().queryByText(reaching)).toBeNull();
    await advance(5000);
    expect(main().getByText(reaching)).toBeTruthy();
    expect(status()).toBe(reaching);
    expect(heading()).toBe("Making your plan");
    await advance(10000);
    expect(client.reads).toHaveLength(4);
    expect(main().queryByText(reaching)).toBeNull();
    expect(status()).toBe("Step 2 of 3: Getting NASA weather records for your area.");
  });

  it("[K4] completed calls onCompleted once with the snapshot, after the save that clears activeJob", async () => {
    const { onCompleted, savedAtCompletion, plans } = await open(["queued", "completed"]);
    await press("Make my plan");
    expect(onCompleted).not.toHaveBeenCalled();
    await advance(2500);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith(jobFixtures.completed.snapshot);
    expect(savedAtCompletion[0]).toMatchObject({ activeJob: null, snapshot: jobFixtures.completed.snapshot });
    await advance(10000);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(plans.latest()?.draft).toEqual(answers);
  });

  it("[K4] a second plan is handed over too when the client reuses the job id, as the fixture client does", async () => {
    const { onCompleted } = await open(["completed"], { submit: [capability, capability] });
    await press("Make my plan");
    await advance(100);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("Your rotation");
    await press("Make my plan");
    await advance(100);
    expect(onCompleted).toHaveBeenCalledTimes(2);
  });

  it("[K3] after completed, advancing 60 s makes no more reads; unmounting during Making stops polling", async () => {
    const done = await open(["queued", "completed"]);
    await press("Make my plan");
    await advance(2500);
    expect(done.client.reads).toHaveLength(2);
    await advance(60000);
    expect(done.client.reads).toHaveLength(2);
    done.unmount();

    const waiting = await open(["queued"]);
    await press("Make my plan");
    await advance(5000);
    expect(waiting.client.reads).toHaveLength(3);
    waiting.unmount();
    await advance(60000);
    expect(waiting.client.reads).toHaveLength(3);
  });

  it("[B6] a completed service_error is handed to onCompleted and the saved plan stays the earlier one", async () => {
    const failedRun: CompletedSnapshot = completedSnapshotsByState.service_error;
    const { onCompleted, plans } = await open([{ state: "completed", snapshot: failedRun }], { saved: { ...restoring, snapshot: completedSnapshotFixture } });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith(failedRun);
    expect(plans.latest()).toMatchObject({ activeJob: null, snapshot: { id: completedSnapshotFixture.id, completedAt: completedSnapshotFixture.completedAt } });
  });

  it("when the completing save fails, client.remove is not called; when it succeeds, remove is called once", async () => {
    const refused = await open(["completed"], { saved: restoring, mode: "saveThrows" });
    expect(refused.onCompleted).toHaveBeenCalledTimes(1);
    expect(refused.client.removed).toEqual([]);
    refused.unmount();

    const kept = await open(["completed"], { saved: restoring });
    expect(kept.onCompleted).toHaveBeenCalledTimes(1);
    expect(kept.client.removed).toEqual([capability]);
  });

  it("Cancel removes the job, clears activeJob and returns to page 4 with every answer", async () => {
    const { client, plans, onCompleted } = await open(["hang"]);
    await press("Make my plan");
    await press("Cancel");
    expect(heading()).toBe("Your rotation");
    expect(client.removed).toEqual([capability]);
    expect(plans.latest()).toMatchObject({ activeJob: null, step: 4, draft: answers });
    expect((screen.getByLabelText("When is your field ready to plant?", { selector: "input" }) as HTMLInputElement).value).toBe("2026-07-01");
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("Back on Making returns to page 4 with See how it’s going; it reopens Making on the same job", async () => {
    const { client, plans } = await open(["queued"]);
    await press("Make my plan");
    await advance(2500);
    await press("Back");
    expect(heading()).toBe("Your rotation");
    expect(screen.getByText("A plan is being made from your answers.")).toBeTruthy();
    expect(plans.latest()?.activeJob).toEqual(capability);
    const readsWhileAway = client.reads.length;
    await advance(10000);
    expect(client.reads).toHaveLength(readsWhileAway);
    await press("See how it’s going");
    expect(heading()).toBe("Making your plan");
    await advance(2500);
    expect(client.reads.length).toBeGreaterThan(readsWhileAway);
    expect(client.reads.every(read => read.jobId === capability.jobId)).toBe(true);
    expect(client.submitted).toHaveLength(1);
  });
});

describe("restore", () => {
  it("[C5] a saved activeJob opens Making and reads that capability at once", async () => {
    const { client } = await open(["calculating", "hang"], { saved: restoring });
    expect(heading()).toBe("Making your plan");
    expect(client.reads).toEqual([capability]);
    expect(client.submitted).toEqual([]);
    expect(status()).toBe("Step 3 of 3: Comparing orders and planting dates.");
  });

  it("[K6] a restored job that reads 404 not_found shows This plan request has expired and keeps every answer", async () => {
    const { plans, onCompleted } = await open([{ reject: expired }], { saved: restoring });
    expect(heading()).toBe("This plan request has expired");
    expect(screen.getByRole("button", { name: "Make my plan again" })).toBeTruthy();
    expect(onCompleted).not.toHaveBeenCalled();
    await press("Change my answers");
    expect(heading()).toBe("Your rotation");
    expect(plans.latest()).toMatchObject({ activeJob: null, draft: answers });
  });
});

describe("the failed screen", () => {
  it("[K5] jobFixtures.failed shows the failure title, No plan was made., Try again and Change my answers, and never calls onCompleted", async () => {
    const { client, onCompleted, plans } = await open(["failed"]);
    await press("Make my plan");
    expect(heading()).toBe("We couldn’t get the weather records");
    expect(screen.getByText("No plan was made.")).toBeTruthy();
    expect(main().getAllByRole("button").map(button => button.textContent)).toEqual(["Try again", "Change my answers"]);
    expect(document.body.textContent).not.toContain("retrieval_failed");
    await advance(60000);
    expect(client.reads).toHaveLength(1);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(plans.latest()?.activeJob).toBeNull();
  });

  it("[K5] the title takes focus when the screen appears", async () => {
    await open(["queued", "failed"]);
    await press("Make my plan");
    expect(document.activeElement?.textContent).toBe("Making your plan");
    await advance(2500);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "We couldn’t get the weather records" }));
  });

  it("[K5] Change my answers opens page 4 with the same answers; Try again submits the same answers as a new job", async () => {
    const changed = await open(["failed"]);
    await press("Make my plan");
    await press("Change my answers");
    expect(heading()).toBe("Your rotation");
    expect(changed.plans.latest()).toMatchObject({ step: 4, draft: answers });
    changed.unmount();

    const retried = await open(["failed", "hang"], { submit: [capability, second] });
    await press("Make my plan");
    await press("Try again");
    expect(heading()).toBe("Making your plan");
    expect(retried.client.submitted).toHaveLength(2);
    expect(retried.client.submitted[1]).toEqual(retried.client.submitted[0]);
    expect(retried.client.reads.at(-1)).toEqual(second);
    expect(retried.plans.latest()?.activeJob).toEqual(second);
  });

  it("Open my earlier plan, made {local date} shows only when a plan was saved before, and calls onCompleted with it", async () => {
    const without = await open([{ reject: expired }], { saved: restoring });
    expect(heading()).toBe("This plan request has expired");
    expect(screen.queryByRole("button", { name: /^Open my earlier plan/ })).toBeNull();
    without.unmount();

    const made = new Date(completedSnapshotFixture.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    const withEarlier = await open([{ reject: expired }], { saved: { ...restoring, snapshot: completedSnapshotFixture } });
    await press(`Open my earlier plan, made ${made}`);
    expect(withEarlier.onCompleted).toHaveBeenCalledTimes(1);
    expect(withEarlier.onCompleted).toHaveBeenCalledWith(completedSnapshotFixture);
  });
});

