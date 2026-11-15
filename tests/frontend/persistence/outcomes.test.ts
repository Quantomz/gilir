import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalState } from "@/client/storage";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture } from "@/fixtures/results";
import { domError, freshStorage, memoryIdb } from "./support/memory-idb";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("idb");
});

const capability = { jobId: "00000000-0000-4000-8000-000000000001", token: "synthetic-local-fixture-token" };
const state: LocalState = { draft: inputFixture, step: 2, activeJob: capability, snapshot: completedSnapshotFixture };

function rejection(call: Promise<unknown>): Promise<Error> {
  return call.then(() => expect.unreachable("the call resolved"), (error: Error) => error);
}

const words = {
  unavailable: "This browser isn’t letting Gilir open or save your answers on this device.",
  full: "This device has no room left to save Gilir.",
  newer: "Gilir has a newer version. Close this page and open Gilir again to see what you saved.",
};

const settleLateWork = () => new Promise(resolve => setTimeout(resolve, 0));

describe("nothing saved is not unavailable", () => {
  it("an empty database, and a database after clear, resolve null", async () => {
    const { localPlans } = await freshStorage();
    expect(await localPlans.load()).toBeNull();
    await localPlans.save(state);
    await localPlans.clear();
    expect(await localPlans.load()).toBeNull();
  });

  it("the real module with the real idb in node (no indexedDB) rejects load, save and clear, and storageProblem reads unavailable", async () => {
    vi.resetModules();
    expect(typeof globalThis.indexedDB).toBe("undefined");
    const real = await import("@/client/storage");
    for (const call of [real.localPlans.load(), real.localPlans.save(state), real.localPlans.clear()]) {
      expect(real.storageProblem(await rejection(call))).toEqual({ reason: "unavailable", text: words.unavailable });
    }
  });

  it("openDB throwing SecurityError synchronously becomes a rejection, never a thrown call", async () => {
    const memory = memoryIdb();
    memory.throwNextOpen(domError("SecurityError"));
    const { localPlans, storageProblem } = await freshStorage(memory);
    let call: Promise<unknown> = Promise.resolve();
    expect(() => { call = localPlans.load(); }).not.toThrow();
    expect(storageProblem(await rejection(call)).reason).toBe("unavailable");
  });

  it("InvalidStateError, UnknownError and AbortError at open reject unavailable", async () => {
    for (const name of ["InvalidStateError", "UnknownError", "AbortError"]) {
      const memory = memoryIdb();
      // Twice, so the one retry a dead connection gets meets the same failure.
      memory.failNext("open", domError(name));
      memory.failNext("open", domError(name));
      const { localPlans, storageProblem } = await freshStorage(memory);
      expect(storageProblem(await rejection(localPlans.load())).reason).toBe("unavailable");
    }
  });

  it("after terminated (site data cleared) the next load opens a new connection and resolves null, not a rejection", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    memory.fire("gilir", "terminated");
    expect(await localPlans.load()).toBeNull();
    expect(memory.opened.get("gilir")).toBe(2);
  });
});

describe("a full device", () => {
  it("a commit that fails with QuotaExceededError and an empty message rejects full, matched by name", async () => {
    const { localPlans, storageProblem, memory } = await freshStorage();
    const quota = domError("QuotaExceededError");
    expect(quota.message).toBe("");
    memory.failNext("commit", quota);
    expect(storageProblem(await rejection(localPlans.save(state)))).toEqual({ reason: "full", text: words.full });
  });

  it("the state saved before the failed save still loads", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    memory.failNext("commit", domError("QuotaExceededError"));
    await rejection(localPlans.save({ ...state, step: 4, snapshot: null }));
    expect(await localPlans.load()).toEqual(state);
  });
});

