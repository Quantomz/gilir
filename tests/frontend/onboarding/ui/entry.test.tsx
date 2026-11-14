// @vitest-environment jsdom
// The production composition, src/app/page.tsx, with its imports mocked:
//   vi.mock("@/client/planner", () => ({ plannerClient: scripted }))   // page.tsx may only default-export
//   vi.mock("@/client/storage", () => storageMock(state))
//   vi.mock("@/features/location", () => fieldPickerStub(inputFixture.field))
//   vi.mock("@/features/results", () => resultsStub())
// layout.tsx is never imported (next/font needs the Next compiler, repo-baseline.md gotcha 37).
import { describe, it } from "vitest";

describe("what opens: no landing page, no sign in, no sign up", () => {
  it.todo("[A9][B1] nothing saved: the first heading is Where is your farm? and no link or button mentions signing in, signing up or getting started");
  it.todo("[B2] storage load rejects: the first heading is Where is your farm? and the flow still completes");
  it.todo("while load is pending the page shows Opening Gilir… and no question");
  it.todo("[B1] a saved draft at step 2: the first heading is Which crops do you want to grow? with its picks checked");
  it.todo("[B1][C5] a saved activeJob: Making your plan shows and the scripted client is read with that capability");
  it.todo("[B1] a saved snapshot and no job: the Results slot shows that snapshot's id inside the Gilir frame (Text size present) and focus is on #main");
  it.todo("[B1] a saved snapshot and a saved job: Making wins");
});

describe("Results and Change inputs (spec.md:25, src/features/ports.ts:4)", () => {
  it.todo("[B4] a completed job swaps the inputs for the Results slot with the completed snapshot");
  it.todo("[B5] Change inputs in the Results stub reopens page 1 with every answer filled in and does not bounce back to Results");
  it.todo("[C6] after Change inputs, a newer different saved draft is kept at its page instead of the snapshot's input (known issue 3)");
  it.todo("resubmitting from there reaches Results again with the new snapshot");
});

describe("slot props unchanged (docs/cards/F1.md:38)", () => {
  it.todo("[A8] FieldPicker receives exactly { value, onChange } and Results exactly { snapshot, onChangeInputs }");
});
