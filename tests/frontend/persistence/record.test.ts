import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalState } from "@/client/storage";
import { farmInputSchemaVersion } from "@/contracts/input";
import { completedSnapshotSchema, runManifestSchema } from "@/contracts/result";
import { inputFixture } from "@/fixtures/input";
import { modeledSnapshotFixture } from "@/fixtures/model-result";
import { completedSnapshotFixture, completedSnapshotsByState, completedSnapshotsV2ByState, resultFixtures } from "@/fixtures/results";
import { frozenRunFixture } from "@/fixtures/science";
import { domError, freshStorage, memoryIdb } from "./support/memory-idb";
import type { MemoryIdb } from "./support/memory-idb";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("idb");
});

const capability = { jobId: "00000000-0000-4000-8000-000000000001", token: "synthetic-local-fixture-token" };
const { schemaVersion: _contractVersion, ...answers } = inputFixture;
const partialDraft = { field: inputFixture.field, cropPurposeIds: inputFixture.cropPurposeIds, water: "rain_only" } as const;
const empty: LocalState = { draft: null, step: 1, activeJob: null, snapshot: null };
const state: LocalState = { draft: partialDraft, step: 3, activeJob: capability, snapshot: completedSnapshotFixture };

function record(parts: Record<string, unknown>, version: unknown = 1) {
  return { format: "gilir.local-state", version, state: { ...empty, ...parts } };
}

const contracts = {
  input: farmInputSchemaVersion,
  snapshot: Math.max(...completedSnapshotSchema.unwrap().options.map(schema => schema.shape.schemaVersion.value)),
  manifest: Math.max(...runManifestSchema.unwrap().options.map(schema => schema.shape.schemaVersion.value)),
};
const setAsideOf = (finds: readonly object[]) => ({ format: "gilir.set-aside", version: 1, contracts, finds });

async function seeded(raw: unknown, setAside?: unknown) {
  const memory = memoryIdb();
  const keys = new Map<string, unknown>([["state", raw]]);
  if (setAside !== undefined) keys.set("set-aside", setAside);
  memory.databases.set("gilir", keys);
  return freshStorage(memory);
}

const onDisk = (memory: MemoryIdb, key: "state" | "set-aside") => memory.databases.get("gilir")?.get(key);

function leftOut(memory: MemoryIdb): string[][] {
  const setAside = onDisk(memory, "set-aside") as { finds: { parts: string[] }[] } | undefined;
  return (setAside?.finds ?? []).map(find => find.parts);
}

const datetimes = (value: unknown) => JSON.stringify(value).match(/\d{4}-\d\d-\d\dT[\d:.]+Z/g) ?? [];

const fixture = completedSnapshotFixture;
const { gridExpandedStates: _expanded, ...searchBeforeGridFields } = fixture.result.details.search;
const insufficient = completedSnapshotsByState.insufficient_data;
const retiredPriority = { ...fixture, input: { ...fixture.input, priority: "reliability" } };
const details = fixture.result.details;
const newerManifest = {
  ...fixture,
  result: {
    ...fixture.result,
    details: { ...details, provenance: { ...details.provenance, manifest: { kind: "available", value: { ...frozenRunFixture.manifest, schemaVersion: 3 } } } },
  },
};
const words = {
  record: "Your saved answers couldn’t be read, so Gilir starts again from the beginning.",
  snapshot: "Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it.",
  activeJob: "The plan that was being made can’t be followed any more. Make the plan again.",
  draft: "Your saved answers don’t match this version of Gilir, so they were left out.",
  kept: "Your answers are kept.",
};