describe("a newer build", () => {
  it("VersionError at open rejects newer for load, save and clear", async () => {
    const memory = memoryIdb();
    memory.versions.set("gilir", 2);
    const { localPlans, storageProblem } = await freshStorage(memory);
    for (const call of [localPlans.load(), localPlans.save(state), localPlans.clear()]) {
      expect(storageProblem(await rejection(call))).toEqual({ reason: "newer", text: words.newer });
    }
  });

  it("blocking closes this page's connection, so a newer tab's upgrade never waits on it; the next call rejects newer", async () => {
    const { localPlans, storageProblem, memory } = await freshStorage();
    await localPlans.save(state);
    memory.fire("gilir", "blocking");
    memory.versions.set("gilir", 2);
    expect(storageProblem(await rejection(localPlans.load())).reason).toBe("newer");
    expect(memory.opened.get("gilir")).toBe(2);
  });
});

describe("no call hangs", () => {
  it("an open, a get or a commit that never settles rejects unavailable after 5 s (fake timers)", async () => {
    for (const operation of ["open", "get", "commit"] as const) {
      const { localPlans, storageProblem, memory } = await freshStorage();
      vi.useFakeTimers();
      memory.failNext(operation, "hang");
      const settled = vi.fn();
      const call = rejection(localPlans.load()).finally(settled);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled, operation).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(storageProblem(await call).reason).toBe("unavailable");
      vi.useRealTimers();
    }
  });

  it("a call that ran out of time changed nothing: its transaction was aborted", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    vi.useFakeTimers();
    const releaseCommit = memory.hold("commit");
    const late = rejection(localPlans.save({ ...state, step: 4 }));
    await vi.advanceTimersByTimeAsync(5_000);
    await late;
    vi.useRealTimers();
    releaseCommit();
    await settleLateWork();
    expect(await localPlans.load()).toEqual(state);
  });

  it("an open that answers after the limit starts no transaction: the late call writes nothing", async () => {
    const memory = memoryIdb();
    await (await freshStorage(memory)).localPlans.save(state);
    const { localPlans } = await freshStorage(memory);
    vi.useFakeTimers();
    const releaseOpen = memory.hold("open");
    const late = rejection(localPlans.save({ ...state, step: 4 }));
    await vi.advanceTimersByTimeAsync(5_000);
    await late;
    vi.useRealTimers();
    releaseOpen();
    await settleLateWork();
    expect(await localPlans.load()).toEqual(state);
  });

  it("the call after a timeout opens a fresh connection", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    vi.useFakeTimers();
    memory.failNext("get", "hang");
    const late = rejection(localPlans.load());
    await vi.advanceTimersByTimeAsync(5_000);
    await late;
    vi.useRealTimers();
    expect(await localPlans.load()).toEqual(state);
    expect(memory.opened.get("gilir")).toBe(2);
  });

  it("a dead connection (InvalidStateError on transaction) is retried once on a fresh connection and succeeds; a second dead one in the same call rejects", async () => {
    const { localPlans, storageProblem, memory } = await freshStorage();
    await localPlans.save(state);
    memory.throwNextTransaction(domError("InvalidStateError"));
    expect(await localPlans.load()).toEqual(state);
    expect(memory.opened.get("gilir")).toBe(2);
    memory.throwNextTransaction(domError("InvalidStateError"));
    memory.throwNextTransaction(domError("InvalidStateError"));
    expect(storageProblem(await rejection(localPlans.load())).reason).toBe("unavailable");
  });

  it("a transaction the browser aborts under a dying connection (AbortError, seen in Chromium when site data is cleared) is retried once on a fresh connection; a second abort in the same call rejects", async () => {
    const { localPlans, storageProblem, memory } = await freshStorage();
    await localPlans.save(state);
    memory.failNext("commit", domError("AbortError"));
    expect(await localPlans.load()).toEqual(state);
    expect(memory.opened.get("gilir")).toBe(2);
    memory.failNext("commit", domError("AbortError"));
    memory.failNext("commit", domError("AbortError"));
    expect(storageProblem(await rejection(localPlans.load())).reason).toBe("unavailable");
  });

  it("three calls in a row open one connection", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    await localPlans.load();
    await localPlans.clear();
    expect(memory.opened.get("gilir")).toBe(1);
  });
});

