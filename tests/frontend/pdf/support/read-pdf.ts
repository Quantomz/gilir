// Reads a PDF made by pdf-lib back into text runs with pdf-lib itself, so committed tests need no poppler (CI has
// none). Each page's content streams are decoded and their operators followed in order: "/F n Tf" picks a font,
// "1 0 0 1 x y Tm" places a run, "<hex> Tj" is the run in windows-1252, "/Timeline BMC … EMC" marks the timeline, and
// "m l l l h" paths under "cm" offsets are rectangles.
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream } from "pdf-lib";
import type { PDFObject, PDFPage } from "pdf-lib";

export interface TextRun {
  /** The run's /BaseFont: "/Helvetica" or "/Helvetica-Bold". */
  readonly font: string;
  readonly size: number;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Drawn inside the /Timeline BMC … EMC block. */
  readonly inTimeline: boolean;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ReadPage {
  readonly width: number;
  readonly height: number;
  readonly runs: readonly TextRun[];
  /** The runs joined by newlines, in drawing order, which is reading order. */
  readonly text: string;
  /** Marked-content tags opened on this page, e.g. ["Timeline"]. */
  readonly marked: readonly string[];
  /** Rectangles drawn inside the Timeline block, with their offsets applied. */
  readonly timelineBoxes: readonly Box[];
  /** Font resources on the page (2 when render registers each font once). */
  readonly fontResources: number;
}

export interface ReadPdf {
  readonly title: string | undefined;
  readonly subject: string | undefined;
  readonly creator: string | undefined;
  readonly producer: string | undefined;
  readonly language: string | undefined;
  readonly created: Date | undefined;
  readonly modified: Date | undefined;
  readonly pages: readonly ReadPage[];
  /** Every /BaseFont in the file, and how many font programs are embedded (0 for standard fonts). */
  readonly fonts: readonly string[];
  readonly embeddedFontFiles: number;
  /**
   * Annotations on all pages, and these names anywhere in the file's objects. All zero means nothing in the file can act
   * or ask for the network when it is opened. (pdf-lib leaves an empty /Annots array on each page it drew on.)
   */
  readonly active: Readonly<Record<"Annots" | "URI" | "JavaScript" | "Launch" | "EmbeddedFile", number>>;
}

export async function readPdf(blob: Blob): Promise<ReadPdf> {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { updateMetadata: false });
  const names = new Map<string, number>();
  const fonts = new Set<string>();
  let annotations = 0;
  let embeddedFontFiles = 0;
  const seen = new Set<PDFObject>();
  const count = (name: string) => names.set(name, (names.get(name) ?? 0) + 1);
  const visit = (object: PDFObject | undefined): void => {
    if (object instanceof PDFName) count(object.decodeText());
    if (object === undefined || object instanceof PDFName || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFArray) object.asArray().forEach(visit);
    const dict = object instanceof PDFDict ? object : object instanceof PDFStream ? object.dict : null;
    if (dict === null) return;
    for (const [key, value] of dict.entries()) {
      const name = key.decodeText();
      if (name !== "Annots") count(name);
      visit(value);
      if (name === "Annots") annotations += doc.context.lookupMaybe(value, PDFArray)?.size() ?? 1;
      if (name === "BaseFont" && value instanceof PDFName) fonts.add(value.asString());
      if (/^FontFile[23]?$/.test(name)) embeddedFontFiles++;
    }
  };
  for (const [, object] of doc.context.enumerateIndirectObjects()) visit(object);
  const language = doc.catalog.lookup(PDFName.of("Lang"));
  return {
    title: doc.getTitle(),
    subject: doc.getSubject(),
    creator: doc.getCreator(),
    producer: doc.getProducer(),
    language: language instanceof PDFString || language instanceof PDFHexString ? language.decodeText() : undefined,
    created: doc.getCreationDate(),
    modified: doc.getModificationDate(),
    pages: doc.getPages().map(page => readPage(doc, page)),
    fonts: [...fonts].sort(),
    embeddedFontFiles,
    active: {
      Annots: annotations,
      URI: names.get("URI") ?? 0,
      JavaScript: names.get("JavaScript") ?? 0,
      Launch: names.get("Launch") ?? 0,
      EmbeddedFile: (names.get("EmbeddedFile") ?? 0) + (names.get("EmbeddedFiles") ?? 0),
    },
  };
}

const winAnsi = new TextDecoder("windows-1252");
const latin1 = new TextDecoder("latin1");

function readPage(doc: PDFDocument, page: PDFPage): ReadPage {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  const operators = refs.map(ref => {
    const stream = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
    return stream instanceof PDFRawStream ? latin1.decode(decodePDFRawStream(stream).decode()) : "";
  }).join("\n");
  const fontDict = page.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
  const baseFont = new Map(fontDict?.keys().map(key => [key.asString(), String(fontDict.lookup(key, PDFDict).get(PDFName.of("BaseFont")))]) ?? []);

  const runs: TextRun[] = [];
  const marked: string[] = [];
  const timelineBoxes: Box[] = [];
  const saved: [number, number][] = [];
  let offset: [number, number] = [0, 0];
  let font = "";
  let size = 0;
  let at: [number, number] = [0, 0];
  let depth = 0;
  let timeline = -1;
  let path: [number, number][] = [];
  let operands: string[] = [];
  const number = (index: number) => Number(operands[operands.length + index]);
  for (const [token] of operators.matchAll(/<[0-9A-Fa-f]*>|\/[^\s/[\]<>()]+|\[|\]|[^\s/[\]<>()]+/g)) {
    if (!/^[A-Za-z'"*]+$/.test(token) || token === "true" || token === "false") {
      operands.push(token);
      continue;
    }
    switch (token) {
      case "q": saved.push(offset); break;
      case "Q": offset = saved.pop() ?? [0, 0]; break;
      case "cm": offset = [offset[0] + number(-2), offset[1] + number(-1)]; break;
      case "Tf": font = baseFont.get(operands[operands.length - 2]) ?? operands[operands.length - 2]; size = number(-1); break;
      case "Tm": at = [number(-2), number(-1)]; break;
      case "Tj": {
        const hex = operands[operands.length - 1].slice(1, -1);
        const text = winAnsi.decode(Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16)));
        runs.push({ font, size, x: at[0], y: at[1], text, inTimeline: timeline >= 0 });
        break;
      }
      case "BMC": {
        const tag = operands[operands.length - 1].slice(1);
        marked.push(tag);
        if (tag === "Timeline" && timeline < 0) timeline = depth;
        depth++;
        break;
      }
      case "EMC": depth--; if (depth === timeline) timeline = -1; break;
      case "m": path = [[number(-2), number(-1)]]; break;
      case "l": path.push([number(-2), number(-1)]); break;
      case "re": path = []; break;
      case "h": {
        if (timeline >= 0 && path.length === 4) {
          const xs = path.map(([x]) => x + offset[0]);
          const ys = path.map(([, y]) => y + offset[1]);
          timelineBoxes.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
        }
        path = [];
        break;
      }
    }
    operands = [];
  }
  const { width, height } = page.getSize();
  return { width, height, runs, text: runs.map(run => run.text).join("\n"), marked, timelineBoxes, fontResources: baseFont.size };
}
