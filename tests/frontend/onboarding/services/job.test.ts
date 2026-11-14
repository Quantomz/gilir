// Node environment, fake timers. Following one job (src/features/onboarding/services/job.ts) with a scripted client
// (support/harness.tsx scriptedClient), because the fixture client never moves between states (src/fixtures/client.ts:20).
import { describe, it } from "vitest";

describe("watchJob", () => {
  it.todo("[K1] reads at once, then every 2.5 s, reporting queued, fetching and calculating in order");
  it.todo("[K1][K4] completed reports the snapshot once and makes no further read");
  it.todo("[K3] a resolved failed (jobFixtures.failed) reports failed once and makes no further read");
  it.todo("[K6] a rejection with retryable false (PlannerServiceError not_found, as the HTTP client sends on 404) ends as failed with that failure");
  it.todo("[K6] a retryable rejection backs off 2.5, 5, 10, 20 s and never ends the wait on its own");
  it.todo("[K6] three retryable rejections in a row report reachable false; the next good read reports reachable true");
  it.todo("[K6] a rate_limited rejection waits 60 s before the next read");
  it.todo("[K6] five rejections with no ServiceFailure (a ZodError) in a row end as failed with unreadable");
  it.todo("a read that never settles is cut after 20 s and counts as retryable");
  it.todo("[K3] stop() before the first read makes no read; stop() during a read drops its answer; stop() twice is safe");
  it.todo("never more than one read in flight, and no timer left after a terminal event or stop");
  it.todo("[A10] the capability token never appears in any console call (console spied)");
});

describe("pure parts", () => {
  it.todo("classifyReadError: PlannerServiceError-like with retryable false is terminal, with retryable true is retryable, a ZodError is unknown");
  it.todo("pollDelay table: 0 failures 2500; 1 to 4 failures 2500, 5000, 10000, 20000; 9 failures 20000; rate_limited 60000");
  it.todo("withTimeout settles with the promise when it wins and clears its timer");
});
