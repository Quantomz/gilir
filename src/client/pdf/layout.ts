import type { BarLook, Block, Head, Item, PdfDocument, Section, StatusTone, Timeline, TimelineBlock } from "./model";
import { pdfText, subText } from "./text";
import type { PdfText } from "./text";
import { pageNumber } from "./words";

export type Face = "regular" | "bold";
export type Measure = (text: PdfText, face: Face, size: number) => number;

export interface Paper {
  readonly name: "a4" | "letter";
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}
const papers = {
  a4: { name: "a4", width: 595.28, height: 841.89, margin: 48 },
  letter: { name: "letter", width: 612, height: 792, margin: 48 },
} as const satisfies Record<Paper["name"], Paper>;

/** CLDR's US-Letter territories (supplementalData.xml, paperSize). */
const letterRegions = new Set(["BZ", "CA", "CL", "CO", "CR", "GT", "MX", "NI", "PA", "PH", "PR", "SV", "US", "VE"]);

export function paperFor(locale: string): Paper {
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).region;
  } catch {
    region = undefined;
  }
  return region !== undefined && letterRegions.has(region) ? papers.letter : papers.a4;
}

export type Tone = "ink" | "ink2" | "line" | "sunk" | "green" | "warn" | "paper";

type Style = "brand" | "title" | "heading" | "body" | "strong" | "small";
const styles: Record<Style, { readonly face: Face; readonly size: number; readonly leading: number; readonly tone: Tone }> = {
  brand: { face: "bold", size: 12, leading: 16.8, tone: "ink2" },
  title: { face: "bold", size: 24, leading: 29, tone: "ink" },
  heading: { face: "bold", size: 17, leading: 22, tone: "ink" },
  body: { face: "regular", size: 14, leading: 19.6, tone: "ink" },
  strong: { face: "bold", size: 14, leading: 19.6, tone: "ink" },
  small: { face: "regular", size: 12, leading: 16.8, tone: "ink2" },
};

export interface Page {
  readonly marks: readonly Mark[];
}

/** In PDF points, origin bottom left and y up. A text mark's y is its baseline. */
export type Mark =
  | { readonly kind: "text"; readonly x: number; readonly y: number; readonly text: PdfText; readonly face: Face; readonly size: number; readonly tone: Tone }
  | { readonly kind: "box"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: Tone | null; readonly stroke: Tone | null; readonly line: "solid" | "dashed" }
  | { readonly kind: "hatch"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly kind: "rule"; readonly x: number; readonly y: number; readonly width: number }
  | { readonly kind: "group"; readonly tag: "Timeline"; readonly marks: readonly Mark[] };

export function layout(doc: PdfDocument, paper: Paper, measure: Measure): readonly Page[] {
  const footer = footerOf(doc.footer, paper, measure);
  const frame: Frame = {
    measure,
    left: paper.margin,
    width: paper.width - 2 * paper.margin,
    top: paper.height - paper.margin,
    bottom: paper.margin + footer.height + 18,
  };
  const sections: readonly Section<Block | TimelineBlock>[] = doc.sections;
  const pieces = [
    ...headPieces(frame, doc.head),
    ...sections.flatMap(section => sectionPieces(frame, section)),
    ...closingPieces(frame, doc.closing),
  ];
  const bodies = paginate(pieces, frame);
  return bodies.map((marks, index) => ({ marks: [...marks, ...footer.marks(index + 1, bodies.length)] }));
}

export function wrap(text: PdfText, face: Face, size: number, width: number, measure: Measure): readonly PdfText[] {
  const fits = (start: number, end: number) => measure(subText(text, start, end), face, size) <= width;
  const lines: PdfText[] = [];
  let lineStart = -1;
  let lineEnd = -1;
  for (const token of text.matchAll(/[^ ]+/g)) {
    let start = token.index;
    const end = start + token[0].length;
    if (lineStart >= 0 && fits(lineStart, end)) {
      lineEnd = end;
      continue;
    }
    if (lineStart >= 0) lines.push(subText(text, lineStart, lineEnd));
    while (!fits(start, end)) {
      let low = start + 1;
      let high = end - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(start, middle)) low = middle;
        else high = middle - 1;
      }
      lines.push(subText(text, start, low));
      start = low;
    }
    lineStart = start;
    lineEnd = end;
  }
  if (lineStart >= 0) lines.push(subText(text, lineStart, lineEnd));
  return lines;
}

interface Frame {
  readonly measure: Measure;
  readonly left: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}

