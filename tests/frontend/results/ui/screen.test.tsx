// @vitest-environment jsdom
// What only a rendered screen can show: every snapshot draws, the actions work with fake ports, failures stay
// visible while the result stays readable, focus and announcements, the keyboard, and the composition inside F1's
// real AppFrame. ResultScreen is rendered with fakeKeeper and locale "en-GB"; the public Results is rendered with the
// real ports, where jsdom's missing IndexedDB makes storage unavailable and the PDF is really made. The PDF module is
// wrapped only so a test can watch preparePdf and make one export fail. Fixture and component evidence: synthetic
// snapshots and fake ports.
process.env.TZ = "America/Los_Angeles";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import type { ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPdf, preparePdf } from "@/client/pdf";
import { localPlans, storageProblem } from "@/client/storage";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot, FarmInput } from "@/contracts";
import { AppFrame } from "@/features/onboarding";
import { Results } from "@/features/results";
import { ResultScreen } from "@/features/results/screen";
import { createKeeper } from "@/features/results/services/keeper";
import { fakeKeeper } from "../support/keeper";
import { memoryPlans, pdfPort, portMessage, savedState } from "../support/ports";
import type { MemoryPlans, PdfPort } from "../support/ports";
import { everySnapshot, shared, variant } from "../support/variants";

const pdfFails = vi.hoisted(() => ({ next: false }));
vi.mock("@/client/pdf", async importOriginal => {
  const real = await importOriginal<typeof import("@/client/pdf")>();
  return {
    preparePdf: vi.fn(real.preparePdf),
    exportPdf: vi.fn((snapshot: CompletedSnapshot) => (pdfFails.next ? Promise.reject(new Error(`PDF: ${portMessage}.`)) : real.exportPdf(snapshot))),
  };
});

const plan = shared("plan");
const warned = shared("plan_with_warnings");
const missing = shared("insufficient_data");
const failed = shared("service_error");

const pdfFailed = (noun: string) => `We couldn’t make the PDF. Your ${noun} is still here on this page. You can try again.`;
const notSaving = (noun: string) => `This browser isn’t saving here, so this ${noun} stays only while this page is open. Download the PDF to keep a copy.`;
const pdfMade = "The PDF was made. Look in your downloads.";
const detailsTitle = "How this result was made";

// For a test that draws many screens or makes a real PDF. On a loaded 4-core machine one such test took 9 s, past
// Vitest's 5 s default, while it takes under 2 s on a quiet one.
const manyScreens = 30_000;

// jsdom draws no layout and has no scrollIntoView; each test gets a fresh recorder in its place.
const scrolledIntoView = vi.fn<(this: Element, options?: ScrollIntoViewOptions) => void>();

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  scrolledIntoView.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrolledIntoView });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(preparePdf).mockClear();
  vi.mocked(exportPdf).mockClear();
  pdfFails.next = false;
});

/** jsdom cannot follow a blob link, so the click is caught and each file handed to the download is kept. */
function catchDownloads(): { readonly files: readonly Blob[]; readonly names: readonly string[] } {
  const files: Blob[] = [];
  const names: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(file => {
    if (file instanceof Blob) files.push(file);
    return "blob:gilir-test";
  });
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return { files, names };
}

/** jsdom fires popstate a few timers after history.back(). */
function popped(): Promise<void> {
  return new Promise(resolve => window.addEventListener("popstate", () => resolve(), { once: true }));
}

/** Lets every answer a fake port has already given reach the screen. */
async function settle(): Promise<void> {
  await act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

interface Opened {
  readonly plans: MemoryPlans;
  readonly pdf: PdfPort;
  readonly downloads: readonly string[];
  readonly onChange: ReturnType<typeof vi.fn<(input: FarmInput) => void>>;
  readonly user: ReturnType<typeof userEvent.setup>;
  readonly unmount: () => void;
}

function open(
  given: CompletedSnapshot,
  stored: LocalState | null,
  options: { readonly plans?: MemoryPlans; readonly pdf?: PdfPort; readonly wrap?: (screen: ReactElement) => ReactElement } = {},
): Opened {
  const plans = options.plans ?? memoryPlans(stored);
  const pdf = options.pdf ?? pdfPort();
  const { keeper, downloads } = fakeKeeper(plans, pdf);
  const onChange = vi.fn<(input: FarmInput) => void>();
  const element = <ResultScreen given={given} onChangeInputs={onChange} keeper={keeper} locale="en-GB" />;
  const { unmount } = render(options.wrap ? options.wrap(element) : element);
  return { plans, pdf, downloads, onChange, user: userEvent.setup(), unmount };
}

const inFrame = (element: ReactElement) => <AppFrame focusOnMount>{element}</AppFrame>;

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function noButton(name: string): boolean {
  return screen.queryByRole("button", { name }) === null;
}

function title(): HTMLElement {
  return screen.getByRole("heading", { level: 1 });
}

function sectionTitles(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent ?? "");
}

/** The saved line of the actions card, found by its words. The polite line can say the same words. */
function keptLine(text: string): HTMLElement {
  const line = within(screen.getByRole("region", { name: "What you can do" })).getByText(text).closest("p");
  if (line === null) throw new Error(`No saved line says ${text}`);
  return line;
}

