// @vitest-environment jsdom
// The typesetter's markup rules over hand-built pages that hold every block kind, so the look is checked without the
// readers. jsdom draws no layout: drawn sizes, overlaps and pointer events are measured in the browser run.
import { createRef } from "react";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completedSnapshotSchema } from "@/contracts";
import type { ActionButton, ActionsCard } from "@/features/results/model/actions";
import type { Block, DetailsPage, Head, Section, YearBlock } from "@/features/results/model/blocks";
import { detailsPage } from "@/features/results/model/details-page";
import { formatIn } from "@/features/results/model/words";
import { Actions } from "@/features/results/views/actions";
import { DetailsView, HeadView, SectionView } from "@/features/results/views/typeset";
import { variant } from "../support/variants";

afterEach(() => {
  cleanup();
});

const head: Head = {
  eyebrow: "Field near Indramayu · Made 15 Nov 2026",
  title: "Your plan, with warnings",
  status: { tone: "warn", icon: "alert", label: "With warnings.", text: "In past seasons, rain fell short of what the crops need in about 5 in 10 weeks." },
  facts: ["Your year: 1 Jul 2026 to 30 Jun 2027", "Maize grain and rice", "Rain only"],
  synthetic: "Synthetic test data only. Values are invented and are not farm advice.",
};

const yearDays = 365;
const fourDayCrop: YearBlock = {
  kind: "year",
  source: "plan",
  caption: "This plan",
  ticks: [
    { at: 0, label: "Jul 2026", narrow: "J" },
    { at: 31 / yearDays, label: "Aug", narrow: "A" },
    { at: 184 / yearDays, label: "Jan 2027", narrow: "J" },
  ],
  bars: [
    { look: "crop", from: 0, to: 4 / yearDays, mark: "1" },
    { look: "after_harvest", from: 4 / yearDays, to: 5 / yearDays, mark: null },
    { look: "open", from: 5 / yearDays, to: 200 / yearDays, mark: null },
    { look: "crop", from: 200 / yearDays, to: 1, mark: "2" },
  ],
  legend: [
    { look: "after_harvest", label: "After harvest, before the field is free" },
    { look: "open", label: "No planned crop" },
  ],
  rows: [
    { mark: "1", head: "Maize grain", lines: ["Plant 1 Jul 2026 · Harvest 4 Jul 2026", "4 days in the field. The field is free again on 6 Jul 2026."] },
    { mark: null, head: "No planned crop", lines: ["5 Jul 2026 to 17 Jan 2027 · 197 days", "The first day is the time after the maize grain harvest, before the field is free."] },
    { mark: "2", head: "Rice", lines: ["Plant 18 Jan 2027 · Harvest 30 Jun 2027", "164 days in the field. The field is free again on 1 Jul 2027."] },
  ],
};

const everyKind: readonly Block[] = [
  { kind: "text", look: "body", text: "We flag a crop if, in any past season, even one week had less rain than it needs." },
  { kind: "note", tone: "neutral", icon: "info", strong: null, text: "We compare plans in one fixed order: water first, then days without a crop. You don’t choose it." },
  { kind: "note", tone: "info", icon: "grid", strong: "We stopped at our search limit.", text: "This is the best plan we found, not proven to be the best." },
  { kind: "subhead", text: "Also good to know" },
  { kind: "items", look: "flag", items: [{ icon: "drop", head: "Rain fell short of what maize grain needs in past seasons", lines: ["Example rainfall warning."], href: null }] },
  { kind: "steps", steps: ["Get seed for rice before 18 Jan 2027.", "Prepare the land before planting rice."] },
  {
    kind: "ranks",
    numbered: true,
    ranks: [
      { icon: null, question: "How often rain fell below what the crops need", value: "About 5 in 10 weeks", explain: "Lower is better." },
      { icon: null, question: "Days without a planned crop", value: "197 days", explain: "" },
    ],
  },
  { kind: "ranks", numbered: false, ranks: [{ icon: "heat", question: "Heat and cold", value: "Not assessed", explain: "Not assessed for maize grain." }] },
  { kind: "versus", sides: [{ value: "387", caption: "days your crops need, at least", tone: "warn" }, { value: "365", caption: "days in your year", tone: "plain" }] },
  fourDayCrop,
  { kind: "facts", facts: [{ name: "Engine", value: "1.0.0", code: false }, { name: "Answers fingerprint", value: "a1b2c3", code: true }] },
  {
    kind: "table",
    caption: "Month by month: rain in mm",
    columns: ["Month", "Usual rain", "Dry year"],
    rows: [["July", "38.0", "12.5"], ["August", "41.2", "Not available: too few seasons"]],
  },
];

