// Node environment. Validation at submission and issue routing (src/features/onboarding/model/check.ts).
import { describe, it } from "vitest";

describe("checkDraft", () => {
  it.todo("[I5] an empty draft returns five presence issues on pages 1, 2, 3, 4, 4, and no zod words");
  it.todo("[I5] a draft missing only the date AND holding duplicate crops shows only date_missing first, then crops_duplicate once the date is set");
  it.todo("[I5] with every answer present, a duplicate crop and an overlapping entry are reported together in one check");
  it.todo("[I1] a complete inputFixture draft returns ready with input deep-equal to inputFixture");
  it.todo("[A4] the ready input has exactly the six FarmInput keys and no priority key (docs/cards/F1.md:43)");
  it.todo("[I1] an unsupported label \" Cassava \" is submitted as \"Cassava\" (parsed.data, src/contracts/common.ts:5)");
  it.todo("[E5] a picked id missing from the loaded catalogue gives crop_not_listed on page 2 and the id stays in the draft");
  it.todo("with no catalogue loaded the membership step is skipped (the server checks it, src/server/jobs/http.ts:116-119)");
  it.todo("[J5] 64 entries with 240-character names stay under inputLimits.payloadBytes; a larger synthetic input gives too_large");
  it.todo("[H9] two bars with a gap between them submit no fallow entry");
  it.todo("[I6] an invalid planningStart shows only date_missing on page 4, not a second history_window issue");
});

describe("stepComplete: the page minimum behind Next", () => {
  it.todo("[D3] page 1 needs a field");
  it.todo("[E3] page 2 needs a ready, non-empty list and at least one picked crop that is on it");
  it.todo("page 3 needs a water answer");
});

describe("classify: paths decide pages and words, never message text", () => {
  it.todo("[I3] [] and [\"schemaVersion\"] go to page null (summary only), kind unreadable");
  it.todo("[D3] [\"field\",\"ring\"] from the server (self-intersection, src/server/jobs/http.ts:114) goes to page 1 as field_shape");
  it.todo("[E5] [\"cropPurposeIds\", 0] from the server goes to page 2 as crop_not_listed with cropId = draft.cropPurposeIds[0]");
  it.todo("[\"cropPurposeIds\"] goes to page 2 as crops_duplicate");
  it.todo("[I4] [\"history\",\"entries\",1] on an entry outside the window is entry_outside; on an inside entry it is entry_overlap, with that entry's id");
  it.todo("[\"history\",\"entries\",1,\"id\"] is entry_id and carries the entry's id");
  it.todo("an unknown path under a known key is kind other on that key's page, with no developer message");
  it.todo("[I4] index i resolves to the i-th entry of the sorted draft, which is the lane order on screen");
  it.todo("[I2] pageOf maps field to 1, cropPurposeIds to 2, water to 3, planningStart and history to 4, anything else to null");
});

describe("pinned server issues", () => {
  it.todo("[J3] a pinned crops issue disappears once cropPurposeIds changes and stays while only water changes");
  it.todo("a page-null issue disappears after any answer changes");
});
