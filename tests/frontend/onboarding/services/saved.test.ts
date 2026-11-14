// Node environment. The one door to localPlans, driven through a fake LocalPlans port, so no module mock is needed.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPlans, LocalState } from "@/client/storage";
import { parseIsoDate } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, completedSnapshotsByState } from "@/fixtures/results";
import { createSavedPlans, keepSnapshot } from "@/features/onboarding/services/saved";
import type { StorageHealth } from "@/features/onboarding/services/saved";
import { capability, memoryPlans } from "../support/harness";
import type { MemoryPlans } from "../support/harness";

afterEach(() => {
  vi.useRealTimers();
});

const plan = completedSnapshotFixture;
const serviceError = completedSnapshotsByState.service_error;
const state = (extra: Partial<LocalState>): LocalState => ({ draft: null, step: 1, activeJob: null, snapshot: null, ...extra });

function healthOf(saved: ReturnType<typeof createSavedPlans>): StorageHealth[] {
  const seen: StorageHealth[] = [];
  saved.onHealth(health => seen.push(health));
  return seen;
}

/** A port whose next calls fail while `failing` says so, over a working memory store. */
function flaky(plans: MemoryPlans, failing: { load: boolean; save: boolean }): LocalPlans {
  const refuse = () => Promise.reject(new Error("Storage is not available."));
  return {
    load: () => (failing.load ? refuse() : plans.load()),
    save: next => (failing.save ? refuse() : plans.save(next)),
    clear: () => plans.clear(),
  };
}

describe("open", () => {
  it("[B2] a rejected load opens as nothing saved (null) and turns health failing", async () => {
    const saved = createSavedPlans(memoryPlans(state({ snapshot: plan }), "loadThrows"));
    const health = healthOf(saved);
    await expect(saved.open()).resolves.toBeNull();
    expect(health).toEqual(["failing"]);
  });

  it("a load that resolves null is nothing saved, with health working", async () => {
    const saved = createSavedPlans(memoryPlans(null));
    const health = healthOf(saved);
    await expect(saved.open()).resolves.toBeNull();
    expect(health).toEqual(["working"]);
  });
});

describe("write: read-modify-write over F1's fields", () => {
  it("[C2] a draft patch is saved with F3's snapshot passed through untouched", async () => {
    const plans = memoryPlans(state({ snapshot: plan, step: 4 }));
    const saved = createSavedPlans(plans);
    saved.write({ draft: { water: "unsure" }, step: 3 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual({ draft: { water: "unsure" }, step: 3, activeJob: null, snapshot: plan });
    expect(plans.latest()?.snapshot).toBe(plan);
  });

  it("a snapshot F3 cleared between two F1 writes stays cleared (F1 never writes a stale snapshot)", async () => {
    const plans = memoryPlans(state({ snapshot: plan }));
    const saved = createSavedPlans(plans);
    saved.write({ step: 2 }, "now");
    await saved.flush();
    plans.external(state({ step: 2, snapshot: null }));
    saved.write({ step: 3 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual(state({ step: 3 }));
  });

  it("[B2][B3] no blind writes: when the load before a write rejects, save is not called, health turns failing, and the patch is written on the next successful write", async () => {
    const plans = memoryPlans(state({ snapshot: plan }));
    const failing = { load: true, save: false };
    const saved = createSavedPlans(flaky(plans, failing));
    const health = healthOf(saved);
    saved.write({ draft: { water: "rain_only" } }, "now");
    await saved.flush();
    expect(plans.saves).toEqual([]);
    expect(new Set(health)).toEqual(new Set(["failing"]));

    failing.load = false;
    saved.write({ step: 3 }, "now");
    await saved.flush();
    expect(plans.saves).toEqual([state({ draft: { water: "rain_only" }, step: 3, snapshot: plan })]);
    expect(health.at(-1)).toBe("working");
  });

  it("[B3] a rejected save turns health failing and keeps the patch for the next write", async () => {
    const plans = memoryPlans(null);
    const failing = { load: false, save: true };
    const saved = createSavedPlans(flaky(plans, failing));
    const health = healthOf(saved);
    saved.write({ draft: { water: "unsure" } }, "now");
    await saved.flush();
    expect(plans.latest()).toBeNull();
    expect(new Set(health)).toEqual(new Set(["failing"]));

    failing.save = false;
    saved.write({ step: 2 }, "now");
    await saved.flush();
    expect(plans.latest()).toEqual(state({ draft: { water: "unsure" }, step: 2 }));
  });

  it("\"soon\" writes coalesce: ten draft patches inside the debounce make one save with the newest draft", async () => {
    vi.useFakeTimers();
    const plans = memoryPlans(null);
    const saved = createSavedPlans(plans, 150);
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
    const slow: LocalPlans = {
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
    };
    const saved = createSavedPlans(slow);
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
    const saved = createSavedPlans(plans, 150);
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
    const saved = createSavedPlans(plans);
    await expect(saved.finish(plan)).resolves.toEqual({ kept: "new", written: true });
    expect(plans.saves).toEqual([state({ draft: inputFixture, step: 4, activeJob: null, snapshot: plan })]);
  });

  it("a queued draft rides in the same save as the finished job", async () => {
    vi.useFakeTimers();
    const plans = memoryPlans(state({ activeJob: capability, step: 4 }));
    const saved = createSavedPlans(plans, 150);
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
    const saved = createSavedPlans(plans);
    await expect(saved.finish(serviceError)).resolves.toEqual({ kept: "earlier", written: true });
    expect(plans.latest()).toEqual(state({ step: 4, snapshot: plan }));
  });

  it("[B6] a service_error with no earlier plan is stored", async () => {
    const plans = memoryPlans(state({ activeJob: capability }));
    await expect(createSavedPlans(plans).finish(serviceError)).resolves.toEqual({ kept: "new", written: true });
    expect(plans.latest()?.snapshot).toBe(serviceError);
  });

  it("written is false when the load or the save fails, so the controller keeps the job on the server", async () => {
    for (const mode of ["loadThrows", "saveThrows", "throws"] as const) {
      const plans = memoryPlans(state({ activeJob: capability }), mode);
      const saved = createSavedPlans(plans);
      const health = healthOf(saved);
      await expect(saved.finish(plan)).resolves.toMatchObject({ written: false });
      expect(plans.saves).toEqual([]);
      expect(health).toEqual(["failing"]);
    }
  });

  it("a finished job whose save failed is still written by the next successful flush", async () => {
    const plans = memoryPlans(state({ activeJob: capability }));
    const failing = { load: false, save: true };
    const saved = createSavedPlans(flaky(plans, failing));
    await expect(saved.finish(plan)).resolves.toEqual({ kept: "new", written: false });
    failing.save = false;
    await saved.flush();
    expect(plans.latest()).toEqual(state({ step: 4, snapshot: plan }));
  });
});
