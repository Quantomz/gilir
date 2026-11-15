import { exportPdf, preparePdf } from "@/client/pdf";
import { localPlans, readStorageNotice, storageProblem } from "@/client/storage";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotsByState } from "@/fixtures/results";

async function download(state: keyof typeof completedSnapshotsByState): Promise<string> {
  const snapshot = completedSnapshotsByState[state];
  const blob = await exportPdf(snapshot);
  const name = `gilir-plan-${snapshot.completedAt.slice(0, 10)}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}

const STORE = "records";

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function exists(name: string): Promise<boolean> {
  return (await indexedDB.databases()).some(database => database.name === name);
}

function openRaw(name: string, version?: number): { opened: Promise<IDBDatabase>; blocked: () => boolean } {
  let wasBlocked = false;
  const request = indexedDB.open(name, version);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  };
  request.onblocked = () => { wasBlocked = true; };
  return { opened: settle(request), blocked: () => wasBlocked };
}

let held: Promise<void> = Promise.resolve();

const raw = {
  async write(name: string, version: number, records: Record<string, unknown>): Promise<void> {
    const database = await openRaw(name, version).opened;
    const transaction = database.transaction(STORE, "readwrite");
    for (const [key, value] of Object.entries(records)) transaction.objectStore(STORE).put(value, key);
    await finished(transaction);
    database.close();
  },
  /** The database version and every record as stored, or null when the database does not exist. */
  async read(name: string): Promise<{ version: number; records: Record<string, unknown> } | null> {
    if (!(await exists(name))) return null;
    const database = await openRaw(name).opened;
    const records: Record<string, unknown> = {};
    if (database.objectStoreNames.contains(STORE)) {
      const store = database.transaction(STORE, "readonly").objectStore(STORE);
      const keys = await settle(store.getAllKeys());
      for (const key of keys) records[String(key)] = await settle(store.get(key));
    }
    database.close();
    return { version: database.version, records };
  },
  /** Upgrades as a newer tab would. Resolves how long the open took and whether it was ever blocked. */
  async upgrade(name: string, version: number): Promise<{ ms: number; blocked: boolean }> {
    const started = performance.now();
    const open = openRaw(name, version);
    const database = await open.opened;
    database.close();
    return { ms: performance.now() - started, blocked: open.blocked() };
  },
  /**
   * Holds a readwrite transaction on the records store for `ms`, as a busy other tab would. Resolves once the
   * transaction is queued, so a later call on this database waits behind it; `released` resolves when it ends.
   */
  async hold(name: string, ms: number): Promise<void> {
    const database = await openRaw(name, 1).opened;
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const until = performance.now() + ms;
    const spin = () => {
      if (performance.now() < until) store.get("state").onsuccess = spin;
    };
    spin();
    held = finished(transaction).finally(() => database.close());
  },
  released: (): Promise<void> => held,
  databases: async (): Promise<string[]> => (await indexedDB.databases()).flatMap(database => database.name ?? []),
};

const gilirF4 = {
  localPlans, readStorageNotice, storageProblem, exportPdf, preparePdf, inputFixture,
  snapshots: completedSnapshotsByState, download, raw,
};

declare global {
  interface Window {
    gilirF4: typeof gilirF4;
  }
}

window.gilirF4 = gilirF4;
