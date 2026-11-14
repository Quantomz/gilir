import type { CompletedSnapshot } from "@/contracts";
export async function exportPdf(_snapshot: CompletedSnapshot): Promise<Blob> {
  throw new Error("PDF export is not implemented. Follow F4.");
}
