import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = resolve(process.argv[2] ?? "src");
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));
const errors = [];
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
function specifiers(source) {
  const found = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) found.push(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) found.push(argument.text);
      else errors.push(`${source.fileName}: computed module imports are not supported by the boundary policy`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
for (const file of files(root).filter(file => /\.[cm]?[jt]sx?$/.test(file))) {
  const path = relative(root, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const browser = path.startsWith("features/") || path.startsWith("client/") || source.statements.some(statement => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client");
  const pure = path.startsWith("engine/") || path.startsWith("registry/");
  for (const name of specifiers(source)) {
    const local = name.startsWith("@/") ? name.slice(2) : name.startsWith(".") ? relative(root, resolve(dirname(file), name)).replaceAll("\\", "/") : null;
    const nodeImport = name.startsWith("node:") || builtins.has(name);
    if (pure && (nodeImport || /^(next|react|pg)(\/|$)/.test(name) || local !== null && !/^(engine|contracts|registry)(?:\/|$)/.test(local))) errors.push(`${path}: pure module imports ${name}`);
    if (!path.startsWith("fixtures/") && !path.startsWith("app/dev/") && local !== null && /^fixtures(?:\/|$)/.test(local)) errors.push(`${path}: production module imports fixtures`);
    if (browser && (nodeImport || name === "pg" || name === "server-only" || name === "next/server" || local !== null && /^(server|engine|registry)(?:\/|$)/.test(local))) errors.push(`${path}: browser module imports ${name}`);
  }
  if (pure && /\b(?:fetch|Math\.random|Date\.now)\s*\(/.test(text)) errors.push(`${path}: impure engine call`);
}
if (errors.length) { process.stderr.write(errors.join("\n") + "\n"); process.exitCode = 1; }
else process.stdout.write("Module boundaries passed.\n");
