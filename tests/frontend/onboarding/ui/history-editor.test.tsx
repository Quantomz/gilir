// @vitest-environment jsdom
// Page 4 through the public Onboarding component: the date, the history editor by keyboard and date sheets,
// validation and submission. Drag runs in a real browser, because jsdom has no layout and no pointer capture.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPlans } from "@/client/storage";
import { parseCropPurposeId, parseIsoDate, serviceFailureSchema } from "@/contracts";
import type { Catalogue, FarmInput, ServiceFailure, Submission } from "@/contracts";
import { Onboarding } from "@/features/onboarding";
import type { CropEntry, Entry, FallowEntry } from "@/features/onboarding/model/timeline";
import { inputFixture } from "@/fixtures/input";
import { capability, memoryPlans, scriptedClient } from "../support/harness";
import type { MemoryPlans, ScriptedClient } from "../support/harness";

const live = vi.hoisted(() => ({ plans: undefined as LocalPlans | undefined }));

vi.mock("@/client/storage", async () => (await import("../support/harness")).storageMock(() => live.plans));
vi.mock("@/features/location", async () => (await import("../support/harness")).fieldPickerStub((await import("@/fixtures/input")).inputFixture.field));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, "");
});

const maize = parseCropPurposeId("maize-grain");
const bean = parseCropPurposeId("common-bean-dry");
const catalogue: Catalogue = {
  version: "test",
  entries: [{ id: maize, label: "Maize (grain)", purpose: "food" }, { id: bean, label: "Common bean (dry grain)", purpose: "food" }],
};
const ready = parseIsoDate("2027-03-01");
const answers: Partial<FarmInput> = { field: inputFixture.field, cropPurposeIds: [maize, bean], water: "rain_only" };
const dated: Partial<FarmInput> = { ...answers, planningStart: ready };

function crop(id: string, planted: string, harvested: string, grown: string = maize): CropEntry {
  return {
    kind: "crop",
    id,
    crop: grown === maize || grown === bean ? { kind: "catalogue", cropPurposeId: parseCropPurposeId(grown) } : { kind: "unsupported", label: grown },
    planted: parseIsoDate(planted),
    harvested: parseIsoDate(harvested),
    plantedPrecision: "approximate",
    harvestedPrecision: "approximate",
  };
}

function empty(id: string, start: string, endExclusive: string): FallowEntry {
  return { kind: "fallow", id, start: parseIsoDate(start), endExclusive: parseIsoDate(endExclusive) };
}

function withBars(...entries: Entry[]): Partial<FarmInput> {
  return { ...dated, history: { kind: "recorded", start: parseIsoDate("2026-03-01"), endExclusive: ready, entries } };
}

/** Opens on page 4 with `draft` saved, once the crop list has arrived. */
async function openAt4(draft: Partial<FarmInput>, submit: readonly Submission[] | "hang" = [{ kind: "accepted", capability }]): Promise<{ client: ScriptedClient; plans: MemoryPlans; onCompleted: ReturnType<typeof vi.fn> }> {
  const plans = memoryPlans({ draft, step: 4, activeJob: null, snapshot: null });
  live.plans = plans;
  const client = scriptedClient({ catalogue, submit: submit === "hang" ? ["hang"] : submit, read: ["hang"] });
  const onCompleted = vi.fn();
  render(<Onboarding client={client} initialInput={null} onCompleted={onCompleted} />);
  await title("Your rotation");
  await act(() => new Promise(resolve => setTimeout(resolve, 0)));
  return { client, plans, onCompleted };
}

/** A calendar date as a phone in this test's locale writes it, worked out apart from the app's own formatting. */
function shown(iso: string, month: "short" | "long" = "short"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}

const title = (name: string) => screen.findByRole("heading", { level: 1, name });
const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));
const dateInput = () => screen.getByLabelText("When is your field ready to plant?", { selector: "input" }) as HTMLInputElement;
const dateCard = () => screen.getByRole("region", { name: "When is your field ready to plant?" });
const lanes = () => within(screen.getByRole("list", { name: "Crops in those 12 months" })).getAllByRole("listitem");
const said = () => screen.getAllByRole("status").map(element => element.textContent).join(" ");
const dialog = () => screen.getByRole("dialog");
const slider = (name: string) => screen.findByRole("slider", { name });
const harvestOf = (crop: string) => slider(`${crop}: harvest day, the last day in the field`);
const plantingOf = (crop: string) => slider(`${crop}: planting day`);
const value = (element: HTMLElement) => Number(element.getAttribute("aria-valuenow"));
const submitted = (client: ScriptedClient) => client.submitted.at(-1);

