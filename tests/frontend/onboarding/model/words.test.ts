// Node environment. Farmer-facing words (src/features/onboarding/model/words.ts).
import { describe, it } from "vitest";

describe("words", () => {
  it.todo("issueWords has words for every IssueKind and never returns a contract or zod message");
  it.todo("[J4] failureWords has a title and body for every ServiceFailure code and none contains the raw code text");
  it.todo("[A5] no word anywhere in words.ts contains priority, pest, weed or Threefield");
  it.todo("[K8] making.steps.calculating is \"Comparing orders and planting dates\" (no \"every\", known issue 8)");
  it.todo("[F1] waterLabels are Rain only, Rain + water when it’s dry, I’m not sure (spec.md:44 wording, apostrophe style per the open decision)");
  it.todo("[F3] the water lead says the plan uses rain alone and backup water does not change it");
  it.todo("[K2] making.announce gives one sentence per state: Step 1 of 3, Step 2 of 3, Step 3 of 3");
  it.todo("no word contains a long dash character");
});