interface Piece {
  readonly space: number;
  readonly height: number;
  readonly keepWithNext: boolean;
  readonly repeat: Piece | null;
  marks(top: number): readonly Mark[];
}

const plain = { keepWithNext: false, repeat: null } as const;

function paginate(pieces: readonly Piece[], frame: Frame): readonly (readonly Mark[])[] {
  const pages: Mark[][] = [];
  let marks: Mark[] = [];
  let y = frame.top;
  const place = (piece: Piece) => {
    if (marks.length) y -= piece.space;
    marks.push(...piece.marks(y));
    y -= piece.height;
  };
  pieces.forEach((piece, index) => {
    if (marks.length && y - piece.space - chainHeight(pieces, index, frame) < frame.bottom) {
      pages.push(marks);
      marks = [];
      y = frame.top;
      if (piece.repeat) place(piece.repeat);
    }
    place(piece);
  });
  pages.push(marks);
  return pages;
}

function chainHeight(pieces: readonly Piece[], index: number, frame: Frame): number {
  let height = pieces[index].height;
  for (let next = index; pieces[next].keepWithNext && next + 1 < pieces.length; next++) {
    height += pieces[next + 1].space + pieces[next + 1].height;
  }
  return height <= frame.top - frame.bottom ? height : pieces[index].height;
}

function together(frame: Frame, parts: readonly Piece[]): readonly Piece[] {
  if (parts.length < 2) return parts;
  const height = parts.reduce((sum, part, index) => sum + part.height + (index ? part.space : 0), 0);
  if (height > frame.top - frame.bottom) return parts;
  return [{
    space: parts[0].space,
    height,
    keepWithNext: parts[parts.length - 1].keepWithNext,
    repeat: null,
    marks: top => {
      let y = top;
      return parts.flatMap((part, index) => {
        if (index) y -= part.space;
        const marks = part.marks(y);
        y -= part.height;
        return marks;
      });
    },
  }];
}

const kept = (pieces: readonly Piece[]): Piece[] => pieces.map(piece => ({ ...piece, keepWithNext: true }));
const spaced = (piece: Piece, space: number): Piece => ({ ...piece, space });

function textLines(frame: Frame, text: PdfText, style: Style, options: { readonly space?: number; readonly tone?: Tone } = {}): Piece[] {
  const { face, size, leading, tone } = styles[style];
  return wrap(text, face, size, frame.width, frame.measure).map((line, index) => ({
    ...plain,
    space: index === 0 ? options.space ?? 0 : 0,
    height: leading,
    marks: top => [textMark(frame.left, top - size, line, { face, size, tone: options.tone ?? tone })],
  }));
}

function ruleLine(frame: Frame, space: number, below: number): Piece {
  return { ...plain, space, height: below, marks: top => [{ kind: "rule", x: frame.left, y: top, width: frame.width }] };
}

function keepNoLineAlone(lines: readonly Piece[]): readonly Piece[] {
  if (lines.length <= 4) return kept(lines.slice(0, -1)).concat(lines.slice(-1));
  return [...kept(lines.slice(0, 2)), ...lines.slice(2, -2), ...kept(lines.slice(-2, -1)), ...lines.slice(-1)];
}

const inset = (frame: Frame, by: number): Frame => ({ ...frame, left: frame.left + by, width: frame.width - 2 * by });
const indented = (frame: Frame, by: number): Frame => ({ ...frame, left: frame.left + by, width: frame.width - by });

function boxed(frame: Frame, padding: number, space: number, stroke: Tone, parts: (inside: Frame) => readonly Piece[]): readonly Piece[] {
  const inner = together(inset(frame, padding), parts(inset(frame, padding)));
  if (inner.length !== 1) return inner.map((part, index) => (index ? part : spaced(part, space)));
  const [content] = inner;
  return [{
    ...plain,
    space,
    height: content.height + 2 * padding,
    marks: top => [
      { kind: "box", x: frame.left, y: top - content.height - 2 * padding, width: frame.width, height: content.height + 2 * padding, fill: null, stroke, line: "solid" },
      ...content.marks(top - padding),
    ],
  }];
}

const statusTones: Record<StatusTone, Tone> = { ok: "green", warn: "warn", plain: "ink" };