describe("round trip", () => {
  it("stores and restores the exact modeled snapshot, including all replay timing and saved labels", async () => {
    const { localPlans, readStorageNotice } = await freshStorage();
    const modeledState = { ...state, snapshot: modeledSnapshotFixture };
    await localPlans.save(modeledState);
    expect(await localPlans.load()).toEqual(modeledState);
    expect(await readStorageNotice()).toBeNull();
  });
  it("a state with a partial draft, step 3, an active job and a snapshot loads deep-equal; the snapshot is a new object, so callers compare by id", async () => {
    const { localPlans } = await freshStorage();
    await localPlans.save(state);
    const loaded = await localPlans.load();
    expect(loaded).toEqual(state);
    expect(loaded?.snapshot).not.toBe(state.snapshot);
    expect(loaded?.snapshot?.id).toBe(state.snapshot?.id);
  });

  it("the snapshot's id, completedAt and provenance are unchanged, and the record holds no date of its own", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    const loaded = await localPlans.load();
    expect(loaded?.snapshot?.id).toBe("synthetic-plan");
    expect(loaded?.snapshot?.completedAt).toBe("2026-07-01T00:00:00Z");
    expect(loaded?.snapshot?.result.details.provenance).toEqual(fixture.result.details.provenance);
    const stored = onDisk(memory, "state") as { state: object };
    expect(Object.keys(stored).sort()).toEqual(["contracts", "format", "state", "version"]);
    expect(Object.keys(stored.state).sort()).toEqual(["activeJob", "draft", "snapshot", "step"]);
    expect(datetimes(stored)).toEqual(datetimes(fixture));
  });

  it("all six v1 and v2 snapshots round trip and preserve unavailable metrics separately from zero", async () => {
    const { localPlans } = await freshStorage();
    for (const snapshot of [...Object.values(completedSnapshotsByState), ...Object.values(completedSnapshotsV2ByState)]) {
      await localPlans.save({ ...empty, snapshot });
      const loaded = await localPlans.load();
      expect(loaded?.snapshot).toEqual(snapshot);
      expect(completedSnapshotSchema.safeParse(loaded?.snapshot).success).toBe(true);
    }
    await localPlans.save({ ...empty, snapshot: insufficient });
    const [missing] = (await localPlans.load())?.snapshot?.result.details.metrics ?? [];
    expect(missing?.value).toEqual({ kind: "unavailable", reason: "No usable windows in this example." });
    await localPlans.save({ ...empty, snapshot: fixture });
    const [zero] = (await localPlans.load())?.snapshot?.result.details.metrics ?? [];
    expect(zero?.value).toEqual({ kind: "available", value: 0 });
  });

  it("loading a valid raw version 1 record leaves it byte-for-byte unchanged", async () => {
    const raw = record({ ...state, snapshot: fixture });
    const bytes = JSON.stringify(raw);
    const { localPlans, readStorageNotice, memory } = await seeded(raw);
    expect(await localPlans.load()).toEqual(state);
    expect(onDisk(memory, "state")).toBe(raw);
    expect(JSON.stringify(onDisk(memory, "state"))).toBe(bytes);
    expect(await readStorageNotice()).toBeNull();
    expect(onDisk(memory, "set-aside")).toBeUndefined();
  });

  it("a draft without schemaVersion (as the input pages write it) and one with schemaVersion 1 both load", async () => {
    const { localPlans } = await freshStorage();
    await localPlans.save({ ...empty, draft: answers });
    expect((await localPlans.load())?.draft).toEqual(answers);
    await localPlans.save({ ...empty, draft: inputFixture });
    expect((await localPlans.load())?.draft).toEqual(inputFixture);
  });

  it("a draft key holding undefined counts as absent, not as a left-out answer", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save({ ...empty, draft: { water: "unsure", field: undefined } });
    const loaded = await localPlans.load();
    expect(Object.keys(loaded?.draft ?? {})).toEqual(["water"]);
    expect(onDisk(memory, "set-aside")).toBeUndefined();
  });

  it("save stores exactly the four LocalState fields: an extra key on the caller's object is not stored", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save({ ...state, label: "Synthetic example field" } as LocalState);
    const stored = onDisk(memory, "state") as { state: object };
    expect(Object.keys(stored.state).sort()).toEqual(["activeJob", "draft", "snapshot", "step"]);
    expect(await localPlans.load()).toEqual(state);
  });

  it("save replaces the whole state: a second save with snapshot null leaves no snapshot", async () => {
    const { localPlans } = await freshStorage();
    await localPlans.save(state);
    await localPlans.save({ ...state, snapshot: null });
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
  });
});

