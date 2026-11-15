import ts from "typescript";
import { describe, expect, it } from "vitest";
import { pdfText } from "@/client/pdf/text";
import { exportedNames, moduleUses, parse, sourceFiles, walk } from "./support/source";

const pdfFiles = ["src/client/pdf.ts", ...sourceFiles("src/client/pdf")];
const isPdfModule = (path: string) => path === "src/client/pdf.ts" || path.startsWith("src/client/pdf/");

describe("the PDF module boundary", () => {
  it("src/client/pdf.ts exports exactly exportPdf and preparePdf", () => {
    expect(exportedNames("src/client/pdf.ts").sort()).toEqual(["exportPdf", "preparePdf"]);
  });

  it("src/client/pdf.ts keeps pdf-lib out of the first load of /: type imports only, and import(\"./pdf/render\") as its only runtime load", () => {
    const uses = moduleUses("src/client/pdf.ts");
    const heavy = uses.filter(use => use.kind === "static value" && (use.specifier.startsWith("pdf-lib") || (use.local?.startsWith("src/client/pdf/") ?? false)));
    expect(heavy).toEqual([]);
    const dynamic = uses.filter(use => use.kind === "dynamic");
    expect(dynamic.every(use => use.local === "src/client/pdf/render")).toBe(true);
    expect(dynamic).toHaveLength(1);
  });

  it("only src/client/pdf/render.ts imports pdf-lib, and nothing imports @pdf-lib/standard-fonts", () => {
    const pdfLib = sourceFiles("src").filter(path => moduleUses(path).some(use => use.specifier === "pdf-lib" || use.specifier.startsWith("pdf-lib/")));
    expect(pdfLib).toEqual(["src/client/pdf/render.ts"]);
    const standardFonts = [...sourceFiles("src"), ...sourceFiles("tests")]
      .filter(path => moduleUses(path).some(use => use.specifier.startsWith("@pdf-lib/")));
    expect(standardFonts).toEqual([]);
  });

  it("only src/client/pdf/text.ts makes PdfText: no `as PdfText` anywhere else", () => {
    const casts: string[] = [];
    for (const path of [...sourceFiles("src"), ...sourceFiles("tests")]) {
      if (path === "src/client/pdf/text.ts") continue;
      walk(parse(path), node => {
        if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && /\bPdfText\b/.test(node.type.getText())) {
          casts.push(`${path}: ${node.getText()}`);
        }
      });
    }
    expect(casts).toEqual([]);
  });

  it("no file under src/ outside src/client/pdf.ts and src/client/pdf/ imports src/client/pdf/*", () => {
    const outside = sourceFiles("src").filter(path => !isPdfModule(path))
      .filter(path => moduleUses(path).some(use => use.local?.startsWith("src/client/pdf/")));
    expect(outside).toEqual([]);
  });

  it("src/client/pdf/** imports no storage, planner, fixtures, features or app", () => {
    const forbidden = /^src\/(client\/storage|client\/planner|fixtures|features|app)(\/|\.|$)/;
    const found = pdfFiles.flatMap(path => moduleUses(path).filter(use => use.local !== null && forbidden.test(use.local))
      .map(use => `${path}: ${use.specifier}`));
    expect(found).toEqual([]);
  });
});

interface Literal {
  readonly text: string;
  readonly inClosing: boolean;
  readonly line: number;
}

function wordsLiterals(): Literal[] {
  const source = parse("src/client/pdf/words.ts");
  const found: Literal[] = [];
  const collect = (node: ts.Node, inClosing: boolean) => {
    if (ts.isImportDeclaration(node)) return;
    const closing = inClosing || (ts.isVariableDeclaration(node) && node.name.getText() === "closing");
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push({ text: node.text, inClosing: closing, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
    ts.forEachChild(node, child => collect(child, closing));
  };
  collect(source, false);
  return found;
}

describe("the words", () => {
  const literals = wordsLiterals();

  it("string literals in pdf/words.ts outside closing hold none of: will, probability, chance, yield, safe, soil, pest, weed, cost, fertilizer, priority, Threefield", () => {
    const outOfScope = /\b(will|probabilit|chance|yield|safe|soil|pest|weed|cost|fertili[sz]|priorit|threefield)/i;
    expect(literals.filter(literal => !literal.inClosing).length).toBeGreaterThan(200);
    expect(literals.filter(literal => !literal.inClosing && outOfScope.test(literal.text))).toEqual([]);
    expect(literals.filter(literal => literal.inClosing).some(literal => outOfScope.test(literal.text))).toBe(true);
  });

  it("string literals in pdf/words.ts hold no U+2013 or U+2014 dash, and each passes through pdfText unchanged", () => {
    expect(literals.filter(literal => /[\u2013\u2014]/.test(literal.text))).toEqual([]);
    expect(literals.filter(literal => pdfText(literal.text) !== literal.text)).toEqual([]);
  });
});