function headPieces(frame: Frame, head: Head): readonly Piece[] {
  const tone = statusTones[head.status.tone];
  const { synthetic } = head;
  return [
    ...together(frame, [
      ...textLines(frame, head.brand, "brand"),
      ...textLines(frame, head.title, "title", { space: 6 }),
      ...textLines(frame, head.place, "strong", { space: 10 }),
      ...head.lines.flatMap(line => textLines(frame, line, "body", { space: 2 })),
      { ...plain, space: 12, height: 2, marks: top => [{ kind: "box", x: frame.left, y: top - 2, width: frame.width, height: 2, fill: "ink", stroke: null, line: "solid" }] },
    ]),
    ...(synthetic === null ? [] : boxed(frame, 8, 14, "warn", inside => textLines(inside, synthetic, "strong"))),
    ...boxed(frame, 12, 14, tone, inside => [
      ...textLines(inside, head.status.label, "strong", { tone }),
      ...textLines(inside, head.status.text, "body", { space: 4 }),
    ]),
  ];
}

function sectionPieces(frame: Frame, section: Section<Block | TimelineBlock>): readonly Piece[] {
  const heading = kept(together(frame, [ruleLine(frame, 24, 12), ...textLines(frame, section.heading, "heading")]));
  return [...heading, ...section.blocks.flatMap((block, index) => {
    const pieces = blockPieces(frame, block);
    const next = section.blocks[index + 1];
    const leadsIn = block.kind === "text" && (block.style === "strong" || next?.kind === "list" || next?.kind === "table");
    return leadsIn ? [...pieces.slice(0, -1), ...kept(pieces.slice(-1))] : pieces;
  })];
}

function blockPieces(frame: Frame, block: Block | TimelineBlock): readonly Piece[] {
  switch (block.kind) {
    case "text": return keepNoLineAlone(textLines(frame, block.text, block.style, { space: 8 }));
    case "list": return listPieces(frame, block.marker, block.items);
    case "table": return tablePieces(frame, block.columns, block.rows);
    case "timeline": return timelinePieces(frame, block.timeline);
  }
}

function listPieces(frame: Frame, marker: "bullet" | "number" | "none", items: readonly Item[]): readonly Piece[] {
  const markers = items.map((_, index) => marker === "bullet" ? pdfText("•") : marker === "number" ? pdfText(`${index + 1}.`) : null);
  const markerSize = styles.strong.size;
  const indent = marker === "none" ? 0 : Math.max(24, ...markers.map(text => (text ? frame.measure(text, "bold", markerSize) + 10 : 0)));
  const inner = indented(frame, indent);
  return items.flatMap((item, index) => {
    const parts = [
      ...(item.head === null ? [] : textLines(inner, item.head, "strong")),
      ...item.lines.flatMap(line => textLines(inner, line, "body")),
    ];
    const text = markers[index];
    if (!parts.length) return [];
    const [first, ...rest] = parts;
    const marked: Piece = {
      ...first,
      space: 8,
      marks: top => [
        ...(text === null ? [] : [textMark(frame.left, top - markerSize, text, { face: "bold", size: markerSize, tone: "ink" })]),
        ...first.marks(top),
      ],
    };
    return together(frame, [marked, ...rest]);
  });
}

/** PDF text extraction follows drawing order, so cells are drawn line by line across the row. */
function tablePieces(frame: Frame, columns: readonly PdfText[], rows: readonly (readonly PdfText[])[]): readonly Piece[] {
  const { measure } = frame;
  const { size, leading } = styles.body;
  const gap = 10;
  const padding = 4;
  const firstColumn = Math.min(frame.width * 0.3, Math.max(...[columns[0], ...rows.map(row => row[0])].map(cell => measure(cell, "bold", size))) + gap);
  const otherColumn = (frame.width - firstColumn) / Math.max(1, columns.length - 1);
  const widths = columns.map((_, index) => (index === 0 ? firstColumn : otherColumn));
  const lefts = widths.map((_, index) => frame.left + widths.slice(0, index).reduce((sum, width) => sum + width, 0));
  const row = (cells: readonly PdfText[], face: Face, under: "strong" | "light"): Piece => {
    const lines = cells.map((cell, index) => wrap(cell, face, size, widths[index] - gap, measure));
    const count = Math.max(1, ...lines.map(cell => cell.length));
    const height = count * leading + 2 * padding;
    return {
      ...plain,
      space: 0,
      height,
      marks: top => [
        ...Array.from({ length: count }, (_, line) => lines.flatMap((cell, index) => cell[line] === undefined ? []
          : [textMark(lefts[index], top - padding - line * leading - size, cell[line], { face, size, tone: "ink" })])).flat(),
        under === "strong"
          ? { kind: "box", x: frame.left, y: top - height - 1.5, width: frame.width, height: 1.5, fill: "ink", stroke: null, line: "solid" }
          : { kind: "rule", x: frame.left, y: top - height, width: frame.width },
      ],
    };
  };
  const header: Piece = { ...row(columns, "bold", "strong"), space: 8, keepWithNext: true };
  return [header, ...rows.map(cells => ({ ...row(cells, "regular", "light"), repeat: { ...header, keepWithNext: false } }))];
}

