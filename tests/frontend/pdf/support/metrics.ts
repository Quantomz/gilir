// A Tj does not kern, so a run is as wide as its characters' advances added up.
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Measure } from "@/client/pdf/layout";

let loaded: Promise<Measure> | null = null;

export function helvetica(): Promise<Measure> {
  loaded ??= (async () => {
    const scratch = await PDFDocument.create();
    const fonts = { regular: await scratch.embedFont(StandardFonts.Helvetica), bold: await scratch.embedFont(StandardFonts.HelveticaBold) };
    return (text, face, size) => [...text].reduce((width, ch) => width + fonts[face].widthOfTextAtSize(ch, size), 0);
  })();
  return loaded;
}
