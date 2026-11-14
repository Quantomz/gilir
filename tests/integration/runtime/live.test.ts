import { expect, it } from "vitest";
import { runLiveAcceptance } from "./live";

it.skipIf(process.env.I1_LIVE !== "1")("I1 strict live production pipeline reaches a scientific terminal state after restart", async () => {
  const report = await runLiveAcceptance();
  expect(report, JSON.stringify(report)).toMatchObject({ status: "PASSED" });
}, 600000);
