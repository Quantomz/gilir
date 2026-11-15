// Evidence is written only with I3_EVIDENCE=1, so an ordinary run leaves docs/evidence/I3 untouched.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Page } from "@playwright/test";

export const recording = process.env.I3_EVIDENCE === "1";
export const evidenceDir = resolve(process.cwd(), "docs/evidence/I3");

export function evidencePath(name: string): string {
  const path = resolve(evidenceDir, name);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/** A JPEG of the whole page, or of the window alone for a long page whose top is what matters. */
export async function shot(page: Page, name: string, extent: "page" | "window" = "page"): Promise<void> {
  if (!recording) return;
  await page.screenshot({
    path: evidencePath(`shots/${name}.jpg`),
    type: "jpeg",
    quality: 60,
    fullPage: extent === "page",
    animations: "disabled",
    // F1's sticky top bar is drawn across the middle of a capture taller than the window.
    style: extent === "page" ? ".topbar { visibility: hidden }" : undefined,
  });
}
