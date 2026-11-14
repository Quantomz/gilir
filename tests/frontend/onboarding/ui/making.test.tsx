// @vitest-environment jsdom
// Making and the failed screen, with fake timers and a scripted client. findBy* hangs under fake timers
// (grounding.md gotcha 30): advance with support/harness.tsx advance(ms), then query with getBy*.
import { describe, it } from "vitest";

describe("Making", () => {
  it.todo("[J2] accepted saves activeJob at once (storageMock records it) and shows Making your plan");
  it.todo("[K2] queued, fetching and calculating each change the one role=status sentence; the visible step list is not a live region");
  it.todo("[L4] each step shows a word (Done, Working on it, Waiting), never colour alone");
  it.todo("[K6] three failed reads show We can’t reach the planning service right now. We keep trying.; a good read hides it");
  it.todo("[K4] completed calls onCompleted once with the snapshot, after the save that clears activeJob");
  it.todo("[K3] after completed, advancing 60 s makes no more reads; unmounting during Making stops polling");
  it.todo("[B6] a completed service_error is handed to onCompleted and the saved plan stays the earlier one");
  it.todo("when the completing save fails, client.remove is not called; when it succeeds, remove is called once");
  it.todo("Cancel removes the job, clears activeJob and returns to page 4 with every answer");
  it.todo("Back on Making returns to page 4 with See how it’s going; it reopens Making on the same job");
});

describe("restore", () => {
  it.todo("[C5] a saved activeJob opens Making and reads that capability at once");
  it.todo("[K6] a restored job that reads 404 not_found shows This plan request has expired and keeps every answer");
});

describe("the failed screen", () => {
  it.todo("[K5] jobFixtures.failed shows the failure title, No plan was made., Try again and Change my answers, and never calls onCompleted");
  it.todo("[K5] the title takes focus when the screen appears (known issue 17)");
  it.todo("[K5] Change my answers opens page 4 with the same answers; Try again submits the same answers as a new job");
  it.todo("Open my earlier plan, made {local date} shows only when a plan was saved before, and calls onCompleted with it");
});
