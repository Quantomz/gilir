// Rules that would otherwise be prose, as failing tests inside `npm run check`. Each case reads source files and
// parses them with the installed `typescript`, like scripts/check-boundaries.mjs and F1's conventions test.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const feature = "src/features/results";

function walk(dir: string): string[] {
  return readdirSync(resolve(repo, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

const f3Files = walk(feature);
const f3Code = f3Files.filter(path => /\.tsx?$/.test(path));
const f3Views = f3Files.filter(path => path.endsWith(".tsx"));
const f3Styles = f3Files.filter(path => path.endsWith(".css"));
const sources = walk("src").filter(path => /\.tsx?$/.test(path));

function read(path: string): string {
  return readFileSync(resolve(repo, path), "utf8");
}

function parse(path: string): ts.SourceFile {
  return sourceOf(read(path), path);
}

function sourceOf(text: string, path = "probe.tsx"): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, extname(path) === ".ts" ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
}

function nodesOf(source: ts.SourceFile): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Text a user can see or a class name: string literals, template text and JSX text. */
function literalTexts(source: ts.SourceFile): string[] {
  return nodesOf(source).flatMap(node =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)
      ? [node.text]
      : [],
  );
}

interface Import {
  readonly specifier: string;
  /** The repo path it points at ("src/client/storage"), or null for a package. */
  readonly target: string | null;
  readonly typeOnly: boolean;
}

function importsIn(source: ts.SourceFile, path: string): Import[] {
  const found: Import[] = [];
  const add = (specifier: string, typeOnly: boolean) => {
    const target = specifier.startsWith("@/")
      ? `src/${specifier.slice(2)}`
      : specifier.startsWith(".")
        ? relative(repo, resolve(repo, dirname(path), specifier)).replaceAll("\\", "/")
        : null;
    found.push({ specifier, target: target?.replace(/\/index$/, "") ?? null, typeOnly });
  };
  for (const node of nodesOf(source)) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
      const typeOnly = Boolean(clause && (clause.isTypeOnly || (!clause.name && named.length > 0 && named.every(element => element.isTypeOnly))));
      add(node.moduleSpecifier.text, typeOnly);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text, node.isTypeOnly);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) add(argument.text, false);
    }
  }
  return found;
}

function importsOf(path: string): Import[] {
  return importsIn(parse(path), path);
}

/** "path -> specifier" for every import in `paths` whose target or package starts with one of `banned`. */
function reaching(paths: readonly string[], banned: readonly string[], runtimeOnly = false): string[] {
  return paths.flatMap(path =>
    importsOf(path)
      .filter(entry => !(runtimeOnly && entry.typeOnly))
      .filter(entry => banned.some(prefix => {
        const at = entry.target ?? entry.specifier;
        return at === prefix || at.startsWith(`${prefix}/`);
      }))
      .map(entry => `${path} -> ${entry.specifier}`),
  );
}

function layer(name: string): string[] {
  return f3Code.filter(path => path.startsWith(`${feature}/${name}/`));
}

/** Identifiers in code, so comments and strings never count. */
function identifiersOf(source: ts.SourceFile): string[] {
  return nodesOf(source).filter(ts.isIdentifier).map(node => node.text);
}

function namesIn(paths: readonly string[], names: ReadonlySet<string>): string[] {
  return paths.flatMap(path => identifiersOf(parse(path)).filter(name => names.has(name)).map(name => `${path}: ${name}`));
}

function consoleCalls(source: ts.SourceFile): number {
  return nodesOf(source).filter(node => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "console").length;
}

function schemaCalls(source: ts.SourceFile): string[] {
  return nodesOf(source).flatMap(node =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" && ["object", "strictObject", "enum"].includes(node.expression.name.text)
      ? [`z.${node.expression.name.text}`]
      : [],
  );
}

function exportedNames(source: ts.SourceFile): string[] {
  return source.statements.flatMap(statement => {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      return statement.exportClause.elements.map(element => element.name.text);
    }
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) return [];
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(declaration => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []));
    const named = statement as ts.Statement & { readonly name?: ts.Node };
    return named.name && ts.isIdentifier(named.name) ? [named.name.text] : [];
  });
}

function declaredNames(source: ts.SourceFile): string[] {
  return source.statements.flatMap(statement => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap(declaration => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []));
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      return statement.name ? [statement.name.text] : [];
    }
    return [];
  });
}

/** Ways a drawn element could be dragged, slid or typed into. */
function editables(source: ts.SourceFile): string[] {
  return nodesOf(source).flatMap(node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ["input", "select", "textarea"].includes(node.tagName.getText(source))) {
      return [`<${node.tagName.getText(source)}>`];
    }
    if (!ts.isJsxAttribute(node)) return [];
    const name = node.name.getText(source);
    if (name === "draggable" || name.startsWith("onDrag") || name.startsWith("onPointerMove")) return [name];
    const value = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : null;
    return name === "role" && value === "slider" ? ["role=slider"] : [];
  });
}

