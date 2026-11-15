// @vitest-environment jsdom
// The corner list: the keyboard and screen-reader way to do everything the map does, and the coordinate entry.
// Rendered through <FieldPicker>, so the list is tested with the picker it talks to. No key; jsdom has no WebGL2, so
// the real globe cannot start and the drawing stands in. One case holds the globe in "starting", as on a slow phone,
// because only a list beside a globe can be closed.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FarmInput, LngLat } from "@/contracts";
import type { GlobeOptions } from "@/features/location/globe";
import { inputFixture } from "@/fixtures/input";
import { FieldPicker } from "@/features/location";
import { startGlobe } from "@/features/location/globe";
import { bad, circle, fieldIssues, good, policy, strictlyInside } from "../support/shapes";

type Field = FarmInput["field"];
type User = ReturnType<typeof userEvent.setup>;

vi.mock("@/features/location/globe", async importOriginal => {
  const real = await importOriginal<typeof import("@/features/location/globe")>();
  return { ...real, startGlobe: vi.fn(real.startGlobe) };
});

const realStart = (await vi.importActual<typeof import("@/features/location/globe")>("@/features/location/globe")).startGlobe;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new TypeError("no network in this test");
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.mocked(startGlobe).mockImplementation(realStart);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mount(value: Field | null = null) {
  const onChange = vi.fn<(field: Field) => void>();
  const view = render(<StrictMode><FieldPicker value={value} onChange={onChange} /></StrictMode>);
  return { onChange, ...view };
}

const drawing = () => screen.findByRole("img", { name: /^Drawing of your field/ }, { timeout: 10_000 });
const theList = () => screen.getByRole("region", { name: "Type the corners of your field" });
const group = (n: number) => within(screen.getByRole("group", { name: `Corner ${n}` }));
const input = (n: number, axis: "Latitude" | "Longitude") => group(n).getByRole("textbox", { name: axis }) as HTMLInputElement;
const rowCount = () => within(theList()).getAllByRole("group").length;
const useCorners = (user: User) => user.click(screen.getByRole("button", { name: "Use these corners" }));
const descriptionOf = (element: HTMLElement) => (element.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent ?? "").join(" ");
const liveRegion = () => screen.getAllByRole("status").find(element => element.getAttribute("aria-live") === "polite") as HTMLElement;

async function type(user: User, n: number, axis: "Latitude" | "Longitude", text: string): Promise<void> {
  await user.clear(input(n, axis));
  if (text) await user.type(input(n, axis), text);
}

/** Make the list hold exactly these [lng, lat] corners, as a farmer would type them. */
async function fill(user: User, corners: readonly (readonly [number, number])[]): Promise<void> {
  while (rowCount() < corners.length) await user.click(within(theList()).getByRole("button", { name: "Add a corner" }));
  while (rowCount() > corners.length) await user.click(screen.getByRole("button", { name: `Remove corner ${rowCount()}` }));
  for (const [index, [longitude, latitude]] of corners.entries()) {
    await type(user, index + 1, "Latitude", String(latitude));
    await type(user, index + 1, "Longitude", String(longitude));
  }
}

function emitted(onChange: ReturnType<typeof vi.fn<(field: Field) => void>>): Field {
  expect(onChange).toHaveBeenCalledTimes(1);
  const field = onChange.mock.calls[0][0];
  expect(fieldIssues(field)).toEqual([]);
  return field;
}

