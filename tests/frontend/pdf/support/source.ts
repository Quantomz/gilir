import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const at = (path: string) => join(root, path);

export function sourceFiles(dir: string): string[] {
  return readdirSync(at(dir), { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && /\.(ts|tsx|mts|js|mjs)$/.test(entry.name))
    .map(entry => relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
}

export function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(at(path), "utf8"), ts.ScriptTarget.Latest, true);
}

/** Every node under `node`, depth first; `visit` returns false to skip a node's children. */
export function walk(node: ts.Node, visit: (node: ts.Node) => boolean | void): void {
  if (visit(node) === false) return;
  ts.forEachChild(node, child => walk(child, visit));
}

/** The names a module exports, from its export modifiers; an export declaration counts as its own text. */
export function exportedNames(path: string): string[] {
  const source = parse(path);
  return source.statements.flatMap(statement => {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) return [statement.getText(source)];
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    if (!modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map(declaration => declaration.name.getText(source));
    const named = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement);
    return named && statement.name ? [statement.name.text] : [statement.getText(source)];
  });
}

export interface ModuleUse {
  readonly specifier: string;
  /** The repo path the specifier names under src/, or null for a package. */
  readonly local: string | null;
  readonly kind: "static value" | "static type" | "dynamic";
  readonly names: readonly string[];
}

export function moduleUses(path: string): ModuleUse[] {
  const uses: ModuleUse[] = [];
  const localOf = (specifier: string) => specifier.startsWith("@/") ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".") ? relative(root, resolve(dirname(at(path)), specifier)).replaceAll("\\", "/")
    : null;
  walk(parse(path), node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined;
      const elements = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : [];
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly === true || (node.importClause !== undefined && node.importClause.name === undefined
          && elements.length > 0 && elements.every(element => element.isTypeOnly))
        : node.isTypeOnly;
      uses.push({
        specifier: node.moduleSpecifier.text,
        local: localOf(node.moduleSpecifier.text),
        kind: typeOnly ? "static type" : "static value",
        names: elements.map(element => element.name.text),
      });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      uses.push({ specifier: node.arguments[0].text, local: localOf(node.arguments[0].text), kind: "dynamic", names: [] });
    }
  });
  return uses;
}