const hexColour = /(^|[\s:(,"'=])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;
const darkVariant = /(^|\s)dark:/;

function colourLeaks(source: ts.SourceFile): string[] {
  return literalTexts(source).filter(text => hexColour.test(text) || darkVariant.test(text));
}

function cssColourLeaks(css: string): string[] {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(line => hexColour.test(line)).map(line => line.trim());
}

/** Attributes that name an element id. A literal in any of them collides when the fixture lab mounts seven Results. */
const idAttributes = new Set(["id", "htmlFor", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-activedescendant"]);

function idLiterals(source: ts.SourceFile): string[] {
  return nodesOf(source).filter(ts.isJsxAttribute).flatMap(attribute => {
    const name = attribute.name.getText(source);
    if (!idAttributes.has(name) || attribute.initializer === undefined) return [];
    const value = ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : attribute.initializer;
    return value !== undefined && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
      ? [`${name}=${value.getText(source)}`]
      : [];
  });
}

describe("public entrypoint", () => {
  it("src/features/results/index.tsx exports exactly Results", () => {
    expect(exportedNames(sourceOf('export function A() {}\nexport const b = 1;\nexport { c } from "./c";\nfunction d() {}'))).toEqual(["A", "b", "c"]);
    expect(exportedNames(parse(`${feature}/index.tsx`))).toEqual(["Results"]);
  });

  it("no file under src/ outside src/features/results imports @/features/results/<path>: only the index, which src/app/page.tsx renders", () => {
    const outside = sources.filter(path => !path.startsWith(`${feature}/`));
    const reach = outside.flatMap(path => importsOf(path).filter(entry => entry.target?.startsWith(feature)).map(entry => ({ path, target: entry.target })));
    expect(reach).toContainEqual({ path: "src/app/page.tsx", target: feature });
    expect(reach.filter(entry => entry.target !== feature)).toEqual([]);
  });

  it("F3 never declares ResultsProps and declares no type, interface or value named like a contract export", () => {
    const contractNames = new Set(walk("src/contracts").filter(path => path.endsWith(".ts")).flatMap(path => exportedNames(parse(path))));
    expect(contractNames).toContain("CompletedSnapshot");
    expect(contractNames).toContain("completedSnapshotSchema");
    expect(declaredNames(sourceOf("interface ResultsProps {}\ntype Plan = string;\nconst x = 1;"))).toEqual(["ResultsProps", "Plan", "x"]);
    const restated = f3Code.flatMap(path => declaredNames(parse(path)).filter(name => name === "ResultsProps" || contractNames.has(name)).map(name => `${path}: ${name}`));
    expect(restated).toEqual([]);
    expect(importsOf(`${feature}/index.tsx`)).toContainEqual({ specifier: "../ports", target: "src/features/ports", typeOnly: true });
  });
});

describe("layers", () => {
  it("only index.tsx imports @/client/storage or @/client/pdf at runtime; model/ and services/ import their types only; no F3 file imports @/client/planner", () => {
    expect(f3Code.filter(path => reaching([path], ["src/client/storage", "src/client/pdf"], true).length > 0)).toEqual([`${feature}/index.tsx`]);
    expect(reaching([...layer("model"), ...layer("services")], ["src/client"]).length).toBeGreaterThan(0);
    expect(reaching([...layer("model"), ...layer("services")], ["src/client"], true)).toEqual([]);
    expect(reaching(f3Code, ["src/client/planner"])).toEqual([]);
  });

  it("model/ imports no react, no next, no services/, no views/ and no screen", () => {
    expect(importsOf(`${feature}/model/actions.ts`).map(entry => entry.target)).toContain(`${feature}/model/session`);
    expect(reaching(layer("model"), ["react", "react-dom", "next", `${feature}/services`, `${feature}/views`, `${feature}/screen`, `${feature}/index`])).toEqual([]);
  });

  it("services/ imports no react and no views/", () => {
    expect(layer("services")).toContain(`${feature}/services/keeper.ts`);
    expect(reaching(layer("services"), ["react", "react-dom", "next", `${feature}/views`, `${feature}/screen`, `${feature}/index`])).toEqual([]);
  });

  it("[R41] views/ imports nothing from @/contracts, @/client or services/, and only types from model/: a component cannot read a metric", () => {
    expect(reaching(layer("views"), [`${feature}/model`]).length).toBeGreaterThan(0);
    expect(reaching(layer("views"), ["src/contracts", "src/client", `${feature}/services`, `${feature}/screen`, `${feature}/index`])).toEqual([]);
    expect(reaching(layer("views"), [`${feature}/model`], true)).toEqual([]);
  });
});

describe("repo rules F3 must not break", () => {
  it("[R41] no F3 file imports @/fixtures, @/server, @/engine, @/registry or @/features/onboarding", () => {
    expect(importsIn(sourceOf('import { a } from "@/fixtures/results";'), `${feature}/probe.ts`).map(entry => entry.target)).toEqual(["src/fixtures/results"]);
    expect(reaching(f3Code, ["src/fixtures", "src/server", "src/engine", "src/registry", "src/features/onboarding"])).toEqual([]);
  });

  it("no F3 file imports zod or calls z.object, z.strictObject or z.enum (no copied contract)", () => {
    expect(schemaCalls(sourceOf('import { z } from "zod"; const a = z.object({}); const b = z.enum(["x"]);'))).toEqual(["z.object", "z.enum"]);
    expect(f3Code.filter(path => importsOf(path).some(entry => entry.specifier === "zod" || entry.specifier.startsWith("zod/")))).toEqual([]);
    expect(f3Code.flatMap(path => schemaCalls(parse(path)).map(call => `${path}: ${call}`))).toEqual([]);
  });

  it("no fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon under src/features/results", () => {
    const network = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon"]);
    expect(identifiersOf(sourceOf('await fetch("/api/plans"); navigator.sendBeacon("/x", "y");')).filter(name => network.has(name))).toEqual(["fetch", "sendBeacon"]);
    expect(identifiersOf(sourceOf('// fetch the plan\nconst state = "fetching";')).filter(name => network.has(name))).toEqual([]);
    expect(namesIn(f3Code, network)).toEqual([]);
  });

  it("no localStorage, sessionStorage or indexedDB under src/features/results: storage goes through localPlans", () => {
    const storage = new Set(["localStorage", "sessionStorage", "indexedDB"]);
    expect(identifiersOf(sourceOf('window.localStorage.setItem("a", "b"); indexedDB.open("x");')).filter(name => storage.has(name))).toEqual(["localStorage", "indexedDB"]);
    expect(namesIn(f3Code, storage)).toEqual([]);
  });

  it("no console call and no crypto.randomUUID under src/features/results", () => {
    expect(consoleCalls(sourceOf('console.log("x"); console.error(1);'))).toBe(2);
    expect(identifiersOf(sourceOf("const id = crypto.randomUUID();"))).toContain("randomUUID");
    expect(f3Code.filter(path => consoleCalls(parse(path)) > 0)).toEqual([]);
    expect(namesIn(f3Code, new Set(["randomUUID"]))).toEqual([]);
  });

  it("no hex colour and no dark: class in any .tsx; no hex colour in results.css", () => {
    expect(colourLeaks(sourceOf('<p className="text-ink dark:text-white" style={{ color: "#233421" }}>Go to #main</p>'))).toEqual(["text-ink dark:text-white", "#233421"]);
    expect(cssColourLeaks(".rs-x { color: #233421; }\n/* #FFFFFF in a comment */\n.rs-y { color: var(--ink); }")).toEqual([".rs-x { color: #233421; }"]);
    expect(f3Views.length).toBeGreaterThan(0);
    expect(f3Styles.length).toBeGreaterThan(0);
    expect(f3Views.flatMap(path => colourLeaks(parse(path)).map(text => `${path}: ${text}`))).toEqual([]);
    expect(f3Styles.flatMap(path => cssColourLeaks(read(path)).map(line => `${path}: ${line}`))).toEqual([]);
  });

  it("no U+2013 or U+2014 dash in any F3 file", () => {
    const longDash = /[\u2013\u2014]/;
    expect(longDash.test("1 Jul \u2013 4 Jul")).toBe(true);
    const f3Text = [...f3Files, ...walk("tests/frontend/results"), ...walk("docs/evidence/F3")].filter(path => /\.(tsx?|css|md|json)$/.test(path));
    expect(f3Text.filter(path => path.startsWith("tests/frontend/results/")).length).toBeGreaterThan(0);
    const dashes = f3Text.flatMap(path => read(path).split("\n").flatMap((line, index) => (longDash.test(line) ? [`${path}:${index + 1}`] : [])));
    expect(dashes).toEqual([]);
  });

  it("[R4] no draggable, onDrag, onPointerMove, role slider, input, select or textarea in any .tsx under src/features/results", () => {
    const probe = sourceOf('const a = <span draggable onDragStart={f} />; const b = <div role="slider" onPointerMove={g} />; const c = <input />; const d = <select></select>; const e = <textarea />; const ok = <div role="list" onClick={h} />;');
    expect(editables(probe)).toEqual(["draggable", "onDragStart", "role=slider", "onPointerMove", "<input>", "<select>", "<textarea>"]);
    expect(f3Views.flatMap(path => editables(parse(path)).map(found => `${path}: ${found}`))).toEqual([]);
  });

  it("no element id literal in any .tsx under src/features/results: ids come from useId", () => {
    const probe = sourceOf('const a = <h2 id="rs-title" />; const b = <section aria-labelledby={`rs-t`} />; const c = <label htmlFor={"field"} />; const d = <h2 id={titleId} />; const e = <p aria-describedby={`${titleId}-hint`} />;');
    expect(idLiterals(probe)).toEqual(['id="rs-title"', "aria-labelledby=`rs-t`", 'htmlFor="field"']);
    expect(f3Views.flatMap(path => idLiterals(parse(path)).map(text => `${path}: ${text}`))).toEqual([]);
    const lookups = f3Files.filter(path => /\.tsx?$/.test(path) && nodesOf(parse(path)).some(node => ts.isIdentifier(node) && node.text === "getElementById"));
    expect(lookups).toEqual([]);
  });
});
