// @vitest-environment jsdom
// The whole slot in jsdom with the real maplibre-gl and no mock of it: jsdom has no WebGL2, so the globe cannot start
// and the drawing and the corner list stand in. That makes this file the test of "no WebGL" by nature. The key is
// empty unless a case sets one. A test observes only the screen, the calls to onChange and the calls to fetch, and
// judges every emitted field with the contract's own parser (support/shapes.ts).
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FarmInput } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { FieldPicker } from "@/features/location";
import { stubBrowser, unstubBrowser } from "../support/browser";
import { bad, fieldIssues, strictlyInside } from "../support/shapes";

type Field = FarmInput["field"];

// Each case drives the whole slot key by key, which takes seconds on a loaded machine.
vi.setConfig({ testTimeout: 20_000 });

const fetchCalls = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
  fetchCalls.mockReset();
  fetchCalls.mockRejectedValue(new TypeError("no network in this test"));
  vi.stubGlobal("fetch", fetchCalls);
  stubBrowser();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "geolocation");
  unstubBrowser();
});

function mount(value: Field | null = null) {
  const onChange = vi.fn<(field: Field) => void>();
  const view = render(<StrictMode><FieldPicker value={value} onChange={onChange} /></StrictMode>);
  return { onChange, ...view };
}

const slot = () => document.querySelector<HTMLElement>("[data-phase]") as HTMLElement;
const drawing = () => screen.findByRole("img", { name: /^Drawing of your field/ }, { timeout: 10_000 });
const searchbox = () => screen.getByRole("searchbox");
const liveRegion = () => screen.getAllByRole("status").find(element => element.getAttribute("aria-live") === "polite") as HTMLElement;
const descriptionOf = (element: HTMLElement) => (element.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent ?? "").join(" ");

function emitted(onChange: ReturnType<typeof vi.fn<(field: Field) => void>>, call = 0): Field {
  const field = onChange.mock.calls[call]?.[0];
  if (!field) throw new Error(`onChange call ${call} did not happen`);
  expect(fieldIssues(field)).toEqual([]);
  expect(strictlyInside(field.lookup, field.ring.slice(0, -1))).toBe(true);
  return field;
}

function answer(features: readonly unknown[], status = 200): Response {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status, headers: { "content-type": "application/json" } });
}

const indramayu = { center: [108.32, -6.3264], text: "Indramayu", place_name: "Indramayu, West Java, Indonesia", context: [{ text: "West Java" }, { text: "Indonesia" }] };
const indramayuRegency = { center: [108.2, -6.45], text: "Indramayu Regency", place_name: "Indramayu Regency, West Java, Indonesia", context: [{ text: "West Java" }, { text: "Indonesia" }] };

async function typePosition(user: ReturnType<typeof userEvent.setup>, text = "-6.326, 108.32"): Promise<void> {
  await user.clear(searchbox());
  await user.type(searchbox(), `${text}{Enter}`);
}