describe("record versions", () => {
  it("a record of version 1 is read", async () => {
    const { localPlans } = await seeded(record({ draft: answers, step: 2 }));
    expect(await localPlans.load()).toEqual({ ...empty, draft: answers, step: 2 });
  });

  it("a record of version 2 rejects load and save with newer, and the stored record is unchanged", async () => {
    const newer = record({ draft: answers }, 2);
    const { localPlans, storageProblem, memory } = await seeded(newer);
    expect(storageProblem(await localPlans.load().catch(error => error)).reason).toBe("newer");
    expect(storageProblem(await localPlans.save(state).catch(error => error)).reason).toBe("newer");
    expect(onDisk(memory, "state")).toBe(newer);
    expect(onDisk(memory, "set-aside")).toBeUndefined();
  });

  it.each([
    { name: "draft version 2", parts: { draft: { ...answers, schemaVersion: 2 }, snapshot: completedSnapshotsV2ByState.plan } },
    { name: "snapshot version 4", parts: { draft: inputFixture, snapshot: { ...completedSnapshotsV2ByState.plan, schemaVersion: 4 } } },
  ])("$name independently refuses every storage mutation", async ({ parts }) => {
    const setAside = { format: "gilir.set-aside", version: 1, finds: [{ parts: ["activeJob"], answersKept: true, raw: "prior unreadable job" }] };
    const { localPlans, storageProblem, readStorageNotice, memory } = await seeded(record({ draft: answers }), setAside);
    const pendingNotice = await readStorageNotice();
    expect(pendingNotice).not.toBeNull();
    const newer = record(parts);
    memory.databases.get("gilir")?.set("state", newer);
    const bytes = JSON.stringify(newer);
    expect(storageProblem(await localPlans.load().catch(error => error)).reason).toBe("newer");
    expect(storageProblem(await localPlans.save(state).catch(error => error)).reason).toBe("newer");
    expect(storageProblem(await localPlans.clear().catch(error => error)).reason).toBe("newer");
    await pendingNotice?.dismiss();
    expect(await readStorageNotice()).toBeNull();
    expect(onDisk(memory, "state")).toBe(newer);
    expect(JSON.stringify(onDisk(memory, "state"))).toBe(bytes);
    expect(onDisk(memory, "set-aside")).toBe(setAside);
  });

  it("a later build's data that kept schemaVersion 1 is set aside exactly as found, and the notice doesn't call it older", async () => {
    const later = record({
      draft: { ...answers, backupWaterSource: "well" },
      snapshot: { ...fixture, cropLabels: { "synthetic-crop": "Synthetic crop" } },
    });
    const { localPlans, readStorageNotice, memory } = await seeded(later);
    expect(await localPlans.load()).toEqual({ ...empty, draft: answers });
    expect(onDisk(memory, "set-aside")).toEqual(setAsideOf([{ parts: ["snapshot"], answersKept: true, raw: later }]));
    const notice = await readStorageNotice();
    expect(notice?.text).toBe(`${words.snapshot} ${words.kept}`);
    expect(notice?.text).not.toMatch(/older/);
  });

  it("a record stamped with a newer FarmInput, CompletedSnapshot or RunManifest version rejects load, save and clear with newer, and nothing is written or dropped", async () => {
    for (const stamp of [{ ...contracts, input: contracts.input + 1 }, { ...contracts, snapshot: contracts.snapshot + 1 }, { ...contracts, manifest: contracts.manifest + 1 }]) {
      const newer = { ...record({ draft: { ...answers, soilKind: "clay", water: "rain_plus_tank" }, snapshot: fixture }), contracts: stamp };
      const { localPlans, storageProblem, memory } = await seeded(newer);
      for (const call of [() => localPlans.load(), () => localPlans.save(state), () => localPlans.clear()]) {
        expect(storageProblem(await call().catch(error => error)).reason, JSON.stringify(stamp)).toBe("newer");
      }
      expect(onDisk(memory, "state")).toBe(newer);
      expect(onDisk(memory, "set-aside")).toBeUndefined();
    }
  });

  it("a snapshot whose input or run manifest carries a newer schemaVersion reads as newer, though the snapshot's own schemaVersion is 1", async () => {
    for (const snapshot of [{ ...fixture, input: { ...fixture.input, schemaVersion: 2 } }, newerManifest]) {
      const newer = record({ draft: answers, snapshot });
      const { localPlans, storageProblem, memory } = await seeded(newer);
      expect(storageProblem(await localPlans.load().catch(error => error)).reason).toBe("newer");
      expect(onDisk(memory, "state")).toBe(newer);
      expect(onDisk(memory, "set-aside")).toBeUndefined();
    }
  });

  it("a set-aside record stamped by a newer build is refused like a newer state: load, save and clear reject newer, no notice shows, and nothing is removed", async () => {
    const theirs = { ...record({ draft: { soilKind: "loam" } }), contracts: { ...contracts, input: 2 } };
    const setAside = { ...setAsideOf([{ parts: ["draft.soilKind"], answersKept: true, raw: theirs }]), contracts: { ...contracts, input: 2 } };
    const { localPlans, readStorageNotice, storageProblem, memory } = await seeded(undefined, setAside);
    for (const call of [() => localPlans.load(), () => localPlans.save(state), () => localPlans.clear()]) {
      expect(storageProblem(await call().catch(error => error)).reason).toBe("newer");
    }
    expect(await readStorageNotice()).toBeNull();
    expect(onDisk(memory, "set-aside")).toBe(setAside);
    expect(onDisk(memory, "state")).toBeUndefined();
  });

  it("this build stamps what it saves with its own FarmInput, CompletedSnapshot and RunManifest versions, so an older build can refuse it", async () => {
    const { localPlans, memory } = await freshStorage();
    await localPlans.save(state);
    expect((onDisk(memory, "state") as { contracts: unknown }).contracts).toEqual(contracts);
  });

  it("clear on a newer record rejects newer and deletes nothing", async () => {
    const newer = record({ draft: answers }, 2);
    const setAside = { format: "gilir.set-aside", version: 1, finds: [{ parts: ["snapshot"], answersKept: true, raw: "an older plan" }] };
    const { localPlans, storageProblem, memory } = await seeded(newer, setAside);
    expect(storageProblem(await localPlans.clear().catch(error => error)).reason).toBe("newer");
    expect(onDisk(memory, "state")).toBe(newer);
    expect(onDisk(memory, "set-aside")).toBe(setAside);
  });

  it("a value that is not a Gilir record (a string, an array, another format) resolves null and is set aside as record", async () => {
    const strangers = [
      "a string",
      [answers],
      { version: 3, savedAt: "2026-07-01T00:00:00Z", draft: answers, step: 2 },
      { format: "gilir.local-state", version: 0, state: { ...empty, draft: answers } },
      { format: "gilir.local-state", version: 1, state: "not a state" },
    ];
    for (const raw of strangers) {
      const { localPlans, memory } = await seeded(raw);
      expect(await localPlans.load()).toBeNull();
      expect(onDisk(memory, "state")).toBeUndefined();
      expect(onDisk(memory, "set-aside")).toEqual(setAsideOf([{ parts: ["record"], answersKept: false, raw }]));
    }
  });
});

