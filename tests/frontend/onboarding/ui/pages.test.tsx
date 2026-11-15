// @vitest-environment jsdom
// Pages 1 to 3 through the public Onboarding component, with an in-memory storage, a FieldPicker stub that emits
// inputFixture.field, and a scripted client.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPlans, LocalState } from "@/client/storage";
import { parseCropPurposeId, parseFarmInput } from "@/contracts";
import type { Catalogue, FarmInput, Submission, WaterAnswer } from "@/contracts";
import { Onboarding } from "@/features/onboarding";
import { inputFixture } from "@/fixtures/input";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { capability, catalogueOf, farmInputKeys, fillFourPages, memoryPlans, phoneBack, scriptedClient, stubSpeech } from "../support/harness";
import type { ScriptedClient } from "../support/harness";

const live = vi.hoisted(() => ({ plans: undefined as LocalPlans | undefined }));

vi.mock("@/client/storage", async () => (await import("../support/harness")).storageMock(() => live.plans));
vi.mock("@/features/location", async () => (await import("../support/harness")).fieldPickerStub((await import("@/fixtures/input")).inputFixture.field));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  history.replaceState(null, "");
});

const catalogue = syntheticRegistryFixture.catalogue;
const unavailable: Submission = { kind: "unavailable", failure: { code: "temporarily_unavailable", message: "Down.", retryable: true } };
const { schemaVersion: _version, ...answers } = inputFixture;

function open(options: { readonly client?: ScriptedClient; readonly initialInput?: FarmInput | null; readonly plans?: LocalPlans } = {}) {
  live.plans = options.plans ?? memoryPlans(null);
  const client = options.client ?? scriptedClient({ catalogue, submit: [{ kind: "accepted", capability }], read: ["queued"] });
  const onCompleted = vi.fn();
  const view = render(<Onboarding client={client} initialInput={options.initialInput ?? null} onCompleted={onCompleted} />);
  return { client, onCompleted, view };
}

const title = (name: string) => screen.findByRole("heading", { level: 1, name });
const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));
const checked = (role: "checkbox" | "radio", name: string) => (screen.getByRole(role, { name }) as HTMLInputElement).checked;
const dateInput = () => screen.getByLabelText("When is your field ready to plant?", { selector: "input" }) as HTMLInputElement;
const primaries = () => Array.from(document.querySelectorAll("#main .btn-primary"), button => button.textContent);
const stepHead = () => document.querySelector(".stepcount")?.textContent;
const crops = (entries: readonly (readonly [string, string, "food" | "cover"])[]): Catalogue => ({
  version: "test",
  entries: entries.map(([id, label, purpose]) => ({ id: parseCropPurposeId(id), label, purpose })),
});

function savedAt(step: number, draft: Partial<FarmInput>): LocalState {
  return { draft, step, activeJob: null, snapshot: null };
}

async function toCrops(): Promise<void> {
  await title("Where is your farm?");
  await click("Use this field");
  await click("Next: crops");
  await title("Which crops do you want to grow?");
}