async function makePlan(): Promise<void> {
  await click("Make my plan");
}

describe("the field-ready date", () => {
  it("[G2] a fresh page 4 has an empty date input and the timeline waits for a date", async () => {
    await openAt4(answers);
    expect(dateInput().value).toBe("");
    expect(screen.getByText("The timeline appears after you choose the date your field is ready.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a crop" })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("[G1] Make my plan with no date shows Choose the date your field is ready on page 4 and does not submit", async () => {
    const { client } = await openAt4({ ...answers, history: { kind: "skipped" } });
    await makePlan();
    expect(within(dateCard()).getByText("Choose the date your field is ready.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Fix these first" })).getByRole("button", { name: "On this page: choose the date your field is ready." })).toBeTruthy();
    expect(dateInput().getAttribute("aria-invalid")).toBe("true");
    expect(client.submitted).toEqual([]);
  });

  it("[G3] a 2028-02-29 date shows Your plan covers 29 February 2028 to 27 February 2029", async () => {
    await openAt4(answers);
    fireEvent.change(dateInput(), { target: { value: "2028-02-29" } });
    const line = `Your plan covers ${shown("2028-02-29")} to ${shown("2029-02-27")}`;
    expect(within(dateCard()).getByText((_, element) => element?.tagName === "SPAN" && element.textContent === line)).toBeTruthy();
  });

  it("[G4] a past date shows This date has passed. Is the year right? and still submits", async () => {
    const { client } = await openAt4({ ...answers, history: { kind: "skipped" } });
    fireEvent.change(dateInput(), { target: { value: "2099-03-01" } });
    expect(screen.queryByText("This date has passed. Is the year right?")).toBeNull();
    fireEvent.change(dateInput(), { target: { value: "2001-03-01" } });
    expect(within(dateCard()).getByText("This date has passed. Is the year right?")).toBeTruthy();
    await makePlan();
    await title("Making your plan");
    expect(submitted(client)?.planningStart).toBe("2001-03-01");
  });
});

