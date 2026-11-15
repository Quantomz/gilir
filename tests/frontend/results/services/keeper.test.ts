// @vitest-environment jsdom
// The one door to the F4 ports, over fakes (support/ports.ts) and over the real ports. Nothing rejects. jsdom, because
// the download makes a link. jsdom has no IndexedDB, so the real localPlans rejects as unavailable here, and the real
// exportPdf makes a real file.
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPdf } from "@/client/pdf";
import { localPlans, readStorageNotice, storageProblem } from "@/client/storage";
import type { LocalPlans, LocalState } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";
import { createSavedPlans } from "@/features/onboarding/services/saved";
import { createKeeper, pdfName } from "@/features/results/services/keeper";
import { memoryPlans, pdfPort, savedState } from "../support/ports";
import { everySnapshot, shared } from "../support/variants";

const plan = shared("plan");
const noPlan = shared("insufficient_data");
const error = shared("service_error");
const working: LocalState = {
  draft: plan.input,
  step: 3,
  activeJob: { jobId: "synthetic-job", token: "synthetic-local-fixture-token" },
  snapshot: noPlan,
};

const realZone = process.env.TZ;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (realZone === undefined) delete process.env.TZ;
  else process.env.TZ = realZone;
});

const refused = { ok: false, problem: storageProblem(new Error("refused")) } as const;

function noNotice(): Promise<null> {
  return Promise.resolve(null);
}

function noPdf(): Promise<Blob> {
  return Promise.reject(new Error("exportPdf must not be called here."));
}

/** Records what the browser download is handed. jsdom cannot follow a blob URL, so the click is caught here. */
function watchDownloads() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:gilir-test");
  const revoked = vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  const clicks: { readonly download: string; readonly href: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.href });
  });
  return { created, revoked, clicks };
}

