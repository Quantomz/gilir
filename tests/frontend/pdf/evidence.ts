// Writes the fixture PDFs for docs/evidence/F4. Not a test:
//   node --import tsx tests/frontend/pdf/evidence.ts docs/evidence/F4          the three committed files
//   node --import tsx tests/frontend/pdf/evidence.ts <folder> --all             also every other fixture state,
//                                                                               every variant, and the plan on Letter
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderPdf } from "@/client/pdf/render";
import type { CompletedSnapshot } from "@/contracts/result";
import { completedSnapshotsByState } from "@/fixtures/results";
import { britishReader, variant, variantNames } from "./support/variants";

const committed = ["plan", "plan_with_warnings", "insufficient_data"] as const;

export async function writeEvidence(outDir: string, which: "committed" | "all" = "committed"): Promise<readonly string[]> {
  await mkdir(outDir, { recursive: true });
  const states = which === "all" ? Object.keys(completedSnapshotsByState) as (keyof typeof completedSnapshotsByState)[] : committed;
  const files: readonly (readonly [name: string, snapshot: CompletedSnapshot, locale: string])[] = [
    ...states.map(state => [`fixture-${state}`, completedSnapshotsByState[state], britishReader.locale] as const),
    ...(which === "all" ? [
      ...variantNames.map(name => [`variant-${name}`, variant(name), britishReader.locale] as const),
      ["fixture-plan-letter", completedSnapshotsByState.plan, "en-US"] as const,
    ] : []),
  ];
  const written: string[] = [];
  for (const [name, snapshot, locale] of files) {
    const blob = await renderPdf(snapshot, { ...britishReader, locale });
    const path = join(outDir, `${name}.pdf`);
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    written.push(path);
  }
  return written;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const written = await writeEvidence(process.argv[2] ?? "docs/evidence/F4", process.argv.includes("--all") ? "all" : "committed");
  process.stdout.write(`${written.join("\n")}\n`);
}
