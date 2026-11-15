// Playwright helpers that reach the browser's real IndexedDB under F4's storage on "/": the "gilir" database, its one
// "records" store, and the "state" and "set-aside" keys (src/client/storage.ts). They write raw records the way an
// older or newer Gilir would have left them, and make the browser refuse storage.
import type { Page } from "@playwright/test";

type Key = "state" | "set-aside";

/** Puts `record` under `key` exactly as given, as another build of Gilir would have stored it. */
export async function writeRaw(page: Page, key: Key, record: unknown): Promise<void> {
  await page.evaluate(([key, record]) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("gilir", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("records", "readwrite");
      transaction.objectStore("records").put(record, key);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => reject(transaction.error);
    };
  }), [key, record] as const);
}

export async function readRaw(page: Page, key: Key): Promise<unknown> {
  return page.evaluate(key => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open("gilir", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("records", "readonly").objectStore("records").get(key);
      read.onsuccess = () => {
        database.close();
        resolve(read.result);
      };
      read.onerror = () => reject(read.error);
    };
  }), key);
}

/**
 * From the next navigation, indexedDB.open throws SecurityError, as Chromium does when the farmer's settings block
 * site data. The refusal is simulated; everything after it is the real storage code.
 */
export async function blockStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("Access to storage is not allowed from this context.", "SecurityError");
    };
  });
}

/**
 * Once `fillDevice` runs, every IndexedDB put on the page throws QuotaExceededError, the error Chromium raises when a
 * device has no room. The refusal is simulated, because Chromium's DevTools quota override did not refuse writes as
 * small as F1's in this run. Everything after the refusal is the real storage code.
 */
export async function canFillDevice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (Reflect.get(window, "__deviceFull") === true) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
}

export async function fillDevice(page: Page): Promise<void> {
  await page.evaluate(() => Reflect.set(window, "__deviceFull", true));
}