const everySection: Section = { id: "ranking", title: "Why this plan ranked first", look: "flagged", blocks: everyKind };

const details: DetailsPage = {
  back: "Back to the result",
  eyebrow: head.eyebrow,
  title: "How this result was made",
  lead: "Sources, calculations and assumptions behind “Your plan, with warnings”.",
  synthetic: head.synthetic,
  sections: [
    {
      id: "sources",
      title: "Where the data comes from",
      look: "card",
      blocks: [{
        kind: "items",
        look: "plain",
        items: [
          { icon: null, head: "NASA POWER daily data", lines: ["Precipitation", "Taken on 1 Nov 2026."], href: "https://power.larc.nasa.gov/" },
          { icon: null, head: "A source with no address", lines: ["Section 3"], href: null },
        ],
      }],
    },
    { id: "answers", title: "Your answers", look: "card", blocks: [{ kind: "facts", facts: [{ name: "Water", value: "Rain only", code: false }] }] },
  ],
};

function page(): ReactElement {
  return (
    <div>
      <HeadView head={head} titleRef={createRef()} />
      <SectionView section={everySection} />
    </div>
  );
}

/** Elements a keyboard or a pointer could act on. */
const operable = "a, button, input, select, textarea, summary, [role='slider'], [draggable='true'], [tabindex], [contenteditable]";

