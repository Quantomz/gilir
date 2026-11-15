import {
  PDFDocument, StandardFonts, beginMarkedContent, beginText, clip, endMarkedContent, endPath, endText, popGraphicsState,
  pushGraphicsState, rectangle, rgb, setFillingColor, setFontAndSize, setTextMatrix, showText,
} from "pdf-lib";
import type { Color, PDFFont, PDFName, PDFPage } from "pdf-lib";
import type { CompletedSnapshot } from "@/contracts/result";
import { compose } from "./compose";
import { layout, paperFor } from "./layout";
import type { Face, Mark, Measure, Page, Paper, Tone } from "./layout";
import type { PdfDocument } from "./model";
import type { Reader } from "./text";

export async function renderPdf(snapshot: CompletedSnapshot, reader: Reader): Promise<Blob> {
  const doc = compose(snapshot, reader);
  const paper = paperFor(reader.locale);
  // pdf-lib otherwise writes the clock and its own Producer URL, so two exports of one snapshot would differ.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  draw(pdf, paper, layout(doc, paper, measureWith(fonts)), fonts);
  metadata(pdf, doc);
  const bytes = await pdf.save();
  return new Blob([bytes.slice()], { type: "application/pdf" });
}

/**
 * pdf-lib's widthOfTextAtSize subtracts kerning pairs, but text is shown with a plain Tj, which does not kern, so a line
 * measured that way can end past the margin.
 */
function measureWith(fonts: Readonly<Record<Face, PDFFont>>): Measure {
  const advances: Record<Face, Map<string, number>> = { regular: new Map(), bold: new Map() };
  return (text, face, size) => {
    let width = 0;
    for (const ch of text) {
      let advance = advances[face].get(ch);
      if (advance === undefined) {
        advance = fonts[face].widthOfTextAtSize(ch, 1000);
        advances[face].set(ch, advance);
      }
      width += advance;
    }
    return (width * size) / 1000;
  };
}

const paperTones: Record<Tone, Color> = {
  paper: hex("#FFFFFF"),
  ink: hex("#111A12"),
  ink2: hex("#3D4A3B"),
  line: hex("#B7C2B2"),
  sunk: hex("#F1F4EE"),
  green: hex("#2F5A1A"),
  warn: hex("#8A3A12"),
};

function hex(value: string): Color {
  const channel = (start: number) => parseInt(value.slice(start, start + 2), 16) / 255;
  return rgb(channel(1), channel(3), channel(5));
}

/** Text is written with raw operators because pdf-lib's drawText({ font }) and setFont add a font resource per call. */
function draw(pdf: PDFDocument, paper: Paper, pages: readonly Page[], fonts: Readonly<Record<Face, PDFFont>>): void {
  for (const { marks } of pages) {
    const page = pdf.addPage([paper.width, paper.height]);
    const keys: Record<Face, PDFName> = {
      regular: page.node.newFontDictionary(fonts.regular.name, fonts.regular.ref),
      bold: page.node.newFontDictionary(fonts.bold.name, fonts.bold.ref),
    };
    const pen = { font: "", tone: "" };
    const put = (mark: Mark) => {
      switch (mark.kind) {
        case "text": {
          const font = `${mark.face} ${mark.size}`;
          page.pushOperators(beginText());
          if (pen.font !== font) page.pushOperators(setFontAndSize(keys[mark.face], mark.size));
          if (pen.tone !== mark.tone) page.pushOperators(setFillingColor(paperTones[mark.tone]));
          page.pushOperators(setTextMatrix(1, 0, 0, 1, mark.x, mark.y), showText(fonts[mark.face].encodeText(mark.text)), endText());
          pen.font = font;
          pen.tone = mark.tone;
          return;
        }
        case "box":
          page.drawRectangle({
            x: mark.x, y: mark.y, width: mark.width, height: mark.height,
            color: mark.fill === null ? undefined : paperTones[mark.fill],
            borderColor: mark.stroke === null ? undefined : paperTones[mark.stroke],
            borderWidth: mark.stroke === null ? 0 : 1.25,
            borderDashArray: mark.line === "dashed" ? [4, 3] : undefined,
          });
          return;
        case "hatch":
          hatch(page, mark.x, mark.y, mark.width, mark.height);
          return;
        case "rule":
          page.drawLine({ start: { x: mark.x, y: mark.y }, end: { x: mark.x + mark.width, y: mark.y }, thickness: 1, color: paperTones.line });
          return;
        case "group":
          page.pushOperators(beginMarkedContent(mark.tag));
          mark.marks.forEach(put);
          page.pushOperators(endMarkedContent());
          return;
      }
    };
    marks.forEach(put);
  }
}

function hatch(page: PDFPage, x: number, y: number, width: number, height: number): void {
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
  for (let offset = -height; offset < width; offset += 5) {
    page.drawLine({ start: { x: x + offset, y }, end: { x: x + offset + height, y: y + height }, thickness: 0.9, color: paperTones.ink });
  }
  page.pushOperators(popGraphicsState());
}

function metadata(pdf: PDFDocument, doc: PdfDocument): void {
  pdf.setTitle(doc.title, { showInWindowTitleBar: true });
  pdf.setSubject(doc.head.title);
  pdf.setCreator("Gilir");
  pdf.setProducer("Gilir");
  pdf.setLanguage("en");
}
