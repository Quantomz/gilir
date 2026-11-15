import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { LocalState } from "@/client/storage";
import { completedSnapshotSchema } from "@/contracts/result";
import type { CompletedSnapshot } from "@/contracts/result";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotsByState, completedSnapshotV2Fixture } from "@/fixtures/results";
import { syntheticLabel } from "@/fixtures/science";
import { openHarness, sandboxedHarness, test, withUserDataFolder } from "./support/harness";

const words = {
  unavailable: "This browser isn’t letting Gilir open or save your answers on this device.",
  full: "This device has no room left to save Gilir.",
  newer: "Gilir has a newer version. Close this page and open Gilir again to see what you saved.",
  oldPlanAnswersKept: "Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it. Your answers are kept.",
};

const plan = completedSnapshotsByState.plan;
const job = { jobId: "00000000-0000-4000-8000-000000000001", token: "synthetic-capability" };
const partialDraft = { field: inputFixture.field, cropPurposeIds: inputFixture.cropPurposeIds };
const saved: LocalState = { draft: partialDraft, step: 3, activeJob: job, snapshot: plan };
const other: LocalState = { draft: null, step: 4, activeJob: null, snapshot: completedSnapshotsByState.plan_with_warnings };

const recordWithRetiredPriority = {
  format: "gilir.local-state",
  version: 1,
  state: { draft: partialDraft, step: 2, activeJob: null, snapshot: { ...plan, input: { ...plan.input, priority: "reliability" } } },
};

const load = (page: Page) => page.evaluate(() => window.gilirF4.localPlans.load());
const save = (page: Page, state: LocalState) => page.evaluate(next => window.gilirF4.localPlans.save(next), state);
const notice = (page: Page) => page.evaluate(async () => (await window.gilirF4.readStorageNotice())?.text ?? null);

function problemOf(page: Page, call: "load" | "save" | "clear", state: LocalState | null = null) {
  return page.evaluate(async ({ call, state }) => {
    const { localPlans, storageProblem } = window.gilirF4;
    try {
      await (call === "save" && state !== null ? localPlans.save(state) : call === "clear" ? localPlans.clear() : localPlans.load());
      return "resolved";
    } catch (error) {
      return storageProblem(error);
    }
  }, { call, state });
}