function timelinePieces(frame: Frame, timeline: Timeline): readonly Piece[] {
  const { measure, left, width } = frame;
  const label = styles.small;
  const keyLook = { face: "bold", size: 12, tone: "ink" } as const;
  const lane = 32;
  const barInset = 4;
  const tick = 5;
  const keyRow = 17;
  const chipHeight = 16;

  const spans = keySpans(timeline.bars);
  const numbers = spans.map(span => {
    const text = pdfText(String(span.key));
    return { text, textWidth: measure(text, keyLook.face, keyLook.size) };
  });
  const roomRightOfLastTick = numbers.length ? 2 + Math.max(...numbers.map(number => number.textWidth)) : 0;
  const trackWidth = width - roomRightOfLastTick;
  const trackRight = left + trackWidth;
  const scale = trackWidth / timeline.days;
  const xAt = (day: number) => left + day * scale;
  const keys = spans.map((span, index) => ({
    ...numbers[index],
    centre: xAt((span.from + span.to) / 2),
    inside: (span.to - span.from) * scale >= numbers[index].textWidth + 14,
  }));
  const { placed: below, rows: keyRows } = placeKeys(keys.filter(key => !key.inside));

  const legendIndent = 34;
  const legend = timeline.legend.map(entry => ({ ...entry, lines: wrap(entry.label, label.face, label.size, width - legendIndent, measure) }));
  const legendHeight = legend.reduce((sum, entry) => sum + Math.max(1, entry.lines.length) * label.leading + 4, 0);
  const drawingHeight = label.leading + tick + lane + (keyRows ? 4 + keyRows * keyRow : 0) + (timeline.years.length ? 4 + label.leading : 0);

  const drawing = (top: number): Mark[] => {
    const laneTop = top - label.leading - tick;
    const laneBottom = laneTop - lane;
    const barBottom = laneBottom + barInset;
    const barHeight = lane - 2 * barInset;
    const marks: Mark[] = [];
    for (const month of timeline.months) {
      if (month.label === null) continue;
      const x = xAt(month.from) + 2;
      if (x + measure(month.label, label.face, label.size) <= xAt(month.from + month.days) - 1) {
        marks.push(textMark(x, top - label.size, month.label, label));
      }
    }
    marks.push({ kind: "box", x: left, y: laneBottom, width: trackWidth, height: lane, fill: "sunk", stroke: null, line: "solid" });
    for (const month of timeline.months.slice(1)) {
      marks.push({ kind: "box", x: xAt(month.from) - 0.4, y: laneTop, width: 0.8, height: tick, fill: "ink2", stroke: null, line: "solid" });
    }
    for (const bar of timeline.bars) {
      const x = xAt(bar.from);
      marks.push(...lookMarks(bar.look, { x, y: barBottom, width: Math.min(Math.max(bar.days * scale, 2), trackRight - x), height: barHeight }));
    }
    const chipBottom = laneBottom + (lane - chipHeight) / 2;
    for (const key of keys.filter(item => item.inside)) {
      const chipWidth = key.textWidth + 8;
      marks.push({ kind: "box", x: key.centre - chipWidth / 2, y: chipBottom, width: chipWidth, height: chipHeight, fill: "paper", stroke: "ink", line: "solid" });
    }
    for (const key of keys.filter(item => item.inside)) {
      marks.push(textMark(key.centre - key.textWidth / 2, chipBottom + 4, key.text, keyLook));
    }
    for (const key of [...below].sort((a, b) => a.row - b.row || a.x - b.x)) {
      const rowTop = laneBottom - 4 - key.row * keyRow;
      marks.push({ kind: "box", x: key.centre - 0.5, y: rowTop - keyLook.size - 1, width: 1, height: barBottom - rowTop + keyLook.size + 1, fill: "ink", stroke: null, line: "solid" });
      marks.push(textMark(key.x, rowTop - keyLook.size, key.text, keyLook));
    }
    const yearsTop = laneBottom - (keyRows ? 4 + keyRows * keyRow : 0) - 4;
    for (const year of timeline.years) {
      const x = Math.min(xAt(year.from) + 2, left + width - measure(year.label, label.face, label.size));
      marks.push(textMark(x, yearsTop - label.size, year.label, label));
    }
    return marks;
  };

  return [{
    ...plain,
    space: 10,
    height: drawingHeight + 10 + legendHeight,
    marks: top => {
      let y = top - drawingHeight - 10;
      const keyMarks = legend.flatMap(entry => {
        const marks: Mark[] = [
          ...lookMarks(entry.look, { x: left, y: y - label.size, width: 26, height: 12 }),
          ...entry.lines.map((line, index) => textMark(left + legendIndent, y - label.size - index * label.leading, line, label)),
        ];
        y -= Math.max(1, entry.lines.length) * label.leading + 4;
        return marks;
      });
      return [{ kind: "group", tag: "Timeline", marks: drawing(top) }, ...keyMarks];
    },
  }];
}

