// F1's only door to F4's storage. Nothing else in F1 imports localPlans, readStorageNotice or storageProblem.
//
// F1 and F3 both write LocalState through localPlans.save, which replaces the WHOLE state, so a writer that saves a
// stale copy erases the other's change. Each writer owns fields and merges at the read boundary:
//  - F1 owns draft, step and activeJob. It writes snapshot only when a job finishes, through `finish`.
//  - Every write is read-modify-write: load what is stored now, lay F1's patch over it, save. F3's fields pass through.
//  - No blind writes: when the load before a write rejects, the write is skipped, the storage line says why, and the
//    patch stays queued for the next write or flush. F1 never overwrites a state it could not read (an envelope F4
//    could not parse stays for F4 to handle).
//  - After an open that failed, the flow started empty without seeing what is stored. Writes stay skipped while the
//    store holds a draft or a running job, so a passing failure never erases answers or a job F1 did not show.
//  - Writes run one at a time and coalesce: at most one save in flight, the newest patch wins.
//  - A failed call puts F4's words for its reason on the storage line, and a save that goes through clears them. A write
//    skipped after a failed open repeats the open's reason.
// Nothing here rejects, so no caller needs try/catch around storage.
import { localPlans, readStorageNotice, storageProblem } from "@/client/storage";
import type { LocalPlans, LocalState, StorageNotice, StorageReason } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";
import { policy } from "../model/policy";

/** F4's storage as F1 uses it: the saved state, and the notice for saved data F4 set aside. */
export interface StoragePort extends LocalPlans {
  readNotice(): Promise<StorageNotice | null>;
}

export const f4Storage: StoragePort = { ...localPlans, readNotice: readStorageNotice };

/** Why a storage call failed: F4's reason, and F4's words for it. */
export interface StorageProblem {
  readonly reason: StorageReason;
  readonly text: string;
}

/** The one quiet storage line above every screen, Results included. Nothing to say is both null. */
export interface StorageLine {
  /** F4's words for saved data it set aside, until Got it removes that data for good. */
  readonly setAside: StorageNotice | null;
  /** Why the latest storage call failed, until a later save goes through or Got it. */
  readonly problem: StorageProblem | null;
}

/**
 * The storage line of one page load. It outlives Onboarding, so the frame around Results shows it too. The views read
 * it and press Got it; the saved plans of each Onboarding mount report into it.
 */
export interface StorageLineStore {
  subscribe(listener: () => void): () => void;
  current(): StorageLine;
  /** Got it: F4 removes the set-aside data for good, and the reason shown stays quiet for the rest of the visit. */
  dismiss(): void;
  /** A load or a save failed. */
  failed(problem: StorageProblem): void;
  /** A save went through, so storage works again. A load alone does not show that: a full device still loads. */
  saved(): void;
  /** Reads the set-aside notice the first time it is called, and returns that same read every later time. */
  readSetAside(read: () => Promise<StorageNotice | null>): Promise<void>;
}

export const nothingToSay: StorageLine = { setAside: null, problem: null };

export function createStorageLine(): StorageLineStore {
  let line = nothingToSay;
  let setAsideRead: Promise<void> | null = null;
  const quiet = new Set<StorageReason>();
  const listeners = new Set<() => void>();
  const show = (next: StorageLine) => {
    if (next.setAside === line.setAside && next.problem === line.problem) return;
    line = next;
    listeners.forEach(listener => listener());
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => line,
    dismiss() {
      const shown = line;
      if (shown.problem !== null) quiet.add(shown.problem.reason);
      show(nothingToSay);
      void shown.setAside?.dismiss();
    },
    failed(problem) {
      if (problem.reason !== line.problem?.reason) show({ ...line, problem: quiet.has(problem.reason) ? null : problem });
    },
    saved() {
      show({ ...line, problem: null });
    },
    readSetAside(read) {
      setAsideRead ??= read().then(setAside => show({ ...line, setAside }));
      return setAsideRead;
    },
  };
}

/** This page load's storage line. A reload starts a new one, as F4's notice is read once per page load. */
export const storageLine = createStorageLine();

export type SavedPatch = Partial<Pick<LocalState, "draft" | "step" | "activeJob">>;

/** How a finished job was stored. `written` gates client.remove. */
export interface Finished {
  /** "earlier": a service_error arrived and the earlier non-error plan was kept. */
  readonly kept: "new" | "earlier";
  /** False when the load or save failed. The job is then NOT removed, so a saved activeJob can still fetch the plan. */
  readonly written: boolean;
}

export interface SavedPlans {
  /** The saved state, or null for nothing saved or unreadable. A load that rejects every attempt is "nothing saved". */
  open(): Promise<LocalState | null>;
  /** Queue F1's fields. "soon" waits policy.save.debounceMs (a drag saves once on drop); "now" writes at once. */
  write(patch: SavedPatch, when: "soon" | "now"): void;
  /** A job finished: clear activeJob, set step 4, and keep the snapshot by `keepSnapshot`, in ONE save. */
  finish(snapshot: CompletedSnapshot): Promise<Finished>;
  /** Write anything queued. Called on pagehide, when the tab is hidden, and on unmount. Safe to call twice. */
  flush(): Promise<void>;
}

