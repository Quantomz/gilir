// Rules that would otherwise be prose, made into failing tests inside `npm run check`. Each case reads source files and
// parses them with the installed `typescript`, like scripts/check-boundaries.mjs.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { storageProblem } from "@/client/storage";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const feature = "src/features/onboarding";

function walk(dir: string): string[] {
  return readdirSync(resolve(repo, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

const sources = walk("src").filter(path => /\.(ts|tsx)$/.test(path));
const f1Code = [...sources.filter(path => path.startsWith(`${feature}/`)), "src/app/page.tsx", "src/app/layout.tsx"];
const f1Files = [...f1Code, ...walk(feature).filter(path => path.endsWith(".css")), "src/app/globals.css"];

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(resolve(repo, path), "utf8"), ts.ScriptTarget.Latest, true, extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
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

interface Import {
  readonly specifier: string;
  /** The repo path it points at ("src/client/storage"), or null for a package. */
  readonly target: string | null;
  readonly typeOnly: boolean;
}

function importsOf(path: string): Import[] {
  const source = parse(path);
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

function importers(paths: readonly string[], target: string, runtimeOnly: boolean): string[] {
  return paths.filter(path => importsOf(path).some(entry => entry.target === target && !(runtimeOnly && entry.typeOnly)));
}

/** Identifiers in code, so comments and strings never count. */
function identifiersOf(source: ts.SourceFile): string[] {
  return nodesOf(source).filter(ts.isIdentifier).map(node => node.text);
}

function sourceOf(text: string, path = "probe.tsx"): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const networkNames = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon"]);

function usesNetwork(source: ts.SourceFile): boolean {
  return identifiersOf(source).some(name => networkNames.has(name));
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

/** Text a user can see or a class name: string literals, template text and JSX text. */
function literalTexts(source: ts.SourceFile): string[] {
  return nodesOf(source).flatMap(node =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)
      ? [node.text]
      : [],
  );
}

const hexColour = /(^|[\s:(,"'=])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;
const darkVariant = /(^|\s)dark:/;

function colourLeaks(source: ts.SourceFile): string[] {
  return literalTexts(source).filter(text => hexColour.test(text) || darkVariant.test(text));
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

describe("public surface", () => {
  it("src/features/onboarding/index.tsx exports exactly Onboarding and AppFrame", () => {
    expect(exportedNames(parse(`${feature}/index.tsx`)).sort()).toEqual(["AppFrame", "Onboarding"]);
  });

  it("no file under src/ outside src/features/onboarding imports @/features/onboarding/<path> except @/features/onboarding/head", () => {
    const outside = sources.filter(path => !path.startsWith(`${feature}/`));
    const reach = outside.flatMap(path => importsOf(path).filter(entry => entry.target?.startsWith(feature)).map(entry => ({ path, target: entry.target })));
    expect(reach).toContainEqual({ path: "src/app/layout.tsx", target: `${feature}/head` });
    expect(reach).toContainEqual({ path: "src/app/page.tsx", target: feature });
    expect(reach.filter(entry => entry.target !== feature && entry.target !== `${feature}/head`)).toEqual([]);
  });

  it("only services/saved.ts imports @/client/storage at runtime; only src/app/page.tsx imports @/client/planner", () => {
    expect(importers(f1Code, "src/client/storage", true)).toEqual([`${feature}/services/saved.ts`]);
    expect(importers(f1Code, "src/client/planner", true)).toEqual(["src/app/page.tsx"]);
  });

  it("[F4-D1] only services/saved.ts names localPlans, readStorageNotice or storageProblem, and no F1 file restates F4's storage words", () => {
    const portNames = new Set(["localPlans", "readStorageNotice", "storageProblem"]);
    expect(f1Code.filter(path => identifiersOf(parse(path)).some(name => portNames.has(name)))).toEqual([`${feature}/services/saved.ts`]);
    const f4Words = [new Error("blocked"), new DOMException("", "QuotaExceededError"), new DOMException("", "VersionError")].map(error => storageProblem(error).text);
    expect(new Set(f4Words).size).toBe(3);
    const restated = f1Code.flatMap(path => literalTexts(parse(path)).filter(text => f4Words.some(words => text.includes(words))).map(text => `${path}: ${text}`));
    expect(restated).toEqual([]);
  });

  it("model/ imports no react, no services/ and no views/; services/ imports no react and no views/", () => {
    const outward = (layer: string, banned: readonly string[]) =>
      f1Code
        .filter(path => path.startsWith(`${feature}/${layer}/`))
        .flatMap(path => importsOf(path).filter(entry => banned.some(prefix => (entry.target ?? entry.specifier).startsWith(prefix))).map(entry => `${path} -> ${entry.specifier}`));
    const ui = ["react", "react-dom", "next", `${feature}/views`, `${feature}/controller`, `${feature}/onboarding`];
    expect(outward("model", [...ui, `${feature}/services`])).toEqual([]);
    expect(outward("services", ui)).toEqual([]);
    expect(importsOf(`${feature}/model/flow.ts`).some(entry => entry.target === `${feature}/model/check`)).toBe(true);
  });
});

describe("repo rules F1 must not break", () => {
  it("[A7][K7] no file under src/features/onboarding or src/app/page.tsx imports @/fixtures, @/server, @/engine or @/registry", () => {
    const banned = /^src\/(fixtures|server|engine|registry)(\/|$)/;
    const reach = f1Code.flatMap(path => importsOf(path).filter(entry => entry.target !== null && banned.test(entry.target)).map(entry => `${path} -> ${entry.specifier}`));
    expect(reach).toEqual([]);
  });

  it("[A2] no F1 file imports zod or declares z.object, z.strictObject or z.enum (no copied contract)", () => {
    expect(schemaCalls(sourceOf('import { z } from "zod"; const a = z.object({}); const b = z.enum(["x"]);'))).toEqual(["z.object", "z.enum"]);
    expect(f1Code.filter(path => importsOf(path).some(entry => entry.specifier === "zod" || entry.specifier.startsWith("zod/")))).toEqual([]);
    expect(f1Code.flatMap(path => schemaCalls(parse(path)).map(call => `${path}: ${call}`))).toEqual([]);
  });

  it("[A6] no fetch, XMLHttpRequest, WebSocket or sendBeacon under src/features/onboarding: the injected PlannerClient is the only network", () => {
    expect(usesNetwork(sourceOf('await fetch("/api/plans");'))).toBe(true);
    expect(usesNetwork(sourceOf('navigator.sendBeacon("/x", "y");'))).toBe(true);
    expect(usesNetwork(sourceOf('// fetch the plan\nconst state = "fetching";'))).toBe(false);
    expect(f1Code.filter(path => path.startsWith(`${feature}/`) && usesNetwork(parse(path)))).toEqual([]);
  });

  it("[A10] no console call under src/features/onboarding, in src/app/page.tsx or in src/app/layout.tsx", () => {
    expect(consoleCalls(sourceOf('console.log("x"); console.error(1);'))).toBe(2);
    expect(f1Code.filter(path => consoleCalls(parse(path)) > 0)).toEqual([]);
  });

  it("no crypto.randomUUID under src/features/onboarding (a phone on plain http lacks it)", () => {
    expect(identifiersOf(sourceOf("const id = crypto.randomUUID();"))).toContain("randomUUID");
    expect(f1Code.filter(path => path.startsWith(`${feature}/`) && identifiersOf(parse(path)).includes("randomUUID"))).toEqual([]);
  });

  it("no `dark:` class and no hex colour in any .tsx under src/features/onboarding: modes arrive through tokens", () => {
    expect(colourLeaks(sourceOf('<p className="text-ink dark:text-white" style={{ color: "#233421" }}>Go to #main</p>'))).toEqual(["text-ink dark:text-white", "#233421"]);
    expect(f1Code.filter(path => path.startsWith(`${feature}/`) && path.endsWith(".tsx")).flatMap(path => colourLeaks(parse(path)).map(text => `${path}: ${text}`))).toEqual([]);
  });

  it("no long dash character in any F1 file", () => {
    const dashes = f1Files.flatMap(path =>
      readFileSync(resolve(repo, path), "utf8").split("\n").flatMap((line, index) => (/[\u2013\u2014]/.test(line) ? [`${path}:${index + 1}`] : [])),
    );
    expect(dashes).toEqual([]);
  });

  it("[B7] src/app/layout.tsx keeps <html lang=\"en\"> and exports metadata and viewport; src/app/page.tsx exports no metadata", () => {
    const layout = parse("src/app/layout.tsx");
    const htmlLang = nodesOf(layout).flatMap(node =>
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(layout) === "html"
        ? node.attributes.properties.flatMap(attribute => (ts.isJsxAttribute(attribute) && attribute.name.getText(layout) === "lang" && attribute.initializer && ts.isStringLiteral(attribute.initializer) ? [attribute.initializer.text] : []))
        : [],
    );
    expect(htmlLang).toEqual(["en"]);
    expect(exportedNames(layout)).toEqual(expect.arrayContaining(["metadata", "viewport"]));
    expect(exportedNames(parse("src/app/page.tsx")).filter(name => ["metadata", "viewport", "generateMetadata", "generateViewport"].includes(name))).toEqual([]);
  });
});

// Whether a frozen file changed is a fact about one pull request's diff (`git diff --name-only main...HEAD`), which a
// permanent test cannot hold: CI's shallow checkout has no main to compare with, and a later contract change by its
// owner would fail here. These cases hold the lasting half of the rule instead: F1 uses the frozen interfaces and
// never restates them.
describe("frozen interfaces are used, never restated", () => {
  it("[A1][A8] F1 renders FieldPicker and Results from their public entrypoints and never declares FieldPickerProps, OnboardingProps or ResultsProps", () => {
    const slotPaths = f1Code.flatMap(path => importsOf(path).filter(entry => /^src\/features\/(location|results)(\/|$)/.test(entry.target ?? "")).map(entry => entry.target));
    expect(slotPaths).toContain("src/features/results");
    expect(slotPaths.filter(target => target !== "src/features/location" && target !== "src/features/results")).toEqual([]);
    const restated = f1Code.flatMap(path => declaredNames(parse(path)).filter(name => ["FieldPickerProps", "OnboardingProps", "ResultsProps"].includes(name)).map(name => `${path}: ${name}`));
    expect(restated).toEqual([]);
  });

  it("[A2] F1 declares no type, interface or value named like a contract export", () => {
    const contractNames = new Set(walk("src/contracts").filter(path => path.endsWith(".ts")).flatMap(path => exportedNames(parse(path))));
    expect(contractNames).toContain("FarmInput");
    expect(contractNames).toContain("farmInputSchema");
    const restated = f1Code.flatMap(path => declaredNames(parse(path)).filter(name => contractNames.has(name)).map(name => `${path}: ${name}`));
    expect(restated).toEqual([]);
  });
});