test.describe("a saved result stays readable", () => {
  test("restart: save draft, step, activeJob and the plan snapshot; close the browser; launch again on the same folder; load deep-equals, with id, completedAt and provenance unchanged", async ({ harness }) => {
    await withUserDataFolder(async launch => {
      const first = await launch();
      await save(await openHarness(await first.newPage(), `${harness.origin}/`), saved);
      await first.close();

      const second = await launch();
      const loaded = await load(await openHarness(await second.newPage(), `${harness.origin}/`));
      expect(loaded).toEqual(saved);
      expect(loaded?.snapshot?.id).toBe("synthetic-plan");
      expect(loaded?.snapshot?.completedAt).toBe("2026-07-01T00:00:00Z");
      expect(loaded?.snapshot?.result.details.provenance).toEqual(plan.result.details.provenance);
    });
  });

  for (const snapshot of [plan, completedSnapshotV2Fixture]) {
    test(`raw snapshot version ${snapshot.schemaVersion} restores after reload without changing stored data`, async ({ page, harness }) => {
      await openHarness(page, `${harness.origin}/`);
      const state = { ...saved, draft: inputFixture, snapshot };
      const record = { format: "gilir.local-state", version: 1, state };
      await page.evaluate(record => window.gilirF4.raw.write("gilir", 1, { state: record }), record);
      const before = await page.evaluate(() => window.gilirF4.raw.read("gilir"));
      await page.reload();
      await page.waitForFunction(() => window.gilirF4 !== undefined);
      expect(await load(page)).toEqual(state);
      expect(await notice(page)).toBeNull();
      expect(await page.evaluate(() => window.gilirF4.raw.read("gilir"))).toEqual(before);
      expect((await load(page))?.snapshot?.schemaVersion).toBe(snapshot.schemaVersion);
    });
  }

  for (const expiry of ["answers 404 not_found", "fails"] as const) {
    test(`server expiry: with every /api request that ${expiry}, a reload still loads the snapshot, and load sent nothing to /api`, async ({ page, context, harness }) => {
      const api: string[] = [];
      await context.route("**/api/**", route => {
        api.push(route.request().url());
        return expiry === "fails" ? route.abort("failed")
          : route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Synthetic: this job is gone.", retryable: false } } });
      });
      await save(await openHarness(page, `${harness.origin}/`), saved);

      const asked = await page.evaluate(({ jobId, token }) =>
        fetch(`/api/plans/${jobId}`, { headers: { Authorization: `Bearer ${token}` } }).then(response => response.status, () => "failed"), job);
      expect(asked).toBe(expiry === "fails" ? "failed" : 404);

      await page.reload();
      await page.waitForFunction(() => window.gilirF4 !== undefined);
      expect(await load(page)).toEqual(saved);
      expect(api).toEqual([`${harness.origin}/api/plans/${job.jobId}`]);
    });
  }

  test("load, save and clear send no request at all (context.on('request') sees none, and does see the page's own fetch)", async ({ page, context, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    const requests: string[] = [];
    context.on("request", request => requests.push(request.url()));
    await page.evaluate(async state => {
      const { localPlans, readStorageNotice } = window.gilirF4;
      await localPlans.load();
      await localPlans.save(state);
      await localPlans.load();
      await readStorageNotice();
      await localPlans.clear();
      await localPlans.load();
    }, saved);
    expect(requests).toEqual([]);

    await page.evaluate(() => fetch("/index.html").then(response => response.status));
    expect(requests).toEqual([`${harness.origin}/index.html`]);
  });
});

test.describe("useful messages, no silent loss", () => {
  test("full: with a 256 KB quota (CDP Storage.overrideQuotaForOrigin) and incompressible data, save rejects full with its words, the earlier state still loads, and a save that fits still works", async ({ page, context, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Storage.overrideQuotaForOrigin", { origin: harness.origin, quotaSize: 256 * 1024 });
    await save(page, saved);

    const tooBig = await page.evaluate(snapshot => {
      const bytes = crypto.getRandomValues(new Uint8Array(240));
      const assumptions = Array.from({ length: 2_000 }, () => {
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => String.fromCharCode(33 + (byte % 90))).join("");
      });
      return { draft: null, step: 4, activeJob: null, snapshot: { ...snapshot, result: { ...snapshot.result, details: { ...snapshot.result.details, assumptions } } } };
    }, completedSnapshotsByState.plan_with_warnings);
    expect(await problemOf(page, "save", tooBig)).toEqual({ reason: "full", text: words.full });
    expect(await load(page)).toEqual(saved);

    await save(page, other);
    expect(await load(page)).toEqual(other);
  });

  test("full: a load that must set an unreadable plan aside on a device filled to its quota returns the readable answers, writes nothing, the notice names the plan, and clear still works", async ({ page, context, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Storage.overrideQuotaForOrigin", { origin: harness.origin, quotaSize: 512 * 1024 });
    const record = await page.evaluate(source => {
      const bytes = crypto.getRandomValues(new Uint8Array(240));
      const assumptions = Array.from({ length: 500 }, () => {
        crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => String.fromCharCode(33 + (byte % 90))).join("");
      });
      const snapshot = source.state.snapshot;
      return { ...source, state: { ...source.state, snapshot: { ...snapshot, result: { ...snapshot.result, details: { ...snapshot.result.details, assumptions } } } } };
    }, recordWithRetiredPriority);
    await page.evaluate(record => window.gilirF4.raw.write("gilir", 1, { state: record }), record);

    const fillerStopped = await page.evaluate(async () => {
      let key = 0;
      for (const size of [32_768, 8_192, 2_048, 512]) {
        for (;;) {
          const bytes = crypto.getRandomValues(new Uint8Array(size));
          try {
            await window.gilirF4.raw.write("filler", 1, { [`k${key++}`]: Array.from(bytes, byte => String.fromCharCode(33 + (byte % 90))).join("") });
          } catch (error) {
            if (size === 512) return (error as Error).name;
            break;
          }
        }
      }
      return "never full";
    });
    expect(fillerStopped).toBe("QuotaExceededError");

    const outcome = await page.evaluate(async () => {
      const { localPlans, readStorageNotice, storageProblem } = window.gilirF4;
      const loaded = await localPlans.load().catch((error: unknown) => storageProblem(error).reason);
      const stored = await window.gilirF4.raw.read("gilir");
      const notice = (await readStorageNotice())?.text ?? null;
      const cleared = await localPlans.clear().then(() => "resolved", (error: unknown) => storageProblem(error).reason);
      return { loaded, stored: stored?.records ?? null, notice, cleared, afterClear: (await window.gilirF4.raw.read("gilir"))?.records ?? null };
    });
    expect(outcome.loaded).toEqual({ draft: partialDraft, step: 2, activeJob: null, snapshot: null });
    expect(outcome.stored).toEqual({ state: record });
    expect(outcome.notice).toBe(words.oldPlanAnswersKept);
    expect(outcome.cleared).toBe("resolved");
    expect(outcome.afterClear).toEqual({});
  });

  test("an old record: a version 1 record with a retired snapshot shape, written with raw indexedDB, loads the draft; the notice names the plan; the raw value sits in set-aside", async ({ page, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    await page.evaluate(record => window.gilirF4.raw.write("gilir", 1, { state: record }), recordWithRetiredPriority);

    expect(await load(page)).toEqual({ draft: partialDraft, step: 2, activeJob: null, snapshot: null });
    expect(await notice(page)).toBe(words.oldPlanAnswersKept);
    const stored = await page.evaluate(() => window.gilirF4.raw.read("gilir"));
    const finds = (stored?.records["set-aside"] as { finds: { raw: unknown }[] } | undefined)?.finds ?? [];
    expect(finds.map(find => find.raw)).toEqual([recordWithRetiredPriority]);
  });

  test("the notice and a load called in the same tick, notice first or load first: the notice names the plan that load set aside, and after a dismiss it doesn't come back", async ({ page, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    for (const noticeFirst of [true, false]) {
      await page.evaluate(() => window.gilirF4.localPlans.clear());
      await page.evaluate(record => window.gilirF4.raw.write("gilir", 1, { state: record }), recordWithRetiredPriority);
      const outcome = await page.evaluate(async noticeFirst => {
        const { localPlans, readStorageNotice } = window.gilirF4;
        const notice = noticeFirst ? readStorageNotice() : null;
        const loaded = localPlans.load();
        const shown = await (notice ?? readStorageNotice());
        const snapshot = (await loaded)?.snapshot ?? null;
        await shown?.dismiss();
        return { text: shown?.text ?? null, snapshot, afterDismiss: (await readStorageNotice())?.text ?? null };
      }, noticeFirst);
      expect(outcome, noticeFirst ? "notice first" : "load first").toEqual({ text: words.oldPlanAnswersKept, snapshot: null, afterDismiss: null });
    }
  });

  test("the notice survives a restart until dismissed, and after dismiss and a restart it does not return", async ({ harness }) => {
    await withUserDataFolder(async launch => {
      const first = await launch();
      const page = await openHarness(await first.newPage(), `${harness.origin}/`);
      await page.evaluate(record => window.gilirF4.raw.write("gilir", 1, { state: record }), recordWithRetiredPriority);
      await load(page);
      await first.close();

      const second = await launch();
      const again = await openHarness(await second.newPage(), `${harness.origin}/`);
      expect(await notice(again)).toBe(words.oldPlanAnswersKept);
      await again.evaluate(async () => (await window.gilirF4.readStorageNotice())?.dismiss());
      expect(await notice(again)).toBeNull();
      await second.close();

      const third = await launch();
      const last = await openHarness(await third.newPage(), `${harness.origin}/`);
      expect(await notice(last)).toBeNull();
      expect(await load(last)).toEqual({ draft: partialDraft, step: 2, activeJob: null, snapshot: null });
    });
  });

  test("denied: in the sandboxed frame (opaque origin) load, save and clear reject and storageProblem reads unavailable with its words; the notice is null", async ({ page, harness }) => {
    const frame = await sandboxedHarness(page, harness.origin);
    const outcomes = await frame.evaluate(async state => {
      const { localPlans, readStorageNotice, storageProblem } = window.gilirF4;
      const problem = (call: Promise<unknown>) => call.then(() => "resolved", storageProblem);
      return {
        load: await problem(localPlans.load()),
        save: await problem(localPlans.save(state)),
        clear: await problem(localPlans.clear()),
        notice: await readStorageNotice(),
      };
    }, saved);
    const denied = { reason: "unavailable", text: words.unavailable };
    expect(outcomes).toEqual({ load: denied, save: denied, clear: denied, notice: null });
  });

  test("site data cleared (CDP Storage.clearDataForOrigin) while the page is open: the next load resolves null, not a rejection, and saving works again", async ({ page, context, harness }) => {
    await save(await openHarness(page, `${harness.origin}/`), saved);
    expect(await load(page)).toEqual(saved);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Storage.clearDataForOrigin", { origin: harness.origin, storageTypes: "all" });

    expect(await problemOf(page, "load")).toBe("resolved");
    expect(await load(page)).toBeNull();
    await save(page, other);
    expect(await load(page)).toEqual(other);
  });
});

test.describe("newer data and other tabs", () => {
  test("a database left at version 2 by raw indexedDB: load, save and clear reject newer and the database is untouched", async ({ page, harness }) => {
    await openHarness(page, `${harness.origin}/`);
    const newerRecord = { format: "gilir.local-state", version: 2, state: { written: "by a newer build" } };
    await page.evaluate(record => window.gilirF4.raw.write("gilir", 2, { state: record }), newerRecord);

    const newer = { reason: "newer", text: words.newer };
    expect(await problemOf(page, "load")).toEqual(newer);
    expect(await problemOf(page, "save", saved)).toEqual(newer);
    expect(await problemOf(page, "clear")).toEqual(newer);
    expect(await page.evaluate(() => window.gilirF4.raw.read("gilir"))).toEqual({ version: 2, records: { state: newerRecord } });
  });

  for (const [name, parts] of [
    ["draft version 2", { draft: { ...inputFixture, schemaVersion: 2 }, snapshot: completedSnapshotV2Fixture }],
    ["snapshot version 3", { draft: inputFixture, snapshot: { ...completedSnapshotV2Fixture, schemaVersion: 3 } }],
  ] as const) {
    test(`${name} independently refuses load, save, clear and pending notice dismissal without mutation`, async ({ page, harness }) => {
      await openHarness(page, `${harness.origin}/`);
      const setAside = { format: "gilir.set-aside", version: 1, finds: [{ parts: ["activeJob"], answersKept: true, raw: "previous unreadable job" }] };
      await page.evaluate(({ state, setAside }) => window.gilirF4.raw.write("gilir", 1, { state, "set-aside": setAside }), {
        state: { format: "gilir.local-state", version: 1, state: saved }, setAside,
      });
      const newer = { format: "gilir.local-state", version: 1, state: { ...saved, ...parts } };
      const outcomes = await page.evaluate(async ({ newer, saved }) => {
        const { localPlans, readStorageNotice, storageProblem, raw } = window.gilirF4;
        const pendingNotice = await readStorageNotice();
        if (pendingNotice === null) throw new Error("Expected pending notice.");
        await raw.write("gilir", 1, { state: newer });
        const before = await raw.read("gilir");
        const rejected = [];
        for (const call of [() => localPlans.load(), () => localPlans.save(saved), () => localPlans.clear()]) {
          try { await call(); rejected.push("resolved"); }
          catch (error) { rejected.push(storageProblem(error).reason); }
        }
        await pendingNotice.dismiss();
        return { rejected, before, after: await raw.read("gilir"), notice: await readStorageNotice() };
      }, { newer, saved });
      expect(outcomes.rejected).toEqual(["newer", "newer", "newer"]);
      expect(outcomes.notice).toBeNull();
      expect(outcomes.after).toEqual(outcomes.before);
      expect(outcomes.after).toEqual({ version: 1, records: { state: newer, "set-aside": setAside } });
    });
  }

  test("a second page upgrading to version 2: the first page's connection closes on blocking, the upgrade resolves at once, and the first page's next load rejects newer", async ({ page, context, harness }) => {
    await save(await openHarness(page, `${harness.origin}/`), saved);
    const newerTab = await openHarness(await context.newPage(), `${harness.origin}/`);

    const upgrade = await newerTab.evaluate(() => window.gilirF4.raw.upgrade("gilir", 2));
    expect(upgrade.blocked).toBe(false);
    expect(upgrade.ms).toBeLessThan(4_000);
    expect(await problemOf(page, "load")).toEqual({ reason: "newer", text: words.newer });
  });

  test("a second tab holding the database does not stall a save beyond the 5 s limit, and the stopped save changed nothing", async ({ page, context, harness }) => {
    await save(await openHarness(page, `${harness.origin}/`), saved);
    const busyTab = await openHarness(await context.newPage(), `${harness.origin}/`);
    await busyTab.evaluate(() => window.gilirF4.raw.hold("gilir", 9_000));

    const started = Date.now();
    expect(await problemOf(page, "save", other)).toEqual({ reason: "unavailable", text: words.unavailable });
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(4_900);
    expect(waited, "stopped by the limit, not by the other tab letting go at 9 s").toBeLessThan(8_500);

    await busyTab.evaluate(() => window.gilirF4.raw.released());
    expect(await load(page)).toEqual(saved);
  });

  test("two pages saving in turn: the last save wins and the record stays readable", async ({ page, context, harness }) => {
    const first = await openHarness(page, `${harness.origin}/`);
    const second = await openHarness(await context.newPage(), `${harness.origin}/`);
    await save(first, saved);
    expect(await load(second)).toEqual(saved);
    await save(second, other);
    expect(await load(first)).toEqual(other);
    await save(first, saved);
    expect(await load(second)).toEqual(saved);
    expect(await notice(second)).toBeNull();
  });
});

test.describe("fixture data stays apart", () => {
  const labState: LocalState = { draft: null, step: 4, activeJob: null, snapshot: completedSnapshotsByState.insufficient_data };

  test("a save at /dev/fixtures/ is invisible at /, and the reverse; indexedDB.databases() lists gilir and gilir-fixture-lab", async ({ page, context, harness }) => {
    const lab = await openHarness(page, `${harness.origin}/dev/fixtures/`);
    const farm = await openHarness(await context.newPage(), `${harness.origin}/`);
    await save(lab, labState);
    expect(await load(farm)).toBeNull();
    await save(farm, saved);
    expect(await load(lab)).toEqual(labState);
    expect(await load(farm)).toEqual(saved);
    expect((await farm.evaluate(() => window.gilirF4.raw.databases())).toSorted()).toEqual(["gilir", "gilir-fixture-lab"]);
  });

  test("clear at /dev/fixtures/ leaves the state saved at /", async ({ page, context, harness }) => {
    const farm = await openHarness(page, `${harness.origin}/`);
    const lab = await openHarness(await context.newPage(), `${harness.origin}/dev/fixtures/`);
    await save(farm, saved);
    await save(lab, labState);
    await lab.evaluate(() => window.gilirF4.localPlans.clear());
    expect(await load(lab)).toBeNull();
    expect(await load(farm)).toEqual(saved);
  });
});

/**
 * Real engine snapshots ran 74 KB to 298 KB, mostly per-season metrics and monthly insights. This one is built to that
 * mix from the synthetic fixture, and stays contract-valid, so load must parse all of it.
 */
function phoneSizedSnapshot(): CompletedSnapshot {
  const source = completedSnapshotsByState.plan_with_warnings;
  const details = source.result.details;
  const [metric] = details.metrics;
  const period = { kind: "available", value: { start: "2001-07-01", endExclusive: "2021-07-01" } } as const;
  const sample = (id: string, value: number) => ({ ...metric, id, label: `Synthetic ${id.replaceAll("_", " ")}`, value: { kind: "available", value } as const });
  const seasons = Array.from({ length: 25 }, (_, season) => ({
    replayStart: `${2001 + season}-07-01`,
    metrics: Array.from({ length: 27 }, (_, index) => sample(`synthetic_season_metric_${index}`, (season * 31 + index) / 997)),
  }));
  const insights = Array.from({ length: 85 }, (_, index) => ({
    metric: sample(`synthetic_insight_${index}`, index / 7), period, month: index < 84 ? (index % 12) + 1 : null,
  }));
  const assumptions = Array.from({ length: 19 }, (_, index) => `${syntheticLabel} Assumption ${index + 1} of 19.`);
  return completedSnapshotSchema.parse({
    ...source,
    id: "synthetic-phone-sized",
    result: { ...source.result, details: { ...details, seasonMetrics: seasons, insights, assumptions } },
  });
}

test.describe("a phone-speed load and write", () => {
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

  test("load of a 300 KB synthetic snapshot under Chromium's 6x CPU throttle settles inside the 5 s limit with the whole snapshot (timings attached)", async ({ page, context, harness }, testInfo) => {
    const big = phoneSizedSnapshot();
    const bytes = JSON.stringify(big).length;
    expect(bytes).toBeGreaterThanOrEqual(300_000);
    expect(bytes).toBeLessThan(330_000);

    const farm = await openHarness(page, `${harness.origin}/`);
    const lab = await openHarness(await context.newPage(), `${harness.origin}/dev/fixtures/`);
    await save(farm, { draft: partialDraft, step: 4, activeJob: null, snapshot: big });
    await save(lab, saved);
    await farm.reload();
    await farm.waitForFunction(() => window.gilirF4 !== undefined);
    for (const tab of [farm, lab]) await (await context.newCDPSession(tab)).send("Emulation.setCPUThrottlingRate", { rate: 6 });

    const timedLoad = (tab: Page) => tab.evaluate(async () => {
      const started = performance.now();
      const state = await window.gilirF4.localPlans.load();
      return { ms: performance.now() - started, id: state?.snapshot?.id ?? null, bytes: JSON.stringify(state?.snapshot ?? null).length };
    });
    const cold = await timedLoad(farm);
    const runs: { big: number; small: number }[] = [];
    for (let run = 0; run < 7; run += 1) {
      const bigRun = await timedLoad(farm);
      const smallRun = await timedLoad(lab);
      expect(bigRun).toMatchObject({ id: "synthetic-phone-sized", bytes });
      expect(smallRun.id).toBe("synthetic-plan");
      runs.push({ big: bigRun.ms, small: smallRun.ms });
    }
    const timings = {
      snapshotBytes: bytes, cpuThrottle: 6, coldFirstLoadMs: cold.ms,
      warmBigMedianMs: median(runs.map(run => run.big)), warmSmallMedianMs: median(runs.map(run => run.small)), runs,
    };
    await testInfo.attach("load-timings.json", { body: JSON.stringify(timings, null, 2), contentType: "application/json" });

    expect(cold).toMatchObject({ id: "synthetic-phone-sized", bytes });
    expect(cold.ms).toBeLessThan(5_000);
    expect(Math.max(...runs.map(run => run.big))).toBeLessThan(5_000);
  });

  test("F1's write of that state, a load and then a save, under the 6x throttle settles inside the 5 s limit and keeps the snapshot (timings attached)", async ({ page, context, harness }, testInfo) => {
    const big = phoneSizedSnapshot();
    const bytes = JSON.stringify(big).length;
    const farm = await openHarness(page, `${harness.origin}/`);
    await save(farm, { draft: partialDraft, step: 4, activeJob: null, snapshot: big });
    await farm.reload();
    await farm.waitForFunction(() => window.gilirF4 !== undefined);
    await (await context.newCDPSession(farm)).send("Emulation.setCPUThrottlingRate", { rate: 6 });

    const runs = await farm.evaluate(async () => {
      const { localPlans } = window.gilirF4;
      await localPlans.load();
      const writes: { load: number; save: number }[] = [];
      for (let run = 0; run < 7; run += 1) {
        const started = performance.now();
        const current = await localPlans.load();
        const loaded = performance.now();
        if (current === null) throw new Error("The saved state did not load.");
        await localPlans.save({ ...current, step: 1 + (run % 4) });
        writes.push({ load: loaded - started, save: performance.now() - loaded });
      }
      return writes;
    });
    const timings = {
      snapshotBytes: bytes, cpuThrottle: 6,
      loadMedianMs: median(runs.map(run => run.load)), saveMedianMs: median(runs.map(run => run.save)),
      writeMedianMs: median(runs.map(run => run.load + run.save)), runs,
    };
    await testInfo.attach("write-timings.json", { body: JSON.stringify(timings, null, 2), contentType: "application/json" });

    const after = await load(farm);
    expect(after?.step).toBe(3);
    expect(JSON.stringify(after?.snapshot).length).toBe(bytes);
    expect(Math.max(...runs.map(run => run.load + run.save))).toBeLessThan(5_000);
  });
});