describe("the four pages, in order", () => {
  it("[A3] the titles are Where is your farm?, Which crops do you want to grow?, Where does your water come from?, Your rotation, each with exactly one primary button", async () => {
    open({ initialInput: inputFixture });
    await title("Where is your farm?");
    expect(primaries()).toEqual(["Next: crops"]);
    await click("Next: crops");
    await title("Which crops do you want to grow?");
    await screen.findByRole("checkbox", { name: "Synthetic crop" });
    expect(primaries()).toEqual(["Next: water"]);
    await click("Next: water");
    await title("Where does your water come from?");
    expect(primaries()).toEqual(["Next: your rotation"]);
    await click("Next: your rotation");
    await title("Your rotation");
    expect(primaries()).toEqual(["Make my plan"]);
  });

  it("[A3] pages 2 to 4 have a Back control; page 1 shows the brand and no Back", async () => {
    open({ initialInput: inputFixture });
    await title("Where is your farm?");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(within(screen.getByRole("banner")).getByText("Gilir")).toBeTruthy();
    for (const [next, page] of [["Next: crops", "Which crops do you want to grow?"], ["Next: water", "Where does your water come from?"], ["Next: your rotation", "Your rotation"]]) {
      await click(next);
      await title(page);
      expect(within(screen.getByRole("banner")).getByRole("button", { name: "Back" })).toBeTruthy();
    }
  });

  it("[A4][A5] no page contains the words priority, pest or weed, and the step head says Step N of 4", async () => {
    open({ initialInput: inputFixture });
    const seen: string[] = [];
    for (const [page, next] of [["Where is your farm?", "Next: crops"], ["Which crops do you want to grow?", "Next: water"], ["Where does your water come from?", "Next: your rotation"], ["Your rotation", null]] as const) {
      await title(page);
      seen.push(stepHead() ?? "");
      expect(document.body.textContent).not.toMatch(/priorit|pest|weed/i);
      if (next) await click(next);
    }
    expect(seen).toEqual(["Step 1 of 4 · Your farm", "Step 2 of 4 · Crops", "Step 3 of 4 · Water", "Step 4 of 4 · Your rotation"]);
  });

  it("[C1] fill pages 1 to 4, press Back three times, then Next three times: every answer is still shown", async () => {
    open();
    await fillFourPages({ water: "Rain + water when it’s dry", start: "2027-03-01", history: "skip" });
    await click("Back");
    await title("Where does your water come from?");
    expect(checked("radio", "Rain + water when it’s dry")).toBe(true);
    await click("Back");
    await title("Which crops do you want to grow?");
    expect(checked("checkbox", "Synthetic crop")).toBe(true);
    await click("Back");
    await title("Where is your farm?");
    expect(screen.getByText("Marked: Synthetic example field")).toBeTruthy();
    await click("Next: crops");
    expect(checked("checkbox", "Synthetic crop")).toBe(true);
    await click("Next: water");
    expect(checked("radio", "Rain + water when it’s dry")).toBe(true);
    await click("Next: your rotation");
    expect(dateInput().value).toBe("2027-03-01");
    expect(screen.getByRole("button", { name: /^I don’t remember/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("[C2] with mocked storage, every answer change is saved; remounting with the last saved state opens the same page with the same values", async () => {
    const plans = memoryPlans(null);
    const first = open({ plans });
    await title("Where is your farm?");
    await click("Use this field");
    await waitFor(() => expect(plans.latest()?.draft?.field).toEqual(inputFixture.field));
    await click("Next: crops");
    await waitFor(() => expect(plans.latest()?.step).toBe(2));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Synthetic crop" }));
    await waitFor(() => expect(plans.latest()?.draft?.cropPurposeIds).toEqual(["synthetic-crop"]));
    await click("Next: water");
    await userEvent.click(screen.getByRole("radio", { name: "I’m not sure" }));
    await waitFor(() => expect(plans.latest()).toMatchObject({ step: 3, draft: { water: "unsure" } }));
    first.view.unmount();

    open({ plans: memoryPlans(plans.latest()) });
    await title("Where does your water come from?");
    expect(checked("radio", "I’m not sure")).toBe(true);
    await click("Back");
    expect(checked("checkbox", "Synthetic crop")).toBe(true);
  });

  it("[B2] with the real, unmocked storage (every call rejects) the whole flow completes and submits", async () => {
    const real = await vi.importActual<typeof import("@/client/storage")>("@/client/storage");
    const { client } = open({ plans: real.localPlans });
    await title("Where is your farm?");
    await fillFourPages({ water: "Rain only", start: "2027-03-01", history: "empty year" });
    await click("Make my plan");
    await title("Making your plan");
    expect(client.submitted).toHaveLength(1);
    expect(screen.getByText("This browser isn’t saving your answers. They stay while this page is open.")).toBeTruthy();
  });

  it("[L3] Next and Back focus the h1 of the new page; the first paint moves no focus", async () => {
    open({ initialInput: inputFixture });
    await title("Where is your farm?");
    expect(document.activeElement).toBe(document.body);
    await click("Next: crops");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Which crops do you want to grow?"));
    await click("Back");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Where is your farm?"));
  });

  it("[C1] the phone's Back button moves one page back and keeps every answer", async () => {
    open({ initialInput: inputFixture });
    await title("Where is your farm?");
    await click("Next: crops");
    await click("Next: water");
    await title("Where does your water come from?");
    await phoneBack();
    await title("Which crops do you want to grow?");
    expect(checked("checkbox", "Synthetic crop")).toBe(true);
    await click("Next: water");
    expect(checked("radio", "Rain only")).toBe(true);
  });
});

describe("the phone's Back with the Text size sheet open", () => {
  it("[C1] closes the sheet and stays on the page; the next Back moves one page back", async () => {
    open({ initialInput: inputFixture });
    await title("Where is your farm?");
    await click("Next: crops");
    await click("Next: water");
    await title("Where does your water come from?");
    await click("Text size");
    screen.getByRole("dialog", { name: "Text size" });
    await phoneBack();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Where does your water come from?");
    await phoneBack();
    await title("Which crops do you want to grow?");
  });
});

describe("the note with Undo", () => {
  it("goes away when the farmer moves to another page, so Undo never changes an answer out of sight", async () => {
    open({ initialInput: inputFixture });
    await toCrops();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Synthetic crop" }));
    expect(screen.getByText("Synthetic crop removed")).toBeTruthy();
    await click("Back");
    await title("Where is your farm?");
    expect(screen.queryByText("Synthetic crop removed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("comes right after the storage notice in the Tab order, before the top bar and the page", async () => {
    open({ initialInput: inputFixture, plans: memoryPlans(null, "throws") });
    await toCrops();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Synthetic crop" }));
    (document.activeElement as HTMLElement | null)?.blur();
    const stops: string[] = [];
    for (let n = 0; n < 3; n++) {
      await userEvent.tab();
      stops.push(document.activeElement?.textContent ?? "");
    }
    expect(stops).toEqual(["Got it", "Undo", "Back"]);
  });

  it("goes away when a later pick changes the crops, so Undo never drops a crop picked after the note", async () => {
    open({ client: scriptedClient({ catalogue: catalogueOf(3) }) });
    await toCrops();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Crop 1" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 2" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 1" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 3" }));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(["Crop 1", "Crop 2", "Crop 3"].map(name => checked("checkbox", name))).toEqual([false, true, true]);
  });

  it("stays while no answer changes, so typing in Find a crop keeps it, and Undo then says what it undid", async () => {
    open({ client: scriptedClient({ catalogue: catalogueOf(12) }) });
    await toCrops();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Crop 1" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 1" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Find a crop" }), "Crop 2");
    await click("Undo");
    expect(checked("checkbox", "Crop 1")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Undone: Crop 1 removed.");
  });
});

describe("the status line", () => {
  it("says a sentence again when it repeats, because a live region speaks only when its text changes", async () => {
    open({ client: scriptedClient({ catalogue: catalogueOf(13) }) });
    await toCrops();
    for (let n = 1; n <= 12; n++) await userEvent.click(await screen.findByRole("checkbox", { name: `Crop ${n}` }));
    const refused = "You can pick up to 12 crops. Remove one first.";
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 13" }));
    const first = screen.getByRole("status").textContent ?? "";
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 13" }));
    const second = screen.getByRole("status").textContent ?? "";
    expect([first.trim(), second.trim()]).toEqual([refused, refused]);
    expect(second).not.toBe(first);
  });
});

describe("Listen", () => {
  it("[L6] reads a water card's name and detail as two sentences", async () => {
    const { spoken } = stubSpeech();
    open({ plans: memoryPlans(savedAt(3, answers)) });
    await title("Where does your water come from?");
    await click("Listen");
    expect(spoken).toHaveLength(1);
    const said = spoken[0]!.text;
    expect(said).toContain("Rain only. No pump, canal or well.");
    expect(said).toContain("Rain + water when it’s dry. A pump, canal or well for dry spells.");
    expect(said).toContain("I’m not sure. That’s fine.");
  });

  it("[L6] reads a crop's name and dates as two sentences, and never a button's label", async () => {
    const { spoken } = stubSpeech();
    open({ plans: memoryPlans(savedAt(4, answers)) });
    await title("Your rotation");
    await screen.findByRole("slider", { name: "Synthetic crop: planting day" });
    await click("Listen");
    expect(spoken[0]!.text).toMatch(/Synthetic crop\. Planted (about )?\w/);
    await click("Stop");
    await click(/^I don’t remember/);
    await click("Listen");
    const said = spoken[1]!.text;
    expect(said).toContain("That’s fine. We make your plan without last year.");
    expect(said).not.toContain("Show last year’s entries again");
  });
});

describe("page 1", () => {
  it("[D1][A8] renders the FieldPicker slot with exactly { value, onChange }; the stub's Use this field makes Next go to page 2", async () => {
    open();
    await title("Where is your farm?");
    const slot = screen.getByRole("region", { name: "Field picker" });
    expect(slot.dataset.props).toBe("onChange,value");
    expect(within(slot).getByText("No field marked")).toBeTruthy();
    await click("Use this field");
    expect(within(slot).getByText("Marked: Synthetic example field")).toBeTruthy();
    await click("Next: crops");
    await title("Which crops do you want to grow?");
  });

  it("[D2] the submitted field deep-equals the field the slot emitted", async () => {
    const { client } = open();
    await fillFourPages({ water: "Rain only", start: "2027-03-01", history: "skip" });
    await click("Make my plan");
    await waitFor(() => expect(client.submitted).toHaveLength(1));
    expect(client.submitted[0]?.field).toEqual(inputFixture.field);
    expect(Object.keys(client.submitted[0] ?? {}).sort()).toEqual([...farmInputKeys]);
  });

  it("[D3] Next without a field says Mark your field to go on (role alert), stays on page 1 and focuses the slot section", async () => {
    open();
    await title("Where is your farm?");
    await click("Next: crops");
    expect(screen.getByRole("alert").textContent).toBe("Mark your field to go on.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Where is your farm?");
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Where is your farm?" }));
    await click("Use this field");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("[D3] a server issue on [\"field\",\"ring\"] shows on page 1 beside the slot, with focus on it", async () => {
    const client = scriptedClient({ catalogue, submit: [{ kind: "invalid", issues: [{ path: ["field", "ring"], message: "Boundary edges cross." }] }] });
    const { onCompleted } = open({ client, initialInput: inputFixture });
    await title("Where is your farm?");
    await click("Next: crops");
    await screen.findByRole("checkbox", { name: "Synthetic crop" });
    await click("Next: water");
    await click("Next: your rotation");
    await click("Make my plan");
    await title("Where is your farm?");
    const issue = screen.getByText("The field outline has a problem. Mark the field again.");
    expect(within(screen.getByRole("main")).getByRole("region", { name: "Field picker" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.contains(issue)).toBe(true));
    expect(document.body.textContent).not.toContain("Boundary edges cross.");
    expect(onCompleted).not.toHaveBeenCalled();
  });
});

describe("page 2", () => {
  it("[E1] the fixture catalogue shows Synthetic crop with Grown for food; picking it checks it and the dock says 1 picked", async () => {
    open();
    await toCrops();
    const crop = await screen.findByRole("checkbox", { name: "Synthetic crop", description: "Grown for food" });
    expect(screen.getByText("0 picked")).toBeTruthy();
    await userEvent.click(crop);
    expect((crop as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("1 picked")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Next step" }).textContent).toContain("1 picked: synthetic crop.");
  });

  it("[E2] a catalogue that rejects shows We couldn’t load the crop list and Try again; Try again loads it; other answers are kept", async () => {
    const client = scriptedClient({ catalogue });
    vi.spyOn(client, "catalogue").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(catalogue);
    open({ client });
    await toCrops();
    const failed = await screen.findByRole("alert");
    expect(within(failed).getByText("We couldn’t load the crop list")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next: water" })).toBeNull();
    await click("Try again");
    expect(await screen.findByRole("checkbox", { name: "Synthetic crop" })).toBeTruthy();
    await click("Back");
    expect(screen.getByText("Marked: Synthetic example field")).toBeTruthy();
  });

  it("[E2] Try again by keyboard keeps focus on the page title, and the status line says when the list is loaded", async () => {
    const client = scriptedClient({ catalogue });
    vi.spyOn(client, "catalogue").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(catalogue);
    open({ client });
    await toCrops();
    within(await screen.findByRole("alert")).getByRole("button", { name: "Try again" }).focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("checkbox", { name: "Synthetic crop" });
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Which crops do you want to grow?" }));
    expect(screen.getByRole("status").textContent).toBe("The crop list is loaded.");
  });

  it("[E3] an empty catalogue shows No crops are available yet, no count, and no Next", async () => {
    open({ client: scriptedClient({ catalogue: { version: "v1-empty", entries: [] } }) });
    await toCrops();
    expect(await screen.findByText("No crops are available yet")).toBeTruthy();
    expect(screen.queryByText(/picked/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Next: water" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Next step" })?.textContent ?? "").toBe("");
  });

  it("[E4] with a 13-crop catalogue the 13th pick is refused with You can pick up to 12 crops. Remove one first.", async () => {
    open({ client: scriptedClient({ catalogue: catalogueOf(13) }) });
    await toCrops();
    for (let n = 1; n <= 12; n++) await userEvent.click(await screen.findByRole("checkbox", { name: `Crop ${n}` }));
    expect(screen.getByText("12 picked")).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 13" }));
    expect(checked("checkbox", "Crop 13")).toBe(false);
    const refusal = "You can pick up to 12 crops. Remove one first.";
    expect(screen.getByRole("status").textContent).toBe(refusal);
    expect(screen.getAllByText(refusal).filter(element => element.getAttribute("role") !== "status")).toHaveLength(1);
    expect(screen.getByText("12 picked")).toBeTruthy();
  });

  it("[E5] a saved pick missing from the list stays listed with Remove and stays in the answers until the farmer removes it", async () => {
    const draft = { ...answers, cropPurposeIds: [parseCropPurposeId("synthetic-crop"), parseCropPurposeId("old-millet")] };
    const plans = memoryPlans(savedAt(2, draft));
    const { client } = open({ plans });
    await title("Which crops do you want to grow?");
    expect(await screen.findByText("Old millet is not on the current crop list.")).toBeTruthy();
    await click("Next: water");
    await click("Next: your rotation");
    await waitFor(() => expect(plans.latest()?.step).toBe(4));
    expect(plans.latest()?.draft?.cropPurposeIds).toEqual(["synthetic-crop", "old-millet"]);
    await click("Make my plan");
    expect(client.submitted).toEqual([]);
    await click("Fix on page 2: old millet is not on the current crop list. Remove it, then pick again.");
    await title("Which crops do you want to grow?");
    await waitFor(() => expect(document.activeElement?.closest("main")).toBeTruthy());
    expect(document.activeElement?.textContent).toContain("Old millet is not on the current crop list.");
    expect(document.activeElement?.contains(screen.getByRole("button", { name: "Remove Old millet" }))).toBe(true);
    await click("Remove Old millet");
    expect(screen.queryByText("Old millet is not on the current crop list.")).toBeNull();
    await waitFor(() => expect(plans.latest()?.draft?.cropPurposeIds).toEqual(["synthetic-crop"]));
    await click("Next: water");
    await click("Next: your rotation");
    await click("Make my plan");
    await waitFor(() => expect(client.submitted.map(input => input.cropPurposeIds)).toEqual([["synthetic-crop"]]));
  });

  it("[E6] a cover crop (purpose cover) can be picked and is submitted like a food crop", async () => {
    const client = scriptedClient({ catalogue: catalogueOf(3), submit: [{ kind: "accepted", capability }], read: ["queued"] });
    open({ client, initialInput: parseFarmInput({ ...inputFixture, cropPurposeIds: ["crop-1"] }) });
    await title("Where is your farm?");
    await click("Next: crops");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Crop 1" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Crop 3", description: "Cover crop" }));
    await click("Next: water");
    await click("Next: your rotation");
    await click("Make my plan");
    await waitFor(() => expect(client.submitted.map(input => input.cropPurposeIds)).toEqual([["crop-3"]]));
  });

  it("removing a pick shows a toast with Undo; Undo restores the pick and focuses its card", async () => {
    open({ initialInput: inputFixture });
    await title("Where is your farm?");
    await click("Next: crops");
    const crop = await screen.findByRole("checkbox", { name: "Synthetic crop" });
    await userEvent.click(crop);
    expect(screen.getByText("Synthetic crop removed")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Synthetic crop removed. You can undo this.");
    await click("Undo");
    expect((crop as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(crop));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("a long list offers Find a crop: typing narrows the cards but never hides a picked crop, and Show all crops brings the rest back", async () => {
    const list = crops([
      ["rice-paddy", "Rice (paddy)", "food"], ["maize-grain", "Maize (grain)", "food"], ["sweet-maize", "Sweet maize (sweet corn)", "food"],
      ["common-bean-dry", "Common bean (dry grain)", "food"], ["mung-bean", "Mung bean", "food"], ["soybean", "Soybean", "food"],
      ["sorghum", "Sorghum (grain)", "food"], ["cassava", "Cassava", "food"], ["groundnut", "Groundnut", "food"],
      ["cowpea", "Cowpea", "cover"], ["wheat", "Wheat (grain)", "food"], ["onion", "Onion (dry)", "food"],
    ]);
    open({ client: scriptedClient({ catalogue: list }) });
    await toCrops();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Rice (paddy)" }));
    const find = screen.getByRole("searchbox", { name: "Find a crop" });
    const cards = (names: readonly string[]) => names.map(name => screen.getByRole("checkbox", { name }));
    await userEvent.type(find, "BEAN");
    expect(screen.getAllByRole("checkbox")).toEqual(cards(["Rice (paddy)", "Common bean (dry grain)", "Mung bean", "Soybean"]));
    expect(screen.getByText("4 of 12 crops shown")).toBeTruthy();
    await userEvent.clear(find);
    await userEvent.type(find, "corn");
    expect(screen.getAllByRole("checkbox")).toEqual(cards(["Rice (paddy)", "Sweet maize (sweet corn)"]));
    await userEvent.type(find, "xyz");
    expect(screen.getByText("No crop on the list matches “cornxyz”.")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toEqual(cards(["Rice (paddy)"]));
    await click("Show all crops");
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
    expect(document.activeElement).toBe(find);
    expect((find as HTMLInputElement).value).toBe("");
  });

  it("Find a crop is not offered on a short list, and leaving page 2 forgets what was typed", async () => {
    open({ client: scriptedClient({ catalogue: catalogueOf(10) }) });
    await toCrops();
    await userEvent.type(await screen.findByRole("searchbox", { name: "Find a crop" }), "7");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await click("Back");
    await click("Next: crops");
    expect((screen.getByRole("searchbox", { name: "Find a crop" }) as HTMLInputElement).value).toBe("");
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
    cleanup();
    open({ client: scriptedClient({ catalogue: catalogueOf(9) }) });
    await toCrops();
    await screen.findByRole("checkbox", { name: "Crop 9" });
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

describe("page 3", () => {
  it("[F1] three radios named Rain only, Rain + water when it’s dry and I’m not sure, each mapping to its value", async () => {
    const plans = memoryPlans(savedAt(3, { field: inputFixture.field, cropPurposeIds: inputFixture.cropPurposeIds }));
    open({ plans });
    await title("Where does your water come from?");
    const expected: Record<string, WaterAnswer> = { "Rain only": "rain_only", "Rain + water when it’s dry": "rain_plus_backup", "I’m not sure": "unsure" };
    expect(screen.getAllByRole("radio")).toEqual(Object.keys(expected).map(name => screen.getByRole("radio", { name })));
    for (const [name, value] of Object.entries(expected)) {
      await userEvent.click(screen.getByRole("radio", { name }));
      await waitFor(() => expect(plans.latest()?.draft?.water).toBe(value));
    }
  });

  it("[F2] submitting the same answers with each water choice gives three inputs equal except for water", async () => {
    const client = scriptedClient({ catalogue, submit: [unavailable] });
    open({ client, initialInput: inputFixture });
    await title("Where is your farm?");
    await click("Next: crops");
    await screen.findByRole("checkbox", { name: "Synthetic crop" });
    await click("Next: water");
    for (const name of ["Rain only", "Rain + water when it’s dry", "I’m not sure"]) {
      await userEvent.click(screen.getByRole("radio", { name }));
      await click("Next: your rotation");
      await click("Make my plan");
      await screen.findByText("The planning service isn’t available right now");
      await click("Back");
    }
    expect(client.submitted.map(input => input.water)).toEqual(["rain_only", "rain_plus_backup", "unsure"]);
    const withoutWater = client.submitted.map(({ water: _water, ...rest }) => rest);
    expect(withoutWater[1]).toEqual(withoutWater[0]);
    expect(withoutWater[2]).toEqual(withoutWater[0]);
    expect(withoutWater[0]).toEqual(answersWithout(inputFixture));
  });

  it("[F3] the lead says the plan uses rain alone and that other water does not change it", async () => {
    open({ plans: memoryPlans(savedAt(3, { field: inputFixture.field })) });
    await title("Where does your water come from?");
    expect(screen.getByText("We plan with rain alone. Water from other sources is extra protection and doesn’t change the plan.")).toBeTruthy();
  });

  it("Next without an answer says Choose one answer to go on and focuses the answers", async () => {
    open({ plans: memoryPlans(savedAt(3, { field: inputFixture.field })) });
    await title("Where does your water come from?");
    await click("Next: your rotation");
    expect(screen.getByRole("alert").textContent).toBe("Choose one answer to go on.");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Where does your water come from?" }));
    await userEvent.click(screen.getByRole("radio", { name: "Rain only" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

function answersWithout(input: FarmInput): Omit<FarmInput, "water"> {
  const { water: _water, ...rest } = input;
  return rest;
}