describe("with no key and no WebGL", () => {
  it("[R14][R16][R20] render(<FieldPicker value={null} onChange>) shows two explanations, no globe on this phone and no search by name on this site, and the drawing", async () => {
    mount();
    expect(await drawing()).toBeTruthy();
    expect(screen.getByText(/^This phone can’t show the moving globe\. Search for your farm, type a position or use your location/)).toBeTruthy();
    expect(screen.getByText(/^Search by name and close-up pictures aren’t set up on this site\. Type a position, use your location, or type your field’s corners\./)).toBeTruthy();
  });

  it("[R16][R20] the search box is named for a position and its hint asks for one; the corner list is open without a press; 'Use my location' is there", async () => {
    mount();
    await drawing();
    expect(screen.getByRole("searchbox", { name: "Position of your farm" }).getAttribute("placeholder")).toBe("-6.326, 108.32");
    expect(screen.getByRole("search", { name: "Find your farm by its position" })).toBeTruthy();
    expect(descriptionOf(searchbox())).toMatch(/Type a position, like -6\.326, 108\.32/);
    expect(screen.getByRole("region", { name: "Type the corners of your field" })).toBeTruthy();
    expect(screen.getAllByRole("textbox", { name: "Latitude", description: /Go round the field in order/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Use my location" })).toBeTruthy();
  });

  it("[R20] nothing calls fetch and nothing calls onChange on mount", async () => {
    const { onChange } = mount();
    await drawing();
    expect(fetchCalls).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R20] typing '-6.326, 108.32' and Enter chooses a place with no fetch; 'Mark my field' calls onChange once with a 1 ha field that passes fieldIssues, lookup [108.32, -6.326]", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await typePosition(user);
    expect(screen.getByText("6.326° S, 108.320° E", { selector: "b" })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const field = emitted(onChange);
    expect(field.lookup).toEqual([108.32, -6.326]);
    expect(field.ring).toHaveLength(5);
    expect(field.label).toBe("Field at 6.33° S, 108.32° E");
    expect(screen.getByText("Your field is marked: about 1 hectare, 4 corners.", { selector: "span" })).toBeTruthy();
    expect(fetchCalls).not.toHaveBeenCalled();
  });

  it("[R15][R8] keyboard only: Tab to Corner 1 latitude, type 3 corners, press Use these corners: onChange once with a field that passes fieldIssues; the drawing shows 3 numbered corners", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    const corner = (n: number, axis: "Latitude" | "Longitude") => within(screen.getByRole("group", { name: `Corner ${n}` })).getByRole("textbox", { name: axis });
    const target = corner(1, "Latitude");
    for (let presses = 0; document.activeElement !== target; presses++) {
      if (presses > 40) throw new Error("Tab never reached Corner 1 latitude");
      await user.tab();
    }
    const typed = [["-0.30", "36.07"], ["-0.30", "36.08"], ["-0.29", "36.08"]];
    for (const [latitude, longitude] of typed) {
      await user.keyboard(latitude);
      await user.tab();
      await user.keyboard(longitude);
      await user.tab();
      await user.tab();
    }
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove corner 4" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("group", { name: "Corner 4" })).toBeNull();
    while (document.activeElement !== screen.getByRole("button", { name: "Use these corners" })) await user.tab();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    const field = emitted(onChange);
    expect(field.ring).toEqual([[36.07, -0.3], [36.08, -0.3], [36.08, -0.29], [36.07, -0.3]]);
    const numbers = [...(await drawing()).querySelectorAll("text")].map(text => text.textContent).filter(text => /^\d+$/.test(text ?? ""));
    expect(numbers).toEqual(["1", "2", "3"]);
  });

  it("[R16][R20] a place name with no key says search by name is not set up, asks for a position, and calls fetch 0 times", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    expect(screen.getByText("Searching by name isn’t set up on this site. Type a position, like -6.326, 108.32, or your field’s corners.")).toBeTruthy();
    expect(fetchCalls).not.toHaveBeenCalled();
  });

  it("[R16][R25] a position that cannot be read, with no key, asks for two numbers and does not offer a town name", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await typePosition(user, "my farm 6.3, 108.3");
    expect(screen.getByText("We couldn’t read this as a position. Type it as two numbers, like -6.326, 108.32, then press Search.")).toBeTruthy();
    expect(fetchCalls).not.toHaveBeenCalled();
  });

  it("[R5] with the drawing and no key there are no map pictures and no place search, so no credit, no MapTiler logo and no claim that NASA sees the area", async () => {
    mount();
    await drawing();
    expect(screen.queryByText(/NASA EOSDIS GIBS|Map pictures|MapTiler/)).toBeNull();
    expect(screen.queryByText(/can see which area/)).toBeNull();
    expect(screen.queryByRole("link", { name: /MapTiler/ })).toBeNull();
    expect(screen.queryByRole("img", { name: /MapTiler/ })).toBeNull();
  });

  it("the root has data-surface='plan', and once marked data-lookup equals the emitted lookup", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    expect(slot().dataset.surface).toBe("plan");
    expect(slot().dataset.lookup).toBeUndefined();
    await typePosition(user, "-0.3, 36.07");
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(slot().dataset.lookup).toBe(emitted(onChange).lookup.join(","));
  });
});

