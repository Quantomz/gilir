// Node environment. The one door to localPlans (src/features/onboarding/services/saved.ts), driven through a fake
// LocalPlans port (support/harness.tsx memoryPlans), so no module mock is needed.
import { describe, it } from "vitest";

describe("open", () => {
  it.todo("[B2] a rejected load opens as nothing saved (null) and turns health failing");
  it.todo("a load that resolves null is nothing saved, with health working");
});

describe("write: read-modify-write over F1's fields", () => {
  it.todo("[C2] a draft patch is saved with F3's snapshot passed through untouched");
  it.todo("a snapshot F3 cleared between two F1 writes stays cleared (F1 never writes a stale snapshot)");
  it.todo("[B2][B3] no blind writes: when the load before a write rejects, save is not called, health turns failing, and the patch is written on the next successful write");
  it.todo("[B3] a rejected save turns health failing and keeps the patch for the next write");
  it.todo("\"soon\" writes coalesce: ten draft patches inside the debounce make one save with the newest draft");
  it.todo("\"now\" writes at once, and never runs two saves at the same time");
  it.todo("flush writes what is queued; a second flush with nothing queued saves nothing");
});

describe("finish", () => {
  it.todo("[K4] clears activeJob, sets step 4 and stores the snapshot in ONE save");
  it.todo("[B6] keepSnapshot keeps an earlier non-error plan when a service_error arrives (spec.md:367), and replaces it otherwise");
  it.todo("[B6] a service_error with no earlier plan is stored");
  it.todo("written is false when the load or the save fails, so the controller keeps the job on the server (graft from candidate 3)");
});
