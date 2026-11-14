import { expect, it } from "vitest";
import { runLiveAcceptance } from "./live";

it.skipIf(process.env.I1_LIVE !== "1")("I1 strict live production pipeline reaches the declared warning plan after restart", async () => {
  const report = await runLiveAcceptance(false, process.env.I1_REPORT_PATH ?? "docs/evidence/I1/current-live-report.json");
  expect(report.status).toBe("PASSED");
}, 600000);