/** `readNotice` is optional so a caller with plain LocalPlans, such as F3's keeper test, gets no set-aside notice. */
export function createSavedPlans(
  port: LocalPlans & Partial<Pick<StoragePort, "readNotice">>,
  debounceMs: number = policy.save.debounceMs,
  line: StorageLineStore = createStorageLine(),
): SavedPlans {
  let pending: Pending | null = null;
  let queue: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opens = 0;
  /** Why the latest open could not read storage, or null once storage was read. */
  let unread: StorageProblem | null = null;

  const add = (patch: SavedPatch, offer: CompletedSnapshot | null, waiter: ((finished: Finished) => void) | null) => {
    pending = {
      patch: { ...pending?.patch, ...patch },
      offer: offer ?? pending?.offer ?? null,
      waiters: waiter === null ? pending?.waiters ?? [] : [...(pending?.waiters ?? []), waiter],
    };
  };

  const requeue = (batch: Pending) => {
    pending = { patch: { ...batch.patch, ...pending?.patch }, offer: pending?.offer ?? batch.offer, waiters: pending?.waiters ?? [] };
  };

  // One attempt per call, chained, so at most one save is in flight and later patches ride on the next attempt.
  const drain = (): Promise<void> => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    queue = queue.then(saveOnce);
    return queue;
  };

  async function saveOnce(): Promise<void> {
    if (pending === null) return;
    const loaded = await port.load().then(
      state => ({ state, problem: null }),
      (error: unknown) => ({ state: null, problem: storageProblem(error) }),
    );
    const skipped = loaded.problem ?? (unread !== null && holdsF1State(loaded.state) ? unread : null);
    if (skipped !== null) {
      const unsaved: Pending = pending;
      pending = { ...unsaved, waiters: [] };
      line.failed(skipped);
      unsaved.waiters.forEach(waiter => waiter({ kept: "new", written: false }));
      return;
    }
    unread = null;
    const batch: Pending = pending;
    pending = null;
    const current = loaded.state ?? emptyLocalState;
    const snapshot = batch.offer === null ? current.snapshot : keepSnapshot(current.snapshot, batch.offer);
    const kept = batch.offer !== null && snapshot !== batch.offer ? "earlier" : "new";
    try {
      await port.save({ ...current, ...batch.patch, snapshot });
    } catch (error) {
      requeue(batch);
      line.failed(storageProblem(error));
      batch.waiters.forEach(waiter => waiter({ kept, written: false }));
      return;
    }
    line.saved();
    batch.waiters.forEach(waiter => waiter({ kept, written: true }));
  }

  return {
    open() {
      const call = ++opens;
      const started = Date.now();
      const retry = (left: number) => left > 1 && Date.now() - started < policy.save.openRetryWithinMs;
      const load = (left: number): Promise<LocalState | null> => port.load().catch((error: unknown) => (retry(left) ? load(left - 1) : Promise.reject(error)));
      return load(policy.save.openAttempts).then(
        async state => {
          if (call === opens) unread = null;
          // The page opens once the notice is read, so it paints with its line instead of jumping down under it.
          await line.readSetAside(() => port.readNotice?.() ?? Promise.resolve(null));
          return state;
        },
        (error: unknown) => {
          const problem = storageProblem(error);
          if (call === opens) unread = problem;
          line.failed(problem);
          return null;
        },
      );
    },
    write(patch, when) {
      add(patch, null, null);
      if (when === "now") {
        void drain();
        return;
      }
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void drain(), debounceMs);
    },
    finish(snapshot) {
      return new Promise(resolve => {
        add({ activeJob: null, step: 4 }, snapshot, resolve);
        void drain();
      });
    },
    flush: drain,
  };
}

/** F1's fields waiting to be written, a finished job's snapshot, and the finish calls waiting on that write. */
interface Pending {
  readonly patch: SavedPatch;
  readonly offer: CompletedSnapshot | null;
  readonly waiters: readonly ((finished: Finished) => void)[];
}

function holdsF1State(state: LocalState | null): boolean {
  return state !== null && (state.draft !== null || state.activeJob !== null);
}

const emptyLocalState: LocalState = { draft: null, step: 1, activeJob: null, snapshot: null };

/**
 * Spec section 8: a finished service_error is no new plan. An earlier saved non-error plan stays saved with its
 * original date. Every other result replaces the saved plan. Pure. The one owner of this rule.
 */
export function keepSnapshot(previous: CompletedSnapshot | null, incoming: CompletedSnapshot): CompletedSnapshot {
  return incoming.result.state === "service_error" && previous !== null && previous.result.state !== "service_error"
    ? previous
    : incoming;
}