describe("storageProblem and its words", () => {
  it("reads its own rejections, raw DOMException names (QuotaExceededError, VersionError, SecurityError), a plain Error and a non-error", async () => {
    const { localPlans, storageProblem, memory } = await freshStorage();
    memory.failNext("commit", domError("QuotaExceededError"));
    expect(storageProblem(await rejection(localPlans.save(state))).reason).toBe("full");
    expect(storageProblem(domError("QuotaExceededError")).reason).toBe("full");
    expect(storageProblem(domError("VersionError")).reason).toBe("newer");
    expect(storageProblem(domError("SecurityError")).reason).toBe("unavailable");
    expect(storageProblem(new Error("The disk is full")).reason).toBe("unavailable");
    expect(storageProblem("full").reason).toBe("unavailable");
  });

  it("anything it does not recognise reads as unavailable, the reason that never invites a write", async () => {
    const { storageProblem } = await freshStorage();
    for (const error of [undefined, null, 42, {}, { name: 22 }, new TypeError("x"), domError("DataCloneError"), domError("UnknownError")]) {
      expect(storageProblem(error)).toEqual({ reason: "unavailable", text: words.unavailable });
    }
  });

  it("unavailable: This browser isn’t letting Gilir open or save your answers on this device.", async () => {
    const memory = memoryIdb();
    memory.throwNextOpen(new ReferenceError("indexedDB is not defined"));
    const { localPlans, storageProblem } = await freshStorage(memory);
    expect(storageProblem(await rejection(localPlans.save(state))).text).toBe(words.unavailable);
  });

  it("full: This device has no room left to save Gilir.", async () => {
    const { localPlans, storageProblem, memory } = await freshStorage();
    memory.failNext("commit", domError("QuotaExceededError"));
    expect(storageProblem(await rejection(localPlans.save(state))).text).toBe(words.full);
  });

  it("newer: Gilir has a newer version. Close this page and open Gilir again to see what you saved.", async () => {
    const memory = memoryIdb();
    memory.versions.set("gilir", 2);
    const { localPlans, storageProblem } = await freshStorage(memory);
    expect(storageProblem(await rejection(localPlans.load())).text).toBe(words.newer);
  });
});

describe("quiet", () => {
  async function everyOutcome(): Promise<Error[]> {
    const { localPlans, readStorageNotice, memory } = await freshStorage();
    await localPlans.save(state);
    await localPlans.load();
    memory.failNext("commit", domError("QuotaExceededError"));
    const full = await rejection(localPlans.save({ ...state, step: 3 }));
    memory.databases.get("gilir")?.set("state", { format: "gilir.local-state", version: 1, state: { ...state, activeJob: { jobId: "synthetic-job" } } });
    await localPlans.load();
    await (await readStorageNotice())?.dismiss();
    await localPlans.clear();
    memory.versions.set("gilir", 2);
    memory.fire("gilir", "blocking");
    const newer = await rejection(localPlans.save(state));
    const unavailable = memoryIdb();
    unavailable.throwNextOpen(domError("SecurityError"));
    const denied = await rejection((await freshStorage(unavailable)).localPlans.save(state));
    const hung = memoryIdb();
    const timed = await freshStorage(hung);
    vi.useFakeTimers();
    hung.failNext("get", "hang");
    const late = rejection(timed.localPlans.save(state));
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();
    return [full, newer, denied, await late];
  }

  it("console is never called, on success or on failure", async () => {
    const calls = (["log", "info", "warn", "error", "debug", "trace"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => undefined));
    expect(await everyOutcome()).toHaveLength(4);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it("a rejection's message holds only the reason and a browser error name: no state, token, label, date or coordinate", async () => {
    const rejections = await everyOutcome();
    for (const error of rejections) {
      expect(error.message).toMatch(/^Local storage failed: (unavailable|full|newer) \([A-Za-z]+Error\)\.$/);
      const everything = JSON.stringify({ ...error, message: error.message, cause: error.cause });
      expect(everything).not.toMatch(/synthetic|token|example field|2026|100\.0|15\.0/i);
    }
  });

  it("no call makes a network request (fetch spied)", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { localPlans, readStorageNotice } = await freshStorage();
    await localPlans.save(state);
    await localPlans.load();
    await readStorageNotice();
    await localPlans.clear();
    expect(fetch).not.toHaveBeenCalled();
  });
});
