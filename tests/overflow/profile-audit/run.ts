import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { auditRegistry } from "./audit";
import { loadEvidence } from "./evidence";

class InvalidSubject extends Error {}

function git(subject: string, args: readonly string[]): string {
  try {
    return execFileSync("git", ["-C", subject, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    throw new InvalidSubject("Cannot inspect the requested Git checkout");
  }
}

function cleanSubject(subject: string, expectedSha: string) {
  if (git(subject, ["rev-parse", "HEAD"]) !== expectedSha) throw new InvalidSubject("Subject HEAD does not match the evidence and requested SHA");
  if (git(subject, ["status", "--porcelain", "--untracked-files=no"])) throw new InvalidSubject("Subject has tracked changes");
  const overlays = git(subject, ["ls-files", "--others", "--directory", "-z"]).split("\0").filter(path => path && path !== "node_modules" && path !== "node_modules/" && (
    path.endsWith("/") || /^(src|scripts|tests)\//.test(path) || /\.(?:[cm]?[jt]sx?|json|ya?ml)$/.test(path) || /^\.(?:npmrc|yarnrc|pnp)/.test(path)
  ));
  if (overlays.length) throw new InvalidSubject("Subject has untracked or ignored source/config overlays");
  const dependencyDirectory = join(subject, "node_modules");
  const installation = lstatSync(dependencyDirectory);
  if (!installation.isDirectory() && !installation.isSymbolicLink()) throw new InvalidSubject("Subject node_modules must be an installed directory or an existing symlink");
  const resolved = realpathSync(dependencyDirectory);
  if (!lstatSync(resolved).isDirectory()) throw new InvalidSubject("Subject dependency resolution is not a directory");
  return resolved;
}

const packetSchema = z.strictObject({
  cwd: z.string(), entrypoint: z.string(), unknownVersionRejected: z.boolean(),
  replies: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("loaded"), version: z.string(), value: z.unknown() }),
    z.strictObject({ kind: z.literal("unavailable"), version: z.string() }),
  ])),
});

const childScript = `
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const entrypoint = realpathSync(join(process.cwd(), "src/registry/index.ts"));
const registry = await import(pathToFileURL(entrypoint).href);
if (typeof registry.readRegistryRelease !== "function") process.exit(2);
const versions = JSON.parse(process.argv[1]);
const replies = versions.map(version => {
  try { return {kind: "loaded", version, value: registry.readRegistryRelease(version)}; }
  catch { return {kind: "unavailable", version}; }
});
let unknownVersionRejected = false;
try { registry.readRegistryRelease("x1-unknown-release-negative-control"); }
catch { unknownVersionRejected = true; }
process.stdout.write(JSON.stringify({cwd: process.cwd(), entrypoint, replies, unknownVersionRejected}));
`;

const auditRoot = fileURLToPath(new URL("../../../", import.meta.url));
let evidence: ReturnType<typeof loadEvidence> | undefined;
let report: ReturnType<typeof auditRegistry> | undefined;
let provenance: object = { nodeVersion: process.version };
try {
  evidence = loadEvidence();
  const { values } = parseArgs({ options: { subject: { type: "string" }, "expect-sha": { type: "string" } }, allowPositionals: false });
  if (!values.subject || !isAbsolute(values.subject) || values["expect-sha"] !== evidence.subjectSha) throw new InvalidSubject("Usage requires --subject ABSOLUTE_CHECKOUT --expect-sha matching the checked-in evidence manifest");
  const subject = realpathSync(values.subject);
  const dependencyDirectory = cleanSubject(subject, evidence.subjectSha);
  const require = createRequire(join(subject, "package.json"));
  const loader = require.resolve("tsx");
  const dependencies = ["tsx", "zod"].map(name => {
    const packagePath = require.resolve(`${name}/package.json`);
    const info = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(packagePath, "utf8")));
    return { name, version: info.version, packagePath: realpathSync(packagePath) };
  });
  const evidenceFiles = ["core-source-worksheet.json", "fao-source-comparison.json", "x1-temperature-a.json", "x1-temperature-b.json"];
  provenance = {
    nodeVersion: process.version, auditRevision: git(auditRoot, ["rev-parse", "HEAD"]), subjectSha: evidence.subjectSha,
    subject, entrypoint: join(subject, "src/registry/index.ts"), subjectTsconfig: join(subject, "tsconfig.json"),
    dependencyDirectory, loader, dependencies, releases: evidence.releases.map(row => row.catalogueVersion),
    evidenceHashes: Object.fromEntries(evidenceFiles.map(file => [file, createHash("sha256").update(readFileSync(join(auditRoot, "docs/evidence/X1", file))).digest("hex")])),
    auditImplementationHashes: Object.fromEntries(["audit.ts", "evidence.ts", "run.ts"].map(file => [file, createHash("sha256").update(readFileSync(join(auditRoot, "tests/overflow/profile-audit", file))).digest("hex")])),
  };
  const child = spawnSync(process.execPath, ["--import", loader, "--input-type=module", "-e", childScript, JSON.stringify(evidence.releases.map(row => row.catalogueVersion))], {
    cwd: subject, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
    env: { NODE_ENV: "test", PATH: process.env.PATH, TSX_TSCONFIG_PATH: join(subject, "tsconfig.json"), TSX_DISABLE_CACHE: "1" },
  });
  if (cleanSubject(subject, evidence.subjectSha) !== dependencyDirectory) throw new InvalidSubject("Dependency symlink changed during the audit");
  if (child.status !== 0 || child.error) throw new InvalidSubject("Subject registry process failed or timed out");
  const packet = packetSchema.parse(JSON.parse(child.stdout));
  if (packet.cwd !== subject || packet.entrypoint !== join(subject, "src/registry/index.ts")) throw new InvalidSubject("Registry entrypoint resolved outside the pinned subject");
  report = auditRegistry(version => {
    const reply = packet.replies.find(row => row.version === version);
    if (!reply || reply.kind === "unavailable") throw new Error("Unavailable release");
    return reply.value;
  }, evidence);
  if (!packet.unknownVersionRejected) throw new InvalidSubject("Registry accepted an unknown release version");
  provenance = { ...provenance, subjectVerifiedBeforeAndAfter: true };
  process.stdout.write(`${JSON.stringify({ ...report, provenance }, null, 2)}\n`);
  process.exitCode = report.exitCode;
} catch (error) {
  const failure = error instanceof InvalidSubject ? error.message : "Audit could not complete. Check arguments, evidence, and local dependency availability.";
  const partial = report ?? (evidence ? auditRegistry(() => { throw new Error("Subject not verified"); }, evidence) : { errors: [], coverage: { completedCoreProfileComparisons: 0 } });
  process.stdout.write(`${JSON.stringify({ ...partial, execution: "incomplete", exitCode: 2, errors: [...partial.errors, failure], provenance }, null, 2)}\n`);
  process.exitCode = 2;
}
