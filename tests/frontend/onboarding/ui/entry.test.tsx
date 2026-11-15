// @vitest-environment jsdom
// What opens on "/", through the production composition in src/app/page.tsx with its imports mocked: storage, the
// HTTP client, the field picker and the results slot. layout.tsx is never imported, because next/font needs the
// Next compiler.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot, JobState, PlannerClient } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";
import Page from "@/app/page";
import { Onboarding } from "@/features/onboarding";
import { capability, fillFourPages, memoryPlans, scriptedClient } from "../support/harness";
import type { MemoryPlans, ScriptedClient } from "../support/harness";

const live = vi.hoisted(() => ({ plans: undefined as LocalPlans | undefined, client: undefined as PlannerClient | undefined }));

vi.mock("@/client/storage", async () => (await import("../support/harness")).storageMock(() => live.plans));
vi.mock("@/client/planner", async () => (await import("../support/harness")).plannerMock(() => live.client));
vi.mock("@/features/location", async () => (await import("../support/harness")).fieldPickerStub((await import("@/fixtures/input")).inputFixture.field));
vi.mock("@/features/results", async () => (await import("../support/harness")).resultsStub());

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, "");
});

const catalogue = syntheticRegistryFixture.catalogue;
const { schemaVersion: _version, ...answers } = inputFixture;
const secondPlan: CompletedSnapshot = { ...completedSnapshotFixture, id: "second-plan" };

function setUp(plans: MemoryPlans, read: readonly (JobState["state"] | JobState | "hang")[] = ["completed"]): { plans: MemoryPlans; client: ScriptedClient } {
  const client = scriptedClient({ catalogue, submit: [{ kind: "accepted", capability }], read });
  live.plans = plans;
  live.client = client;
  return { plans, client };
}

function saved(state: Partial<LocalState>): LocalState {
  return { draft: null, step: 1, activeJob: null, snapshot: null, ...state };
}

const title = (name: string) => screen.findByRole("heading", { level: 1, name });

describe("what opens: no landing page, no sign in, no sign up", () => {
  it("[A9][B1] nothing saved: the first heading is Where is your farm? and no link or button mentions signing in, signing up or getting started", async () => {
    setUp(memoryPlans(null));
    render(<Page />);
    await title("Where is your farm?");
    const controls = [...screen.getAllByRole("button"), ...screen.queryAllByRole("link")].map(control => control.textContent ?? "");
    expect(controls).toContain("Next: crops");
    expect(controls.filter(text => /sign ?(in|up)|log ?in|register|account|get started/i.test(text))).toEqual([]);
  });

  it("[B2] storage load rejects: the first heading is Where is your farm?, a quiet line says answers are not saved, and the flow still completes", async () => {
    const { client } = setUp(memoryPlans(null, "throws"));
    render(<Page />);
    await title("Where is your farm?");
    expect(await screen.findByText("This browser isn’t saving your answers. They stay while this page is open.")).toBeTruthy();
    await fillFourPages({ water: "Rain only", start: "2027-03-01", history: "skip" });
    await userEvent.click(screen.getByRole("button", { name: "Make my plan" }));
    expect(await screen.findByRole("heading", { name: "Plan synthetic-plan" })).toBeTruthy();
    expect(client.submitted).toHaveLength(1);
  });

  it("while load is pending the page shows Opening Gilir… and no question", async () => {
    setUp(memoryPlans(null, "hangs"));
    render(<Page />);
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Opening Gilir…");
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
  });

  it("the first render equals the prerendered HTML, even with initialInput and a saved draft", async () => {
    setUp(memoryPlans(saved({ draft: { water: "unsure" }, step: 3 })));
    const element = <Onboarding client={scriptedClient({ catalogue })} initialInput={inputFixture} onCompleted={() => undefined} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    expect(container.textContent).toContain("Opening Gilir…");
    const mismatches: unknown[] = [];
    const root = await act(async () => hydrateRoot(container, element, { onRecoverableError: error => mismatches.push(error) }));
    expect(mismatches).toEqual([]);
    expect(await within(container).findByRole("heading", { level: 1, name: "Where does your water come from?" })).toBeTruthy();
    act(() => root.unmount());
    container.remove();
  });

  it("[B1] a saved draft at step 2: the first heading is Which crops do you want to grow? with its picks checked", async () => {
    setUp(memoryPlans(saved({ draft: { field: inputFixture.field, cropPurposeIds: inputFixture.cropPurposeIds }, step: 2 })));
    render(<Page />);
    await title("Which crops do you want to grow?");
    const crop = await screen.findByRole("checkbox", { name: "Synthetic crop" });
    expect((crop as HTMLInputElement).checked).toBe(true);
  });

  it("[B1][C5] a saved activeJob: Making your plan shows and the scripted client is read with that capability", async () => {
    const { client } = setUp(memoryPlans(saved({ draft: answers, step: 4, activeJob: capability })), ["queued"]);
    render(<Page />);
    await title("Making your plan");
    await waitFor(() => expect(client.reads[0]).toEqual(capability));
  });

  it("[B1] a saved snapshot and no job: the Results slot shows that snapshot's id inside the Gilir frame (Text size present) and focus is on #main", async () => {
    const { client } = setUp(memoryPlans(saved({ draft: answers, step: 4, snapshot: completedSnapshotFixture })));
    const asked = vi.spyOn(client, "catalogue");
    render(<Page />);
    expect(await screen.findByRole("heading", { name: "Plan synthetic-plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Text size" })).toBeTruthy();
    expect(screen.getByRole("main").contains(screen.getByRole("region", { name: "Results" }))).toBe(true);
    await waitFor(() => expect(document.activeElement?.id).toBe("main"));
    expect(asked).not.toHaveBeenCalled();
  });

  it("[B1] a saved snapshot and a saved job: Making wins", async () => {
    setUp(memoryPlans(saved({ draft: answers, step: 4, activeJob: capability, snapshot: completedSnapshotFixture })), ["queued"]);
    render(<Page />);
    await title("Making your plan");
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
  });
});

