// The one place F3's browser tests touch F4's IndexedDB directly. Not a spec. These names and the record shape are
// private to src/client/storage.ts (database "gilir", store "records", keys "state" and "set-aside", a state record
// { format: "gilir.local-state", version: 1, state }), so a change there breaks here and nowhere else.
import type { Page } from "@playwright/test";
import type { LocalState } from "@/client/storage";

type Key = "state" | "set-aside";

/** The id of the snapshot the stored state holds, or null when nothing is stored. Reads only. */
export async function storedSnapshotId(page: Page): Promise<string | null> {
  const record = await readRecord(page, "state");
  const id = isObject(record) && isObject(record.state) && isObject(record.state.snapshot) ? record.state.snapshot.id : null;
  return typeof id === "string" ? id : null;
}

/** The version of the stored state record, or null when nothing is stored. */
export async function storedVersion(page: Page): Promise<number | null> {
  const record = await readRecord(page, "state");
  return isObject(record) && typeof record.version === "number" ? record.version : null;
}

/** Whether F4 holds saved data it set aside because this version could not read it. */
export async function holdsSetAside(page: Page): Promise<boolean> {
  return (await readRecord(page, "set-aside")) !== undefined;
}

/** Write a state the way a Gilir in another tab would. */
export async function storeState(page: Page, state: LocalState): Promise<void> {
  await writeRecord(page, "state", { format: "gilir.local-state", version: 1, state });
}

/** Write a state record from a newer Gilir, which this version must not read or overwrite. */
export async function storeNewerState(page: Page): Promise<void> {
  await writeRecord(page, "state", { format: "gilir.local-state", version: 2, state: {} });
}

/** Write a state whose saved plan this version cannot open, so F4 sets it aside on its next load. */
export async function storeUnreadablePlan(page: Page): Promise<void> {
  await writeRecord(page, "state", { format: "gilir.local-state", version: 1, state: { draft: null, step: 1, activeJob: null, snapshot: { schemaVersion: 1, id: "unreadable" } } });
}

function readRecord(page: Page, key: Key): Promise<unknown> {
  return page.evaluate(key => new Promise<unknown>((resolve, reject) => {
    const opening = indexedDB.open("gilir");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const reading = database.transaction("records").objectStore("records").get(key);
      reading.onerror = () => reject(reading.error);
      reading.onsuccess = () => {
        database.close();
        resolve(reading.result);
      };
    };
  }), key);
}

function writeRecord(page: Page, key: Key, value: unknown): Promise<void> {
  return page.evaluate(({ key, value }) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("gilir", 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("records");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const writing = database.transaction("records", "readwrite");
      writing.objectStore("records").put(value, key);
      writing.oncomplete = () => {
        database.close();
        resolve();
      };
      writing.onerror = () => reject(writing.error);
    };
  }), { key, value });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