function actionNames(): string[] {
  const card = screen.getByRole("region", { name: "What you can do" });
  return within(card).getAllByRole("button").map(found => found.textContent ?? "");
}

function writes(plans: MemoryPlans) {
  return plans.calls.filter(call => call.kind !== "load");
}

/** The pdfPort shape, answering only when the test says so. */
function gatedPdf() {
  const gate = deferred<Blob>();
  const calls: CompletedSnapshot[] = [];
  const port: PdfPort = {
    calls,
    set: () => undefined,
    exportPdf: snapshot => {
      calls.push(snapshot);
      return gate.promise;
    },
  };
  return { port, gate };
}

/** Each Tab stop inside `root`, by its words, until focus leaves it. */
async function tabStops(user: Opened["user"], root: HTMLElement): Promise<string[]> {
  const stops: string[] = [];
  for (let step = 0; step < 20; step += 1) {
    await user.tab();
    const at = document.activeElement;
    if (!(at instanceof HTMLElement) || !root.contains(at)) break;
    stops.push(at.textContent ?? "");
  }
  return stops;
}

const titles: Record<string, string> = {
  plan: "Keep last year’s rotation",
  plan_with_warnings: "Your plan, with warnings",
  insufficient_data: "We can’t make a plan yet",
  no_calendar_fit: "Your crops don’t all fit in one year",
  search_incomplete: "We couldn’t finish the search",
  service_error: "Something went wrong while making your plan",
  changed: "Your plan",
  skipped: "Your plan",
  no_recommendation: "Your plan",
  several_crops: "Your plan",
  temperature: "Your plan, with warnings",
  context: "Keep last year’s rotation",
  insights: "We can’t make a plan yet",
  structural: "Your crops don’t all fit in one year",
  fatal: "Something went wrong while making your plan",
  run_provenance: "Keep last year’s rotation",
  no_preparation: "Keep last year’s rotation",
  limit_plan: "Keep last year’s rotation",
  no_fit_assessed: "Your crops don’t all fit in one year",
  labels_several: "Your plan",
  labels_changed: "Your plan",
  labels_warnings: "Your plan, with warnings",
};

