// @vitest-environment jsdom
// The Terrace frame: top bar, tools, notices, focus and landmarks, through the frame components themselves.
// What Onboarding does with them (which notice is up, where focus goes after Next) is tested in the other ui files.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyReading, readingHeadScript, readingKey } from "@/features/onboarding/services/reading";
import type { ReadingPrefs } from "@/features/onboarding/services/reading";
import { storageLine } from "@/features/onboarding/services/saved";
import { AppFrame, Broken, Opening, PlainFrame, Sheet, StatusBars, StatusLine, StepFrame, ToastBar } from "@/features/onboarding/views/frame";
import { stubSpeech } from "../support/harness";

const root = document.documentElement;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  root.removeAttribute("style");
  root.removeAttribute("class");
  root.removeAttribute("data-contrast");
  localStorage.clear();
});

function page(step: 1 | 2 | 3 | 4, title: string, extra: { readonly onNext?: () => void; readonly lead?: string } = {}): ReactElement {
  return (
    <StepFrame
      step={step}
      title={title}
      lead={extra.lead}
      onBack={step === 1 ? null : () => undefined}
      dock={<button className="btn btn-primary btn-block" type="button" onClick={extra.onNext}>Next: crops</button>}
    >
      <p data-say="">Rain only</p>
    </StepFrame>
  );
}

const quiet = { keptNewer: false } as const;

function htmlState() {
  return {
    scale: root.style.getPropertyValue("--scale"),
    bigText: root.classList.contains("big-text"),
    contrast: root.getAttribute("data-contrast"),
  };
}

function resetHtml(): void {
  root.removeAttribute("style");
  root.removeAttribute("class");
  root.removeAttribute("data-contrast");
}

