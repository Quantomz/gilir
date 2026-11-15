// Rules that would otherwise be prose, as failing tests inside `npm run check`. Each case reads source files as text and
// parses them with the installed `typescript`, like scripts/check-boundaries.mjs. Where a rule could pass by seeing
// nothing, the case also shows that it sees the thing it rules on.
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const feature = "src/features/location";

function walk(dir: string): string[] {
  return readdirSync(resolve(repo, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

const sources = walk("src").filter(path => /\.(ts|tsx)$/.test(path));
const mine = sources.filter(path => path.startsWith(`${feature}/`));
const views = mine.filter(path => path.endsWith(".tsx"));
const textOf = (path: string) => readFileSync(resolve(repo, path), "utf8");

function sourceOf(text: string, path = "probe.tsx"): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, extname(path) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

const parse = (path: string) => sourceOf(textOf(path), path);

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
  /** The repo path it points at, or null for a package. */
  readonly target: string | null;
  readonly kind: "type" | "value" | "side-effect" | "dynamic";
}

function importsOf(path: string, source = parse(path)): Import[] {
  const targetOf = (specifier: string) =>
    specifier.startsWith("@/") ? `src/${specifier.slice(2)}`
      : specifier.startsWith(".") ? relative(repo, resolve(repo, dirname(path), specifier)).replaceAll("\\", "/")
      : null;
  return nodesOf(source).flatMap((node): Import[] => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
      const typeOnly = Boolean(clause && (clause.isTypeOnly || (!clause.name && named.length > 0 && named.every(element => element.isTypeOnly))));
      const specifier = node.moduleSpecifier.text;
      return [{ specifier, target: targetOf(specifier), kind: clause ? (typeOnly ? "type" : "value") : "side-effect" }];
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      return [{ specifier, target: targetOf(specifier), kind: node.isTypeOnly ? "type" : "value" }];
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const specifier = node.arguments[0].text;
      return [{ specifier, target: targetOf(specifier), kind: "dynamic" }];
    }
    return [];
  });
}

function exportedNames(source: ts.SourceFile): string[] {
  return source.statements.flatMap(statement => {
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) return statement.exportClause.elements.map(element => element.name.text);
    if (!exported) return [];
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map(declaration => declaration.name.getText(source));
    const named = statement as ts.DeclarationStatement;
    return named.name ? [named.name.getText(source)] : [];
  });
}

/** Module-scope declarations: what a file could be mistaken to define for everyone. */
function declaredNames(source: ts.SourceFile): string[] {
  return source.statements.flatMap(statement =>
    (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name
      ? [statement.name.text]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.flatMap(declaration => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : [])) : []);
}