describe("every state renders", () => {
  it("[R1] each of the six shared snapshots and each variant renders one h1 with its title and no console error", async () => {
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    const drawn: string[] = [];
    for (const { name, snapshot } of everySnapshot()) {
      open(snapshot, null);
      await settle();
      expect(screen.getAllByRole("heading", { level: 1 }).map(heading => heading.textContent), name).toEqual([titles[name]]);
      drawn.push(name);
      cleanup();
    }
    expect(drawn).toEqual(Object.keys(titles));
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  }, manyScreens);

  it("[R2] only plan and plan_with_warnings have the When to plant and harvest card; the four others have no plan or baseline year line", async () => {
    const planOnly = ["When to plant and harvest", "Your rotation, kept", "Why this plan ranked first", "Why your rotation ranked first", "Get ready"];
    for (const [snapshot, timeline] of [[plan, "Your rotation, kept"], [warned, "When to plant and harvest"]] as const) {
      open(snapshot, null);
      await settle();
      const card = screen.getByRole("region", { name: timeline });
      expect(card.querySelectorAll(".rs-year")).toHaveLength(1);
      cleanup();
    }
    for (const state of ["insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const) {
      open(shared(state), null);
      await settle();
      expect(sectionTitles().filter(heading => planOnly.includes(heading)), state).toEqual([]);
      const lines = [...document.querySelectorAll(".rs-year")];
      expect(lines.length, state).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.previousElementSibling?.textContent, state).toBe("What you told us about last year (not scored)");
      }
      cleanup();
    }
  });

  it("[R3] in plan_with_warnings the warning text precedes the timeline in the document (compareDocumentPosition) before details are opened", async () => {
    open(warned, null);
    await settle();
    const risk = screen.getByText("Rain fell short of what synthetic crop needs in past seasons");
    const warning = screen.getByText("In some past seasons, at least one week had less rain than it needs.");
    const timeline = screen.getByRole("heading", { level: 2, name: "When to plant and harvest" });
    expect(title().textContent).toBe("Your plan, with warnings");
    for (const words of [risk, warning]) {
      expect(words.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("[R8][R9] the search-limit note and What we couldn’t check are on the main screen, not only in details", async () => {
    open(warned, null);
    await settle();
    expect(title().textContent).toBe("Your plan, with warnings");
    const ranking = screen.getByRole("region", { name: "Why this plan ranked first" });
    expect(within(ranking).getByText("We stopped at our search limit.")).toBeTruthy();
    expect(within(ranking).getByText(/This is the best plan we found, not proven to be the best\./)).toBeTruthy();
    cleanup();

    open(variant("temperature"), null);
    await settle();
    expect(title().textContent).toBe("Your plan, with warnings");
    const unchecked = screen.getByRole("region", { name: "What we couldn’t check" });
    expect(within(unchecked).getByText("No temperature limits for this crop in this example.")).toBeTruthy();
  });

  it("[R37] the synthetic label is visible on the result and on details", async () => {
    const { user } = open(plan, null);
    await settle();
    const label = "Synthetic test data only. Values are invented and are not farm advice.";
    expect(screen.getByText(label).closest(".rs-head")).not.toBeNull();
    await user.click(button("View details"));
    expect(title().textContent).toBe(detailsTitle);
    expect(screen.getByText(`${label} Use it to see how Gilir works, not to decide what to plant.`)).toBeTruthy();
  });

  it("[R40] the plan fixture’s open row says 361 days, the same value as Longest stretch without a planned crop", async () => {
    open(plan, null);
    await settle();
    const rows = screen.getAllByRole("listitem");
    const longest = rows.find(row => within(row).queryByText("Longest stretch without a planned crop") !== null);
    const gap = rows.find(row => within(row).queryByText("No planned crop") !== null);
    if (longest === undefined || gap === undefined) throw new Error("The ranking row or the open row is missing.");
    expect(within(longest).getByText(/^\d+ days$/).textContent).toBe("361 days");
    expect(within(gap).getByText(/ days$/).textContent).toBe("5 Jul 2026 to 30 Jun 2027 · 361 days");
  });
});

describe("inside F1's frame", () => {
  it("the public Results inside AppFrame focusOnMount: one main, one banner, focus on #main, and Results adds no main of its own", async () => {
    render(inFrame(<Results snapshot={plan} onChangeInputs={() => undefined} />));
    await settle();
    const mains = document.querySelectorAll("main");
    expect(mains).toHaveLength(1);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(document.activeElement).toBe(mains[0]);
    expect(mains[0].id).toBe("main");
    expect(within(mains[0]).getByRole("heading", { level: 1 }).textContent).toBe("Keep last year’s rotation");
    expect(screen.getByRole("status").textContent).toBe(notSaving("plan"));
  });

  it("the server render of Results (renderToString) is empty and the client render shows the h1, so the fixture lab cannot mismatch on hydration", async () => {
    const element = <Results snapshot={warned} onChangeInputs={() => undefined} />;
    const html = renderToString(element);
    expect(html).toBe("");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const mismatches: unknown[] = [];
    const root = await act(async () => hydrateRoot(container, element, { onRecoverableError: error => mismatches.push(error) }));
    expect(await within(container).findByRole("heading", { level: 1, name: "Your plan, with warnings" })).toBeTruthy();
    expect(mismatches).toEqual([]);
    act(() => root.unmount());
    container.remove();
  });

  it("seven Results on one page, as in the fixture lab, have no duplicate element id", async () => {
    const snapshots = [plan, ...everySnapshot().slice(0, 6).map(({ snapshot }) => snapshot)];
    render(
      <div>
        {snapshots.map((snapshot, index) => <Results key={index} snapshot={snapshot} onChangeInputs={() => undefined} />)}
      </div>,
    );
    await settle();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(7);
    const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
    expect(ids.length).toBeGreaterThan(7);
    expect(new Set(ids).size).toBe(ids.length);
    for (const labelled of document.querySelectorAll("[aria-labelledby]")) {
      const target = labelled.getAttribute("aria-labelledby") ?? "";
      expect(document.querySelectorAll(`[id="${target}"]`)).toHaveLength(1);
    }
  }, manyScreens);

  it("a new snapshot id starts a new session: details closes, the alert is gone, storage is read again", async () => {
    const load = vi.spyOn(localPlans, "load");
    pdfFails.next = true;
    const user = userEvent.setup();
    const { rerender } = render(<Results snapshot={plan} onChangeInputs={() => undefined} />);
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    await user.click(button("Download PDF"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(pdfFailed("plan"));
    await user.click(button("View details"));
    expect(title().textContent).toBe(detailsTitle);

    rerender(<Results snapshot={warned} onChangeInputs={() => undefined} />);
    await settle();
    expect(title().textContent).toBe("Your plan, with warnings");
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("actions with fake ports", () => {
  it("[R22] Change my answers calls onChangeInputs once with the shown snapshot’s input, the same object, and writes nothing", async () => {
    const { onChange, plans, user } = open(plan, savedState(plan));
    await settle();
    await user.click(button("Change my answers"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(plan.input);
    expect(writes(plans)).toEqual([]);
  });

  it("[R22] after Open my earlier plan, Change my answers passes the earlier snapshot’s input", async () => {
    const earlier = variant("skipped");
    expect(earlier.input).not.toBe(failed.input);
    const { onChange, user } = open(failed, savedState(earlier));
    await settle();
    await user.click(button("Open my earlier plan"));
    await user.click(button("Change my answers"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(earlier.input);
  });

  it("[R23] Download PDF calls exportPdf with the shown snapshot and downloads a .pdf; the button says Making the PDF… with aria-busy meanwhile and keeps focus", async () => {
    const { port, gate } = gatedPdf();
    const { downloads, user } = open(plan, savedState(plan), { pdf: port });
    await settle();
    const download = button("Download PDF");
    await user.click(download);
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]).toBe(plan);
    expect(download.textContent).toBe("Making the PDF…");
    expect(download.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(download);

    gate.resolve(new Blob(["%PDF-1.7\n%%EOF\n"], { type: "application/pdf" }));
    await settle();
    expect(downloads).toEqual(["gilir-plan-2026-06-30.pdf"]);
    expect(download.textContent).toBe("Download PDF");
    expect(download.getAttribute("aria-busy")).toBeNull();
    expect(document.activeElement).toBe(download);
    expect(screen.getByRole("status").textContent).toBe(pdfMade);
  });

  it("[R23] a second PDF is announced again: the polite line is emptied while the call runs, then says the sentence", async () => {
    const { pdf, user } = open(plan, savedState(plan));
    await settle();
    const status = screen.getByRole("status");
    const heard: string[] = [];
    const watch = new MutationObserver(() => heard.push(status.textContent ?? ""));
    watch.observe(status, { childList: true, characterData: true, subtree: true });
    for (const attempt of [1, 2]) {
      await user.click(button("Download PDF"));
      await settle();
      expect(pdf.calls, `attempt ${attempt}`).toHaveLength(attempt);
    }
    watch.disconnect();
    expect(heard.filter((text, index) => text !== heard[index - 1])).toEqual([pdfMade, "", pdfMade]);
  });

  it("[R23] a same-tick double tap on Download PDF calls exportPdf once", async () => {
    const { pdf, downloads } = open(plan, savedState(plan));
    await settle();
    const download = button("Download PDF");
    act(() => {
      download.click();
      download.click();
    });
    await settle();
    expect(pdf.calls).toHaveLength(1);
    expect(downloads).toHaveLength(1);
  });

  it("[R24] exportPdf rejects: one alert with F3’s words, the h1 and the timeline still there, the button usable again", async () => {
    const { pdf, user } = open(warned, savedState(warned));
    await settle();
    pdf.set("reject");
    await user.click(button("Download PDF"));
    await settle();
    expect(screen.getAllByRole("alert").map(alert => alert.textContent)).toEqual([pdfFailed("plan")]);
    expect(title().textContent).toBe("Your plan, with warnings");
    expect(screen.getByRole("heading", { level: 2, name: "When to plant and harvest" })).toBeTruthy();
    const download = button("Download PDF");
    expect(document.activeElement).toBe(download);
    expect(scrolledIntoView.mock.contexts, "the alert above it pushed the focused button down, so it is brought back into view").toEqual([download]);
    expect(scrolledIntoView.mock.calls).toEqual([[{ block: "nearest" }]]);
    expect(download.getAttribute("aria-busy")).toBeNull();
    expect(download.getAttribute("aria-disabled")).toBeNull();
    expect(document.body.textContent).not.toContain(portMessage);

    pdf.set("work");
    await user.click(download);
    await settle();
    expect(pdf.calls).toHaveLength(2);
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(screen.getByRole("status").textContent).toBe(pdfMade);
  });

  it("[R23][R25] the public Results with the real ports in jsdom: no IndexedDB, so the not-saving note and no Save or Clear; Download PDF makes a real PDF and says so", async () => {
    const { files, names } = catchDownloads();
    const user = userEvent.setup();
    render(<Results snapshot={warned} onChangeInputs={() => undefined} />);
    await settle();
    expect(keptLine(notSaving("plan"))).toBeTruthy();
    expect(noButton("Save on this device")).toBe(true);
    expect(noButton("Clear saved data")).toBe(true);

    await user.click(button("Download PDF"));
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe(pdfMade), { timeout: manyScreens - 5_000 });
    expect(vi.mocked(exportPdf).mock.calls).toEqual([[warned]]);
    expect(names).toEqual(["gilir-plan-2026-06-30.pdf"]);
    const [file] = files;
    expect(file?.type).toBe("application/pdf");
    expect(new TextDecoder().decode(new Uint8Array(await (file ?? new Blob()).arrayBuffer()).subarray(0, 5))).toBe("%PDF-");
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(title().textContent).toBe("Your plan, with warnings");
  }, manyScreens);

  it("the public Results calls preparePdf once when it mounts, before any tap, and not again for a new snapshot", async () => {
    const { rerender } = render(<Results snapshot={warned} onChangeInputs={() => undefined} />);
    await settle();
    expect(preparePdf).toHaveBeenCalledTimes(1);
    expect(exportPdf).not.toHaveBeenCalled();
    rerender(<Results snapshot={plan} onChangeInputs={() => undefined} />);
    await settle();
    expect(title().textContent).toBe("Keep last year’s rotation");
    expect(preparePdf).toHaveBeenCalledTimes(1);
  });

  it("[R25] load resolves the same id: Saved on this device. Another id or null: not saved, with Save on this device", async () => {
    open(plan, savedState(plan));
    await settle();
    expect(keptLine("Saved on this device.")).toBeTruthy();
    expect(noButton("Save on this device")).toBe(true);
    cleanup();

    for (const stored of [savedState(warned), null]) {
      open(plan, stored);
      await settle();
      const line = keptLine("This plan isn’t saved on this device.");
      expect(within(line).getByRole("button", { name: "Save on this device" })).toBeTruthy();
      expect(screen.queryByText("Saved on this device.")).toBeNull();
      cleanup();
    }
  });

  it("[R25] load rejects: the not-saving note, no saved claim, no Save or Clear, Download PDF still there, and the polite line says it once", async () => {
    const plans = memoryPlans(savedState(plan));
    plans.set("load", "reject");
    open(plan, null, { plans, wrap: element => <StrictMode>{element}</StrictMode> });
    await settle();
    expect(keptLine(notSaving("plan"))).toBeTruthy();
    expect(screen.queryByText(/Saved on this device|is saved on this device/)).toBeNull();
    expect(noButton("Save on this device")).toBe(true);
    expect(noButton("Clear saved data")).toBe(true);
    expect(button("Download PDF")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(notSaving("plan"));
    expect(writes(plans)).toEqual([]);
  });

  it("[R25] a newer Gilir refuses the first read: the line and the polite line say so in F4’s words, then that the PDF keeps a copy, with no Save or Clear", async () => {
    const plans = memoryPlans(savedState(plan));
    plans.set("load", "newer");
    open(missing, null, { plans });
    await settle();
    const words = "Gilir has a newer version. Close this page and open Gilir again to see what you saved. This result stays here while this page is open. Download the PDF to keep a copy.";
    expect(keptLine(words)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(words);
    expect(document.body.textContent).not.toContain("This browser isn’t saving here");
    expect(noButton("Save on this device")).toBe(true);
    expect(noButton("Clear saved data")).toBe(true);
    expect(writes(plans)).toEqual([]);
  });

  it("[R25][R27] Save on this device saves the loaded state with only the snapshot replaced (recording fake), then the line reads Saved on this device. and has focus", async () => {
    const stored: LocalState = {
      draft: { water: "unsure" },
      step: 3,
      activeJob: { jobId: "8b0f6a3e-2f8e-4b51-9a57-1f0c1b7c2d10", token: "synthetic-local-fixture-token" },
      snapshot: warned,
    };
    const { plans, user } = open(plan, stored);
    await settle();
    await user.click(button("Save on this device"));
    await settle();
    expect(plans.calls.map(call => call.kind)).toEqual(["load", "load", "save"]);
    expect(writes(plans)).toEqual([{ kind: "save", state: { ...stored, snapshot: plan } }]);
    expect(document.activeElement).toBe(keptLine("Saved on this device."));
    expect(noButton("Save on this device")).toBe(true);
  });

  it("[R25] a rejected save shows the save alert and the result stays readable", async () => {
    const plans = memoryPlans(savedState(warned));
    const { user } = open(plan, null, { plans });
    await settle();
    plans.set("save", "reject");
    await user.click(button("Save on this device"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(
      "We couldn’t save this on this device. It stays here while this page is open. Download the PDF to keep a copy.",
    );
    expect(title().textContent).toBe("Keep last year’s rotation");
    expect(screen.getByRole("heading", { level: 2, name: "Your rotation, kept" })).toBeTruthy();
    expect(keptLine("This plan isn’t saved on this device.")).toBeTruthy();
    expect(document.activeElement).toBe(button("Save on this device"));
    expect(plans.held()?.snapshot).toBe(warned);
  });

  it("[R26] Clear saved data calls clear, the line reads Your saved answers and plan are cleared. … with Undo, focus is on the line, and the result is still on the page", async () => {
    const { plans, user } = open(plan, savedState(plan));
    await settle();
    await user.click(button("Clear saved data"));
    await settle();
    expect(writes(plans)).toEqual([{ kind: "clear" }]);
    expect(plans.held()).toBeNull();
    const line = keptLine("Your saved answers and plan are cleared. This plan stays on this page until you leave it.");
    expect(document.activeElement).toBe(line);
    expect(within(line).getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(noButton("Clear saved data")).toBe(true);
    expect(title().textContent).toBe("Keep last year’s rotation");
    expect(screen.getByRole("heading", { level: 2, name: "Your rotation, kept" })).toBeTruthy();
  });

  it("[R26] Undo saves the earlier state back and the line reads Saved on this device. again; Undo stays while focused and after any wait", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stored = savedState(plan);
    const { plans, user } = open(plan, stored);
    await settle();
    await user.click(button("Clear saved data"));
    await settle();
    const undo = button("Undo");
    undo.focus();
    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(button("Undo")).toBe(undo);
    expect(document.activeElement).toBe(undo);

    await user.click(undo);
    await settle();
    expect(writes(plans)).toEqual([{ kind: "clear" }, { kind: "save", state: stored }]);
    expect(plans.held()).toBe(stored);
    expect(document.activeElement).toBe(keptLine("Saved on this device."));
    expect(noButton("Undo")).toBe(true);
    expect(button("Clear saved data")).toBeTruthy();
  });

  it("[R26] Undo after something else was saved since the clear: that is kept, nothing is written, the alert says so and focus is on the saved line", async () => {
    const { plans, user } = open(plan, savedState(plan));
    await settle();
    await user.click(button("Clear saved data"));
    await settle();
    const since = savedState(warned);
    await plans.save(since);
    await user.click(button("Undo"));
    await settle();
    expect(plans.held()).toBe(since);
    expect(writes(plans)).toEqual([{ kind: "clear" }, { kind: "save", state: since }]);
    expect(screen.getByRole("alert").textContent).toBe(
      "Something was saved on this device after you cleared it. We kept it, so your earlier answers and plan were not put back.",
    );
    const line = keptLine("This plan isn’t saved on this device.");
    expect(document.activeElement).toBe(line);
    expect(noButton("Undo")).toBe(true);
    expect(within(line).getByRole("button", { name: "Save on this device" })).toBeTruthy();
  });

  it("[R26] a clear while F4 holds saved data it could not open says that was cleared too and Undo can’t bring it back; Undo still puts the plan back", async () => {
    const stored = savedState(plan);
    const plans = memoryPlans(stored);
    plans.holdSetAside();
    const { user } = open(plan, null, { plans });
    await settle();
    await user.click(button("Clear saved data"));
    await settle();
    const line = keptLine(
      "Your saved answers and plan are cleared. This plan stays on this page until you leave it. Saved data this version of Gilir couldn’t open was cleared too. Undo can’t bring that back.",
    );
    expect(document.activeElement).toBe(line);
    await expect(plans.notice()).resolves.toBeNull();
    await user.click(within(line).getByRole("button", { name: "Undo" }));
    await settle();
    expect(plans.held()).toBe(stored);
    expect(document.activeElement).toBe(keptLine("Saved on this device."));
  });

  it("[R25] a full device: the save alert names it in F4’s words and still says to download the PDF", async () => {
    const plans = memoryPlans(null);
    const { user } = open(plan, null, { plans });
    await settle();
    plans.set("save", "full");
    await user.click(button("Save on this device"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(
      "This device has no room left to save Gilir. This plan stays here while this page is open. Download the PDF to keep a copy.",
    );
    expect(document.body.textContent).not.toContain(portMessage);
    expect(keptLine("This plan isn’t saved on this device.")).toBeTruthy();
  });

  it("[R26] a newer Gilir refuses the clear: the alert says the data is still here and how to see it", async () => {
    const stored = savedState(plan);
    const plans = memoryPlans(stored);
    const { user } = open(plan, null, { plans });
    await settle();
    plans.set("clear", "newer");
    await user.click(button("Clear saved data"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe(
      "We couldn’t clear the saved data. It is still on this device. Gilir has a newer version. Close this page and open Gilir again to see what you saved.",
    );
    expect(plans.held()).toBe(stored);
  });

  it("[R26] a rejected clear shows the clear alert, offers no Undo, and the saved line is unchanged", async () => {
    const stored = savedState(plan);
    const plans = memoryPlans(stored);
    const { user } = open(plan, null, { plans });
    await settle();
    plans.set("clear", "reject");
    await user.click(button("Clear saved data"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("We couldn’t clear the saved data. It is still on this device.");
    expect(noButton("Undo")).toBe(true);
    expect(keptLine("Saved on this device.")).toBeTruthy();
    expect(document.activeElement).toBe(button("Clear saved data"));
    expect(plans.held()).toBe(stored);
  });

  it("while one port call runs the other port buttons are aria-disabled and do nothing; View details and Change my answers still work", async () => {
    const { plans, pdf, onChange, user } = open(plan, savedState(warned));
    await settle();
    pdf.set("hang");
    await user.click(button("Download PDF"));
    const busy = button("Making the PDF…");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    for (const name of ["Save on this device", "Clear saved data"]) {
      const waiting = button(name);
      expect(waiting.getAttribute("aria-disabled"), name).toBe("true");
      expect(waiting.hasAttribute("disabled"), name).toBe(false);
      await user.click(waiting);
    }
    await settle();
    expect(writes(plans)).toEqual([]);
    expect(pdf.calls).toHaveLength(1);
    expect(button("Making the PDF…")).toBe(busy);

    for (const name of ["View details", "Change my answers"]) expect(button(name).getAttribute("aria-disabled"), name).toBeNull();
    await user.click(button("Change my answers"));
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.click(button("View details"));
    expect(title().textContent).toBe(detailsTitle);
  });

  it("no storage write happens without a tap: mounting, Strict Mode double effects and unmounting call load only", async () => {
    const { plans, unmount } = open(plan, savedState(warned), { wrap: element => <StrictMode>{element}</StrictMode> });
    await settle();
    expect(keptLine("This plan isn’t saved on this device.")).toBeTruthy();
    unmount();
    await settle();
    expect(plans.calls.length).toBeGreaterThan(0);
    expect(writes(plans)).toEqual([]);
  });

  it("an answer that arrives after unmount changes nothing and logs nothing", async () => {
    const load = deferred<LocalState | null>();
    const made = deferred<Blob>();
    const plans: LocalPlans = { load: () => load.promise, save: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) };
    const keeper = createKeeper({ plans, exportPdf: () => made.promise, storageProblem, notice: () => Promise.resolve(null) });
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    const user = userEvent.setup();
    const { unmount } = render(<ResultScreen given={plan} onChangeInputs={() => undefined} keeper={keeper} locale="en-GB" />);
    await user.click(button("Download PDF"));
    unmount();

    load.resolve(savedState(warned));
    made.reject(new Error(`PDF: ${portMessage}.`));
    await settle();
    expect(document.body.textContent).toBe("");
    expect(plans.save).not.toHaveBeenCalled();
    expect(plans.clear).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });
});

describe("an earlier plan beside a service_error", () => {
  const earlier: CompletedSnapshot = { ...plan, id: "synthetic-earlier-plan", completedAt: "2026-05-20T18:00:00Z" };

  it("[R28] service_error with the plan fixture saved under another id: This result isn’t saved. Your earlier plan, made 30 Jun 2026, is still saved on this device. and Open my earlier plan", async () => {
    open(failed, savedState(plan));
    await settle();
    expect(keptLine("This result isn’t saved. Your earlier plan, made 30 Jun 2026, is still saved on this device.")).toBeTruthy();
    expect(actionNames()).toEqual(["Change my answers", "Open my earlier plan", "Download PDF", "View details", "Clear saved data"]);
  });

  it("[R28] Open my earlier plan shows that plan with its own Made date, focus on its h1, and the line reads Saved on this device.", async () => {
    const { user } = open(failed, savedState(earlier));
    await settle();
    expect(keptLine("This result isn’t saved. Your earlier plan, made 20 May 2026, is still saved on this device.")).toBeTruthy();
    await user.click(button("Open my earlier plan"));
    const heading = title();
    expect(heading.textContent).toBe("Keep last year’s rotation");
    expect(document.activeElement).toBe(heading);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    expect(screen.getByText("Synthetic example field · Made 20 May 2026")).toBeTruthy();
    expect(keptLine("Saved on this device.")).toBeTruthy();
    expect(noButton("Open my earlier plan")).toBe(true);
  });

  it("[R28] F3 never saves the error: no save call in the whole flow", async () => {
    const alone = open(failed, null);
    await settle();
    expect(keptLine("This result isn’t saved on this device.")).toBeTruthy();
    expect(noButton("Save on this device")).toBe(true);
    expect(writes(alone.plans)).toEqual([]);
    cleanup();

    const { plans, user } = open(failed, savedState(earlier));
    await settle();
    expect(noButton("Save on this device")).toBe(true);
    await user.click(button("Download PDF"));
    await settle();
    await user.click(button("Open my earlier plan"));
    await user.click(button("Download PDF"));
    await settle();
    expect(noButton("Save on this device")).toBe(true);
    expect(plans.calls.filter(call => call.kind === "save")).toEqual([]);
    expect(plans.held()?.snapshot).toBe(earlier);
  });

  it("[R28] load rejects: nothing about an earlier plan is said", async () => {
    const plans = memoryPlans(savedState(plan));
    plans.set("load", "reject");
    open(failed, null, { plans });
    await settle();
    expect(keptLine(notSaving("result"))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/earlier/i);
    expect(noButton("Open my earlier plan")).toBe(true);
  });

  it("[R29] no failure code or raw message is on the result page", async () => {
    const cases = [
      { snapshot: failed, code: "retrieval_failed", message: "Example source did not respond.", words: "We couldn’t get the weather records this time. It wasn’t anything you did." },
      { snapshot: variant("fatal"), code: "processing_failed", message: "Example processing failure.", words: "The plan couldn’t be finished. It wasn’t anything you did." },
    ];
    for (const { snapshot, code, message, words } of cases) {
      open(snapshot, null);
      await settle();
      const text = document.body.textContent ?? "";
      expect(text, code).toContain(words);
      expect(text, code).not.toContain(code);
      expect(text, code).not.toContain(message);
      cleanup();
    }
  });
});

describe("View details and the keyboard", () => {
  it("[R34] Tab from #main reaches the actions in order for a plan: Download PDF, View details, Change my answers, Clear saved data; nothing in the head, warnings, year line or ranking is a stop", async () => {
    const { user } = open(warned, savedState(warned), { wrap: inFrame });
    await settle();
    const main = document.querySelector("main");
    if (main === null) throw new Error("AppFrame drew no main.");
    expect(document.activeElement).toBe(main);
    expect(screen.getByRole("region", { name: "What we flagged" })).toBeTruthy();
    expect(await tabStops(user, main)).toEqual(["Download PDF", "View details", "Change my answers", "Clear saved data"]);
  });

  it("[R34] Tab order for a no-plan result starts with Change my answers", async () => {
    const { user } = open(missing, savedState(missing), { wrap: inFrame });
    await settle();
    const main = document.querySelector("main");
    if (main === null) throw new Error("AppFrame drew no main.");
    expect(await tabStops(user, main)).toEqual(["Change my answers", "Download PDF", "View details", "Clear saved data"]);
  });

  it("[R34] Enter on View details shows How this result was made with focus on its h1, and the result’s sections are gone", async () => {
    const { user } = open(warned, savedState(warned));
    await settle();
    button("View details").focus();
    await user.keyboard("{Enter}");
    const heading = title();
    expect(heading.textContent).toBe(detailsTitle);
    expect(document.activeElement).toBe(heading);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    for (const gone of ["What we flagged", "When to plant and harvest", "What you can do", "Why this plan ranked first"]) {
      expect(screen.queryByRole("heading", { name: gone }), gone).toBeNull();
    }
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("[R34] Back to the result (top or bottom) returns to the result with focus on View details", async () => {
    for (const which of [0, 1]) {
      const { user } = open(warned, savedState(warned));
      await settle();
      await user.click(button("View details"));
      const backs = screen.getAllByRole("button", { name: "Back to the result" });
      expect(backs).toHaveLength(2);
      expect(backs[0].compareDocumentPosition(title()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(backs[1].compareDocumentPosition(title()) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      backs[which].focus();
      await user.keyboard("{Enter}");
      expect(title().textContent, `back ${which}`).toBe("Your plan, with warnings");
      expect(document.activeElement, `back ${which}`).toBe(button("View details"));
      cleanup();
    }
  });

  it("[R34] the phone’s Back on View details returns to the result with focus on View details, and Back to the result leaves no history entry behind", async () => {
    history.replaceState(null, "");
    const { user } = open(warned, savedState(warned));
    await settle();
    const before = { state: history.state as unknown };
    await user.click(button("View details"));
    expect(title().textContent).toBe(detailsTitle);
    expect(history.state).not.toEqual(before.state);
    await act(async () => {
      history.back();
      await popped();
    });
    expect(title().textContent).toBe("Your plan, with warnings");
    expect(document.activeElement).toBe(button("View details"));
    expect(history.state).toEqual(before.state);

    await user.click(button("View details"));
    const leftDetails = popped();
    await user.click(screen.getAllByRole("button", { name: "Back to the result" })[0]);
    expect(title().textContent).toBe("Your plan, with warnings");
    await act(() => leftDetails);
    expect(history.state).toEqual(before.state);
    expect(title().textContent).toBe("Your plan, with warnings");
  });

  it("[R34] back from View details returns the page to where the farmer left it", async () => {
    const { user } = open(warned, savedState(warned));
    await settle();
    const scrolled = vi.spyOn(window, "scrollY", "get").mockReturnValue(1234);
    await user.click(button("View details"));
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    scrolled.mockReturnValue(4321);
    await user.click(screen.getAllByRole("button", { name: "Back to the result" })[1]);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 1234 });
    expect(document.activeElement).toBe(button("View details"));
  });

  it("[R19] details show sources, profiles, assumptions, metrics with units and denominators, and method versions for the plan fixture", async () => {
    const { user } = open(plan, null);
    await settle();
    await user.click(button("View details"));
    expect(sectionTitles()).toEqual([
      "The numbers behind the ranking",
      "How the numbers are worked out",
      "Rain and temperature by month",
      "Past seasons used",
      "Where the data comes from",
      "Crop profiles and rules",
      "How far the search went",
      "Assumptions",
      "Method versions",
      "Your answers",
    ]);
    const region = (name: string) => screen.getByRole("region", { name });
    expect(within(region("Where the data comes from")).getByText("No sources are recorded for this result.")).toBeTruthy();
    expect(within(region("Crop profiles and rules")).getByText("Profile synthetic-profile, version synthetic-v1.")).toBeTruthy();
    expect(within(region("Assumptions")).getByText("Synthetic test data only. Values are invented and are not farm advice.")).toBeTruthy();
    const numbers = region("The numbers behind the ranking");
    expect(within(numbers).getByText("unplanted_days = 361 days")).toBeTruthy();
    expect(within(numbers).getByText("Out of")).toBeTruthy();
    expect(within(numbers).getByText("1 season")).toBeTruthy();
    expect(within(numbers).getByText("Method version").nextElementSibling?.textContent).toBe("synthetic-v1");
    expect(within(region("Method versions")).getByText("Engine").nextElementSibling?.textContent).toBe("synthetic-engine");
  });

  it("[R34] Enter and Space activate Download PDF and Change my answers; focus never falls to body after any action", async () => {
    const { pdf, onChange, user } = open(plan, savedState(warned));
    await settle();
    const stays = (label: string) => {
      expect(document.activeElement, label).not.toBe(document.body);
      expect(document.activeElement, label).not.toBeNull();
    };

    const download = button("Download PDF");
    download.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(pdf.calls).toHaveLength(1);
    await user.keyboard(" ");
    await settle();
    expect(pdf.calls).toHaveLength(2);
    expect(document.activeElement).toBe(download);

    const change = button("Change my answers");
    change.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls.every(([input]) => input === plan.input)).toBe(true);
    expect(document.activeElement).toBe(change);

    for (const [name, key] of [["View details", "{Enter}"], ["Back to the result", " "], ["Save on this device", "{Enter}"], ["Clear saved data", " "], ["Undo", "{Enter}"]] as const) {
      screen.getAllByRole("button", { name })[0].focus();
      await user.keyboard(key);
      await settle();
      stays(name);
    }
    expect(keptLine("Saved on this device.")).toBe(document.activeElement);
  });

  it("the alert has role alert; the polite line has role status and is present from the first render", async () => {
    const { pdf, user } = open(plan, savedState(plan));
    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
    expect(alert.textContent).toBe("");
    await settle();

    pdf.set("reject");
    await user.click(button("Download PDF"));
    await settle();
    expect(screen.getByRole("alert")).toBe(alert);
    expect(alert.textContent).toBe(pdfFailed("plan"));

    pdf.set("work");
    await user.click(button("Download PDF"));
    await settle();
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe(pdfMade);
    expect(alert.textContent).toBe("");
  });
});
