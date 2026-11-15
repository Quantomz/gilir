import { vi } from "vitest";
import { storageProblem } from "@/client/storage";
import { createKeeper } from "@/features/results/services/keeper";
import type { Keeper } from "@/features/results/services/keeper";
import type { MemoryPlans, PdfPort } from "./ports";

/**
 * The real createKeeper over the two fakes, with the browser download stubbed (URL.createObjectURL,
 * URL.revokeObjectURL and HTMLAnchorElement.prototype.click), because jsdom cannot navigate to a blob. `downloads`
 * records each file name. Its callers restore the stubs with vi.restoreAllMocks. It needs a DOM, so they run under jsdom.
 */
export function fakeKeeper(plans: MemoryPlans, pdf: PdfPort): { readonly keeper: Keeper; readonly downloads: readonly string[] } {
  const downloads: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:gilir-test");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  return {
    keeper: createKeeper({ plans, exportPdf: snapshot => pdf.exportPdf(snapshot), storageProblem, notice: () => plans.notice() }),
    downloads,
  };
}