describe("parts this version cannot read", () => {
  it("a snapshot without search.gridExpandedStates is left out; draft, step and job load", async () => {
    const before = { ...fixture, result: { ...fixture.result, details: { ...fixture.result.details, search: searchBeforeGridFields } } };
    const { localPlans, memory } = await seeded(record({ ...state, snapshot: before }));
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
    expect(leftOut(memory)).toEqual([["snapshot"]]);
  });

  it("a snapshot whose input has the retired priority field is left out, although its schemaVersion is 1", async () => {
    const { localPlans, memory } = await seeded(record({ ...state, snapshot: retiredPriority }));
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
    expect(leftOut(memory)).toEqual([["snapshot"]]);
  });

  it("a snapshot with a plan on an insufficient_data result is left out", async () => {
    const invented = { ...insufficient, result: { ...insufficient.result, plan: resultFixtures.plan.plan } };
    const { localPlans, memory } = await seeded(record({ ...state, snapshot: invented }));
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
    expect(leftOut(memory)).toEqual([["snapshot"]]);
  });

  it("a history without start and endExclusive leaves out only draft.history; the other answers load", async () => {
    const { history: _history, ...rest } = answers;
    const { localPlans, memory } = await seeded(record({ draft: { ...answers, history: { kind: "recorded", entries: [] } }, step: 4 }));
    expect(await localPlans.load()).toEqual({ ...empty, draft: rest, step: 4 });
    expect(leftOut(memory)).toEqual([["draft.history"]]);
  });

  it("each of the five answer keys can be left out alone, named draft.<key>", async () => {
    const unreadable = {
      field: { label: "Synthetic example field" },
      cropPurposeIds: [],
      water: "rain",
      planningStart: "1 July 2026",
      history: { kind: "recorded", start: "2025-07-01", endExclusive: "2026-07-01", entries: [{ kind: "crop" }] },
    };
    for (const [key, value] of Object.entries(unreadable)) {
      const { localPlans, memory } = await seeded(record({ draft: { ...answers, [key]: value } }));
      const loaded = await localPlans.load();
      expect(Object.keys(loaded?.draft ?? {}).sort()).toEqual(Object.keys(answers).filter(name => name !== key).sort());
      expect(leftOut(memory)).toEqual([[`draft.${key}`]]);
    }
  });

  it("a draft key FarmInput does not have is dropped with no notice", async () => {
    const { localPlans, memory } = await seeded(record({ draft: { ...answers, priority: "reliability" } }));
    expect((await localPlans.load())?.draft).toEqual(answers);
    expect(onDisk(memory, "set-aside")).toBeUndefined();
  });

  it("a draft that is not an object, or whose schemaVersion is neither absent nor 1, is left out whole", async () => {
    for (const draft of ["my answers", 42, [answers], { ...answers, schemaVersion: 0 }, { ...answers, schemaVersion: "1" }]) {
      const { localPlans, memory } = await seeded(record({ draft, snapshot: fixture }));
      expect(await localPlans.load()).toEqual({ ...empty, snapshot: fixture });
      expect(leftOut(memory)).toEqual([["draft"]]);
    }
  });

  it("an invalid activeJob is left out and the valid UUID fixture capability loads", async () => {
    const jobs = [{ jobId: "synthetic-job" }, { ...capability, jobId: "synthetic-job" }, { ...capability, expiresAt: "2026-07-02T00:00:00Z" }, { ...capability, jobId: "" }];
    for (const activeJob of jobs) {
      const { localPlans, memory } = await seeded(record({ draft: answers, activeJob }));
      expect(await localPlans.load()).toEqual({ ...empty, draft: answers });
      expect(leftOut(memory)).toEqual([["activeJob"]]);
    }
    const { localPlans } = await seeded(record({ draft: answers, activeJob: capability }));
    expect((await localPlans.load())?.activeJob).toEqual(capability);
  });

  it("a step that is not an integer from 1 to 4 loads as 1 and is not reported: it is the page, not an answer", async () => {
    for (const step of [0, 5, 2.5, "3", null, undefined]) {
      const { localPlans, memory } = await seeded(record({ draft: answers, step }));
      expect(await localPlans.load()).toEqual({ ...empty, draft: answers, step: 1 });
      expect(onDisk(memory, "set-aside")).toBeUndefined();
    }
  });

  it("no part is invented: a left-out part loads as null, never a default draft, job or snapshot", async () => {
    const cases = [
      { stored: { draft: { field: "here", water: "rain" }, snapshot: fixture }, loads: { ...empty, snapshot: fixture } },
      { stored: { draft: answers, activeJob: { jobId: "synthetic-job" } }, loads: { ...empty, draft: answers } },
      { stored: { draft: answers, snapshot: { ...fixture, id: "" } }, loads: { ...empty, draft: answers } },
    ];
    for (const { stored, loads } of cases) {
      const { localPlans } = await seeded(record(stored));
      expect(await localPlans.load()).toEqual(loads);
    }
  });

  it("when nothing readable is left, load resolves null and the state record is removed", async () => {
    const { localPlans, memory } = await seeded(record({ draft: "my answers", activeJob: { jobId: "synthetic-job" }, snapshot: { id: "old" } }));
    expect(await localPlans.load()).toBeNull();
    expect(onDisk(memory, "state")).toBeUndefined();
    expect(leftOut(memory).map(parts => [...parts].sort())).toEqual([["activeJob", "draft", "snapshot"]]);
  });
});

