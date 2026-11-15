// @vitest-environment jsdom
// F4's storage words as the farmer sees them on "/": the set-aside notice from readStorageNotice() once per visit, on
// the input pages and on Results, and storageProblem(error).text when a storage call fails. Storage is mocked with
// MemoryPlans; storageProblem is F4's own. Each visit() is a fresh page load: the notice is read once per module lifetime.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { PlannerClient } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { capability, memoryPlans, scriptedClient } from "../support/harness";
import type { MemoryPlans } from "../support/harness";

const live = vi.hoisted(() => ({ plans: undefined as LocalPlans | undefined, client: undefined as PlannerClient | undefined }));

vi.mock("@/client/storage", async () => (await import("../support/harness")).storageMock(() => live.plans));
vi.mock("@/client/planner", async () => (await import("../support/harness")).plannerMock(() => live.client));
vi.mock("@/features/location", async () => (await import("../support/harness")).fieldPickerStub((await import("@/fixtures/input")).inputFixture.field));
vi.mock("@/features/results", async () => (await import("../support/harness")).resultsStub());

afterEach(() => {
  cleanup();
  history.replaceState(null, "");
});

const { schemaVersion: _version, ...answers } = inputFixture;
const leftOutPlan = "Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it. Your answers are kept.";
const leftOutJob = "The plan that was being made can’t be followed any more. Make the plan again.";
const stay = "Your answers stay while this page is open.";
const problems = {
  unavailable: "This browser isn’t letting Gilir open or save your answers on this device.",
  full: "This device has no room left to save Gilir.",
  newer: "Gilir has a newer version. Close this page and open Gilir again to see what you saved.",
} as const;

const saved = (state: Partial<LocalState>): LocalState => ({ draft: null, step: 1, activeJob: null, snapshot: null, ...state });
const title = (name: string) => screen.findByRole("heading", { level: 1, name });
const noticeLines = () => screen.queryAllByRole("status").filter(line => within(line).queryByRole("button", { name: "Got it" }) !== null);

/** One page load of "/": a fresh module graph, so the once-per-visit read starts over, as a reload does. */
async function visit(plans: MemoryPlans) {
  vi.resetModules();
  live.plans = plans;
  live.client = scriptedClient({ catalogue: syntheticRegistryFixture.catalogue, submit: [{ kind: "accepted", capability }], read: ["completed"] });
  const { default: Page } = await import("@/app/page");
  return render(<Page />);
}

async function settle(): Promise<void> {
  await act(() => new Promise(resolve => setTimeout(resolve, 50)));
}

describe("[F4-D1] the set-aside notice", () => {
  it("shows once on the input pages, stays across pages, and Got it removes it for this visit and the next", async () => {
    const plans = memoryPlans(saved({ draft: { water: "unsure" }, step: 3 }), "ok", leftOutPlan);
    const user = userEvent.setup();
    const first = await visit(plans);
    await title("Where does your water come from?");
    await waitFor(() => expect(noticeLines().map(line => line.textContent)).toEqual([`${leftOutPlan}Got it`]));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await title("Which crops do you want to grow?");
    expect(noticeLines()).toHaveLength(1);

    await user.click(within(noticeLines()[0]!).getByRole("button", { name: "Got it" }));
    expect(noticeLines()).toEqual([]);
    expect(document.activeElement?.id).toBe("main-title");
    await waitFor(() => expect(plans.setAside).toBeNull());
    expect(plans.noticeReads).toBe(1);
    first.unmount();

    await visit(plans);
    await title("Which crops do you want to grow?");
    await settle();
    expect(plans.noticeReads).toBe(2);
    expect(noticeLines()).toEqual([]);
  });

  it("is not dismissed by a reload: the next visit shows it again until Got it", async () => {
    const plans = memoryPlans(saved({ draft: { water: "unsure" }, step: 3 }), "ok", leftOutPlan);
    const first = await visit(plans);
    await waitFor(() => expect(noticeLines()).toHaveLength(1));
    first.unmount();
    await visit(plans);
    await waitFor(() => expect(noticeLines().map(line => line.textContent)).toEqual([`${leftOutPlan}Got it`]));
    expect(plans.noticeReads).toBe(2);
  });

  it("shows on Results in the Gilir frame when a saved plan opens, is read once, and stays gone after Change inputs", async () => {
    const plans = memoryPlans(saved({ draft: answers, step: 4, snapshot: completedSnapshotFixture }), "ok", leftOutJob);
    const user = userEvent.setup();
    await visit(plans);
    const results = await screen.findByRole("region", { name: "Results" });
    await waitFor(() => expect(noticeLines()).toHaveLength(1));
    expect(noticeLines()[0]!.textContent).toBe(`${leftOutJob}Got it`);
    expect(results.contains(noticeLines()[0]!)).toBe(false);

    await user.click(within(results).getByRole("button", { name: "Change inputs" }));
    await title("Where is your farm?");
    expect(noticeLines()).toHaveLength(1);
    await user.click(within(noticeLines()[0]!).getByRole("button", { name: "Got it" }));
    await user.click(screen.getByRole("button", { name: "Next: crops" }));
    await screen.findByRole("checkbox", { name: "Synthetic crop" });
    await user.click(screen.getByRole("button", { name: "Next: water" }));
    await user.click(screen.getByRole("button", { name: "Next: your rotation" }));
    await user.click(screen.getByRole("button", { name: "Make my plan" }));
    expect(await screen.findByRole("region", { name: "Results" })).toBeTruthy();
    await settle();
    expect(noticeLines()).toEqual([]);
    expect(plans.noticeReads).toBe(1);
  });

  it("a normal visit shows no notice line at all", async () => {
    const plans = memoryPlans(saved({ draft: { water: "unsure" }, step: 3 }));
    await visit(plans);
    await title("Where does your water come from?");
    await settle();
    expect(plans.noticeReads).toBe(1);
    expect(noticeLines()).toEqual([]);
  });

  it("is not read after an open that failed, because nothing could be set aside", async () => {
    const plans = memoryPlans(null, "throws", leftOutPlan);
    await visit(plans);
    await title("Where is your farm?");
    await settle();
    expect(plans.noticeReads).toBe(0);
    expect(noticeLines().map(line => line.textContent)).toEqual([`${problems.unavailable} ${stay}Got it`]);
  });
});

describe("[F4-D1] a failed storage call says why", () => {
  it("blocked storage: the open's refusal shows F4's words for it", async () => {
    await visit(memoryPlans(null, "throws"));
    await title("Where is your farm?");
    await waitFor(() => expect(noticeLines().map(line => line.textContent)).toEqual([`${problems.unavailable} ${stay}Got it`]));
  });

  it("full storage: the first save's refusal says the device has no room, and the answers stay on screen", async () => {
    const plans = memoryPlans(null, "full");
    const user = userEvent.setup();
    await visit(plans);
    await title("Where is your farm?");
    expect(noticeLines()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Use this field" }));
    await user.click(screen.getByRole("button", { name: "Next: crops" }));
    await title("Which crops do you want to grow?");
    await waitFor(() => expect(noticeLines().map(line => line.textContent)).toEqual([`${problems.full} ${stay}Got it`]));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Marked: Synthetic example field")).toBeTruthy();
    expect(plans.saves).toEqual([]);
  });

  it("a newer Gilir's data: the open's refusal says to close the page and open Gilir again", async () => {
    await visit(memoryPlans(null, "newer"));
    await title("Where is your farm?");
    await waitFor(() => expect(noticeLines().map(line => line.textContent)).toEqual([`${problems.newer} ${stay}Got it`]));
  });
});
