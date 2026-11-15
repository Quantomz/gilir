// Nothing here rejects, so a port's own error message can never reach the screen: a storage failure arrives only as
// storageProblem's reason and words.
// localPlans.save replaces the whole LocalState, and F1 owns draft, step and activeJob. So every write loads first and
// changes only `snapshot`, and nothing is written when that load rejects.
import type { LocalPlans, LocalState, StorageNotice } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";
import type { Cleared, Made, Problem, Read, Undone, Wrote } from "../model/session";
import { appName, nounOf } from "../model/words";

export interface Ports {
  readonly plans: LocalPlans;
  readonly exportPdf: (snapshot: CompletedSnapshot) => Promise<Blob>;
  /** F4's reading of a storage error: the reason, and its words for the farmer. */
  readonly storageProblem: (error: unknown) => Problem;
  /** F4's readStorageNotice: non-null while it holds saved data set aside as unreadable, which its clear also removes. */
  readonly notice: () => Promise<StorageNotice | null>;
}

export interface Keeper {
  read(): Promise<Read>;
  save(shown: CompletedSnapshot): Promise<Wrote>;
  /**
   * Loads first, so `undo` is exactly what was there, and nothing is cleared that could not be put back. It cannot
   * delete a job on the server: Results has no planner client, and F1 removes a finished job itself.
   */
  clear(): Promise<Cleared>;
  /** Puts `previous` back only if storage is still empty. A state saved since the clear is kept, and `restored` is false. */
  undo(previous: LocalState): Promise<Undone>;
  pdf(shown: CompletedSnapshot): Promise<Made>;
}

/** Some browsers fetch the file after click() returns, so revoking the URL at once can cancel the download. */
const revokeAfterMs = 30_000;

export function createKeeper(ports: Ports): Keeper {
  const { plans } = ports;
  const failed = ({ error }: { readonly error: unknown }) => ({ ok: false, problem: ports.storageProblem(error) }) as const;
  return {
    async read() {
      const loaded = await attempt(() => plans.load());
      return loaded.ok ? { ok: true, state: loaded.value } : failed(loaded);
    },
    async save(shown) {
      const loaded = await attempt(() => plans.load());
      if (!loaded.ok) return failed(loaded);
      const state: LocalState = { ...(loaded.value ?? emptyState), snapshot: shown };
      const saved = await attempt(() => plans.save(state));
      return saved.ok ? { ok: true, state } : failed(saved);
    },
    async clear() {
      const loaded = await attempt(() => plans.load());
      if (!loaded.ok) return failed(loaded);
      const notice = await attempt(() => ports.notice());
      const cleared = await attempt(() => plans.clear());
      return cleared.ok ? { ok: true, undo: loaded.value, setAside: notice.ok && notice.value !== null } : failed(cleared);
    },
    async undo(previous) {
      const loaded = await attempt(() => plans.load());
      if (!loaded.ok) return failed(loaded);
      if (loaded.value !== null) return { ok: true, state: loaded.value, restored: false };
      const saved = await attempt(() => plans.save(previous));
      return saved.ok ? { ok: true, state: previous, restored: true } : failed(saved);
    },
    async pdf(shown) {
      const made = await attempt(() => ports.exportPdf(shown));
      if (!made.ok) return { ok: false };
      const file = made.value;
      return { ok: (await attempt(() => download(file, pdfName(shown)))).ok };
    },
  };
}

const emptyState: LocalState = { draft: null, step: 1, activeJob: null, snapshot: null };

/** Never the field's label or coordinates: exact farm inputs stay out of file names (AGENTS.md). */
export function pdfName(shown: CompletedSnapshot): string {
  const made = new Date(shown.completedAt);
  const day = [made.getFullYear(), made.getMonth() + 1, made.getDate()].map(part => String(part).padStart(2, "0")).join("-");
  return `${appName.toLowerCase()}-${nounOf(shown)}-${day}.pdf`;
}

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

async function attempt<T>(call: () => T | Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, error };
  }
}

function download(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
  }
}