describe("set aside, never lost", () => {
  it("after a load that left something out, the set-aside record holds the stored value exactly as found, with its parts", async () => {
    const raw = record({ ...state, snapshot: retiredPriority });
    const { localPlans, memory } = await seeded(raw);
    await localPlans.load();
    expect(onDisk(memory, "set-aside")).toEqual(setAsideOf([{ parts: ["snapshot"], answersKept: true, raw }]));
  });

  it("the readable rest is written back in the same transaction, so the next load writes nothing and returns the same state", async () => {
    const { localPlans, memory } = await seeded(record({ ...state, snapshot: retiredPriority }));
    const first = await localPlans.load();
    expect(onDisk(memory, "state")).toEqual({ ...record({ ...state, snapshot: null }), contracts });
    const writtenBack = onDisk(memory, "state");
    const setAside = onDisk(memory, "set-aside");
    expect(await localPlans.load()).toEqual(first);
    expect(onDisk(memory, "state")).toBe(writtenBack);
    expect(onDisk(memory, "set-aside")).toBe(setAside);
  });

  it("on a full device (the set-aside write fails at commit with QuotaExceededError) load still resolves the readable rest and writes nothing", async () => {
    const raw = record({ ...state, snapshot: retiredPriority });
    const { localPlans, memory } = await seeded(raw);
    memory.failNext("commit", domError("QuotaExceededError"));
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
    expect(onDisk(memory, "state")).toBe(raw);
    expect(onDisk(memory, "set-aside")).toBeUndefined();
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
    expect(leftOut(memory)).toEqual([["snapshot"]]);
  });

  it("only a full device lets load skip that write: an UnknownError at commit rejects unavailable, and nothing is written or dropped", async () => {
    const raw = record({ ...state, snapshot: retiredPriority });
    const { localPlans, storageProblem, memory } = await seeded(raw);
    memory.failNext("commit", domError("UnknownError"));
    const outcome = await localPlans.load().then(loaded => ({ loaded }), (error: unknown) => storageProblem(error).reason);
    expect(outcome).toBe("unavailable");
    expect(onDisk(memory, "state")).toBe(raw);
    expect(onDisk(memory, "set-aside")).toBeUndefined();
  });

  it("an AbortError at that commit is retried once on a fresh connection, and the retry sets the part aside", async () => {
    const raw = record({ ...state, snapshot: retiredPriority });
    const { localPlans, memory } = await seeded(raw);
    memory.failNext("commit", domError("AbortError"));
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null });
    expect(memory.opened.get("gilir")).toBe(2);
    expect(leftOut(memory)).toEqual([["snapshot"]]);
  });

  it("a save after that load sets the unreadable part aside before it replaces the state; while that doesn't fit, save rejects full and the old record stays", async () => {
    const raw = record({ ...state, snapshot: retiredPriority });
    const { localPlans, storageProblem, memory } = await seeded(raw);
    memory.failNext("commit", domError("QuotaExceededError"));
    const loaded = { ...(await localPlans.load() ?? empty), step: 4 };
    memory.failNext("commit", domError("QuotaExceededError"));
    expect(storageProblem(await localPlans.save(loaded).catch(error => error)).reason).toBe("full");
    expect(onDisk(memory, "state")).toBe(raw);
    expect(onDisk(memory, "set-aside")).toBeUndefined();
    await localPlans.save(loaded);
    expect(onDisk(memory, "set-aside")).toEqual(setAsideOf([{ parts: ["snapshot"], answersKept: true, raw }]));
    expect(await localPlans.load()).toEqual(loaded);
  });

  it("on a full device the notice still names the part load couldn't set aside; it shows until that part is set aside and dismissed", async () => {
    const raw = record({ draft: answers, snapshot: retiredPriority });
    const { localPlans, readStorageNotice, memory } = await seeded(raw);
    memory.failNext("commit", domError("QuotaExceededError"));
    expect(await localPlans.load()).toEqual({ ...empty, draft: answers });
    const notice = await readStorageNotice();
    expect(notice?.text).toBe(`${words.snapshot} ${words.kept}`);
    await notice?.dismiss();
    expect(onDisk(memory, "state")).toBe(raw);
    expect((await readStorageNotice())?.text).toBe(`${words.snapshot} ${words.kept}`);
    await localPlans.save({ ...empty, draft: answers, step: 2 });
    const setAside = await readStorageNotice();
    expect(setAside?.text).toBe(`${words.snapshot} ${words.kept}`);
    await setAside?.dismiss();
    expect(await readStorageNotice()).toBeNull();
  });

  it("a part a save sets aside says the answers are kept only when that save keeps answers", async () => {
    for (const [draft, text] of [[answers, `${words.snapshot} ${words.kept}`], [null, words.snapshot]] as const) {
      const { localPlans, readStorageNotice, memory } = await seeded(record({ draft: answers, step: 4, snapshot: retiredPriority }));
      memory.failNext("commit", domError("QuotaExceededError"));
      await localPlans.load();
      await localPlans.save({ ...empty, draft });
      expect((await localPlans.load())?.draft ?? null).toEqual(draft);
      expect((await readStorageNotice())?.text, JSON.stringify(draft)).toBe(text);
    }
  });

  it("a second finding is appended and the first raw value is kept", async () => {
    const first = record({ ...state, snapshot: retiredPriority });
    const { localPlans, memory } = await seeded(first);
    await localPlans.load();
    const second = record({ draft: answers, activeJob: { jobId: "synthetic-job" } });
    memory.databases.get("gilir")?.set("state", second);
    await localPlans.load();
    expect(onDisk(memory, "set-aside")).toEqual(setAsideOf([
      { parts: ["snapshot"], answersKept: true, raw: first },
      { parts: ["activeJob"], answersKept: true, raw: second },
    ]));
  });

  it("a caller's next save (load, then save a patch over it) leaves the set-aside record in place", async () => {
    const { localPlans, readStorageNotice, memory } = await seeded(record({ ...state, snapshot: retiredPriority }));
    const loaded = await localPlans.load();
    await localPlans.save({ ...(loaded ?? empty), step: 4 });
    expect(await localPlans.load()).toEqual({ ...state, snapshot: null, step: 4 });
    expect(leftOut(memory)).toEqual([["snapshot"]]);
    expect((await readStorageNotice())?.text).toBe(`${words.snapshot} ${words.kept}`);
  });
});