describe("Results and Change inputs", () => {
  it("[B4] a completed job swaps the inputs for the Results slot with the completed snapshot, after the save that clears the job", async () => {
    const { plans, client } = setUp(memoryPlans(null));
    render(<Page />);
    await fillFourPages({ water: "Rain only", start: "2027-03-01", history: "empty year" });
    await userEvent.click(screen.getByRole("button", { name: "Make my plan" }));
    expect(await screen.findByRole("heading", { name: "Plan synthetic-plan" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Your rotation" })).toBeNull();
    expect(plans.latest()).toMatchObject({ activeJob: null, step: 4, snapshot: { id: "synthetic-plan" } });
    await waitFor(() => expect(client.removed).toEqual([capability]));
  });

  it("[B5] Change inputs in the Results stub reopens page 1 with every answer filled in and does not bounce back to Results", async () => {
    setUp(memoryPlans(saved({ snapshot: completedSnapshotFixture, step: 4 })));
    const user = userEvent.setup();
    render(<Page />);
    await user.click(await screen.findByRole("button", { name: "Change inputs" }));
    await title("Where is your farm?");
    expect(screen.getByText("Marked: Synthetic example field")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next: crops" }));
    expect(((await screen.findByRole("checkbox", { name: "Synthetic crop" })) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next: water" }));
    expect((screen.getByRole("radio", { name: "Rain only" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next: your rotation" }));
    expect((screen.getByLabelText("When is your field ready to plant?", { selector: "input" }) as HTMLInputElement).value).toBe("2026-07-01");
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
  });

  it("[C6] after Change inputs, a newer different saved draft is kept at its page instead of the snapshot's input", async () => {
    setUp(memoryPlans(saved({ draft: { ...answers, water: "unsure" }, step: 3, snapshot: completedSnapshotFixture })));
    render(<Page />);
    await userEvent.click(await screen.findByRole("button", { name: "Change inputs" }));
    await title("Where does your water come from?");
    expect((screen.getByRole("radio", { name: "I’m not sure" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("We kept the answers you changed after that plan was made.")).toBeTruthy();
  });

  it("resubmitting from there reaches Results again with the new snapshot", async () => {
    const { client } = setUp(memoryPlans(saved({ snapshot: completedSnapshotFixture, step: 4 })), [{ state: "completed", snapshot: secondPlan }]);
    const user = userEvent.setup();
    render(<Page />);
    await user.click(await screen.findByRole("button", { name: "Change inputs" }));
    await title("Where is your farm?");
    await user.click(screen.getByRole("button", { name: "Next: crops" }));
    await screen.findByRole("checkbox", { name: "Synthetic crop" });
    await user.click(screen.getByRole("button", { name: "Next: water" }));
    await user.click(screen.getByRole("button", { name: "Next: your rotation" }));
    await user.click(screen.getByRole("button", { name: "Make my plan" }));
    expect(await screen.findByRole("heading", { name: "Plan second-plan" })).toBeTruthy();
    expect(client.submitted).toEqual([inputFixture]);
  });
});

describe("slot props unchanged", () => {
  it("[A8] FieldPicker receives exactly { value, onChange } and Results exactly { snapshot, onChangeInputs }", async () => {
    setUp(memoryPlans(null));
    render(<Page />);
    await title("Where is your farm?");
    expect(screen.getByRole("region", { name: "Field picker" }).dataset.props).toBe("onChange,value");
    await fillFourPages({ water: "I’m not sure", start: "2027-03-01", history: "skip" });
    await userEvent.click(screen.getByRole("button", { name: "Make my plan" }));
    expect((await screen.findByRole("region", { name: "Results" })).dataset.props).toBe("onChangeInputs,snapshot");
  });
});