describe("frame", () => {
  it("[L3] no frame moves focus on first paint, and each screen has one focusable #main-title h1 for the page-change focus", () => {
    const { rerender } = render(page(1, "Where is your farm?"));
    expect(document.activeElement).toBe(document.body);
    rerender(page(2, "Which crops do you want to grow?"));
    expect(document.activeElement).toBe(document.body);
    expect(document.querySelectorAll("#main-title")).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1 });
    expect([title.id, title.tabIndex, title.textContent]).toEqual(["main-title", -1, "Which crops do you want to grow?"]);
    title.focus();
    expect(document.activeElement).toBe(title);

    for (const screenOf of [<PlainFrame key="plain" onBack={null}><h1>Making your plan</h1></PlainFrame>, <AppFrame key="app"><h1>Your plan</h1></AppFrame>, <Opening key="opening" />]) {
      cleanup();
      render(screenOf);
      expect(document.activeElement).toBe(document.body);
    }
  });

  it("AppFrame with focusOnMount moves focus to #main when the plan replaces the inputs, so focus never drops to the page", () => {
    render(<AppFrame focusOnMount><h1>Your plan</h1></AppFrame>);
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(document.activeElement?.id).toBe("main");
  });

  it("every F1 screen has one <main id=\"main\">, and the dock with the primary button is inside it as region Next step", () => {
    render(page(2, "Which crops do you want to grow?"));
    const mains = screen.getAllByRole("main");
    expect(mains.map(main => main.id)).toEqual(["main"]);
    const region = screen.getByRole("region", { name: "Next step" });
    expect(mains[0]!.contains(region)).toBe(true);
    expect(within(region).getByRole("button", { name: "Next: crops" })).toBeTruthy();
    expect(mains[0]!.contains(screen.getByRole("banner"))).toBe(false);

    for (const screenOf of [<PlainFrame key="plain" onBack={null}><h1>Making your plan</h1></PlainFrame>, <AppFrame key="app"><h1>Your plan</h1></AppFrame>, <Opening key="opening" />]) {
      cleanup();
      render(screenOf);
      expect(screen.getAllByRole("main").map(main => main.id)).toEqual(["main"]);
      expect(screen.queryByRole("region", { name: "Next step" })).toBeNull();
    }
  });

  it("the step head says Step N of 4 with the page's name, and pages 2 to 4 have Back where page 1 shows the brand", () => {
    const { rerender } = render(page(1, "Where is your farm?"));
    expect(document.querySelector(".stepcount")?.textContent).toBe("Step 1 of 4 · Your farm");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(within(screen.getByRole("banner")).getByText("Gilir")).toBeTruthy();
    rerender(page(4, "Your rotation"));
    expect(document.querySelector(".stepcount")?.textContent).toBe("Step 4 of 4 · Your rotation");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("[B3] a failing storage shows one quiet line (role status) with F4's reason, that answers stay while the page is open, and Got it; Next still works", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <>
        <StatusBars notices={quiet} onDismiss={vi.fn()} />
        {page(1, "Where is your farm?", { onNext })}
      </>,
    );
    act(() => storageLine.failed({ reason: "full", text: "This device has no room left to save Gilir." }));
    const lines = screen.getAllByRole("status").filter(line => line.textContent?.includes("This device has no room left to save Gilir."));
    expect(lines.map(line => line.textContent)).toEqual(["This device has no room left to save Gilir. Your answers stay while this page is open.Got it"]);
    await user.click(within(lines[0]!).getByRole("button", { name: "Got it" }));
    expect(document.activeElement?.id).toBe("main-title");
    expect(screen.queryByText(/no room left/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next: crops" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("[C6] Change inputs over newer answers shows We kept the answers you changed after that plan was made.", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<StatusBars notices={{ keptNewer: true }} onDismiss={onDismiss} />);
    const line = screen.getByRole("status");
    expect(line.textContent).toContain("We kept the answers you changed after that plan was made.");
    await user.click(within(line).getByRole("button", { name: "Got it" }));
    expect(onDismiss.mock.calls).toEqual([["keptNewer"]]);
  });

  it("the toast with Undo stays 15 s and pauses while focused or hovered; Undo calls back once", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const onUndo = vi.fn();
    render(<ToastBar text="Rice removed" onUndo={onUndo} onDone={onDone} />);
    act(() => void vi.advanceTimersByTime(14_999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();

    onDone.mockClear();
    render(<ToastBar text="Rice removed" onUndo={onUndo} onDone={onDone} />);
    const undo = screen.getByRole("button", { name: "Undo" });
    const toast = undo.parentElement!;
    fireEvent.mouseEnter(toast);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toast);
    act(() => undo.focus());
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onDone).not.toHaveBeenCalled();
    act(() => undo.blur());
    act(() => void vi.advanceTimersByTime(14_999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);

    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("a toast without Undo stays 7 s and has no button", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<ToastBar text="The 12 months are full. Change the dates of a crop first." onUndo={null} onDone={onDone} />);
    expect(screen.queryByRole("button")).toBeNull();
    act(() => void vi.advanceTimersByTime(6_999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("the status line is one polite region that exists before it speaks, so a later sentence is announced", () => {
    const { rerender } = render(<StatusLine said="" />);
    const line = screen.getByRole("status");
    expect(line.getAttribute("aria-live")).toBe("polite");
    rerender(<StatusLine said="Step 2 of 3: Getting NASA weather records for your area." />);
    expect(screen.getByRole("status")).toBe(line);
    expect(line.textContent).toBe("Step 2 of 3: Getting NASA weather records for your area.");
  });

  it("an offline event shows the offline line; an online event hides it", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<StatusBars notices={quiet} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/offline/)).toBeNull();
    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status").textContent).toBe("You’re offline. Your answers stay on this page.");
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.queryByText(/offline/)).toBeNull();
  });

  it("a sheet takes focus, keeps Tab inside, closes on Escape and returns focus to returnTo, else to its opener", async () => {
    const user = userEvent.setup();
    function Host(props: { readonly returnTo: string | null }) {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" id="ly-h-rice-start">Rice: planting day</button>
          <button type="button" onClick={() => setOpen(true)}>Change dates</button>
          {open ? (
            <Sheet title="Change dates: Rice" returnTo={props.returnTo} onClose={() => setOpen(false)}>
              <label>Planted <input type="date" data-autofocus="" /></label>
              <button type="button">Save dates</button>
            </Sheet>
          ) : null}
        </>
      );
    }
    render(<Host returnTo="ly-h-rice-start" />);
    await user.click(screen.getByRole("button", { name: "Change dates" }));
    const dialog = screen.getByRole("dialog", { name: "Change dates: Rice" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Planted"));
    within(dialog).getByRole("button", { name: "Save dates" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Save dates" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rice: planting day" }));

    cleanup();
    render(<Host returnTo={null} />);
    const opener = screen.getByRole("button", { name: "Change dates" });
    await user.click(opener);
    await user.click(document.querySelector(".scrim")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("[B1] the Opening screen hydrates its prerendered HTML without a mismatch, and Listen appears after hydration", async () => {
    const html = renderToString(<Opening />);
    stubSpeech();
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const mismatches: unknown[] = [];
    const hydrated = await act(async () => hydrateRoot(container, <Opening />, { onRecoverableError: error => void mismatches.push(error) }));
    expect(mismatches).toEqual([]);
    expect(within(container).getByRole("heading", { level: 1 }).textContent).toBe("Opening Gilir…");
    expect(within(container).getByRole("button", { name: "Listen" })).toBeTruthy();
    act(() => hydrated.unmount());
    container.remove();
  });

  it("a screen that throws shows Something went wrong on our side with Open Gilir again, and takes focus", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Crash(): ReactElement {
      throw new Error("draw failed");
    }
    const { rerender } = render(<Broken><p>Where is your farm?</p></Broken>);
    rerender(<Broken><Crash /></Broken>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong on our side");
    expect(screen.getByRole("button", { name: "Open Gilir again" })).toBeTruthy();
    expect(document.activeElement?.id).toBe("main-title");
  });
});

describe("tools", () => {
  it("[L6] Text size offers Normal, Large and Largest and High contrast; choosing Largest sets --scale 1.36 and .big-text on <html> and writes gilir.reading", async () => {
    const user = userEvent.setup();
    render(<AppFrame><h1>Your plan</h1></AppFrame>);
    const opener = screen.getByRole("button", { name: "Text size" });
    expect(opener.getAttribute("aria-haspopup")).toBe("dialog");
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Text size" });
    const radio = (name: string) => within(dialog).getByRole("radio", { name }) as HTMLInputElement;
    expect([radio("Normal").checked, radio("Large").checked, radio("Largest").checked]).toEqual([true, false, false]);
    expect(document.activeElement).toBe(radio("Normal"));

    await user.click(radio("Largest"));
    expect(htmlState()).toEqual({ scale: "1.36", bigText: true, contrast: null });
    expect(JSON.parse(localStorage.getItem("gilir.reading") ?? "null")).toEqual({ textSize: "largest", highContrast: false });

    const contrast = within(dialog).getByRole("switch", { name: /High contrast/ }) as HTMLInputElement;
    expect(contrast.checked).toBe(false);
    await user.click(contrast);
    expect(htmlState()).toEqual({ scale: "1.36", bigText: true, contrast: "high" });
    expect(JSON.parse(localStorage.getItem("gilir.reading") ?? "null")).toEqual({ textSize: "largest", highContrast: true });

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);

    await user.click(opener);
    expect((screen.getByRole("radio", { name: "Largest" }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Largest" }));
    await user.click(screen.getByRole("radio", { name: "Normal" }));
    expect(htmlState()).toEqual({ scale: "1", bigText: false, contrast: "high" });
  });

  it("[L6] Listen is absent when speechSynthesis is missing (jsdom), speaks the [data-say] texts in #main when a stub is present, and is a plain button named Listen or Stop", async () => {
    const user = userEvent.setup();
    const water = () => page(3, "Where does your water come from?", { lead: "We plan with rain alone." });
    render(water());
    expect(screen.queryByRole("button", { name: "Listen" })).toBeNull();
    cleanup();

    const { spoken, synth } = stubSpeech();
    const { unmount } = render(water());
    const listen = screen.getByRole("button", { name: "Listen" });
    expect(listen.hasAttribute("aria-pressed")).toBe(false);
    await user.click(listen);
    expect(spoken.map(utterance => utterance.text)).toEqual(["Where does your water come from? We plan with rain alone. Rain only."]);
    expect(screen.getByRole("button", { name: "Stop" }).hasAttribute("aria-pressed")).toBe(false);
    act(() => spoken[0]!.onend?.());
    expect(screen.getByRole("button", { name: "Listen" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Listen" }));
    synth.cancel.mockClear();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Listen" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Listen" }));
    synth.cancel.mockClear();
    unmount();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("a blocked localStorage (getItem throws) leaves Normal size and no crash", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => new Function(readingHeadScript)()).not.toThrow();
    expect(htmlState()).toEqual({ scale: "", bigText: false, contrast: null });
    render(<AppFrame><h1>Your plan</h1></AppFrame>);
    await user.click(screen.getByRole("button", { name: "Text size" }));
    expect((screen.getByRole("radio", { name: "Normal" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Large" }));
    expect(htmlState()).toEqual({ scale: "1.18", bigText: true, contrast: null });
  });

  it("the reading head script built from readingKey and textScale sets the same attributes as applyReading", () => {
    const choices: ReadingPrefs[] = (["normal", "large", "largest"] as const).flatMap(textSize => [
      { textSize, highContrast: false },
      { textSize, highContrast: true },
    ]);
    const byScript = choices.map(prefs => {
      resetHtml();
      localStorage.setItem(readingKey, JSON.stringify(prefs));
      new Function(readingHeadScript)();
      return htmlState();
    });
    const byApply = choices.map(prefs => {
      resetHtml();
      applyReading(prefs);
      return htmlState();
    });
    expect(byScript).toEqual(byApply);
    expect(byScript[5]).toEqual({ scale: "1.36", bigText: true, contrast: "high" });
    expect(byScript[0]).toEqual({ scale: "1", bigText: false, contrast: null });
  });
});
