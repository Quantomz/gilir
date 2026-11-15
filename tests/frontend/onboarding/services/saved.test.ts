// Node environment. The one door to localPlans, driven through a fake LocalPlans port, so no module mock is needed.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalState } from "@/client/storage";
import { parseIsoDate } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, completedSnapshotsByState } from "@/fixtures/results";
import { createSavedPlans, createStorageLine, keepSnapshot } from "@/features/onboarding/services/saved";
import type { SavedPlans, StorageLineStore, StoragePort } from "@/features/onboarding/services/saved";
import { capability, memoryPlans } from "../support/harness";
import type { MemoryPlans } from "../support/harness";

afterEach(() => {
  vi.useRealTimers();
});

const plan = completedSnapshotFixture;
const serviceError = completedSnapshotsByState.service_error;
const state = (extra: Partial<LocalState>): LocalState => ({ draft: null, step: 1, activeJob: null, snapshot: null, ...extra });

const lines = new WeakMap<SavedPlans, StorageLineStore>();

/** The door over `port`, with a storage line of its own, as one page load has. */
function door(port: StoragePort, debounceMs?: number): SavedPlans {
  const line = createStorageLine();
  const saved = createSavedPlans(port, line, debounceMs);
  lines.set(saved, line);
  return saved;
}

/** F4's words the storage line shows now, or null when it says nothing about a failure. */
const problemOf = (saved: SavedPlans) => lines.get(saved)?.current().problem?.text ?? null;

const words = {
  unavailable: "This browser isn’t letting Gilir open or save your answers on this device.",
  full: "This device has no room left to save Gilir.",
  newer: "Gilir has a newer version. Close this page and open Gilir again to see what you saved.",
};

/** A port whose next calls fail while `failing` says so, over a working memory store. */
function flaky(plans: MemoryPlans, failing: { load: boolean; save: boolean }): StoragePort {
  const refuse = () => Promise.reject(new Error("Storage is not available."));
  return {
    load: () => (failing.load ? refuse() : plans.load()),
    save: next => (failing.save ? refuse() : plans.save(next)),
    clear: () => plans.clear(),
    readNotice: () => plans.readNotice(),
  };
}

describe("open", () => {
  it("[B2] a rejected load opens as nothing saved (null) and shows F4's words on the storage line", async () => {
    const saved = door(memoryPlans(state({ snapshot: plan }), "loadThrows"));
    await expect(saved.open()).resolves.toBeNull();
    expect(problemOf(saved)).toBe(words.unavailable);
  });

  it("[B2] a load that fails once is tried again, so a passing failure does not hide what is saved", async () => {
    const plans = memoryPlans(state({ draft: { water: "unsure" }, step: 3 }));
    let loads = 0;
    const saved = door({ ...plans, load: () => (++loads === 1 ? Promise.reject(new Error("Storage is busy.")) : plans.load()) });
    await expect(saved.open()).resolves.toEqual(state({ draft: { water: "unsure" }, step: 3 }));
    expect(problemOf(saved)).toBeNull();
  });

  it("[B2] a load that fails only after storage's own 5 s limit is not tried again, so Opening waits for it once", async () => {
    vi.useFakeTimers();
    let loads = 0;
    const slow = () => new Promise<LocalState | null>((_, reject) => setTimeout(() => reject(new Error("Storage did not answer.")), 5_000));
    const saved = door({ ...memoryPlans(null), load: () => (++loads, slow()) });
    const opened = saved.open();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(opened).resolves.toBeNull();
    expect(loads).toBe(1);
  });

  it("a load that resolves null is nothing saved, with nothing on the storage line", async () => {
    const saved = door(memoryPlans(null));
    await expect(saved.open()).resolves.toBeNull();
    expect(problemOf(saved)).toBeNull();
  });
});