function keySpans(bars: Timeline["bars"]): readonly { readonly key: number; readonly from: number; readonly to: number }[] {
  const spans: { key: number; from: number; to: number }[] = [];
  for (const bar of bars) {
    if (bar.key === null) continue;
    const last = spans[spans.length - 1];
    if (last && last.key === bar.key && last.to === bar.from) last.to = bar.from + bar.days;
    else spans.push({ key: bar.key, from: bar.from, to: bar.from + bar.days });
  }
  return spans;
}

function placeKeys<K extends { readonly centre: number; readonly textWidth: number }>(keys: readonly K[]) {
  const rows: [number, number][][] = [];
  const stems: { readonly x: number; readonly row: number }[] = [];
  const placed = [...keys].sort((a, b) => b.centre - a.centre).map(key => {
    const x = key.centre + 2;
    const own: [number, number] = [key.centre - 2, x + key.textWidth + 3];
    const apart = ([a, b]: [number, number]) => own[1] <= a || b <= own[0];
    const free = (row: number) => (rows[row] ?? []).every(apart)
      && stems.every(stem => stem.row <= row || stem.x < own[0] || stem.x > own[1])
      && rows.slice(0, row).every(above => above.every(([a, b]) => key.centre < a || key.centre > b));
    let row = 0;
    while (row < rows.length && !free(row)) row++;
    (rows[row] ??= []).push(own);
    stems.push({ x: key.centre, row });
    return { ...key, x, row };
  });
  return { placed, rows: rows.length };
}

function lookMarks(look: BarLook, box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): Mark[] {
  switch (look) {
    case "crop": return [{ kind: "box", ...box, fill: "green", stroke: "ink", line: "solid" }];
    case "after_harvest": return [{ kind: "hatch", ...box }, { kind: "box", ...box, fill: null, stroke: "ink", line: "solid" }];
    case "no_crop": return [{ kind: "box", ...box, fill: null, stroke: "ink", line: "dashed" }];
  }
}

function textMark(x: number, y: number, text: PdfText, look: { readonly face: Face; readonly size: number; readonly tone: Tone }): Mark {
  return { kind: "text", x, y, text, face: look.face, size: look.size, tone: look.tone };
}

function closingPieces(frame: Frame, closing: readonly PdfText[]): readonly Piece[] {
  return together(frame, [ruleLine(frame, 24, 10), ...closing.flatMap((line, index) => textLines(frame, line, "small", { space: index ? 6 : 0 }))]);
}

function footerOf(footer: PdfDocument["footer"], paper: Paper, measure: Measure) {
  const { face, size, leading } = styles.small;
  const left = paper.margin;
  const width = paper.width - 2 * paper.margin;
  const numberRoom = measure(pdfText(pageNumber(999, 999)), face, size) + 12;
  const titleLines = wrap(footer.left, face, size, width - numberRoom, measure);
  const syntheticLines = footer.synthetic === null ? [] : wrap(footer.synthetic, face, size, width, measure);
  const lines = [...titleLines, ...syntheticLines];
  const height = 8 + lines.length * leading;
  const top = paper.margin + height;
  return {
    height,
    marks: (page: number, pages: number): Mark[] => {
      const number = pdfText(pageNumber(page, pages));
      const baseline = (index: number) => top - 8 - size - index * leading;
      return [
        { kind: "rule", x: left, y: top, width },
        ...titleLines.map((line, index) => textMark(left, baseline(index), line, styles.small)),
        textMark(left + width - measure(number, face, size), baseline(0), number, styles.small),
        ...syntheticLines.map((line, index) => textMark(left, baseline(titleLines.length + index), line, styles.small)),
      ];
    },
  };
}