describe("the value prop", () => {
  it("[R23] mounting with inputFixture.field shows 'Fit the corners to your field', the 4 rows with the fixture's numbers, 'About 119 hectares', and calls onChange 0 times", async () => {
    const { onChange } = mount(inputFixture.field);
    await drawing();
    expect(screen.getByRole("heading", { level: 2, name: "Fit the corners to your field" })).toBeTruthy();
    inputFixture.field.ring.slice(0, -1).forEach(([longitude, latitude], index) => {
      const group = within(screen.getByRole("group", { name: `Corner ${index + 1}` }));
      expect(Number((group.getByRole("textbox", { name: "Latitude" }) as HTMLInputElement).value)).toBe(latitude);
      expect(Number((group.getByRole("textbox", { name: "Longitude" }) as HTMLInputElement).value)).toBe(longitude);
    });
    expect(screen.queryByRole("group", { name: "Corner 5" })).toBeNull();
    expect(screen.getByText(/about 119 hectares, 4 corners\./)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R23] a value that arrives after mount (rerender from null) is drawn and calls onChange 0 times", async () => {
    const onChange = vi.fn<(field: Field) => void>();
    const view = render(<StrictMode><FieldPicker value={null} onChange={onChange} /></StrictMode>);
    await drawing();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    view.rerender(<StrictMode><FieldPicker value={inputFixture.field} onChange={onChange} /></StrictMode>);
    expect(screen.getByRole("heading", { level: 2, name: "Fit the corners to your field" })).toBeTruthy();
    expect(slot().dataset.lookup).toBe(inputFixture.field.lookup.join(","));
    expect(onChange).not.toHaveBeenCalled();
  });

  function Parent(props: { readonly copy: boolean; readonly calls: Field[] }): ReactElement {
    const [field, setField] = useState<Field | null>(null);
    return <FieldPicker value={field} onChange={next => {
      props.calls.push(next);
      setField(props.copy ? structuredClone(next) : next);
    }} />;
  }

  async function threeEdits(copy: boolean): Promise<Field[]> {
    const user = userEvent.setup();
    const calls: Field[] = [];
    render(<StrictMode><Parent copy={copy} calls={calls} /></StrictMode>);
    await drawing();
    await typePosition(user, "-0.3, 36.07");
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    await user.click(screen.getByRole("button", { name: "Bigger" }));
    await user.click(screen.getByRole("button", { name: "Smaller" }));
    await user.click(screen.getByRole("button", { name: "Search again" }));
    await user.click(screen.getByRole("button", { name: "Back to my field" }));
    return calls;
  }

  it("[R23] a parent that hands every emitted field straight back (useState) sees exactly one onChange per accepted edit", async () => {
    const calls = await threeEdits(false);
    expect(calls).toHaveLength(3);
    calls.forEach(field => expect(fieldIssues(field)).toEqual([]));
    expect(screen.getByText(/about 1 hectare, 4 corners\./)).toBeTruthy();
  });

  it("a parent that hands back a deep copy of the emitted field also sees no second onChange", async () => {
    const calls = await threeEdits(true);
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map(field => JSON.stringify(field))).size).toBe(2);
  });

  it("rerender with null after a field returns to the search box", async () => {
    const onChange = vi.fn<(field: Field) => void>();
    const view = render(<StrictMode><FieldPicker value={inputFixture.field} onChange={onChange} /></StrictMode>);
    await drawing();
    expect(screen.queryByRole("searchbox")).toBeNull();
    view.rerender(<StrictMode><FieldPicker value={null} onChange={onChange} /></StrictMode>);
    expect(searchbox()).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(slot().dataset.lookup).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a value the picker cannot draw shows 'We couldn’t draw the field you saved. …', offers 'Mark my field' at its place, and does not call onChange", async () => {
    const user = userEvent.setup();
    const corners = bad.bowTie.corners;
    const bowTie: Field = { ring: [...corners, corners[0]], lookup: corners[0], label: "My old field" };
    expect(fieldIssues(bowTie)).toEqual([]);
    const { onChange } = mount(bowTie);
    await drawing();
    expect(screen.getByRole("alert").textContent).toMatch(/^We couldn’t draw the field you saved\. Two sides cross\./);
    expect(screen.getByText("My old field")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(emitted(onChange).lookup).toEqual([0, 0]);
  });

  it("[R8] a saved value whose label is blank says so, and 'Mark my field' emits a field the contract accepts, named 'Field at …'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount({ ...inputFixture.field, label: "   " });
    await drawing();
    expect(screen.getByRole("alert").textContent).toBe("We couldn’t use the field you saved, because its name is empty or too long. Mark your field again.");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(emitted(onChange).label).toBe("Field at 15.01° N, 100.00° E");
  });

  it("[R17] two pickers in one document have no duplicate id (document.querySelectorAll('[id]'))", async () => {
    render(<StrictMode><FieldPicker value={inputFixture.field} onChange={() => undefined} /><FieldPicker value={null} onChange={() => undefined} /></StrictMode>);
    await waitFor(() => expect(screen.getAllByRole("img", { name: /^Drawing of your field/ })).toHaveLength(2), { timeout: 10_000 });
    const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const references = [...document.querySelectorAll("[aria-describedby], [aria-labelledby], [for]")].flatMap(element =>
      ["aria-describedby", "aria-labelledby", "for"].flatMap(name => (element.getAttribute(name) ?? "").split(" ").filter(Boolean)));
    expect(references.filter(id => !document.getElementById(id))).toEqual([]);
  });
});

