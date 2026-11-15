// An in-memory stand-in for the part of `idb` that src/client/storage.ts calls, so Vitest can drive the real localPlans
// without IndexedDB (node and jsdom have none, and fake-indexeddb is not installed: root dependencies have one writer).
// It implements: openDB with upgrade, blocking and terminated; db.transaction(store, "readwrite") with store.get, put,
// delete and clear, tx.done and tx.abort; db.close.
//
// It keeps the IndexedDB behaviours the storage rules depend on, each seen in Chromium:
//  - values are structured clones, so a stored object never shares identity with the caller's;
//  - writes land only when the transaction commits, so a failed or aborted commit leaves the previous value;
//  - openDB can throw synchronously (no indexedDB, an opaque origin), reject, never settle, or settle late;
//  - an aborted transaction commits nothing, even when its commit was already under way;
//  - an open at a lower version than the stored one rejects with VersionError;
//  - clearing site data fires `terminated` and kills the connection: its next transaction throws InvalidStateError.
//    A connection can also die before its event arrives, so db.transaction can throw with no event fired.
// What it does not model: a transaction committing early across a non-IndexedDB await. storage.spec.ts covers that.
// A new idb call in storage.ts needs this file extended in the same change.
import { vi } from "vitest";

type Operation = "open" | "get" | "commit";
type Failure = DOMException | "hang" | Promise<void>;

interface Callbacks {
  upgrade?(database: { createObjectStore(name: string): void }, oldVersion: number, newVersion: number): void;
  blocking?(): void;
  terminated?(): void;
}

export interface MemoryIdb {
  /** What `vi.doMock("idb", () => memory.module)` serves. */
  readonly module: { openDB(name: string, version: number, callbacks?: Callbacks): Promise<unknown> };
  /** Raw records by database name, then key. Tests seed old records and read what was written here. */
  readonly databases: Map<string, Map<string, unknown>>;
  /** Stored database versions, to seed a database a newer build left. */
  readonly versions: Map<string, number>;
  /** Connections asked for, per database: proves reuse, and reopening once after a dead one. */
  readonly opened: Map<string, number>;
  /** The next `operation` rejects with `how`, or never settles when `how` is "hang". */
  failNext(operation: Operation, how: DOMException | "hang"): void;
  /** The next `operation` waits until the returned function is called, then goes on as normal. */
  hold(operation: Operation): () => void;
  /** The next openDB throws `error` synchronously, as idb does with no indexedDB or in an opaque origin. */
  throwNextOpen(error: Error): void;
  /** The next db.transaction throws `error` synchronously, on a connection that died with no event. */
  throwNextTransaction(error: DOMException): void;
  /** What the browser fires on every open connection of `name`. "terminated" also wipes the data and kills them. */
  fire(name: string, event: "blocking" | "terminated"): void;
}

export const domError = (name: string): DOMException => new DOMException("", name);

export function memoryIdb(): MemoryIdb {
  const databases = new Map<string, Map<string, unknown>>();
  const versions = new Map<string, number>();
  const opened = new Map<string, number>();
  const failures = new Map<Operation, Failure[]>();
  const throws: Error[] = [];
  const transactionThrows: DOMException[] = [];
  const connections = new Map<string, Set<{ callbacks: Callbacks; dead: boolean }>>();

  const settle = async (operation: Operation): Promise<void> => {
    const how = failures.get(operation)?.shift();
    if (how === "hang") await new Promise<never>(() => undefined);
    if (how instanceof Promise) return how;
    if (how !== undefined) throw how;
  };
  const records = (name: string) => databases.get(name) ?? databases.set(name, new Map()).get(name)!;

  const open = async (name: string, version: number, callbacks: Callbacks) => {
    await settle("open");
    const stored = versions.get(name) ?? 0;
    if (version < stored) throw domError("VersionError");
    if (version > stored) callbacks.upgrade?.({ createObjectStore: () => undefined }, stored, version);
    versions.set(name, version);
    const connection = { callbacks, dead: false };
    connections.set(name, (connections.get(name) ?? new Set()).add(connection));
    const alive = () => {
      if (connection.dead) throw domError("InvalidStateError");
    };
    return {
      transaction(_store: string, _mode: "readwrite") {
        alive();
        const error = transactionThrows.shift();
        if (error) throw error;
        const staged = new Map(records(name));
        let aborted = false;
        let done: Promise<void> | null = null;
        return {
          store: {
            async get(key: string) {
              await settle("get");
              return structuredClone(staged.get(key));
            },
            async put(value: unknown, key: string) { staged.set(key, structuredClone(value)); },
            async delete(key: string) { staged.delete(key); },
            async clear() { staged.clear(); },
          },
          abort() { aborted = true; },
          get done() {
            done ??= settle("commit").then(() => {
              if (aborted) throw domError("AbortError");
              databases.set(name, staged);
            });
            return done;
          },
        };
      },
      close() {
        connection.dead = true;
        connections.get(name)?.delete(connection);
      },
    };
  };

  return {
    databases, versions, opened,
    failNext(operation, how) { failures.set(operation, [...(failures.get(operation) ?? []), how]); },
    hold(operation) {
      let release!: () => void;
      failures.set(operation, [...(failures.get(operation) ?? []), new Promise<void>(resolve => { release = resolve; })]);
      return release;
    },
    throwNextOpen(error) { throws.push(error); },
    throwNextTransaction(error) { transactionThrows.push(error); },
    fire(name, event) {
      if (event === "terminated") { databases.delete(name); versions.delete(name); }
      for (const connection of connections.get(name) ?? []) {
        if (event === "terminated") connection.dead = true;
        connection.callbacks[event]?.();
      }
    },
    module: {
      openDB(name, version, callbacks = {}) {
        opened.set(name, (opened.get(name) ?? 0) + 1);
        const error = throws.shift();
        if (error) throw error;
        return open(name, version, callbacks);
      },
    },
  };
}

/**
 * A fresh copy of src/client/storage.ts wired to `memory` in place of idb. Each call resets the module registry, so no
 * connection cached by an earlier test leaks in. `pathname` chooses the shelf (storage.ts shelfHere). Pair with
 * `afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock("idb"); })`.
 */
export async function freshStorage(memory: MemoryIdb = memoryIdb(), pathname = "/") {
  vi.resetModules();
  vi.doMock("idb", () => memory.module);
  vi.stubGlobal("location", { pathname });
  const storage = await import("@/client/storage");
  return { ...storage, memory };
}