describe("createKeeper", () => {
  it("[R25] read answers ok with the stored state, ok with null for nothing saved, and not ok with storageProblem’s reading when load rejects", async () => {
    const plans = memoryPlans(working);
    await expect(createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).read()).resolves.toEqual({ ok: true, state: working });
    expect(plans.calls).toEqual([{ kind: "load" }]);

    await expect(createKeeper({ plans: memoryPlans(null), exportPdf: noPdf, storageProblem, notice: noNotice }).read()).resolves.toEqual({ ok: true, state: null });

    const failing = memoryPlans(working);
    failing.set("load", "reject");
    await expect(createKeeper({ plans: failing, exportPdf: noPdf, storageProblem, notice: noNotice }).read()).resolves.toEqual(refused);
    expect(failing.calls).toEqual([{ kind: "load" }]);

    failing.set("load", "newer");
    const newer = await createKeeper({ plans: failing, exportPdf: noPdf, storageProblem, notice: noNotice }).read();
    expect(newer).toEqual({ ok: false, problem: { reason: "newer", text: "Gilir has a newer version. Close this page and open Gilir again to see what you saved." } });
  });

  it("[R27] save loads first, then saves the loaded state with only snapshot replaced: draft, step and activeJob pass through unchanged", async () => {
    const plans = memoryPlans(working);
    const answer = await createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan);
    const written: LocalState = { draft: plan.input, step: 3, activeJob: { jobId: "synthetic-job", token: "synthetic-local-fixture-token" }, snapshot: plan };

    expect(plans.calls).toEqual([{ kind: "load" }, { kind: "save", state: written }]);
    const [, saveCall] = plans.calls;
    if (saveCall?.kind !== "save") throw new Error("The second call is not a save.");
    expect(saveCall.state.draft).toBe(working.draft);
    expect(saveCall.state.activeJob).toBe(working.activeJob);
    expect(saveCall.state.snapshot).toBe(plan);
    expect(answer).toEqual({ ok: true, state: written });
    expect(plans.held()).toEqual(written);
  });

  it("[R27] save with nothing stored saves an empty state holding the snapshot", async () => {
    const plans = memoryPlans(null);
    const answer = await createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan);
    const written: LocalState = { draft: null, step: 1, activeJob: null, snapshot: plan };
    expect(plans.calls).toEqual([{ kind: "load" }, { kind: "save", state: written }]);
    expect(answer).toEqual({ ok: true, state: written });
  });

  it("[R27] with nothing stored, the state the keeper writes is the one F1 writes from nothing, holding the snapshot", async () => {
    const byF1 = memoryPlans(null);
    const saved = createSavedPlans(byF1, 0);
    saved.write({}, "now");
    await saved.flush();
    const fromF1 = byF1.held();
    expect(fromF1).not.toBeNull();

    const byF3 = memoryPlans(null);
    await createKeeper({ plans: byF3, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan);
    expect(byF3.held()).toEqual({ ...fromF1, snapshot: plan });
  });

  it("[R27] save makes no save call when the load rejects, and answers not ok", async () => {
    const plans = memoryPlans(working);
    plans.set("load", "reject");
    await expect(createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan)).resolves.toEqual(refused);
    expect(plans.calls).toEqual([{ kind: "load" }]);
    expect(plans.held()).toBe(working);
  });

  it("[R25] save answers not ok when the save rejects, with storageProblem’s reading of the error", async () => {
    const plans = memoryPlans(working);
    plans.set("save", "reject");
    await expect(createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan)).resolves.toEqual(refused);
    expect(plans.calls.map(call => call.kind)).toEqual(["load", "save"]);
    expect(plans.held()).toBe(working);

    plans.set("save", "full");
    const full = await createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan);
    expect(full).toEqual({ ok: false, problem: { reason: "full", text: "This device has no room left to save Gilir." } });

    plans.set("save", "work");
    plans.set("load", "newer");
    const newer = await createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice }).save(plan);
    expect(newer.ok === false && newer.problem.reason).toBe("newer");
    expect(plans.held()).toBe(working);
  });

  it("[R26] clear loads, clears, and answers ok with the state that was there as undo", async () => {
    const plans = memoryPlans(working);
    const answer = await createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: () => plans.notice() }).clear();
    expect(plans.calls).toEqual([{ kind: "load" }, { kind: "clear" }]);
    expect(answer).toEqual({ ok: true, undo: working, setAside: false });
    if (answer.ok) expect(answer.undo).toBe(working);
    expect(plans.held()).toBeNull();
  });

  it("[R26] a clear while F4 holds data set aside says it removed that too, which Undo cannot put back", async () => {
    const plans = memoryPlans(working);
    plans.holdSetAside();
    const keeper = createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: () => plans.notice() });
    await expect(keeper.clear()).resolves.toEqual({ ok: true, undo: working, setAside: true });
    await expect(plans.notice()).resolves.toBeNull();
    await expect(keeper.undo(working)).resolves.toEqual({ ok: true, state: working, restored: true });
    await expect(plans.notice()).resolves.toBeNull();

    const unknown = memoryPlans(working);
    const failingNotice = () => Promise.reject(new Error("The notice could not be read."));
    await expect(createKeeper({ plans: unknown, exportPdf: noPdf, storageProblem, notice: failingNotice }).clear()).resolves.toEqual({ ok: true, undo: working, setAside: false });
  });

  it("[R26] clear makes no clear call when the load rejects, and answers not ok; it answers not ok when the clear rejects", async () => {
    const unreadable = memoryPlans(working);
    unreadable.set("load", "reject");
    await expect(createKeeper({ plans: unreadable, exportPdf: noPdf, storageProblem, notice: noNotice }).clear()).resolves.toEqual(refused);
    expect(unreadable.calls).toEqual([{ kind: "load" }]);
    expect(unreadable.held()).toBe(working);

    const stuck = memoryPlans(working);
    stuck.set("clear", "newer");
    const answer = await createKeeper({ plans: stuck, exportPdf: noPdf, storageProblem, notice: noNotice }).clear();
    expect(answer.ok === false && answer.problem.reason).toBe("newer");
    expect(stuck.calls).toEqual([{ kind: "load" }, { kind: "clear" }]);
    expect(stuck.held()).toBe(working);
  });

  it("[R26] undo puts the previous state back when storage is empty, and keeps a state saved since without writing, saying it put nothing back", async () => {
    const empty = memoryPlans(null);
    await expect(createKeeper({ plans: empty, exportPdf: noPdf, storageProblem, notice: noNotice }).undo(working)).resolves.toEqual({ ok: true, state: working, restored: true });
    expect(empty.calls).toEqual([{ kind: "load" }, { kind: "save", state: working }]);
    expect(empty.held()).toBe(working);

    const newer = savedState(plan);
    const refilled = memoryPlans(newer);
    await expect(createKeeper({ plans: refilled, exportPdf: noPdf, storageProblem, notice: noNotice }).undo(working)).resolves.toEqual({ ok: true, state: newer, restored: false });
    expect(refilled.calls).toEqual([{ kind: "load" }]);
    expect(refilled.held()).toBe(newer);
  });

  it("[R26] undo answers not ok and writes nothing when the load rejects; it answers not ok when the save rejects", async () => {
    const unreadable = memoryPlans(null);
    unreadable.set("load", "reject");
    await expect(createKeeper({ plans: unreadable, exportPdf: noPdf, storageProblem, notice: noNotice }).undo(working)).resolves.toEqual(refused);
    expect(unreadable.calls).toEqual([{ kind: "load" }]);

    const full = memoryPlans(null);
    full.set("save", "reject");
    await expect(createKeeper({ plans: full, exportPdf: noPdf, storageProblem, notice: noNotice }).undo(working)).resolves.toEqual(refused);
    expect(full.calls.map(call => call.kind)).toEqual(["load", "save"]);
    expect(full.held()).toBeNull();
  });

  it("undo twice saves once: the second finds the first one’s state and writes nothing", async () => {
    const plans = memoryPlans(working);
    const keeper = createKeeper({ plans, exportPdf: noPdf, storageProblem, notice: noNotice });
    await keeper.clear();
    const first = await keeper.undo(working);
    const second = await keeper.undo(working);
    expect(first).toEqual({ ok: true, state: working, restored: true });
    expect(second).toEqual({ ok: true, state: working, restored: false });
    expect(plans.calls.filter(call => call.kind === "save")).toEqual([{ kind: "save", state: working }]);
    expect(plans.held()).toBe(working);
  });

  it("[R23] pdf calls exportPdf with the snapshot, hands the Blob to one object URL on a link whose download is pdfName, clicks it and revokes the URL", async () => {
    process.env.TZ = "Asia/Tokyo";
    const { created, revoked, clicks } = watchDownloads();
    const blob = new Blob(["%PDF-1.7\n%%EOF\n"], { type: "application/pdf" });
    const made = vi.fn((_snapshot: CompletedSnapshot) => Promise.resolve(blob));
    const plans = memoryPlans(working);

    await expect(createKeeper({ plans, exportPdf: made, storageProblem, notice: noNotice }).pdf(plan)).resolves.toEqual({ ok: true });
    expect(made).toHaveBeenCalledTimes(1);
    expect(made.mock.calls[0]?.[0]).toBe(plan);
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0]?.[0]).toBe(blob);
    expect(clicks).toEqual([{ download: "gilir-plan-2026-07-01.pdf", href: "blob:gilir-test" }]);

    vi.runAllTimers();
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledWith("blob:gilir-test");
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(plans.calls).toEqual([]);
  });

  it("[R24] pdf answers not ok when exportPdf rejects, and makes no link", async () => {
    const { created, clicks } = watchDownloads();
    const failing = pdfPort();
    failing.set("reject");
    await expect(createKeeper({ plans: memoryPlans(null), exportPdf: failing.exportPdf, storageProblem, notice: noNotice }).pdf(plan)).resolves.toEqual({ ok: false });
    expect(failing.calls).toEqual([plan]);

    expect(created).not.toHaveBeenCalled();
    expect(clicks).toEqual([]);

    created.mockImplementation(() => {
      throw new Error("Blob URLs are blocked.");
    });
    await expect(createKeeper({ plans: memoryPlans(null), exportPdf: pdfPort().exportPdf, storageProblem, notice: noNotice }).pdf(plan)).resolves.toEqual({ ok: false });
    expect(clicks).toEqual([]);
  });

  it("[R23] pdfName is gilir-plan-<local day>.pdf for a plan and gilir-result-<local day>.pdf otherwise, with no field label or coordinates", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(pdfName(plan)).toBe("gilir-plan-2026-06-30.pdf");
    expect(pdfName(shared("plan_with_warnings"))).toBe("gilir-plan-2026-06-30.pdf");
    expect(pdfName(noPlan)).toBe("gilir-result-2026-06-30.pdf");
    expect(pdfName(error)).toBe("gilir-result-2026-06-30.pdf");

    process.env.TZ = "Asia/Tokyo";
    expect(pdfName(plan)).toBe("gilir-plan-2026-07-01.pdf");
    expect(pdfName(shared("no_calendar_fit"))).toBe("gilir-result-2026-07-01.pdf");

    for (const { snapshot } of everySnapshot()) expect(pdfName(snapshot)).toMatch(/^gilir-(plan|result)-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it("[R23][R25] with the real ports in jsdom, which has no IndexedDB: every storage call answers not ok as unavailable and writes nothing, and pdf downloads a real PDF", async () => {
    expect(storageProblem(await localPlans.load().catch((error: unknown) => error)).reason).toBe("unavailable");
    const save = vi.spyOn(localPlans, "save");
    const clear = vi.spyOn(localPlans, "clear");
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:gilir-test");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    const keeper = createKeeper({ plans: localPlans, exportPdf, storageProblem, notice: readStorageNotice });
    const unavailable = { ok: false, problem: { reason: "unavailable", text: storageProblem(new Error("refused")).text } };

    await expect(keeper.read()).resolves.toEqual(unavailable);
    await expect(keeper.save(plan)).resolves.toEqual(unavailable);
    await expect(keeper.clear()).resolves.toEqual(unavailable);
    await expect(keeper.undo(savedState(plan))).resolves.toEqual(unavailable);
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    await expect(keeper.pdf(plan)).resolves.toEqual({ ok: true });
    expect(clicks).toEqual([pdfName(plan)]);
    const [file] = created.mock.calls[0] ?? [];
    if (!(file instanceof Blob)) throw new Error("No file was handed to the download.");
    expect(file.type).toBe("application/pdf");
    expect(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()).subarray(0, 5))).toBe("%PDF-");
  });

  it("a port that throws instead of rejecting is answered not ok too", async () => {
    const thrown = (): never => {
      throw new Error("A port threw instead of rejecting.");
    };
    const plans: LocalPlans = { load: thrown, save: thrown, clear: thrown };
    const keeper = createKeeper({ plans, exportPdf: thrown, storageProblem, notice: thrown });
    await expect(keeper.read()).resolves.toEqual(refused);
    await expect(keeper.save(plan)).resolves.toEqual(refused);
    await expect(keeper.clear()).resolves.toEqual(refused);
    await expect(keeper.undo(working)).resolves.toEqual(refused);
    await expect(keeper.pdf(plan)).resolves.toEqual({ ok: false });
  });
});