describe("after an open that failed", () => {
  it("[B2] a later write never replaces answers or a running job the open could not read", async () => {
    const plans = memoryPlans(state({ draft: inputFixture, step: 3, activeJob: capability }));
    const failing = { load: true, save: false };
    const saved = door(flaky(plans, failing));
    await expect(saved.open()).resolves.toBeNull();
    failing.load = false;
    saved.write({ draft: { water: "unsure" }, step: 1, activeJob: null }, "now");
    await saved.flush();
    await expect(saved.finish(plan)).resolves.toEqual({ kept: "new", written: false });
    expect(plans.saves).toEqual([]);
    expect(plans.latest()).toEqual(state({ draft: inputFixture, step: 3, activeJob: capability }));
    expect(problemOf(saved)).toBe(words.unavailable);
  });

  it("[B2] writes go ahead once storage turns out to hold no answers and no running job", async () => {
    const plans = memoryPlans(state({ snapshot: plan }));
    const failing = { load: true, save: false };
    const saved = door(flaky(plans, failing));
    await expect(saved.open()).resolves.toBeNull();
    failing.load = false;
    saved.write({ draft: { water: "unsure" }, step: 3 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual(state({ draft: { water: "unsure" }, step: 3, snapshot: plan }));
    expect(problemOf(saved)).toBeNull();
  });

  it("the newest open decides: a failed open followed by one that read the state allows writes", async () => {
    const plans = memoryPlans(state({ draft: { water: "rain_only" }, step: 3 }));
    const failing = { load: true, save: false };
    const saved = door(flaky(plans, failing));
    await saved.open();
    failing.load = false;
    await saved.open();
    saved.write({ draft: { water: "unsure" }, step: 3 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual(state({ draft: { water: "unsure" }, step: 3 }));
  });
});

describe("write: read-modify-write over F1's fields", () => {
  it("[C2] a draft patch is saved with F3's snapshot passed through untouched", async () => {
    const plans = memoryPlans(state({ snapshot: plan, step: 4 }));
    const saved = door(plans);
    saved.write({ draft: { water: "unsure" }, step: 3 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual({ draft: { water: "unsure" }, step: 3, activeJob: null, snapshot: plan });
    expect(plans.latest()?.snapshot).toBe(plan);
  });

  it("a snapshot F3 cleared between two F1 writes stays cleared (F1 never writes a stale snapshot)", async () => {
    const plans = memoryPlans(state({ snapshot: plan }));
    const saved = door(plans);
    saved.write({ step: 2 }, "now");
    await saved.flush();
    plans.external(state({ step: 2, snapshot: null }));
    saved.write({ step: 3 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual(state({ step: 3 }));
  });

  it("[B2][B3] no blind writes: when the load before a write rejects, save is not called, the storage line says why, and the patch is written on the next successful write", async () => {
    const plans = memoryPlans(state({ snapshot: plan }));
    const failing = { load: true, save: false };
    const saved = door(flaky(plans, failing));
    saved.write({ draft: { water: "rain_only" } }, "now");
    await saved.flush();
    expect(plans.saves).toEqual([]);
    expect(problemOf(saved)).toBe(words.unavailable);

    failing.load = false;
    saved.write({ step: 3 }, "now");
    await saved.flush();
    expect(plans.saves).toEqual([state({ draft: { water: "rain_only" }, step: 3, snapshot: plan })]);
    expect(problemOf(saved)).toBeNull();
  });

  it("[B3] a rejected save puts F4's words on the storage line and keeps the patch for the next write", async () => {
    const plans = memoryPlans(null);
    const failing = { load: false, save: true };
    const saved = door(flaky(plans, failing));
    saved.write({ draft: { water: "unsure" } }, "now");
    await saved.flush();
    expect(plans.latest()).toBeNull();
    expect(problemOf(saved)).toBe(words.unavailable);

    failing.save = false;
    saved.write({ step: 2 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual(state({ draft: { water: "unsure" }, step: 2 }));
  });

  it("\"soon\" writes coalesce: ten draft patches inside the debounce make one save with the newest draft", async () => {
    vi.useFakeTimers();
    const plans = memoryPlans(null);
    const saved = door(plans, 150);
    for (let n = 1; n <= 10; n++) {
      saved.write({ draft: { planningStart: parseIsoDate(`2026-07-${String(n).padStart(2, "0")}`) } }, "soon");
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(plans.saves).toEqual([]);
    await vi.advanceTimersByTimeAsync(150);
    expect(plans.saves).toEqual([state({ draft: { planningStart: parseIsoDate("2026-07-10") } })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("\"now\" writes at once, and never runs two saves at the same time", async () => {
    const plans = memoryPlans(null);
    const releases: (() => void)[] = [];
    let running = 0;
    let most = 0;
    const slow: StoragePort = {
      load: () => plans.load(),
      save: next => {
        running += 1;
        most = Math.max(most, running);
        return new Promise<void>(resolve => releases.push(() => {
          running -= 1;
          void plans.save(next).then(resolve);
        }));
      },
      clear: () => plans.clear(),
      readNotice: () => plans.readNotice(),
    };
    const saved = door(slow);
    saved.write({ step: 2 }, "now");
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    saved.write({ step: 3 }, "now");
    saved.write({ step: 4, activeJob: capability }, "now");
    await Promise.resolve();
    expect(releases).toHaveLength(1);
    releases[0]();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[1]();
    await saved.flush();
    expect(most).toBe(1);
    expect(plans.saves.map(next => next.step)).toEqual([2, 4]);
    expect(plans.latest()).toEqual(state({ step: 4, activeJob: capability }));
  });

  it("flush writes what is queued; a second flush with nothing queued saves nothing", async () => {
    vi.useFakeTimers();
    const plans = memoryPlans(null);
    const load = vi.spyOn(plans, "load");
    const saved = door(plans, 150);
    saved.write({ draft: inputFixture }, "soon");
    await saved.flush();
    expect(plans.saves).toHaveLength(1);
    await saved.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(plans.saves).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("finish", () => {
  it("[K4] clears activeJob, sets step 4 and stores the snapshot in ONE save", async () => {
    const plans = memoryPlans(state({ draft: inputFixture, step: 4, activeJob: capability }));
    const saved = door(plans);
    await expect(saved.finish(plan)).resolves.toEqual({ kept: "new", written: true });
    expect(plans.saves).toEqual([state({ draft: inputFixture, step: 4, activeJob: null, snapshot: plan })]);
  });

  it("a queued draft rides in the same save as the finished job", async () => {
    vi.useFakeTimers();
    const plans = memoryPlans(state({ activeJob: capability, step: 4 }));
    const saved = door(plans, 150);
    saved.write({ draft: { water: "unsure" } }, "soon");
    await saved.finish(plan);
    expect(plans.saves).toEqual([state({ draft: { water: "unsure" }, step: 4, snapshot: plan })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[B6] keepSnapshot keeps an earlier non-error plan when a service_error arrives, and replaces it otherwise", async () => {
    expect(keepSnapshot(plan, serviceError)).toBe(plan);
    expect(keepSnapshot(serviceError, plan)).toBe(plan);
    expect(keepSnapshot(plan, completedSnapshotsByState.no_calendar_fit)).toBe(completedSnapshotsByState.no_calendar_fit);
    const older = { ...serviceError, id: "older-error" };
    expect(keepSnapshot(older, serviceError)).toBe(serviceError);

    const plans = memoryPlans(state({ activeJob: capability, snapshot: plan }));
    const saved = door(plans);
    await expect(saved.finish(serviceError)).resolves.toEqual({ kept: "earlier", written: true });
    expect(plans.latest()).toEqual(state({ step: 4, snapshot: plan }));
  });

  it("[B6] a service_error with no earlier plan is stored", async () => {
    const plans = memoryPlans(state({ activeJob: capability }));
    await expect(door(plans).finish(serviceError)).resolves.toEqual({ kept: "new", written: true });
    expect(plans.latest()?.snapshot).toBe(serviceError);
  });

  it("written is false when the load or the save fails, so the controller keeps the job on the server", async () => {
    for (const mode of ["loadThrows", "saveThrows", "throws"] as const) {
      const plans = memoryPlans(state({ activeJob: capability }), mode);
      const saved = door(plans);
      await expect(saved.finish(plan)).resolves.toMatchObject({ written: false });
      expect(plans.saves).toEqual([]);
      expect(problemOf(saved)).toBe(words.unavailable);
    }
  });

  it("a finished job whose save failed is still written by the next successful flush", async () => {
    const plans = memoryPlans(state({ activeJob: capability }));
    const failing = { load: false, save: true };
    const saved = door(flaky(plans, failing));
    await expect(saved.finish(plan)).resolves.toEqual({ kept: "new", written: false });
    failing.save = false;
    await saved.flush();
    expect(plans.latest()).toEqual(state({ step: 4, snapshot: plan }));
  });
});

describe("[F4-D1] storage words", () => {
  it("each failure shows F4's words for its reason: a blocked load, a newer Gilir's data, a full device on save", async () => {
    const blocked = door(memoryPlans(null, "throws"));
    await blocked.open();
    expect(problemOf(blocked)).toBe(words.unavailable);

    const newer = door(memoryPlans(null, "newer"));
    await newer.open();
    expect(problemOf(newer)).toBe(words.newer);

    const plans = memoryPlans(state({ draft: { water: "unsure" } }), "full");
    const full = door(plans);
    await full.open();
    expect(problemOf(full)).toBeNull();
    full.write({ step: 3 }, "now");
    await full.flush();
    expect(problemOf(full)).toBe(words.full);
    expect(plans.latest()).toEqual(state({ draft: { water: "unsure" } }));
  });

  it("a load before a write that fails after a good open shows that load's own reason", async () => {
    const plans = memoryPlans(state({ draft: { water: "unsure" } }));
    let newer = false;
    const saved = door({ ...plans, load: () => (newer ? Promise.reject(new DOMException("", "VersionError")) : plans.load()) });
    await saved.open();
    newer = true;
    saved.write({ step: 2 }, "now");
    await saved.flush();
    expect(problemOf(saved)).toBe(words.newer);
    expect(plans.saves).toEqual([]);
  });

  it("a write skipped because the open could not read storage repeats the open's reason, and writes nothing", async () => {
    const stored = state({ draft: { water: "unsure" }, step: 3 });
    const plans = memoryPlans(stored);
    let failing = true;
    const saved = door({ ...plans, load: () => (failing ? Promise.reject(new DOMException("", "VersionError")) : plans.load()) });
    await expect(saved.open()).resolves.toBeNull();
    expect(problemOf(saved)).toBe(words.newer);
    failing = false;
    saved.write({ step: 2 }, "now");
    await saved.flush();
    expect(problemOf(saved)).toBe(words.newer);
    expect(plans.latest()).toBe(stored);
  });

  it("the line shows the latest failure's reason, and a save that goes through clears it; a load alone does not", async () => {
    const plans = memoryPlans(null);
    let refusing: "unavailable" | "full" | null = "unavailable";
    const saved = door({
      ...plans,
      load: () => (refusing === "unavailable" ? Promise.reject(new Error("Storage is not available.")) : plans.load()),
      save: next => (refusing === "full" ? Promise.reject(new DOMException("", "QuotaExceededError")) : plans.save(next)),
    });
    await saved.open();
    expect(problemOf(saved)).toBe(words.unavailable);
    refusing = "full";
    saved.write({ step: 2 }, "now");
    await saved.flush();
    expect(problemOf(saved)).toBe(words.full);
    await saved.open();
    expect(problemOf(saved)).toBe(words.full);
    refusing = null;
    saved.write({ step: 3 }, "now");
    await saved.flush();
    expect(problemOf(saved)).toBeNull();
  });

  it("Got it quiets the reason it showed for the visit, and a later failure for another reason shows again", () => {
    const line = createStorageLine();
    const full = { reason: "full", text: words.full } as const;
    const newer = { reason: "newer", text: words.newer } as const;
    line.failed(full);
    line.dismiss();
    expect(line.current().problem).toBeNull();
    line.failed(full);
    expect(line.current().problem).toBeNull();
    line.failed(newer);
    expect(line.current().problem).toEqual(newer);
  });

  it("the set-aside notice is read through the port once per line, and Got it dismisses it through F4", async () => {
    const plans = memoryPlans(state({ draft: { water: "unsure" } }), "ok", "Some answers were left out.");
    const line = createStorageLine();
    await createSavedPlans(plans, line).open();
    await createSavedPlans(plans, line).open();
    expect(plans.noticeReads).toBe(1);
    expect(line.current().setAside?.text).toBe("Some answers were left out.");
    line.dismiss();
    expect(line.current().setAside).toBeNull();
    await vi.waitFor(() => expect(plans.setAside).toBeNull());
  });

  it("an open resolves only after the set-aside notice is read, so the page it opens paints with its line", async () => {
    const plans = memoryPlans(state({ draft: { water: "unsure" } }), "ok", "Some answers were left out.");
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const line = createStorageLine();
    const saved = createSavedPlans({ ...plans, readNotice: () => held.then(() => plans.readNotice()) }, line);
    let opened = false;
    const open = saved.open().then(() => {
      opened = true;
    });
    await vi.waitFor(() => expect(plans.saves).toEqual([]));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(opened).toBe(false);
    release();
    await open;
    expect(line.current().setAside?.text).toBe("Some answers were left out.");
  });
});