describe("typing corners", () => {
  it("[R15] each input is named by its legend and label: 'Corner 1' group, 'Latitude' and 'Longitude' textboxes", async () => {
    mount();
    await drawing();
    for (const n of [1, 2, 3, 4]) {
      expect(input(n, "Latitude")).toBeTruthy();
      expect(input(n, "Longitude")).toBeTruthy();
    }
    expect(screen.queryByRole("group", { name: "Corner 5" })).toBeNull();
  });

  it("[R15] inputs are type=text with inputmode=decimal and are described by the hint until they have an error", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    const latitude = input(1, "Latitude");
    expect(latitude.type).toBe("text");
    expect(latitude.inputMode).toBe("decimal");
    expect(latitude.autocomplete).toBe("off");
    expect(descriptionOf(latitude)).toMatch(/^Go round the field in order\./);
    await useCorners(user);
    expect(descriptionOf(input(1, "Latitude"))).toBe("Type the latitude.");
    expect(descriptionOf(input(1, "Longitude"))).toBe("Type the longitude.");
  });

  it("[R15] 'Use these corners' with an empty latitude shows 'Type the latitude.' under it, sets aria-invalid, and focuses that input", async () => {
    const user = userEvent.setup();
    const { onChange } = mount(inputFixture.field);
    await drawing();
    await type(user, 2, "Latitude", "");
    await useCorners(user);
    expect(group(2).getByText("Type the latitude.")).toBeTruthy();
    expect(input(2, "Latitude").getAttribute("aria-invalid")).toBe("true");
    expect(input(1, "Latitude").getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(input(2, "Latitude"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R15] several bad numbers all show at once and focus goes to the first in reading order", async () => {
    const user = userEvent.setup();
    const { onChange } = mount(inputFixture.field);
    await drawing();
    await type(user, 3, "Longitude", "abc");
    await type(user, 2, "Latitude", "6 E");
    await type(user, 1, "Latitude", "95");
    await useCorners(user);
    expect(group(1).getByText("Latitude goes from -90 to 90.")).toBeTruthy();
    expect(group(2).getByText("Use N or S for latitude.")).toBeTruthy();
    expect(group(3).getByText("Type a number, like 108.32.")).toBeTruthy();
    expect(document.activeElement).toBe(input(1, "Latitude"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R15] '6.326 S' and '108,32' are accepted as typed", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Remove corner 4" }));
    const rows = [["6.326 S", "108,32"], ["6.326 S", "108,33"], ["6.316 S", "108,33"]];
    for (const [index, [latitude, longitude]] of rows.entries()) {
      await type(user, index + 1, "Latitude", latitude);
      await type(user, index + 1, "Longitude", longitude);
    }
    await useCorners(user);
    expect(emitted(onChange).ring).toEqual([[108.32, -6.326], [108.33, -6.326], [108.33, -6.316], [108.32, -6.326]]);
  });

  it("nothing calls onChange while typing: only 'Use these corners' does", async () => {
    const user = userEvent.setup();
    const { onChange } = mount(inputFixture.field);
    await drawing();
    await type(user, 1, "Latitude", "15.0005");
    await type(user, 1, "Longitude", "100.0005");
    expect(onChange).not.toHaveBeenCalled();
    await useCorners(user);
    expect(emitted(onChange).ring[0]).toEqual([100.0005, 15.0005]);
  });
});

describe("the shape", () => {
  it("[R24] a bow-tie shows 'Two sides cross. Type the corners in order, going around the field.' as role=alert, focused, and onChange is not called", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await fill(user, bad.bowTie.corners);
    await useCorners(user);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Two sides cross. Type the corners in order, going around the field.");
    expect(document.activeElement).toBe(alert);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R12] the U shape's 8 corners are accepted; the emitted lookup passes fieldIssues and is strictly inside (support strictlyInside)", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await fill(user, good.u);
    await useCorners(user);
    const field = emitted(onChange);
    expect(field.ring).toHaveLength(9);
    expect(strictlyInside(field.lookup, good.u)).toBe(true);
  });

  it("[R11] the Fiji corners (179.99 and -179.99) are accepted; the emitted ring keeps longitudes in [-180, 180]; the drawing shows one small rectangle; 'About 237 hectares'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await fill(user, good.fiji);
    await useCorners(user);
    const field = emitted(onChange);
    expect(field.ring.every(([longitude]) => longitude >= -180 && longitude <= 180)).toBe(true);
    expect(strictlyInside(field.lookup, good.fiji)).toBe(true);
    expect(screen.getByText("Your field is marked: about 237 hectares, 4 corners.", { selector: "span" })).toBeTruthy();
    const outline = (await drawing()).querySelector("path.fp-plan-edge")?.getAttribute("d") ?? "";
    const points = [...outline.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    expect(points).toHaveLength(4);
    const across = Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));
    const tall = Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y));
    expect(across / tall).toBeGreaterThan(1.6);
    expect(across / tall).toBeLessThan(2.3);
  });

  it("corners 10° apart show 'These corners are more than 20 km apart. Check the numbers.'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await fill(user, policy.tooFar.corners);
    await useCorners(user);
    expect(screen.getByRole("alert").textContent).toBe("These corners are more than 20 km apart. Check the numbers.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a latitude of 89 shows the pole sentence", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await fill(user, [[0, 89], [0.01, 89], [0.01, 89.001], [0, 89.001]]);
    await useCorners(user);
    expect(screen.getByRole("alert").textContent).toBe("We can’t mark a field this close to the North or South Pole. Check the latitude.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("after a refusal, fixing the number and pressing again clears the alert and emits", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await fill(user, bad.bowTie.corners);
    await useCorners(user);
    expect(screen.getByRole("alert")).toBeTruthy();
    await type(user, 2, "Latitude", "0");
    await type(user, 3, "Latitude", "0.02");
    await useCorners(user);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(emitted(onChange).ring).toEqual([[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.01], [0, 0]]);
  });
});