describe("search with a key (vi.stubEnv, fetch stubbed)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    fetchCalls.mockImplementation(async () => answer([indramayu, indramayuRegency]));
  });

  const requested = (call = 0) => new URL(String(fetchCalls.mock.calls[call]?.[0]));

  it("[R6] typing 12 letters calls fetch 0 times", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu Ko");
    expect(fetchCalls).not.toHaveBeenCalled();
  });

  it("[R6][R4] pressing Enter calls fetch once, with a URL on api.maptiler.com that has autocomplete=false and the stubbed key", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    await screen.findByRole("button", { name: /^Indramayu West Java, Indonesia$/ });
    expect(fetchCalls).toHaveBeenCalledTimes(1);
    expect(requested().host).toBe("api.maptiler.com");
    expect(requested().searchParams.get("autocomplete")).toBe("false");
    expect(requested().searchParams.get("key")).toBe("test-key");
    expect(decodeURIComponent(requested().pathname)).toContain("Indramayu");
  });

  it("[R6] pressing the Search button does the same; one letter shows 'Type at least 2 letters, then Search.' and calls fetch 0 times", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "I");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText("Type at least 2 letters, then Search.")).toBeTruthy();
    expect(fetchCalls).not.toHaveBeenCalled();
    await user.type(searchbox(), "ndramayu");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("button", { name: /^Indramayu West Java/ });
    expect(fetchCalls).toHaveBeenCalledTimes(1);
    expect(requested().searchParams.get("autocomplete")).toBe("false");
  });

  it("[R25] a position in degrees, minutes and seconds, or with a leading letter, is chosen with no fetch; one that cannot be read says so and calls fetch 0 times", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    for (const typed of [`6°19'33.6"S 108°19'12.0"E`, "S 6.326, E 108.32", "(-6.326, 108.32)"]) {
      await typePosition(user, typed);
      expect(await screen.findByRole("button", { name: "Mark my field" })).toBeTruthy();
      expect(screen.getByText("6.326° S, 108.320° E", { selector: "b" })).toBeTruthy();
    }
    await typePosition(user, "6.326 S 108.32 E 12");
    expect(screen.getByText("We couldn’t read this as a position. Type it as two numbers, like -6.326, 108.32, or type the name of the nearest town. Then press Search.")).toBeTruthy();
    expect(fetchCalls).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R25] a labelled position is chosen with no fetch; a pasted map link or a position among words says it cannot be read and calls fetch 0 times", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    const read = [
      ["lat: -6.326, lon: 108.32", "6.326° S, 108.320° E"],
      ["Latitude -6.1 Longitude 108.1", "6.100° S, 108.100° E"],
      ["lat=-6.2&lon=108.2", "6.200° S, 108.200° E"],
      ["Lat/Long: -6.3, 108.3", "6.300° S, 108.300° E"],
      ["-6.4, lon 108.4", "6.400° S, 108.400° E"],
      ["lat 6 lon 108", "6.000° N, 108.000° E"],
      ["lintang -6.32 bujur 108.32", "6.320° S, 108.320° E"],
      ["۳۵.۶۸۹۲, ۵۱.۳۸۹۰", "35.689° N, 51.389° E"],
      ["6.326 - 108.32", "6.326° N, 108.320° E"],
    ] as const;
    for (const [typed, card] of read) {
      await typePosition(user, typed);
      expect(await screen.findByText(card, { selector: "b" }), typed).toBeTruthy();
    }
    for (const typed of [
      "https://maps.google.com/?q=-6.326,108.32", "https://maps.app.goo.gl/AbC123xYz", "geo:-6.326,108.32", "my farm -6.326, 108.32",
      "my farm -6.3, 108", "45N 9E farm", "farm lat -6.326 lon 108", "GPS -6.326 108.32", "-6.32 lat 108.32 lon", "6.32 dan 108.32",
      "X4HM+3C Indramayu", "///filled.count.soap", "UTM 49M 213456 9300123", "maps.app.goo.gl/AbCd123",
    ]) {
      await typePosition(user, typed);
      expect(screen.getByText("We couldn’t read this as a position. Type it as two numbers, like -6.326, 108.32, or type the name of the nearest town. Then press Search."), typed).toBeTruthy();
    }
    expect(fetchCalls).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R1] a place name with an ordinal or a kilometre mark is searched by name", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    const names = ["1º de Mayo", "Via 1° Maggio", "Ruta 3 Km 4.5 a 5.5"];
    for (const typed of names) {
      await typePosition(user, typed);
      await screen.findByRole("list", { name: "Places" });
    }
    expect(fetchCalls.mock.calls.map((_, call) => decodeURIComponent(requested(call).pathname))).toEqual(names.map(name => `/geocoding/${name}.json`));
  });

  it("results show as buttons 'Indramayu' with 'West Java, Indonesia'; the status line says '2 places found. Choose one from the list.'", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    const places = await screen.findByRole("list", { name: "Places" });
    const rows = within(places).getAllByRole("button");
    expect(rows.map(row => row.textContent)).toEqual(["Indramayu West Java, Indonesia", "Indramayu Regency West Java, Indonesia"]);
    expect(screen.getAllByRole("status").map(status => status.textContent)).toContain("2 places found. Choose one from the list.");
  });

  it("choosing a row shows the place card and 'Mark my field'; pressing it calls onChange with a 1 ha field labelled 'Field near Indramayu, West Java, Indonesia'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    await user.click(await screen.findByRole("button", { name: /^Indramayu West Java/ }));
    const mark = screen.getByRole("button", { name: "Mark my field" });
    expect(document.activeElement).toBe(mark);
    expect(screen.getByText("West Java, Indonesia")).toBeTruthy();
    await user.click(mark);
    const field = emitted(onChange);
    expect(field.label).toBe("Field near Indramayu, West Java, Indonesia");
    expect(field.lookup).toEqual([108.32, -6.3264]);
    expect(screen.getByText("Your field is marked: about 1 hectare, 4 corners.", { selector: "span" })).toBeTruthy();
    expect(fetchCalls).toHaveBeenCalledTimes(1);
  });

  it("[R16] a 403 shows 'The place search isn’t working on this site right now. …' and a typed position still marks a field", async () => {
    fetchCalls.mockImplementation(async () => new Response("{}", { status: 403 }));
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    expect(await screen.findByText(/^The place search isn’t working on this site right now\. Type a position/)).toBeTruthy();
    await typePosition(user);
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(emitted(onChange).lookup).toEqual([108.32, -6.326]);
    expect(fetchCalls).toHaveBeenCalledTimes(1);
  });

  it("[R16] a rejected fetch shows 'We couldn’t reach the place search. …'; pressing Search again calls fetch again", async () => {
    fetchCalls.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    expect(await screen.findByText(/^We couldn’t reach the place search\. Check your internet connection/)).toBeTruthy();
    fetchCalls.mockImplementation(async () => answer([indramayu]));
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: /^Indramayu West Java/ })).toBeTruthy();
    expect(fetchCalls).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/We couldn’t reach the place search/)).toBeNull();
  });

  it("[R16] a 429 shows 'The place search is busy. Wait a moment, then press Search again.'", async () => {
    fetchCalls.mockImplementation(async () => new Response("{}", { status: 429 }));
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    expect(await screen.findByText("The place search is busy. Wait a moment, then press Search again.")).toBeTruthy();
  });

  it("no result shows 'No place found. Try the nearest town, or type a position.' (no globe to tap in jsdom)", async () => {
    fetchCalls.mockImplementation(async () => answer([]));
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Nowhere at all{Enter}");
    expect(await screen.findByText("No place found. Try the nearest town, or type a position.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Places" })).toBeNull();
  });

  it("a slow first answer arriving after a second search does not replace the second's results", async () => {
    let answerFirst: (response: Response) => void = () => undefined;
    fetchCalls.mockImplementationOnce(() => new Promise(resolve => {
      answerFirst = resolve;
    }));
    fetchCalls.mockImplementationOnce(async () => answer([{ ...indramayu, text: "Second" }]));
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "First{Enter}");
    await user.clear(searchbox());
    await user.type(searchbox(), "Second{Enter}");
    await screen.findByRole("button", { name: /^Second/ });
    answerFirst(answer([{ ...indramayu, text: "First" }]));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole("button", { name: /^First/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Second/ })).toBeTruthy();
    expect(fetchCalls).toHaveBeenCalledTimes(2);
  });

  it("[R5] with the drawing the credits line credits the place search alone: '© MapTiler' and '© OpenStreetMap contributors' as links, without a press, and no NASA", async () => {
    mount();
    await drawing();
    expect(screen.getByText(/^Place search:/)).toBeTruthy();
    expect(screen.getByText("The place search comes from MapTiler, so MapTiler can see the names you search for.")).toBeTruthy();
    const maptiler = screen.getByRole("link", { name: "© MapTiler (opens in a new tab)" });
    const osm = screen.getByRole("link", { name: "© OpenStreetMap contributors (opens in a new tab)" });
    expect(maptiler.getAttribute("href")).toMatch(/^https:\/\/www\.maptiler\.com\//);
    expect(osm.getAttribute("href")).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    for (const link of [maptiler, osm]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.queryByText(/NASA/)).toBeNull();
  });

  it("[R5] with a key the drawing carries MapTiler's logo: a link named 'MapTiler logo (opens in a new tab)' to https://www.maptiler.com/, its picture from api.maptiler.com with no key", async () => {
    mount();
    const plan = await drawing();
    const link = screen.getByRole("link", { name: "MapTiler logo (opens in a new tab)" });
    expect(link.getAttribute("href")).toBe("https://www.maptiler.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(link).getByRole("img", { name: "MapTiler" }).getAttribute("src")).toBe("https://api.maptiler.com/resources/logo.svg");
    expect(plan.closest(".fp-map")?.contains(link)).toBe(true);
  });

  it("unmounting during a search aborts it and nothing is set afterwards", async () => {
    let signal: AbortSignal | undefined;
    let answerLate: (response: Response) => void = () => undefined;
    fetchCalls.mockImplementation((_input, init) => new Promise(resolve => {
      signal = init?.signal ?? undefined;
      answerLate = resolve;
    }));
    const errors = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const view = mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    answerLate(answer([indramayu]));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(errors).not.toHaveBeenCalled();
    expect(document.body.textContent).toBe("");
  });
});

