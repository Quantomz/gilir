// F1's only door to the F4 storage port. Nothing else in F1 imports localPlans.
//
// F1 and F3 both write LocalState through localPlans.save, which replaces the WHOLE state, so a writer that saves a
// stale copy erases the other's change. Each writer owns fields and merges at the read boundary:
//  - F1 owns draft, step and activeJob. It writes snapshot only when a job finishes, through `finish`.
//  - Every write is read-modify-write: load what is stored now, lay F1's patch over it, save. F3's fields pass through.
//  - No blind writes: when the load before a write rejects, the write is skipped, health turns "failing", and the
//    patch stays queued for the next write or flush. F1 never overwrites a state it could not read (an envelope F4
//    could not parse stays for F4 to handle).
//  - After an open that failed, the flow started empty without seeing what is stored. Writes stay skipped while the
//    store holds a draft or a running job, so a passing failure never erases answers or a job F1 did not show.
//  - Writes run one at a time and coalesce: at most one save in flight, the newest patch wins.
// Nothing here rejects, so no caller needs try/catch around storage.
import { localPlans } from "@/client/storage";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";
import { policy } from "../model/policy";

export type StorageHealth = "working" | "failing";
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
  /** Called after every settled storage call. The flow shows one quiet notice once health turns "failing". */
  onHealth(listener: (health: StorageHealth) => void): () => void;
}

export function createSavedPlans(port: LocalPlans = localPlans, debounceMs: number = policy.save.debounceMs): SavedPlans {
  let pending: Pending | null = null;
  let queue: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opens = 0;
  let unread = false;
  const listeners = new Set<(health: StorageHealth) => void>();
  const report = (health: StorageHealth) => listeners.forEach(listener => listener(health));

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
    const loaded = await port.load().then(state => ({ ok: true as const, state }), () => ({ ok: false as const }));
    if (!loaded.ok || (unread && holdsF1State(loaded.state))) {
      const unsaved: Pending = pending;
      pending = { ...unsaved, waiters: [] };
      report("failing");
      unsaved.waiters.forEach(waiter => waiter({ kept: "new", written: false }));
      return;
    }
    unread = false;
    const batch: Pending = pending;
    pending = null;
    const current = loaded.state ?? emptyLocalState;
    const snapshot = batch.offer === null ? current.snapshot : keepSnapshot(current.snapshot, batch.offer);
    const kept = batch.offer !== null && snapshot !== batch.offer ? "earlier" : "new";
    try {
      await port.save({ ...current, ...batch.patch, snapshot });
    } catch {
      requeue(batch);
      report("failing");
      batch.waiters.forEach(waiter => waiter({ kept, written: false }));
      return;
    }
    report("working");
    batch.waiters.forEach(waiter => waiter({ kept, written: true }));
  }

  return {
    open() {
      const call = ++opens;
      const started = Date.now();
      const retry = (left: number) => left > 1 && Date.now() - started < policy.save.openRetryWithinMs;
      const load = (left: number): Promise<LocalState | null> => port.load().catch((error: unknown) => (retry(left) ? load(left - 1) : Promise.reject(error)));
      return load(policy.save.openAttempts).then(
        state => {
          if (call === opens) unread = false;
          report("working");
          return state;
        },
        () => {
          if (call === opens) unread = true;
          report("failing");
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
    onHealth(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
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