describe("the notice in the farmer's words", () => {
  async function noticeAfterLoad(raw: unknown): Promise<string | undefined> {
    const { localPlans, readStorageNotice } = await seeded(raw);
    await localPlans.load();
    return (await readStorageNotice())?.text;
  }

  it("readStorageNotice resolves null before any finding, after a clean load, and when storage is unavailable or newer", async () => {
    const { localPlans, readStorageNotice } = await freshStorage();
    expect(await readStorageNotice()).toBeNull();
    await localPlans.save(state);
    await localPlans.load();
    expect(await readStorageNotice()).toBeNull();

    const unavailable = memoryIdb();
    unavailable.throwNextOpen(domError("SecurityError"));
    expect(await (await freshStorage(unavailable)).readStorageNotice()).toBeNull();

    const setAside = { format: "gilir.set-aside", version: 1, finds: [{ parts: ["snapshot"], answersKept: true, raw: "an older plan" }] };
    expect(await (await seeded(record({ draft: answers }, 2), setAside)).readStorageNotice()).toBeNull();
  });

  it("record: Your saved answers couldn’t be read, so Gilir starts again from the beginning.", async () => {
    expect(await noticeAfterLoad("a string")).toBe(words.record);
  });

  it("snapshot, with answers kept: Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it. Your answers are kept.", async () => {
    expect(await noticeAfterLoad(record({ draft: answers, snapshot: retiredPriority }))).toBe(`${words.snapshot} ${words.kept}`);
  });

  it("snapshot, with no answer saved: the plan sentence alone, without Your answers are kept.", async () => {
    expect(await noticeAfterLoad(record({ snapshot: retiredPriority }))).toBe(words.snapshot);
  });

  it("activeJob: The plan that was being made can’t be followed any more. Make the plan again.", async () => {
    expect(await noticeAfterLoad(record({ activeJob: { jobId: "synthetic-job" }, snapshot: fixture }))).toBe(words.activeJob);
  });

  it("draft: Your saved answers don’t match this version of Gilir, so they were left out.", async () => {
    expect(await noticeAfterLoad(record({ draft: "my answers", snapshot: fixture }))).toBe(words.draft);
  });

  it("draft.field and draft.cropPurposeIds: Some saved answers don’t match this version and were left out: your field and your crops. Please check your answers.", async () => {
    expect(await noticeAfterLoad(record({ draft: { ...answers, field: { label: "Synthetic example field" }, cropPurposeIds: [] } })))
      .toBe("Some saved answers don’t match this version and were left out: your field and your crops. Please check your answers.");
  });

  it("readStorageNotice and load started in the same tick, notice first or load first, both name what that load set aside", async () => {
    for (const noticeFirst of [true, false]) {
      const { localPlans, readStorageNotice } = await seeded(record({ draft: answers, snapshot: retiredPriority }));
      const [notice, loaded] = noticeFirst
        ? await Promise.all([readStorageNotice(), localPlans.load()])
        : await Promise.all([localPlans.load(), readStorageNotice()]).then(([state, text]) => [text, state] as const);
      expect(loaded, noticeFirst ? "notice first" : "load first").toEqual({ ...empty, draft: answers });
      expect(notice?.text, noticeFirst ? "notice first" : "load first").toBe(`${words.snapshot} ${words.kept}`);
    }
  });

  it("a notice read in the same tick as a load, then dismissed, doesn’t come back: the dismiss removes what that load set aside", async () => {
    for (const noticeFirst of [true, false]) {
      const { localPlans, readStorageNotice, memory } = await seeded(record({ draft: answers, snapshot: retiredPriority }));
      const [notice] = noticeFirst
        ? await Promise.all([readStorageNotice(), localPlans.load()])
        : await Promise.all([localPlans.load(), readStorageNotice()]).then(([, text]) => [text] as const);
      await notice?.dismiss();
      expect(await readStorageNotice(), noticeFirst ? "notice first" : "load first").toBeNull();
      expect(onDisk(memory, "set-aside"), noticeFirst ? "notice first" : "load first").toBeUndefined();
    }
  });

  it("reading twice gives the same text and changes nothing (React Strict Mode runs effects twice)", async () => {
    const { localPlans, readStorageNotice, memory } = await seeded(record({ draft: answers, snapshot: retiredPriority }));
    await localPlans.load();
    const before = { state: onDisk(memory, "state"), setAside: onDisk(memory, "set-aside") };
    const first = await readStorageNotice();
    const second = await readStorageNotice();
    expect(second?.text).toBe(first?.text);
    expect({ state: onDisk(memory, "state"), setAside: onDisk(memory, "set-aside") }).toEqual(before);
    expect(onDisk(memory, "set-aside")).toBe(before.setAside);
  });

  it("dismiss removes only the findings it showed: a finding made after the read still shows", async () => {
    const { localPlans, readStorageNotice, memory } = await seeded(record({ draft: answers, snapshot: retiredPriority }));
    await localPlans.load();
    const shown = await readStorageNotice();
    const later = record({ draft: answers, activeJob: { jobId: "synthetic-job" } });
    memory.databases.get("gilir")?.set("state", later);
    await localPlans.load();
    await shown?.dismiss();
    const next = await readStorageNotice();
    expect(next?.text).toBe(`${words.activeJob} ${words.kept}`);
    expect(onDisk(memory, "set-aside")).toEqual(setAsideOf([{ parts: ["activeJob"], answersKept: true, raw: later }]));
    await next?.dismiss();
    expect(await readStorageNotice()).toBeNull();
    expect(onDisk(memory, "set-aside")).toBeUndefined();
  });

  it("dismiss after a full-device notice removes only the set-aside findings it showed: a part it named from the saved state never counts", async () => {
    const earlier = setAsideOf([{ parts: ["activeJob"], answersKept: true, raw: "an earlier job" }]);
    const { localPlans, readStorageNotice, memory } = await seeded(record({ draft: answers, snapshot: retiredPriority }), earlier);
    memory.failNext("commit", domError("QuotaExceededError"));
    await localPlans.load();
    const shown = await readStorageNotice();
    expect(shown?.text).toBe(`${words.snapshot} ${words.activeJob} ${words.kept}`);
    memory.databases.get("gilir")?.set("state", record({ draft: "my answers", snapshot: fixture }));
    await localPlans.load();
    await shown?.dismiss();
    expect((await readStorageNotice())?.text).toBe(words.draft);
  });

  it("clear removes the state and every finding: load and readStorageNotice both resolve null", async () => {
    const { localPlans, readStorageNotice, memory } = await seeded(record({ draft: answers, snapshot: retiredPriority }));
    await localPlans.load();
    await localPlans.clear();
    expect(await localPlans.load()).toBeNull();
    expect(await readStorageNotice()).toBeNull();
    expect([...(memory.databases.get("gilir")?.keys() ?? [])]).toEqual([]);
  });

  it("no notice holds a token, a coordinate, a label or a crop ID from the stored record", async () => {
    const texts = [
      await noticeAfterLoad(record({
        draft: { ...answers, field: { ...answers.field, ring: [] }, cropPurposeIds: ["Synthetic crop"] },
        activeJob: { ...capability, expiresAt: "2026-07-02T00:00:00Z" },
        snapshot: retiredPriority,
      })),
      await noticeAfterLoad({ ...record({ draft: answers, activeJob: capability }), format: "threefield.v3" }),
    ];
    for (const text of texts) {
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/\d|synthetic|token|crop-|example field/i);
    }
  });
});