describe("typeset", () => {
  it("HeadView draws one h1 with tabIndex -1 and data-say, the eyebrow, the status box, the facts and the synthetic label in bold", () => {
    const titleRef = createRef<HTMLHeadingElement>();
    const { container } = render(<HeadView head={head} titleRef={titleRef} />);
    const [h1, ...others] = screen.getAllByRole("heading", { level: 1 });
    expect(others).toEqual([]);
    expect(h1.textContent).toBe("Your plan, with warnings");
    expect(h1.tabIndex).toBe(-1);
    expect(h1.hasAttribute("data-say")).toBe(true);
    expect(titleRef.current).toBe(h1);
    expect(screen.getByText(head.eyebrow).hasAttribute("data-say")).toBe(true);
    const status = container.querySelector(".rs-status");
    expect(status?.textContent).toBe(`With warnings. ${head.status.text}`);
    expect(Array.from(container.querySelectorAll(".rs-for > span"), span => span.textContent)).toEqual(head.facts);
    expect(screen.getByText(head.synthetic ?? "").tagName).toBe("B");
    expect(container.querySelector(".rs-intro")).toBeNull();
  });

  it("[R33] the status box has an aria-hidden icon and a bold label in words; its tone is a class, never the only signal", () => {
    const statuses = (["ok", "warn", "info", "neutral"] as const).map(tone => {
      const { container } = render(<HeadView head={{ ...head, status: { ...head.status, tone } }} titleRef={createRef()} />);
      const status = container.querySelector(".rs-status");
      if (status === null) throw new Error("no status box");
      return status;
    });
    for (const status of statuses) {
      expect(status.querySelector("b")?.textContent).toBe("With warnings.");
      expect(Array.from(status.querySelectorAll("svg"), svg => svg.closest("[aria-hidden='true']") !== null)).toEqual([true]);
      expect(status.getAttribute("style")).toBeNull();
    }
    expect(statuses.map(status => status.className)).toEqual(["rs-status rs-tone-ok", "rs-status rs-tone-warn", "rs-status rs-tone-info", "rs-status rs-tone-neutral"]);
  });

  it("SectionView draws a section labelled by its h2 (aria-labelledby from useId), h3 for a subhead, and data-say on every readable text", () => {
    const { container } = render(<SectionView section={everySection} />);
    const region = screen.getByRole("region", { name: "Why this plan ranked first" });
    const h2 = within(region).getByRole("heading", { level: 2 });
    expect(region.getAttribute("aria-labelledby")).toBe(h2.id);
    expect(h2.hasAttribute("data-say")).toBe(true);
    expect(within(region).getByRole("heading", { level: 3, name: "Also good to know" }).hasAttribute("data-say")).toBe(true);
    expect(region.classList.contains("rs-flagged")).toBe(true);

    // Listen reads each [data-say] once, skipping aria-hidden parts, so every word shown must sit under exactly one.
    // A table's header row is left out: each cell names its own column.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const unread: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || (node.textContent ?? "").trim() === "" || parent.closest("[aria-hidden='true'], thead") !== null) continue;
      if (parent.closest("[data-say]") === null) unread.push(node.textContent ?? "");
    }
    expect(unread).toEqual([]);
    expect(Array.from(container.querySelectorAll("[data-say] [data-say]"), element => element.textContent)).toEqual([]);
  });

  it("[R4] a year line’s picture is aria-hidden, has pointer-events none, and holds no button, input, slider, link, draggable or tabindex 0 element", () => {
    const { container } = render(<SectionView section={{ id: "timeline", title: "When to plant and harvest", look: "card", blocks: [fourDayCrop] }} />);
    const pictures = container.querySelectorAll(".rs-track");
    expect(pictures).toHaveLength(1);
    const [picture] = Array.from(pictures);
    expect(picture.getAttribute("aria-hidden")).toBe("true");
    expect(picture.querySelectorAll(".rs-bar")).toHaveLength(4);
    expect(picture.querySelector(".rs-legend")?.textContent).toContain("No planned crop");
    expect(container.querySelectorAll(operable)).toHaveLength(0);
  });

  it("[R4] a year line’s rows are an ordered list that says each bar in words, with the same mark as its bar", () => {
    const { container } = render(<SectionView section={{ id: "timeline", title: "When to plant and harvest", look: "card", blocks: [fourDayCrop] }} />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map(row => row.textContent)).toEqual(fourDayCrop.rows.map(row => `${row.mark ?? ""}${row.head}${row.lines.join("")}`));
    const barMarks = Array.from(container.querySelectorAll(".rs-lane .rs-mark"), mark => mark.textContent);
    const rowMarks = rows.flatMap(row => (row.classList.contains("rs-step-gap") ? [] : [row.querySelector(".rs-step-n")?.textContent]));
    expect(barMarks).toEqual(["1", "2"]);
    expect(rowMarks).toEqual(barMarks);
    expect(within(rows[1]).queryByText("1")).toBeNull();
  });

  it("a year line given no rows draws its picture and no empty list", () => {
    const { container } = render(<SectionView section={{ id: "compared", title: "Compared with last year", look: "card", blocks: [{ ...fourDayCrop, rows: [] }] }} />);
    expect(container.querySelector(".rs-track")).not.toBeNull();
    expect(container.querySelectorAll("ol, ul")).toHaveLength(0);
  });

  it("a crop bar is drawn at its own share of the year, and its number is a disc beside it in the lane, not inside it", () => {
    const { container } = render(<SectionView section={{ id: "timeline", title: "When to plant and harvest", look: "card", blocks: [fourDayCrop] }} />);
    const [shortCrop] = Array.from(container.querySelectorAll<HTMLElement>(".rs-bar.rs-look-crop"));
    expect(shortCrop.textContent).toBe("");
    expect(shortCrop.style.width).toBe(`${((4 / yearDays) * 100).toFixed(3)}%`);
    expect(Number.parseFloat(shortCrop.style.left)).toBe(0);
    const marks = Array.from(container.querySelectorAll(".rs-lane > .rs-mark"), mark => mark.textContent);
    expect(marks).toEqual(["1", "2"]);
  });

  it("a table keeps its caption and scope headers; every body row is read by Listen, each cell after its column name", () => {
    render(<SectionView section={{ id: "months", title: "Rain and temperature by month", look: "card", blocks: everyKind.filter(block => block.kind === "table") }} />);
    const table = screen.getByRole("table", { name: "Month by month: rain in mm" });
    expect(within(table).getAllByRole("columnheader").map(header => [header.textContent, header.getAttribute("scope")])).toEqual([["Month", "col"], ["Usual rain", "col"], ["Dry year", "col"]]);
    expect(within(table).getAllByRole("rowheader").map(header => [header.textContent, header.getAttribute("scope")])).toEqual([["July", "row"], ["August", "row"]]);
    expect(within(table).getAllByRole("cell").map(cell => cell.textContent)).toEqual([
      "Usual rain: 38.0", "Dry year: 12.5", "Usual rain: 41.2", "Dry year: Not available: too few seasons",
    ]);
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    for (const row of Array.from(bodyRows)) expect(row.hasAttribute("data-say")).toBe(true);
    for (const cell of Array.from(table.querySelectorAll("tbody th, tbody td"))) expect(cell.closest("[data-say]")).not.toBeNull();
  });

  it("[R20] a source item with an href is a link that opens in a new tab with rel noreferrer; without one it is plain text", () => {
    render(<SectionView section={details.sections[0]} />);
    const link = screen.getByRole("link", { name: "NASA POWER daily data" });
    expect(link.getAttribute("href")).toBe("https://power.larc.nasa.gov/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(" ")).toContain("noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("A source with no address").tagName).toBe("B");
  });

  it("through the model, a source address that is not http or https is drawn as plain text, never a link", () => {
    const addresses = ["https://example.org/safe", "javascript:alert(1)", "data:text/html,<b>hi</b>", "ftp://example.org/file", "mailto:someone@example.org", "http://example.org/plain"];
    const base = variant("run_provenance");
    const { provenance } = base.result.details;
    const [source] = provenance.sources;
    const sources = addresses.map((url, index) => ({ ...source, id: `source-${index}`, title: `Source ${index}`, url }));
    const snapshot = completedSnapshotSchema.parse({ ...base, result: { ...base.result, details: { ...base.result.details, provenance: { ...provenance, sources } } } });
    const section = detailsPage(snapshot, formatIn("en-GB")).sections.find(each => each.id === "sources");
    if (section === undefined) throw new Error("No sources section.");
    render(<SectionView section={section} />);
    expect(screen.getAllByRole("link").map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Source 0", "https://example.org/safe"],
      ["Source 5", "http://example.org/plain"],
    ]);
    expect([1, 2, 3, 4].map(index => screen.getByText(`Source ${index}`).tagName)).toEqual(["B", "B", "B", "B"]);
  });

  it("DetailsView draws Back to the result above and below, both calling onBack, and one h1", () => {
    const onBack = vi.fn();
    const titleRef = createRef<HTMLHeadingElement>();
    render(<DetailsView page={details} titleRef={titleRef} onBack={onBack} />);
    const [h1, ...others] = screen.getAllByRole("heading", { level: 1 });
    expect(others).toEqual([]);
    expect(h1.textContent).toBe("How this result was made");
    expect(titleRef.current).toBe(h1);
    const [top, bottom, ...more] = screen.getAllByRole("button", { name: "Back to the result" });
    expect(more).toEqual([]);
    const lastSection = screen.getByRole("region", { name: "Your answers" });
    expect(top.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lastSection.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(top);
    fireEvent.click(bottom);
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("region").map(region => region.getAttribute("aria-labelledby") !== null)).toEqual([true, true]);
  });

  it("two pages drawn side by side share no element id", () => {
    const { container } = render(
      <>
        {page()}
        {page()}
        <DetailsView page={details} titleRef={createRef()} onBack={() => undefined} />
        <DetailsView page={details} titleRef={createRef()} onBack={() => undefined} />
        <Actions card={card({})} onAct={() => undefined} detailsButtonRef={createRef()} keptRef={createRef()} />
        <Actions card={card({})} onAct={() => undefined} detailsButtonRef={createRef()} keptRef={createRef()} />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]"), element => element.id);
    expect(ids.length).toBe(8);
    expect(new Set(ids).size).toBe(ids.length);
    for (const element of Array.from(container.querySelectorAll("[aria-labelledby]"))) {
      const label = document.getElementById(element.getAttribute("aria-labelledby") ?? "");
      expect(label !== null && element.contains(label)).toBe(true);
    }
  });
});

