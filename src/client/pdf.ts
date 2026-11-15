import type { CompletedSnapshot } from "@/contracts/result";
import type { Reader } from "./pdf/text";

/**
 * A PDF of one completed snapshot, made from the snapshot alone: no engine, no server and no storage, so it works when
 * the browser is not saving. A plan prints with its timeline; a result with no plan prints as a status report with no
 * calendar. Rejects only when the PDF code can't load (offline before preparePdf ran) or on a bug.
 */
export async function exportPdf(snapshot: CompletedSnapshot): Promise<Blob> {
  const { renderPdf } = await renderer();
  return renderPdf(snapshot, browserReader());
}

/**
 * Fetches the PDF code now, so exportPdf still works if the connection drops later. Call it when a result is on screen.
 * Returns nothing, so `useEffect(() => preparePdf(), [])` is safe. Idempotent, never throws, and does nothing on the
 * server.
 */
export function preparePdf(): void {
  if (typeof window !== "undefined") void renderer().catch(() => undefined);
}

let loading: Promise<typeof import("./pdf/render")> | null = null;

function renderer(): Promise<typeof import("./pdf/render")> {
  loading ??= import("./pdf/render").catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

function browserReader(): Reader {
  const locale = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-GB";
  return { locale, timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" };
}