describe("use my location (navigator.geolocation stubbed)", () => {
  type Fix = { readonly coords: { readonly latitude: number; readonly longitude: number; readonly accuracy: number } };
  function phone(outcome: Fix | { readonly code: number }) {
    const getCurrentPosition = vi.fn((found: (fix: Fix) => void, failed: (error: { readonly code: number }) => void) => {
      if ("coords" in outcome) found(outcome);
      else failed(outcome);
    });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    return getCurrentPosition;
  }
  const fix: Fix = { coords: { latitude: -6.40213, longitude: 108.28137, accuracy: 9.6 } };

  it("'Use my location' opens the explanation with 'Find my location' and moves focus to its heading; nothing is asked of the phone yet", async () => {
    const asked = phone(fix);
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 3, name: "Use your location" }));
    expect(screen.getByText("Stand in your field if you can.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find my location" })).toBeTruthy();
    expect(asked).not.toHaveBeenCalled();
  });

  it("'Close' folds the explanation away and gives focus back to 'Use my location'", async () => {
    const asked = phone(fix);
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("button", { name: "Use my location" }).getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("button", { name: "Find my location" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByRole("button", { name: "Use my location" }).getAttribute("aria-expanded")).toBe("false");
    expect(asked).not.toHaveBeenCalled();
  });

  it("[R13] 'Find my location' with a fix: onChange gets a 1 ha field whose lookup is the fix, and the note reads 'From your phone’s location, within about 10 m.'", async () => {
    phone(fix);
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    await user.click(screen.getByRole("button", { name: "Find my location" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(emitted(onChange).lookup).toEqual([108.28137, -6.40213]);
    expect(screen.getByText("From your phone’s location, within about 10 m.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Put your field in the box" }));
  });

  it("[R25] with a fix, fetch is never called: the position goes to no service", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    phone(fix);
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    await user.click(screen.getByRole("button", { name: "Find my location" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fetchCalls).not.toHaveBeenCalled();
  });

  it("[R16] denied shows 'Your location is turned off' with the three steps and 'Try again'", async () => {
    const asked = phone({ code: 1 });
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    await user.click(screen.getByRole("button", { name: "Find my location" }));
    const title = screen.getByRole("heading", { level: 3, name: "Your location is turned off" });
    expect(document.activeElement).toBe(title);
    expect(screen.getAllByRole("listitem").map(step => step.textContent)).toEqual([
      "Tap the small icon beside the web address at the top of the screen.",
      "Tap Location, then Allow.",
      "Come back here and tap Try again.",
    ]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(asked).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[R16] with no navigator.geolocation it shows 'This phone can’t share its location here'", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    await user.click(screen.getByRole("button", { name: "Find my location" }));
    expect(screen.getByRole("heading", { level: 3, name: "This phone can’t share its location here" })).toBeTruthy();
    expect(screen.getByText("Search for your farm, type a position, or type your field’s corners.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("marking", () => {
  const weather = "Weather comes from NASA records on a grid much larger than a field. Every farm in the same grid square shares the same records, so marking your field more exactly doesn’t make the weather records finer.";

  it("[R13][R26] the note under the tools states how the outline was made and the weather grid sentence, for a searched box, typed corners and a saved field", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    fetchCalls.mockImplementation(async () => answer([indramayu]));
    const user = userEvent.setup();
    mount();
    await drawing();
    await user.type(searchbox(), "Indramayu{Enter}");
    await user.click(await screen.findByRole("button", { name: /^Indramayu West Java/ }));
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(screen.getByText("From your search: the box is at the middle of Indramayu, not on your field yet.")).toBeTruthy();
    expect(screen.getByText(weather)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Use these corners" }));
    expect(screen.getByText("These are the corners you typed.")).toBeTruthy();
    expect(screen.getByText(weather)).toBeTruthy();
    cleanup();

    mount(inputFixture.field);
    await drawing();
    expect(screen.getByText("This is the field you marked before.")).toBeTruthy();
    expect(screen.getByText(weather)).toBeTruthy();
  });

  it("[R10] 'Your field is marked: about 1 hectare, 4 corners.' is visible text, and the live region says it after each accepted edit", async () => {
    const user = userEvent.setup();
    mount();
    await drawing();
    await typePosition(user);
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(screen.getByText("Your field is marked: about 1 hectare, 4 corners.", { selector: "span" })).toBeTruthy();
    expect(liveRegion().textContent).toBe("Your field is marked: about 1 hectare, 4 corners.");
    await user.click(screen.getByRole("button", { name: "Bigger" }));
    expect(screen.getByText("Your field is marked: about 2 hectares, 4 corners.", { selector: "span" })).toBeTruthy();
    expect(liveRegion().textContent).toBe("Your field is marked: about 2 hectares, 4 corners.");
    expect(screen.getByText("About 2 hectares")).toBeTruthy();
    expect(screen.getByText("140 m across")).toBeTruthy();
  });

  it("'Search again' moves focus to the search box, calls onChange 0 times, and shows and says 'Your field is still marked: …' above the map, with 'Back to my field'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount(inputFixture.field);
    await drawing();
    await user.click(screen.getByRole("button", { name: "Search again" }));
    expect(document.activeElement).toBe(searchbox());
    const stillMarked = `Your field is still marked: ${inputFixture.field.label}. Mark your field at a new place to replace it.`;
    const shown = screen.getByText(stillMarked, { selector: "p:not([aria-live])" });
    expect(shown.compareDocumentPosition(document.querySelector(".fp-map") as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(liveRegion().textContent).toBe(stillMarked);
    expect(screen.getByRole("button", { name: "Back to my field" })).toBeTruthy();
    expect(slot().dataset.lookup).toBe(inputFixture.field.lookup.join(","));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("'Back to my field' shows the same box again, with Smaller and Bigger, and calls onChange 0 times", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await typePosition(user);
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    await user.click(screen.getByRole("button", { name: "Bigger" }));
    expect(onChange).toHaveBeenCalledTimes(2);
    const held = slot().dataset.lookup;
    await user.click(screen.getByRole("button", { name: "Search again" }));
    await typePosition(user, "10, 10");
    await user.click(screen.getByRole("button", { name: "Back to my field" }));
    expect(screen.getByRole("heading", { level: 2, name: "Put your field in the box" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Smaller" })).toBeTruthy();
    expect(screen.getByText("About 2 hectares")).toBeTruthy();
    expect(slot().dataset.lookup).toBe(held);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("[R14] Bigger at 50 ha stays enabled and, with the drawing, answers 'This is the biggest box. Type the corners in the list below to make your field bigger.'", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await typePosition(user);
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    const bigger = screen.getByRole("button", { name: "Bigger" });
    for (let press = 0; press < 6; press++) await user.click(bigger);
    expect(screen.getByText("About 50 hectares")).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(7);
    await user.click(bigger);
    expect((bigger as HTMLButtonElement).disabled).toBe(false);
    expect(bigger.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByText("This is the biggest box. Type the corners in the list below to make your field bigger.", { selector: "p:not([aria-live])" })).toBeTruthy();
    expect(liveRegion().textContent).toBe("This is the biggest box. Type the corners in the list below to make your field bigger.");
    expect(onChange).toHaveBeenCalledTimes(7);
  });

  it("[R15] focus moves to the slot's heading when marking starts, and not on first mount; the map is brought into view instead of the heading", async () => {
    const user = userEvent.setup();
    const scrolled: Element[] = [];
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value(this: Element) {
        scrolled.push(this);
      },
    });
    mount(inputFixture.field);
    await drawing();
    expect(document.activeElement).toBe(document.body);
    cleanup();
    mount();
    await drawing();
    await typePosition(user);
    scrolled.length = 0;
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Put your field in the box" }));
    expect(scrolled).toEqual([document.querySelector(".fp-map")]);
  });

  it("[R16] the no-key explanation sits below the map and the no-globe one above it", async () => {
    mount();
    await drawing();
    const map = document.querySelector(".fp-map") as Node;
    const noGlobe = screen.getByText(/^This phone can’t show the moving globe\./);
    const noKey = screen.getByText(/^Search by name and close-up pictures aren’t set up on this site\./);
    expect(noGlobe.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noKey.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("[R15] every button and input in the slot has an accessible name (getAllByRole) in each of the three phases", async () => {
    const user = userEvent.setup();
    const named = () => {
      for (const role of ["button", "textbox", "searchbox", "link"] as const) {
        expect(screen.queryAllByRole(role, { name: /\S/ })).toHaveLength(screen.queryAllByRole(role).length);
      }
      return slot().dataset.phase;
    };
    mount();
    await drawing();
    expect(named()).toBe("finding");
    await typePosition(user);
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    expect(named()).toBe("box");
    await user.click(screen.getByRole("button", { name: "Use these corners" }));
    expect(named()).toBe("corners");
    expect(screen.getAllByRole("button").length).toBeGreaterThan(5);
  });
});

describe("across 180°", () => {
  it("[R11] a box marked at '-16.795, 179.9999' straddles 180°: every longitude stays in [-180, 180] and the lookup is the typed position", async () => {
    const user = userEvent.setup();
    const { onChange } = mount();
    await drawing();
    await typePosition(user, "-16.795, 179.9999");
    await user.click(screen.getByRole("button", { name: "Mark my field" }));
    const fiji = emitted(onChange);
    expect(fiji.ring.every(([longitude]) => longitude >= -180 && longitude <= 180)).toBe(true);
    expect(fiji.ring.some(([longitude]) => longitude < 0)).toBe(true);
    expect(fiji.lookup).toEqual([179.9999, -16.795]);
  });
});