describe("adding and removing", () => {
  const values = () => within(theList()).getAllByRole("group").map(row => within(row).getAllByRole("textbox").map(box => (box as HTMLInputElement).value));

  it("[R15] the list starts with 4 empty rows with nothing marked, a 1 ha box's corners around a chosen place, or the field's corners", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    expect(values()).toEqual([["", ""], ["", ""], ["", ""], ["", ""]]);
    await user.type(screen.getByRole("searchbox", { name: "Village, town or area" }), "-0.3, 36.07{Enter}");
    const box = values().map(([latitude, longitude]) => [Number(latitude), Number(longitude)]);
    expect(box).toHaveLength(4);
    expect(box.every(([latitude, longitude]) => Math.abs(latitude + 0.3) < 0.0006 && Math.abs(longitude - 36.07) < 0.0006)).toBe(true);
    expect(new Set(box.map(String)).size).toBe(4);
    cleanup();
    mount(inputFixture.field);
    await drawing();
    expect(values()).toEqual(inputFixture.field.ring.slice(0, -1).map(([longitude, latitude]) => [String(latitude), String(longitude)]));
  });

  it("[R15] 'Add a corner' appends 'Corner 5' and moves focus to its latitude", async () => {
    const user = userEvent.setup();
    mount(inputFixture.field);
    await drawing();
    await user.click(within(theList()).getByRole("button", { name: "Add a corner" }));
    expect(rowCount()).toBe(5);
    expect(document.activeElement).toBe(input(5, "Latitude"));
    expect(input(5, "Latitude").value).toBe("");
  });

  it("[R15] 'Remove corner 2' removes that row, renumbers the rest and keeps focus in the list", async () => {
    const user = userEvent.setup();
    mount(inputFixture.field);
    await drawing();
    const [first, , third, fourth] = values();
    await user.click(screen.getByRole("button", { name: "Remove corner 2" }));
    expect(values()).toEqual([first, third, fourth]);
    expect(theList().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(input(2, "Latitude"));
  });

  it("[R15] with 3 rows there is no Remove button", async () => {
    const user = userEvent.setup();
    mount(inputFixture.field);
    await drawing();
    expect(within(theList()).getAllByRole("button", { name: /^Remove corner \d+$/ })).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Remove corner 4" }));
    expect(document.activeElement).toBe(input(3, "Latitude"));
    expect(within(theList()).queryAllByRole("button", { name: /^Remove corner/ })).toEqual([]);
  });

  it("[R7] at 256 rows 'Add a corner' answers 'A field can have up to 256 corners.' and adds nothing", async () => {
    const corners = circle(256);
    const field: Field = { ring: [...corners, corners[0]], lookup: [36.07, -0.3], label: "A round field" };
    expect(fieldIssues(field)).toEqual([]);
    const user = userEvent.setup();
    const { onChange } = mount(field);
    await drawing();
    const list = screen.getByText("Type the corners of your field").closest("section") as HTMLElement;
    const rows = () => list.querySelectorAll("fieldset").length;
    expect(rows()).toBe(256);
    await user.click(within(list).getByText("Add a corner"));
    expect(rows()).toBe(256);
    expect(within(list).getByText("A field can have up to 256 corners.")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  }, 20_000);
});

describe("in step with the picker", () => {
  it("[R15] after 'Use these corners' the heading has focus and the live region says 'Your field now has the 5 corners you typed.'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    const pentagon: readonly LngLat[] = [[36.07, -0.3], [36.08, -0.3], [36.085, -0.295], [36.08, -0.29], [36.07, -0.29]];
    await fill(user, pentagon);
    await useCorners(user);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Fit the corners to your field" }));
    expect(liveRegion().textContent).toBe("Your field now has the 5 corners you typed.");
    expect(emitted(onChange).ring).toHaveLength(6);
  });

  it("[R15] Close returns focus to the button that opened the list", async () => {
    vi.mocked(startGlobe).mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("region", { name: "Type the corners of your field" })).toBeNull();
    const opener = screen.getByRole("button", { name: "Type your field’s corners instead" });
    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 3, name: "Type the corners of your field" }));
    await user.click(within(theList()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Type the corners of your field" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Type your field’s corners instead" }));
    cleanup();

    mount(inputFixture.field);
    await user.click(screen.getByRole("button", { name: "Type the corners" }));
    await user.click(within(theList()).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Type the corners" }));
  });

  it("a new value from the parent re-seeds the rows; text the farmer is typing is not lost on an unrelated re-render", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(field: Field) => void>();
    const view = render(<StrictMode><FieldPicker value={inputFixture.field} onChange={onChange} /></StrictMode>);
    await drawing();
    await type(user, 1, "Latitude", "-6.3");
    view.rerender(<StrictMode><FieldPicker value={structuredClone(inputFixture.field)} onChange={onChange} /></StrictMode>);
    expect(input(1, "Latitude").value).toBe("-6.3");
    const fiji: Field = { ring: [...good.fiji, good.fiji[0]], lookup: [-180, -16.795], label: "Field near Labasa, Fiji" };
    expect(fieldIssues(fiji)).toEqual([]);
    view.rerender(<StrictMode><FieldPicker value={fiji} onChange={onChange} /></StrictMode>);
    await waitFor(() => expect(input(1, "Latitude").value).toBe("-16.8"));
    expect(input(2, "Longitude").value).toBe("-179.99");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("with the flat plan the list has no Close button and stays open", async () => {
    const user = userEvent.setup();
    mount(inputFixture.field);
    await drawing();
    expect(within(theList()).queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Type the corners" })).toBeNull();
    await type(user, 1, "Latitude", "15.0005");
    await useCorners(user);
    expect(theList()).toBeTruthy();
    expect(input(1, "Latitude").value).toBe("15.0005");
  });
});