function button(id: ActionButton["id"], label: string, look: ActionButton["look"], state: Partial<Pick<ActionButton, "busy" | "waiting">> = {}): ActionButton {
  return { id, icon: "info", label, look, busy: false, waiting: false, ...state };
}

function card(changes: Partial<ActionsCard>): ActionsCard {
  return {
    title: "What you can do",
    kept: { tone: "info", icon: "info", text: "This plan isn’t saved on this device.", button: button("save", "Save on this device", "inline") },
    alert: null,
    buttons: [
      button("pdf", "Download PDF", "primary"),
      button("details", "View details", "plain"),
      button("change", "Change my answers", "plain"),
      button("clear", "Clear saved data", "quiet"),
    ],
    ...changes,
  };
}

describe("the actions card", () => {
  it("draws each button as a real button with its icon and words, in the card's order, and reports a tap by id", () => {
    const onAct = vi.fn();
    const detailsButtonRef = createRef<HTMLButtonElement>();
    render(<Actions card={card({})} onAct={onAct} detailsButtonRef={detailsButtonRef} keptRef={createRef()} />);
    const region = screen.getByRole("region", { name: "What you can do" });
    const buttons = within(region).getAllByRole("button");
    expect(buttons.map(element => element.textContent)).toEqual(["Save on this device", "Download PDF", "View details", "Change my answers", "Clear saved data"]);
    expect(buttons.map(element => element.getAttribute("type"))).toEqual(buttons.map(() => "button"));
    expect(buttons.every(element => element.querySelector("[aria-hidden='true'] svg") !== null)).toBe(true);
    expect(detailsButtonRef.current?.textContent).toBe("View details");
    expect(buttons[1].className).toContain("btn-primary");
    for (const element of buttons) fireEvent.click(element);
    expect(onAct.mock.calls.map(([id]) => id)).toEqual(["save", "pdf", "details", "change", "clear"]);
  });

  it("a busy button says so with aria-busy and a waiting one with aria-disabled, never the disabled attribute", () => {
    render(
      <Actions
        card={card({ buttons: [button("pdf", "Making the PDF…", "primary", { busy: true }), button("details", "View details", "plain"), button("clear", "Clear saved data", "quiet", { waiting: true })] })}
        onAct={() => undefined}
        detailsButtonRef={createRef()}
        keptRef={createRef()}
      />,
    );
    const busy = screen.getByRole("button", { name: "Making the PDF…" });
    const waiting = screen.getByRole("button", { name: "Clear saved data" });
    const free = screen.getByRole("button", { name: "View details" });
    expect([busy, waiting, free].map(element => [element.getAttribute("aria-busy"), element.getAttribute("aria-disabled"), element.hasAttribute("disabled")])).toEqual([
      ["true", null, false],
      [null, "true", false],
      [null, null, false],
    ]);
    waiting.focus();
    expect(document.activeElement).toBe(waiting);
  });

  it("one role=alert stays in the document: empty while nothing failed, the failure words once one did", () => {
    const props = { onAct: () => undefined, detailsButtonRef: createRef<HTMLButtonElement>(), keptRef: createRef<HTMLParagraphElement>() };
    const { rerender } = render(<Actions card={card({})} {...props} />);
    const [alert, ...others] = screen.getAllByRole("alert");
    expect(others).toEqual([]);
    expect(alert.textContent).toBe("");
    const failure = "We couldn’t make the PDF. Your plan is still here on this page. You can try again.";
    rerender(<Actions card={card({ alert: failure })} {...props} />);
    expect(screen.getAllByRole("alert")).toEqual([alert]);
    expect(alert.textContent).toBe(failure);
  });

  it("the saved line takes focus by script only (tabIndex -1), holds its button, and is not a live region", () => {
    const keptRef = createRef<HTMLParagraphElement>();
    const { rerender } = render(<Actions card={card({})} onAct={() => undefined} detailsButtonRef={createRef()} keptRef={keptRef} />);
    const line = keptRef.current;
    expect(line?.tabIndex).toBe(-1);
    expect(line?.textContent).toBe("This plan isn’t saved on this device.Save on this device");
    expect(line?.hasAttribute("aria-live")).toBe(false);
    expect(within(line ?? document.body).getByRole("button", { name: "Save on this device" })).toBeTruthy();
    rerender(<Actions card={card({ kept: null })} onAct={() => undefined} detailsButtonRef={createRef()} keptRef={keptRef} />);
    expect(keptRef.current).toBeNull();
  });
});
