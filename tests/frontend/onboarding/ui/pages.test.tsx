// @vitest-environment jsdom
// Pages 1 to 3 through the public Onboarding component, with storageMock (support/harness.tsx), the FieldPicker stub
// (fieldPickerStub emits inputFixture.field) and a scripted client. Rules: cleanup() in afterEach (no Vitest globals),
// plain expect (no jest-dom), user-event for clicks and keys.
import { describe, it } from "vitest";

describe("the four pages, in order", () => {
  it.todo("[A3] the titles are Where is your farm?, Which crops do you want to grow?, Where does your water come from?, Your rotation, each with exactly one primary button");
  it.todo("[A3] pages 2 to 4 have a Back control; page 1 shows the brand and no Back");
  it.todo("[A4][A5] no page contains the words priority, pest or weed, and the step head says Step N of 4");
  it.todo("[C1] fill pages 1 to 4, press Back three times, then Next three times: every answer is still shown");
  it.todo("[C2] with mocked storage, every answer change is saved; remounting with the last saved state opens the same page with the same values");
  it.todo("[B2] with the real, unmocked storage (every call rejects) the whole flow completes and submits");
});

describe("page 1", () => {
  it.todo("[D1][A8] renders the FieldPicker slot with exactly { value, onChange }; the stub's Use this field makes Next go to page 2");
  it.todo("[D2] the submitted field deep-equals the field the slot emitted");
  it.todo("[D3] Next without a field says Mark your field to go on (role alert), stays on page 1 and focuses the slot section");
  it.todo("[D3] a server issue on [\"field\",\"ring\"] shows on page 1 beside the slot");
});

describe("page 2", () => {
  it.todo("[E1] the fixture catalogue shows Synthetic crop with Grown for food; picking it shows Picked and 1 picked");
  it.todo("[E2] a catalogue that rejects shows We couldn’t load the crop list and Try again; Try again loads it; other answers are kept");
  it.todo("[E3] an empty catalogue shows No crops are available yet, no count, and no Next");
  it.todo("[E4] with a 13-crop catalogue the 13th pick is refused with You can pick up to 12 crops. Remove one first.");
  it.todo("[E5] a saved pick missing from the list stays listed with Remove and is still in the submitted draft until removed");
  it.todo("[E6] a cover crop (purpose cover) can be picked and is submitted like a food crop");
  it.todo("removing a pick shows a toast with Undo; Undo restores the pick and focuses its card");
});

describe("page 3", () => {
  it.todo("[F1] three radios named Rain only, Rain + water when it’s dry and I’m not sure, each mapping to its value");
  it.todo("[F2] submitting the same answers with each water choice gives three inputs equal except for water (Done-when 2)");
  it.todo("[F3] the lead says the plan uses rain alone");
});
