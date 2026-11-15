// F3's browser evidence, written to docs/evidence/F3/ only when F3_EVIDENCE=1. Tests stage their files under the run's
// output folder, and this module's default export, the config's globalTeardown, copies them into the repository once
// after the last test. A file written into the repository mid-run makes Tailwind rescan and `next dev` rebuild, and a
// page loaded during that rebuild can fail. Nothing is copied unless every test passed and every state was walked at
// both widths, so a failed or filtered run never replaces the committed evidence with a partial set.
// Publishing deletes every other file in docs/evidence/F3 first, so a screenshot no test writes any more does not
// linger beside the new set. README.md in that folder is written by hand from the observed results and is kept.
// Commit a new set before `npm run check`: its runtime report reads `git diff --binary HEAD` into a 1 MB buffer.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig, TestInfo } from "@playwright/test";

export const writingEvidence = process.env.F3_EVIDENCE === "1";

/** One state at one width, as the browser showed it. */
export interface StateRow {
  readonly name: string;
  readonly state: string;
  readonly width: number;
  readonly title: string;
  readonly status: string;
  readonly sections: readonly string[];
  readonly yearLines: readonly string[];
  readonly kept: string;
  readonly actions: readonly string[];
  readonly sideways: { readonly normal: boolean; readonly largest: boolean };
  readonly height: { readonly normal: number; readonly largest: number };
  readonly shot: string | null;
}

const stagingOf = (outputDir: string) => join(outputDir, "f3-evidence");
const failedMarker = "FAILED";
const statesDir = "states";
const expectedFile = "expected.json";

/**
 * Where a file goes. Under F3_EVIDENCE=1 a file meant for docs/evidence/F3 is staged; every other file stays in the
 * test's own output folder, so a plain run still leaves each screenshot to look at.
 */