describe("beside a globe (a stand-in that reports what a farmer did on the map)", () => {
  function fakeGlobe() {
    const seen = { send: null as GlobeOptions["send"] | null, zoom: [] as number[] };
    vi.mocked(startGlobe).mockImplementation(async options => {
      seen.send = options.send;
      return { kind: "globe", globe: { show: () => undefined, zoomBy: step => void seen.zoom.push(step), destroy: () => undefined } };
    });
    return seen;
  }

  it("[R7] a corner chosen on the map gets 'Remove corner 2'; pressing it emits a 3-corner field and keeps focus on 'Add a corner'", async () => {
    const globe = fakeGlobe();
    const user = userEvent.setup();
    const { onChange } = mount(inputFixture.field);
    await screen.findByRole("button", { name: "Zoom in" });
    expect(screen.getByText("Tap a corner to choose it.")).toBeTruthy();
    globe.send?.({ kind: "select", corner: 1 });
    await user.click(await screen.findByRole("button", { name: "Remove corner 2" }));
    expect(emitted(onChange).ring).toHaveLength(4);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a corner" }));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(globe.zoom).toEqual([1, -1]);
  });

  it("[R7] a corner dropped across the opposite side goes back: 'Two sides would cross, so the corner went back.' shows as an alert and onChange is not called", async () => {
    const globe = fakeGlobe();
    const { onChange } = mount(inputFixture.field);
    await screen.findByRole("button", { name: "Zoom in" });
    globe.send?.({ kind: "move", corner: 1, to: [100.005, 15.02] });
    expect((await screen.findByRole("alert")).textContent).toBe("Two sides would cross, so the corner went back.");
    expect(document.querySelector<HTMLElement>("[data-phase]")?.dataset.lookup).toBe(inputFixture.field.lookup.join(","));
    expect(onChange).not.toHaveBeenCalled();
  });
});