const packageName = (specifier: string) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
const nodeBuiltin = (specifier: string) => specifier.startsWith("node:") || builtinModules.includes(packageName(specifier));
const where = (path: string, source: ts.SourceFile, node: ts.Node) => `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;

function callsTo(path: string, names: ReadonlySet<string>, source = parse(path)): string[] {
  return nodesOf(source).flatMap(node =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text) ? [`${where(path, source, node)} ${node.expression.text}`] : []);
}

function castsTo(path: string, names: ReadonlySet<string>, source = parse(path)): string[] {
  return nodesOf(source).flatMap(node =>
    ts.isAsExpression(node) && names.has(node.type.getText(source)) ? [`${where(path, source, node)} as ${node.type.getText(source)}`] : []);
}

/** JSX text or string children with a letter, and string literals in attributes a person hears or reads. */
function strayWords(path: string, source = parse(path)): string[] {
  const spoken = new Set(["aria-label", "title", "alt", "placeholder", "aria-description", "aria-valuetext"]);
  const literal = (node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
    node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
  return nodesOf(source).flatMap(node => {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) return [`${where(path, source, node)} ${node.text.trim()}`];
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && literal(node.expression) && /\p{L}/u.test(node.expression.text)) return [`${where(path, source, node)} ${node.expression.text}`];
    if (ts.isJsxAttribute(node) && spoken.has(node.name.getText(source))) {
      const value = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (literal(value)) return [`${where(path, source, node)} ${node.name.getText(source)}="${value.text}"`];
    }
    return [];
  });
}

/** id-like attributes whose value is not built from c.idOf, directly or through a local constant. */
function fixedIds(path: string, source = parse(path)): string[] {
  const references = new Set(["id", "htmlFor", "aria-describedby", "aria-labelledby", "aria-controls", "aria-owns", "aria-activedescendant"]);
  const constants = new Map(nodesOf(source).flatMap(node =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer ? [[node.name.text, node.initializer.getText(source)] as const] : []));
  const builtFromIdOf = (expression: ts.Expression) => {
    const used = nodesOf(source).filter(node => ts.isIdentifier(node) && node.pos >= expression.pos && node.end <= expression.end) as ts.Identifier[];
    return [expression.getText(source), ...used.map(identifier => constants.get(identifier.text) ?? "")].some(text => /\bidOf\(/.test(text));
  };
  return nodesOf(source).flatMap(node => {
    if (!ts.isJsxAttribute(node) || !references.has(node.name.getText(source)) || !node.initializer) return [];
    const expression = ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
    const ok = expression !== undefined && (builtFromIdOf(expression) || /^props\.\w+$/.test(expression.getText(source)));
    return ok ? [] : [`${where(path, source, node)} ${node.getText(source)}`];
  });
}

const hexColour = /#[0-9a-fA-F]{3,8}\b/;

function colourLeaks(path: string, source = parse(path)): string[] {
  return nodesOf(source).flatMap(node =>
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node))
      && (/(^|\s)dark:/.test(node.text) || hexColour.test(node.text))
      ? [`${where(path, source, node)} ${node.text}`] : []);
}

describe("public surface", () => {
  it("[R17] src/features/location/index.tsx exports exactly FieldPicker, typed with FieldPickerProps from ../ports", () => {
    const index = parse(`${feature}/index.tsx`);
    expect(exportedNames(index)).toEqual(["FieldPicker"]);
    const picker = index.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "FieldPicker");
    expect(picker?.parameters.map(parameter => parameter.type?.getText(index))).toEqual(["FieldPickerProps"]);
    expect(importsOf(`${feature}/index.tsx`, index).filter(entry => entry.target === "src/features/ports")).toEqual([
      { specifier: "../ports", target: "src/features/ports", kind: "type" },
    ]);
    expect(textOf(`${feature}/index.tsx`)).toMatch(/import type \{ FieldPickerProps \} from "\.\.\/ports";/);
  });

  it("[R17] no file under src/ outside src/features/location imports @/features/location/<path>", () => {
    const outside = sources.filter(path => !path.startsWith(`${feature}/`));
    const slots = outside.flatMap(path => importsOf(path).filter(entry => entry.target?.startsWith(feature)).map(entry => `${path}: ${entry.target}`));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.filter(entry => !entry.endsWith(`: ${feature}`))).toEqual([]);
  });
});

describe("outside services stay in one file", () => {
  it("[R4][R17] only src/features/location/provider.ts contains NEXT_PUBLIC_MAPTILER_KEY, maptiler.com or earthdata.nasa.gov across the whole of src/, and it is the only file in the folder that calls fetch", () => {
    const hosts = /NEXT_PUBLIC_MAPTILER_KEY|maptiler\.com|earthdata\.nasa\.gov/;
    const naming = sources.filter(path => hosts.test(textOf(path)));
    expect(naming).toEqual([`${feature}/provider.ts`]);
    const fetching = mine.filter(path => /\bfetch\s*\(/.test(textOf(path)));
    expect(fetching).toEqual([`${feature}/provider.ts`]);
  });

  it("[R17] no XMLHttpRequest, WebSocket or sendBeacon under src/features/location", () => {
    expect(mine.filter(path => /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(textOf(path)))).toEqual([]);
  });

  it("[R2][R17] only globe.ts loads maplibre-gl at run time (a value import or import()); other files import its types, and index.tsx its stylesheet", () => {
    const loads = mine.flatMap(path => importsOf(path).filter(entry => entry.specifier.startsWith("maplibre-gl")).map(entry => ({ path, ...entry })));
    const runtime = loads.filter(entry => entry.kind === "value" || entry.kind === "dynamic");
    expect(runtime.map(entry => `${entry.path} ${entry.kind} ${entry.specifier}`)).toEqual([`${feature}/globe.ts dynamic maplibre-gl`]);
    const sheets = loads.filter(entry => entry.kind === "side-effect");
    expect(sheets.map(entry => `${entry.path} ${entry.specifier}`)).toEqual([`${feature}/index.tsx maplibre-gl/dist/maplibre-gl.css`]);
    expect(loads.filter(entry => entry.kind === "type").length).toBeGreaterThan(0);
  });

  it("[R17] no file under src/features/location imports @/server, @/engine, @/registry, @/fixtures, @/client, pg or a node builtin", () => {
    const forbidden = /^(src\/(server|engine|registry|fixtures|client)(\/|$))/;
    const found = mine.flatMap(path => importsOf(path)
      .filter(entry => (entry.target !== null && forbidden.test(entry.target)) || (entry.target === null && (packageName(entry.specifier) === "pg" || nodeBuiltin(entry.specifier))))
      .map(entry => `${path}: ${entry.specifier}`));
    expect(found).toEqual([]);
    expect(importsOf("probe.ts", sourceOf('import { readFileSync } from "node:fs"; import "pg"; import type { X } from "@/server/jobs";', "probe.ts"))
      .filter(entry => (entry.target !== null && forbidden.test(entry.target)) || nodeBuiltin(entry.specifier) || entry.specifier === "pg")).toHaveLength(3);
  });

  it("[R25] no console. call and no debugger under src/features/location", () => {
    const found = mine.flatMap(path => {
      const source = parse(path);
      return nodesOf(source).flatMap(node =>
        (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "console") || node.kind === ts.SyntaxKind.DebuggerStatement
          ? [where(path, source, node)] : []);
    });
    expect(found).toEqual([]);
  });
});

describe("layers inside the folder", () => {
  it("outline.ts, coordinates.ts, picker.ts and words.ts import no react and no maplibre-gl, and take only types from provider.ts, globe.ts and views/ (import type)", () => {
    const pure = ["outline.ts", "coordinates.ts", "picker.ts", "words.ts"].map(name => `${feature}/${name}`);
    const found = pure.flatMap(path => importsOf(path).filter(entry =>
      packageName(entry.specifier) === "react" || entry.specifier.startsWith("maplibre-gl")
      || (entry.kind !== "type" && entry.target !== null && /^src\/features\/location\/(provider|globe|views\/)/.test(entry.target)))
      .map(entry => `${path}: ${entry.kind} ${entry.specifier}`));
    expect(found).toEqual([]);
    expect(importsOf(`${feature}/words.ts`).some(entry => entry.target === `${feature}/provider` && entry.kind === "type")).toBe(true);
  });

  it("only picker.ts calls markOutline, markSaved, moveCorner, insertCorner or removeCorner; views, index.tsx and controller.ts only send actions", () => {
    const makers = new Set(["markOutline", "markSaved", "moveCorner", "insertCorner", "removeCorner"]);
    const others = mine.filter(path => path !== `${feature}/picker.ts` && path !== `${feature}/outline.ts`);
    expect(others.flatMap(path => callsTo(path, makers))).toEqual([]);
    const inPicker = new Set(callsTo(`${feature}/picker.ts`, makers).map(entry => entry.split(" ")[1]));
    expect([...inPicker].sort()).toEqual([...makers].sort());
  });

  it("no `as Marked` or `as Corners` outside outline.ts, and no `as BrowserKey` outside provider.ts (the brands stay honest)", () => {
    const outlineBrands = new Set(["Marked", "Corners"]);
    const keyBrand = new Set(["BrowserKey"]);
    expect(mine.filter(path => path !== `${feature}/outline.ts`).flatMap(path => castsTo(path, outlineBrands))).toEqual([]);
    expect(mine.filter(path => path !== `${feature}/provider.ts`).flatMap(path => castsTo(path, keyBrand))).toEqual([]);
    expect(castsTo(`${feature}/outline.ts`, outlineBrands).length).toBeGreaterThan(0);
    expect(castsTo(`${feature}/provider.ts`, keyBrand).length).toBeGreaterThan(0);
  });

  it("provider.ts and globe.ts import no react", () => {
    expect(["provider.ts", "globe.ts"].flatMap(name => importsOf(`${feature}/${name}`).filter(entry => packageName(entry.specifier).startsWith("react")))).toEqual([]);
  });
});

describe("repo rules F2 must not break", () => {
  const manifest = JSON.parse(textOf("package.json")) as { readonly dependencies: Record<string, string> };

  it("[R9] the only Turf imports are @turf/area and @turf/boolean-point-in-polygon (direct dependencies in package.json), and only outline.ts has them", () => {
    const turf = mine.flatMap(path => importsOf(path).filter(entry => entry.specifier.startsWith("@turf/")).map(entry => `${path} ${entry.specifier}`));
    expect(turf.sort()).toEqual([`${feature}/outline.ts @turf/area`, `${feature}/outline.ts @turf/boolean-point-in-polygon`]);
    expect(Object.keys(manifest.dependencies)).toEqual(expect.arrayContaining(["@turf/area", "@turf/boolean-point-in-polygon"]));
  });

  it("[R8] zod appears only in provider.ts, for the provider's wire shape: no field, ring or lookup schema anywhere (the contract's parser is the only one)", () => {
    expect(mine.filter(path => importsOf(path).some(entry => packageName(entry.specifier) === "zod"))).toEqual([`${feature}/provider.ts`]);
    const provider = parse(`${feature}/provider.ts`);
    const schemaKeys = nodesOf(provider).flatMap(node =>
      ts.isCallExpression(node) && node.expression.getText(provider) === "z.object" && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])
        ? node.arguments[0].properties.map(property => property.name?.getText(provider).replaceAll('"', "") ?? "")
        : []);
    expect(schemaKeys).toContain("center");
    expect(schemaKeys.filter(key => ["field", "ring", "lookup", "label", "schemaVersion"].includes(key))).toEqual([]);
  });

  it("no fixed DOM id: every id= in views/ and index.tsx comes from c.idOf (the lab mounts two pickers)", () => {
    expect(views.flatMap(path => fixedIds(path))).toEqual([]);
    expect(views.flatMap(path => nodesOf(parse(path)).filter(node => ts.isJsxAttribute(node) && node.name.getText() === "id")).length).toBeGreaterThan(5);
    expect(fixedIds("probe.tsx", sourceOf('const id = c.idOf("list"); const other = "corners-err"; <><input id="place-q" /><p id={`x-${n}`} /><b id={other} /><label htmlFor={c.idOf("search")} /><i id={`${id}-1`} /></>'))).toHaveLength(3);
  });

  it("no `dark:` class and no hex colour in any .tsx under src/features/location: modes arrive through F1's tokens", () => {
    expect(views.flatMap(path => colourLeaks(path))).toEqual([]);
    expect(colourLeaks("probe.tsx", sourceOf('<p className="text-ink dark:text-white" style={{ color: "#233421" }}>Go</p>'))).toHaveLength(2);
  });

  it("every class defined in location.css starts with fp-, it defines no custom property, and it names no colour except the pin's drop shadow", () => {
    const css = textOf(`${feature}/location.css`).replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1]).filter(selector => !selector.trim().startsWith("@"));
    const classes = new Set(selectors.flatMap(selector => [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1])));
    const f1 = textOf("src/features/onboarding/terrace.css") + textOf("src/app/globals.css");
    const reused = [...classes].filter(name => !name.startsWith("fp-") && name !== "fp");
    expect(reused.filter(name => !name.startsWith("maplibregl-") && !new RegExp(`\\.${name}\\b|\\b${name}\\b`).test(f1))).toEqual([]);
    expect([...classes].filter(name => name.startsWith("fp-")).length).toBeGreaterThan(30);
    expect(css.match(/(^|[;{\s])--[\w-]+\s*:/gm) ?? []).toEqual([]);
    const colours = css.match(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|color)\(/g) ?? [];
    expect(colours).toEqual(["rgba("]);
    expect(css).toMatch(/\.fp-pin \{[^}]*drop-shadow\([^)]*rgba\(/);
  });

  it("F2 declares no schema and no input or slot type named like the contract's, and imports only packages that package.json lists as dependencies (frozen files are checked per PR with git diff main...HEAD)", () => {
    const contractNames = new Set(walk("src/contracts").filter(path => path.endsWith(".ts")).flatMap(path => exportedNames(parse(path))));
    expect(contractNames).toContain("farmInputSchema");
    const copyable = (name: string) => (contractNames.has(name) && (name.endsWith("Schema") || ["FarmInput", "LngLat", "inputLimits"].includes(name))) || name === "FieldPickerProps";
    expect([...contractNames].filter(copyable).length).toBeGreaterThan(3);
    const restated = mine.flatMap(path => declaredNames(parse(path)).filter(copyable).map(name => `${path}: ${name}`));
    expect(restated).toEqual([]);
    const packages = new Set(mine.flatMap(path => importsOf(path).filter(entry => entry.target === null).map(entry => packageName(entry.specifier))));
    expect([...packages].filter(name => !(name in manifest.dependencies))).toEqual([]);
    expect(packages).toContain("maplibre-gl");
  });
});

describe("every word lives in words.ts", () => {
  it("[R26] no JSX text with a letter, and no aria-label, title, alt or placeholder string literal, in any .tsx under src/features/location", () => {
    expect(views.flatMap(path => strayWords(path))).toEqual([]);
    expect(strayWords("probe.tsx", sourceOf('<><p>Search</p><b>{"Close"}</b><input placeholder="Indramayu" aria-label={"Clear"} /><span>{", "}</span></>'))).toHaveLength(4);
  });
});