describe("bars by keyboard and date sheets", () => {
  it("[H4] ArrowRight on the harvest handle adds one day: aria-valuenow, aria-valuetext and the lane text change together", async () => {
    await openAt4(withBars(crop("crop-1", "2026-04-01", "2026-07-15")));
    const harvest = await harvestOf("Maize (grain)");
    expect(value(harvest)).toBe(136);
    expect(harvest.getAttribute("aria-valuetext")).toBe(`about ${shown("2026-07-15", "long")}, 106 days in the field`);
    harvest.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(value(harvest)).toBe(137);
    expect(harvest.getAttribute("aria-valuetext")).toBe(`about ${shown("2026-07-16", "long")}, 107 days in the field`);
    expect(within(lanes()[0]).getByText(`Planted about ${shown("2026-04-01")}, harvested about ${shown("2026-07-16")}`)).toBeTruthy();
  });

  it("[H4] ArrowLeft on the planting handle moves planting one day earlier; PageUp and PageDown move a week; Home and End reach the window edges", async () => {
    const { plans } = await openAt4(withBars(crop("crop-1", "2026-06-09", "2026-08-07")));
    const planting = await plantingOf("Maize (grain)");
    const harvest = await harvestOf("Maize (grain)");
    planting.focus();
    const steps: [string, number][] = [["{ArrowLeft}", 99], ["{ArrowDown}", 98], ["{PageUp}", 105], ["{PageDown}", 98], ["{ArrowUp}", 99], ["{Home}", 0]];
    for (const [key, day] of steps) {
      await userEvent.keyboard(key);
      expect(value(planting), key).toBe(day);
    }
    await userEvent.keyboard("{End}");
    expect(value(planting)).toBe(value(harvest));
    expect(said()).toContain("Maize (grain) needs at least one day in the field.");
    harvest.focus();
    await userEvent.keyboard("{End}");
    expect(value(harvest)).toBe(364);
    await waitFor(() => expect(plans.latest()?.draft?.history).toMatchObject({ entries: [{ planted: "2026-08-07", harvested: "2027-02-28" }] }));
  });

  it("[H5] Enter on a handle opens Change dates with that end's input focused; Escape closes it and focus returns to that handle", async () => {
    await openAt4(withBars(crop("crop-1", "2026-04-01", "2026-07-15")));
    const harvest = await harvestOf("Maize (grain)");
    harvest.focus();
    await userEvent.keyboard("{Enter}");
    expect(within(dialog()).getByRole("heading", { name: "Change dates: Maize (grain)" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByLabelText("Harvested")));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(harvest);

    const planting = await plantingOf("Maize (grain)");
    planting.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByLabelText("Planted")));
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(planting);
  });

  it("[H6] These dates are approximate is on for a new bar; turning it off and saving submits both precisions as exact", async () => {
    const { client } = await openAt4(dated);
    await click("Add a crop");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Maize (grain)" }));
    await click("Change dates for maize (grain)");
    const approximate = within(dialog()).getByRole("checkbox", { name: /These dates are approximate/ }) as HTMLInputElement;
    expect(approximate.checked).toBe(true);
    await userEvent.click(approximate);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Save dates" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(lanes()[0]).getByText(`Planted ${shown("2026-03-01")}, harvested ${shown("2026-05-29")}`)).toBeTruthy();
    await makePlan();
    await title("Making your plan");
    expect(submitted(client)?.history).toMatchObject({ kind: "recorded", entries: [{ plantedPrecision: "exact", harvestedPrecision: "exact" }] });
  });

  it("[H3] Add a crop places a 90-day bar and focuses its Change dates; Remove in the sheet removes it with Undo and focuses Add a crop", async () => {
    await openAt4(dated);
    expect(screen.getByText(/^No crops yet\. Tap/)).toBeTruthy();
    await click("Add a crop");
    expect(within(dialog()).getByRole("heading", { name: "Which crop grew here?" })).toBeTruthy();
    expect(within(dialog()).getByRole("heading", { name: "Your crops" })).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Maize (grain)" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change dates for maize (grain)" })));
    expect(within(lanes()[0]).getByText(`Planted about ${shown("2026-03-01")}, harvested about ${shown("2026-05-29")}`)).toBeTruthy();
    expect((await harvestOf("Maize (grain)")).getAttribute("aria-valuetext")).toMatch(/, 90 days in the field$/);

    await click("Change dates for maize (grain)");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Remove maize (grain)" }));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByText("Maize (grain) removed")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a crop" })));
    await click("Undo");
    expect(lanes()).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change dates for maize (grain)" })));
  });

  it("[H3] A crop grew then, from a tapped Not sure time, puts the new crop inside that time", async () => {
    await openAt4(withBars(crop("crop-1", "2026-06-09", "2026-08-07")));
    const firstGap = document.querySelector<HTMLElement>(".ly-over .ly-seg-gap");
    if (firstGap === null) throw new Error("The overview strip has no Not sure time.");
    fireEvent.click(firstGap);
    expect(within(dialog()).getByRole("heading", { name: `Not sure: ${shown("2026-03-01")} to ${shown("2026-06-08")}` })).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole("button", { name: "A crop grew then" }));
    expect(within(dialog()).getByRole("heading", { name: "Which crop grew then?" })).toBeTruthy();
    expect(within(dialog()).getByText("It goes in the Not sure time you tapped.")).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Common bean (dry grain)" }));
    expect(lanes()).toHaveLength(2);
    expect(within(lanes()[0]).getByText(`Planted about ${shown("2026-03-01")}, harvested about ${shown("2026-05-29")}`)).toBeTruthy();
  });

  it("[H8] A crop not on our list named Cassava is submitted as { kind: \"unsupported\", label: \"Cassava\" }; a blank name says Type the name of the crop.", async () => {
    const { client } = await openAt4(dated);
    await click("Add a crop");
    const name = within(dialog()).getByLabelText("Name of the crop");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Add this crop" }));
    expect(within(dialog()).getByText("Type the name of the crop.")).toBeTruthy();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(screen.queryByRole("slider")).toBeNull();

    await userEvent.type(name, "  Cassava ");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Add this crop" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(lanes()[0]).getByText("Cassava")).toBeTruthy();
    expect(within(lanes()[0]).getByText("Not on our list: shown, but not scored")).toBeTruthy();
    await makePlan();
    await title("Making your plan");
    expect(submitted(client)?.history).toMatchObject({ kind: "recorded", entries: [{ kind: "crop", crop: { kind: "unsupported", label: "Cassava" } }] });
  });

  it("[H10] The field was empty then on a Not sure time submits a fallow entry; Mark as not sure removes it", async () => {
    const { client, plans } = await openAt4(withBars(crop("crop-1", "2026-06-09", "2026-08-07")));
    const before = `${shown("2026-03-01")} to ${shown("2026-06-08")}`;
    expect(screen.getByText(`${before} · 100 days`)).toBeTruthy();
    await click(`The field was empty then: ${before}`);
    expect(screen.getByText(`Marked as empty: ${before}`)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: `Mark as not sure: ${before}` })));
    await waitFor(() => expect(plans.latest()?.draft?.history).toMatchObject({ entries: [{ kind: "fallow", start: "2026-03-01", endExclusive: "2026-06-09" }, { kind: "crop" }] }));

    await click(`Mark as not sure: ${before}`);
    expect(screen.getByRole("button", { name: `The field was empty then: ${before}` })).toBeTruthy();
    await waitFor(() => expect(plans.latest()?.draft?.history).toMatchObject({ entries: [{ kind: "crop" }] }));

    await click(`The field was empty then: ${before}`);
    await makePlan();
    await title("Making your plan");
    expect(submitted(client)?.history).toEqual({
      kind: "recorded",
      start: "2026-03-01",
      endExclusive: "2027-03-01",
      entries: [{ ...empty("empty-1", "2026-03-01", "2026-06-09"), id: expect.any(String) }, crop("crop-1", "2026-06-09", "2026-08-07")],
    });
  });

  it("[H1] I don’t remember is aria-pressed and the submitted history is exactly { kind: \"skipped\" }", async () => {
    const { client } = await openAt4(withBars(crop("crop-1", "2026-04-01", "2026-07-15")));
    const skip = screen.getByRole("button", { name: /^I don’t remember/ });
    expect(skip.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(skip);
    expect(skip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("We make your plan without last year.")).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    await makePlan();
    await title("Making your plan");
    expect(submitted(client)?.history).toEqual({ kind: "skipped" });
  });

  it("[H13] saving overlapping dates says This overlaps your … One crop at a time and keeps the sheet open", async () => {
    const { plans } = await openAt4(withBars(crop("crop-1", "2026-04-01", "2026-07-15"), crop("crop-2", "2026-09-01", "2026-12-10", bean)));
    await click("Change dates for common bean (dry grain)");
    fireEvent.change(within(dialog()).getByLabelText("Planted"), { target: { value: "2026-07-10" } });
    const words = `This overlaps your maize (grain) (${shown("2026-04-01")} to ${shown("2026-07-15")}). One crop at a time: choose other dates.`;
    const problem = within(dialog()).getByText(words).closest("p");
    expect(problem?.getAttribute("role")).toBeNull();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Save dates" }));
    expect(within(dialog()).getByRole("alert").textContent).toBe(words);
    expect(document.activeElement).toBe(within(dialog()).getByRole("alert"));
    expect(plans.latest()?.draft?.history).toMatchObject({ entries: [{ id: "crop-1" }, { id: "crop-2", planted: "2026-09-01" }] });
  });

  it("[I4] an overlapping bar shows its issue in its own lane at once, without Make my plan", async () => {
    await openAt4(withBars(crop("crop-1", "2026-04-01", "2026-07-15"), crop("crop-2", "2026-07-01", "2026-09-30", bean)));
    const [first, second] = lanes();
    expect(within(second).getByText("Common bean (dry grain) overlaps another entry. One crop at a time: change the dates.")).toBeTruthy();
    expect(within(first).queryByText(/overlaps/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Fix these first" })).toBeNull();
  });

  it("every pointer action has a button twin: overview gap, empty time and crop segment each match a list button", async () => {
    await openAt4(withBars(crop("crop-1", "2026-04-01", "2026-07-15"), empty("empty-1", "2026-07-20", "2026-08-15")));
    const strip = document.querySelector(".ly-over");
    expect(strip?.getAttribute("aria-hidden")).toBe("true");
    const segments = Array.from(strip?.querySelectorAll<HTMLElement>(".ly-seg") ?? []);
    expect(segments).toHaveLength(5);
    const twins: string[] = [];
    for (const segment of segments) {
      fireEvent.click(segment);
      const opened = within(dialog()).getByRole("heading").textContent ?? "";
      const twin = opened.startsWith("Not sure: ") ? `The field was empty then: ${opened.slice("Not sure: ".length)}`
        : opened.startsWith("Empty: ") ? `Mark as not sure: ${opened.slice("Empty: ".length)}`
        : `Change dates for ${opened.slice("Change dates: ".length).toLocaleLowerCase()}`;
      twins.push(twin);
      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("button", { name: twin })).toBeTruthy();
    }
    expect(twins.filter(twin => twin.startsWith("The field was empty then"))).toHaveLength(3);
    expect(twins).toContain(`Mark as not sure: ${shown("2026-07-20")} to ${shown("2026-08-14")}`);
    expect(twins).toContain("Change dates for maize (grain)");
  });
});