export function evidencePath(info: TestInfo, file: string, committed: boolean): string {
  const path = writingEvidence && committed ? join(stagingOf(info.project.outputDir), file) : info.outputPath(file);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/** Text for docs/evidence/F3 under F3_EVIDENCE=1; otherwise it stays in the test's output folder. */
export function stageText(info: TestInfo, file: string, text: string): void {
  writeFileSync(evidencePath(info, file, true), text);
}

export function stageRow(info: TestInfo, row: StateRow): void {
  if (!writingEvidence) return;
  stageText(info, join(statesDir, `${row.name}-${row.width}.json`), JSON.stringify(row));
}

/** Every name and width the run must have walked before anything is published. */
export function expectRows(info: TestInfo, keys: readonly string[]): void {
  if (writingEvidence) stageText(info, expectedFile, JSON.stringify(keys));
}

export function noteFailure(info: TestInfo): void {
  if (!writingEvidence || info.status === info.expectedStatus) return;
  const path = join(stagingOf(info.project.outputDir), failedMarker);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${info.titlePath.join(" > ")}\n`);
}

export default function publish(config: FullConfig): void {
  const [project] = config.projects;
  if (!writingEvidence || project === undefined) return;
  const staging = stagingOf(project.outputDir);
  const refuse = (reason: string): void => {
    process.stdout.write(`F3 evidence not published: ${reason}\n`);
  };
  if (existsSync(join(staging, failedMarker))) return refuse(`a test failed:\n${readFileSync(join(staging, failedMarker), "utf8")}`);
  const expected = existsSync(join(staging, expectedFile)) ? readStaged(join(staging, expectedFile), isStrings) : [];
  const rows = existsSync(join(staging, statesDir))
    ? readdirSync(join(staging, statesDir)).map(file => readStaged(join(staging, statesDir, file), isStateRow))
    : [];
  const walked = new Set(rows.map(row => `${row.name}-${row.width}`));
  const missing = expected.filter(key => !walked.has(key));
  if (expected.length === 0 || missing.length > 0) return refuse(`states not walked: ${missing.join(", ") || "all"}`);
  const tabOrders = ["tab-order-360.md", "tab-order-1280.md"].filter(file => !existsSync(join(staging, file)));
  if (tabOrders.length > 0) return refuse(`missing ${tabOrders.join(", ")}`);

  const target = fileURLToPath(new URL("../../../../docs/evidence/F3", import.meta.url));
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(target)) {
    if (entry !== "README.md") rmSync(join(target, entry), { recursive: true });
  }
  writeFileSync(join(target, "states.md"), statesTable(rows, expected));
  for (const entry of readdirSync(staging)) {
    if (entry === statesDir || entry === expectedFile) continue;
    cpSync(join(staging, entry), join(target, entry), { recursive: true });
  }
  process.stdout.write(`F3 evidence published to ${target}\n`);
}

function readStaged<T>(path: string, is: (value: unknown) => value is T): T {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!is(value)) throw new Error(`${path} does not hold what this run staged.`);
  return value;
}

function isStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(each => typeof each === "string");
}

function isStateRow(value: unknown): value is StateRow {
  return typeof value === "object" && value !== null
    && "name" in value && typeof value.name === "string"
    && "state" in value && typeof value.state === "string"
    && "width" in value && typeof value.width === "number"
    && "title" in value && typeof value.title === "string"
    && "status" in value && typeof value.status === "string"
    && "sections" in value && isStrings(value.sections)
    && "yearLines" in value && isStrings(value.yearLines)
    && "kept" in value && typeof value.kept === "string"
    && "actions" in value && isStrings(value.actions)
    && "sideways" in value && isPair(value.sideways, "boolean")
    && "height" in value && isPair(value.height, "number")
    && "shot" in value && (value.shot === null || typeof value.shot === "string");
}

function isPair(value: unknown, kind: "boolean" | "number"): boolean {
  return typeof value === "object" && value !== null
    && "normal" in value && typeof value.normal === kind && "largest" in value && typeof value.largest === kind;
}

function statesTable(rows: readonly StateRow[], order: readonly string[]): string {
  const names = [...new Set(order.map(key => key.replace(/-\d+$/, "")))];
  const byName = (name: string) => rows.filter(row => row.name === name).sort((a, b) => a.width - b.width);
  const sorted = [...rows].sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name) || a.width - b.width);
  const yesNo = (value: boolean) => (value ? "yes" : "no");
  const cell = (text: string) => text.replaceAll("|", "\\|");
  const lines = [
    "# Every result state in Chromium",
    "",
    "Fixture evidence: the six shared synthetic snapshots and F3's variants, served through a stubbed `/api` to the real HTTP client and shown by Results inside F1's `AppFrame` on `/`. This is not live end-to-end evidence.",
    "",
    "Written by `tests/frontend/results/results.spec.ts` with `F3_EVIDENCE=1`. Each row was walked at Normal text, then at Largest through F1's own Text size sheet. Storage is F4's real IndexedDB port in a fresh browser profile. F1 saved each result when it finished, and the saved line is what Results read back.",
    "",
    "| Snapshot | State | Width | Title | Status | Saved line | Sideways at Normal, Largest | Page height at Normal, Largest (px) | Actions in order | Full page |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...sorted.map(row => `| ${row.name} | ${row.state} | ${row.width} | ${cell(row.title)} | ${cell(row.status)} | ${cell(row.kept)} | ${yesNo(row.sideways.normal)}, ${yesNo(row.sideways.largest)} | ${row.height.normal}, ${row.height.largest} | ${row.actions.map(cell).join(", ")} | ${row.shot === null ? "in the run's output only" : `[${row.shot}](${row.shot})`} |`),
    "",
    "## Sections in reading order",
    "",
    "The h2 headings inside `#main`, top to bottom, and each year line with the section it sits in. The order is the same at both widths unless a second line says otherwise.",
    "",
  ];
  for (const name of names) {
    const [first, ...others] = byName(name);
    if (first === undefined) continue;
    lines.push(`### ${name}`, "", `- Sections: ${first.sections.map(cell).join("; ")}`, `- Year lines: ${first.yearLines.length === 0 ? "none" : first.yearLines.map(cell).join("; ")}`);
    for (const other of others) {
      if (other.sections.join() !== first.sections.join()) lines.push(`- Sections at ${other.width}: ${other.sections.map(cell).join("; ")}`);
      if (other.yearLines.join() !== first.yearLines.join()) lines.push(`- Year lines at ${other.width}: ${other.yearLines.map(cell).join("; ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
