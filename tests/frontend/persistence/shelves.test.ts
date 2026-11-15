import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalState } from "@/client/storage";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture } from "@/fixtures/results";
import { freshStorage, memoryIdb } from "./support/memory-idb";
import type { MemoryIdb } from "./support/memory-idb";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("idb");
});

const farmer: LocalState = {
  draft: { water: "rain_plus_backup", planningStart: inputFixture.planningStart },
  step: 4,
  activeJob: { jobId: "4f5b2c4e-0d7e-4a51-9d0e-2b8f6c1a7e30", token: "test-farmer-capability-token" },
  snapshot: null,
};
const lab: LocalState = {
  draft: inputFixture,
  step: 4,
  activeJob: { jobId: "00000000-0000-4000-8000-000000000001", token: "synthetic-local-fixture-token" },
  snapshot: completedSnapshotFixture,
};

const at = (pathname: string) => vi.stubGlobal("location", { pathname });
const stored = (memory: MemoryIdb, shelf: string) => memory.databases.get(shelf)?.get("state");

describe("the fixture lab keeps its own shelf", () => {
  it("a save at /dev/fixtures writes gilir-fixture-lab and leaves gilir untouched", async () => {
    const { localPlans, memory } = await freshStorage(memoryIdb(), "/");
    await localPlans.save(farmer);
    const farmerRecord = stored(memory, "gilir");
    at("/dev/fixtures");
    await localPlans.save(lab);
    expect(stored(memory, "gilir")).toBe(farmerRecord);
    expect(stored(memory, "gilir-fixture-lab")).toEqual({ format: "gilir.local-state", version: 1, state: lab });
  });

  it("a save at / writes gilir and leaves gilir-fixture-lab untouched", async () => {
    const { localPlans, memory } = await freshStorage(memoryIdb(), "/dev/fixtures");
    await localPlans.save(lab);
    const labRecord = stored(memory, "gilir-fixture-lab");
    at("/");
    await localPlans.save(farmer);
    expect(stored(memory, "gilir-fixture-lab")).toBe(labRecord);
    expect(stored(memory, "gilir")).toEqual({ format: "gilir.local-state", version: 1, state: farmer });
  });

  it("the lab loading while a farmer has an active job resolves null: it can neither see nor overwrite the capability", async () => {
    const { localPlans } = await freshStorage(memoryIdb(), "/");
    await localPlans.save(farmer);
    at("/dev/fixtures");
    expect(await localPlans.load()).toBeNull();
    await localPlans.save({ ...lab, activeJob: null });
    at("/");
    expect((await localPlans.load())?.activeJob).toEqual(farmer.activeJob);
  });

  it("clear at /dev/fixtures leaves the farmer's state loadable at /, and the reverse", async () => {
    const { localPlans } = await freshStorage(memoryIdb(), "/");
    await localPlans.save(farmer);
    at("/dev/fixtures");
    await localPlans.save(lab);
    await localPlans.clear();
    expect(await localPlans.load()).toBeNull();
    at("/");
    expect(await localPlans.load()).toEqual(farmer);

    at("/dev/fixtures");
    await localPlans.save(lab);
    at("/");
    await localPlans.clear();
    expect(await localPlans.load()).toBeNull();
    at("/dev/fixtures");
    expect(await localPlans.load()).toEqual(lab);
  });

  it("the shelf is chosen on each call: one imported module serves both paths as location changes", async () => {
    const { localPlans, memory } = await freshStorage(memoryIdb(), "/");
    for (const [path, state] of [["/", farmer], ["/dev/fixtures", lab], ["/", { ...farmer, step: 2 }], ["/dev/fixtures/", { ...lab, step: 1 }]] as const) {
      at(path);
      await localPlans.save(state);
      expect(await localPlans.load()).toEqual(state);
    }
    expect([...memory.databases.keys()].sort()).toEqual(["gilir", "gilir-fixture-lab"]);
    expect(memory.opened).toEqual(new Map([["gilir", 1], ["gilir-fixture-lab", 1]]));
  });

  it("a path that only starts like the lab (/developer) uses the farmer's shelf", async () => {
    const { localPlans, memory } = await freshStorage(memoryIdb(), "/developer");
    await localPlans.save(farmer);
    expect(stored(memory, "gilir")).toEqual({ format: "gilir.local-state", version: 1, state: farmer });
    expect(memory.databases.has("gilir-fixture-lab")).toBe(false);
  });
});