describe("Make my plan", () => {
  it("[I2] an incomplete draft shows Fix these first with Fix on page N links; a link opens that page and focuses the control", async () => {
    const { water: _water, ...noWater } = answers;
    const { client } = await openAt4({ ...noWater, planningStart: ready, history: { kind: "skipped" } });
    await makePlan();
    const summary = screen.getByRole("region", { name: "Fix these first" });
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(summary).getAllByRole("button").map(button => button.textContent)).toEqual(["Fix on page 3: choose where your water comes from."]);
    expect(client.submitted).toEqual([]);
    await userEvent.click(within(summary).getByRole("button"));
    await title("Where does your water come from?");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Choose where your water comes from."));
  });

  it("[I3] a server issue with path [] is listed in Fix these first with no link", async () => {
    await openAt4({ ...dated, history: { kind: "skipped" } }, [{ kind: "invalid", issues: [{ path: [], message: "Malformed body." }] }]);
    await makePlan();
    const summary = await screen.findByRole("region", { name: "Fix these first" });
    expect(within(summary).getByText("Your answers couldn’t be read. Tap Make my plan again.")).toBeTruthy();
    expect(within(summary).queryAllByRole("button")).toEqual([]);
  });

  it("[J1] accepted opens Making; invalid stays on the pages; unavailable stays on page 4", async () => {
    const draft = { ...dated, history: { kind: "skipped" } } as const;
    const outcomes: readonly [Submission, string][] = [
      [{ kind: "accepted", capability }, "Making your plan"],
      [{ kind: "invalid", issues: [{ path: ["water"], message: "Required." }] }, "Where does your water come from?"],
      [{ kind: "unavailable", failure: { code: "temporarily_unavailable", message: "Down.", retryable: true } }, "Your rotation"],
    ];
    for (const [submission, page] of outcomes) {
      const { onCompleted } = await openAt4(draft, [submission]);
      await makePlan();
      await title(page);
      expect(onCompleted).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("[J4] each unavailable code shows its farmer title and body, no raw code, and one Make my plan button", async () => {
    const titles: Readonly<Record<ServiceFailure["code"], string>> = {
      retrieval_failed: "We couldn’t get the weather records",
      processing_failed: "Something went wrong while making your plan",
      temporarily_unavailable: "The planning service isn’t available right now",
      not_found: "This plan request has expired",
      rate_limited: "Too many plan requests right now",
      payload_too_large: "Your answers are too large to send",
      not_configured: "Plans can’t be made in this version yet",
      not_implemented: "Plans can’t be made in this version yet",
    };
    for (const [code, words] of Object.entries(titles)) {
      const failure = serviceFailureSchema.parse({ code, message: `Developer message for ${code}.`, retryable: code === "rate_limited" });
      await openAt4({ ...dated, history: { kind: "skipped" } }, [{ kind: "unavailable", failure }]);
      await makePlan();
      const panelTitle = await screen.findByText(words, { selector: "#submit-fail" });
      await waitFor(() => expect(document.activeElement).toBe(panelTitle));
      expect(document.body.textContent, code).not.toContain(code);
      expect(document.body.textContent, code).not.toContain("Developer message");
      expect(screen.getAllByRole("button", { name: /Make my plan|Try again/ }).map(button => button.textContent), code).toEqual(["Make my plan"]);
      expect(screen.queryByText("When you’re ready, tap Make my plan again.") !== null, code).toBe(code === "rate_limited");
      cleanup();
    }
  });

  it("[J6] a double click submits once: the button is aria-busy and says Sending your answers… while sending", async () => {
    const { client } = await openAt4({ ...dated, history: { kind: "skipped" } }, "hang");
    await userEvent.dblClick(screen.getByRole("button", { name: "Make my plan" }));
    const busy = screen.getByRole("button", { name: "Sending your answers…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(busy);
    expect(client.submitted).toHaveLength(1);
  });

  it("[J3] a rejected submission (invalid, cropPurposeIds 0) opens page 2 with the issue, never calls onCompleted, and keeps every answer", async () => {
    const draft = withBars(crop("crop-1", "2026-04-01", "2026-07-15"));
    const { onCompleted, plans } = await openAt4(draft, [{ kind: "invalid", issues: [{ path: ["cropPurposeIds", 0], message: "Not in the current catalogue." }] }]);
    await makePlan();
    await title("Which crops do you want to grow?");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Maize (grain) is not on the current crop list. Remove it, then pick again."));
    expect((screen.getByRole("checkbox", { name: "Maize (grain)" }) as HTMLInputElement).checked).toBe(true);
    expect(onCompleted).not.toHaveBeenCalled();
    await click("Next: water");
    await click("Next: your rotation");
    await title("Your rotation");
    expect(dateInput().value).toBe("2027-03-01");
    expect(lanes()).toHaveLength(1);
    await waitFor(() => expect(plans.latest()?.draft).toEqual(draft));
  });
});
