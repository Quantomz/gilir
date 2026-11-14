// F1's only door to the F4 port (src/client/storage.ts). Nothing else in F1 imports localPlans.
//
// Shared state: F1 and F3 both write LocalState through localPlans.save, which replaces the WHOLE state
// (src/client/storage.ts:10; docs/cards/F3.md:35). A writer that saves a stale copy erases the other's change
// (grounding.md gotcha 17). Per separate-before-serializing-shared-state, each writer owns fields and merges at the
// read boundary:
//  - F1 owns draft, step and activeJob. It writes snapshot only when a job finishes, through `finish`.
//  - Every write is read-modify-write: load what is stored now, lay F1's patch over it, save. F3's fields pass through.
//  - No blind writes (synthesis rule): when the load before a write rejects, the write is skipped, health turns
//    "failing", and the patch stays queued for the next write or flush. F1 never overwrites a state it could not read
//    (an envelope F4 could not parse stays for F4 to handle, docs/cards/F4.md "Done when").
//  - Writes run one at a time and coalesce: at most one save in flight, the newest patch wins.
// Nothing here rejects, so no caller needs try/catch around storage.
import { localPlans } from "@/client/storage";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";
import { policy } from "../model/policy";

export type StorageHealth = "working" | "failing";
export type SavedPatch = Partial<Pick<LocalState, "draft" | "step" | "activeJob">>;

/** How a finished job was stored. `written` gates client.remove (graft from candidate 3). */
export interface Finished {
  /** "earlier": a service_error arrived and the earlier non-error plan was kept (spec.md:367). */
  readonly kept: "new" | "earlier";
  /** False when the load or save failed. The job is then NOT removed, so a saved activeJob can still fetch the plan. */
  readonly written: boolean;
}

export interface SavedPlans {
  /** The saved state, or null for nothing saved or unreadable (a rejected load is "nothing saved", storage.ts:14-16). */
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
  throw new Error("not implemented");
  // TODO:
  //  let pending: (SavedPatch & { offer?: CompletedSnapshot }) | null = null; let running: Promise<void> | null = null
  //  write(p, when): pending = { ...pending, ...p }; when === "now" ? drain() : debounce(drain, debounceMs)
  //  finish(s): pending = { ...pending, activeJob: null, step: 4, offer: s }; return drain().then(() => outcome of that save)
  //  drain(): if (running) return running.then(drain-if-pending)
  //    running = (async () => { while (pending) {
  //      const base = await port.load().then(s => ({ ok: true, s }), () => ({ ok: false }))
  //      if (!base.ok) { health("failing"); return }                       // no blind writes: keep `pending`
  //      const p = pending; pending = null
  //      const current = base.s ?? emptyLocalState
  //      const next: LocalState = { ...current, ...pick(p, "draft", "step", "activeJob"),
  //                                 snapshot: p.offer ? keepSnapshot(current.snapshot, p.offer) : current.snapshot }
  //      try { await port.save(next); health("working") } catch { health("failing"); pending = { ...p, ...pending } } } })()
  //  open(): port.load() (catch -> null, health "failing")
}

export const emptyLocalState: LocalState = { draft: null, step: 1, activeJob: null, snapshot: null };

/**
 * Spec 8 (spec.md:367): a finished service_error is no new plan. An earlier saved non-error plan stays saved with its
 * original date. Every other result replaces the saved plan. Pure. The one owner of this rule.
 */
export function keepSnapshot(previous: CompletedSnapshot | null, incoming: CompletedSnapshot): CompletedSnapshot {
  return incoming.result.state === "service_error" && previous !== null && previous.result.state !== "service_error"
    ? previous
    : incoming;
}
