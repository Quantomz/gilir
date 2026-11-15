// Node environment, fake timers. Following one job with a scripted client, because the fixture client never moves
// between states.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerServiceError } from "@/client/planner";
import { farmInputSchema } from "@/contracts";
import type { JobState, PlannerClient, ServiceFailure } from "@/contracts";
import { completedSnapshotFixture, jobFixtures } from "@/fixtures/results";
import { policy } from "@/features/onboarding/model/policy";
import {
  NoAnswerError,
  classifyReadError,
  pollDelay,
  unreadable,
  watchJob,
  withTimeout,
} from "@/features/onboarding/services/job";
import type { JobEvent } from "@/features/onboarding/services/job";
import { capability, scriptedClient, serviceError } from "../support/harness";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const outage: ServiceFailure = { code: "temporarily_unavailable", message: "The planning service could not be reached.", retryable: true };
const limited: ServiceFailure = { code: "rate_limited", message: "The request limit was reached. Try again shortly.", retryable: true };
const expired: ServiceFailure = { code: "not_found", message: "The job was not found.", retryable: false };
const zodError = (() => {
  const parsed = farmInputSchema.safeParse({});
  if (parsed.success) throw new Error("expected a ZodError");
  return parsed.error;
})();

function follow(script: Parameters<typeof scriptedClient>[0]) {
  const client = scriptedClient(script);
  const events: JobEvent[] = [];
  const readAt: number[] = [];
  const read = client.read.bind(client);
  const timed: Pick<PlannerClient, "read"> = {
    read(provided) {
      readAt.push(Date.now() - start);
      return read(provided);
    },
  };
  const start = Date.now();
  const stop = watchJob(timed, capability, event => events.push(event));
  return { client, events, readAt, stop };
}

const kinds = (events: readonly JobEvent[]) => events.map(event => (event.kind === "progress" ? event.progress : event.kind === "reachable" ? `reachable ${event.reachable}` : event.kind));

describe("watchJob", () => {
  it("[K1] reads at once, then every 2.5 s, reporting queued, fetching and calculating in order", async () => {
    const { events, readAt } = follow({ read: ["queued", "fetching", "calculating"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(kinds(events)).toEqual(["queued"]);
    await vi.advanceTimersByTimeAsync(2499);
    expect(readAt).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);
    expect(readAt).toEqual([0, 2500, 5000, 7500]);
    expect(kinds(events)).toEqual(["queued", "fetching", "calculating"]);
  });

  it("[K1][K4] completed reports the snapshot once and makes no further read", async () => {
    const { events, readAt } = follow({ read: ["queued", "completed"] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual([{ kind: "progress", progress: "queued" }, { kind: "completed", snapshot: completedSnapshotFixture }]);
    expect(readAt).toEqual([0, 2500]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[K3] a resolved failed (jobFixtures.failed) reports failed once and makes no further read", async () => {
    const { events, readAt } = follow({ read: ["failed"] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual([{ kind: "failed", failure: jobFixtures.failed.failure }]);
    expect(readAt).toEqual([0]);
  });

  it("[K6] a rejection with retryable false (PlannerServiceError not_found, as the HTTP client sends on 404) ends as failed with that failure", async () => {
    const { events, readAt } = follow({ read: ["queued", { reject: new PlannerServiceError(expired) }] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual([{ kind: "progress", progress: "queued" }, { kind: "failed", failure: expired }]);
    expect(readAt).toEqual([0, 2500]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[K6] a retryable rejection backs off 2.5, 5, 10, 20 s and never ends the wait on its own", async () => {
    const { events, readAt } = follow({ read: [{ reject: outage }] });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(readAt.slice(0, 7)).toEqual([0, 2500, 7500, 17_500, 37_500, 57_500, 77_500]);
    expect(events).toEqual([{ kind: "reachable", reachable: false }]);
  });

  it("[K6] three retryable rejections in a row report reachable false; the next good read reports reachable true", async () => {
    const { events } = follow({ read: [{ reject: outage }, { reject: outage }, "queued", { reject: outage }, { reject: outage }, { reject: outage }, "fetching"] });
    await vi.advanceTimersByTimeAsync(7500);
    expect(kinds(events)).toEqual(["queued"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(kinds(events)).toEqual(["queued", "reachable false", "reachable true", "fetching"]);
  });

  it("[K6] a rate_limited rejection waits 60 s before the next read", async () => {
    const { readAt, events } = follow({ read: [{ reject: limited }, "queued"] });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(readAt).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(readAt).toEqual([0, 60_000]);
    expect(kinds(events)).toEqual(["queued"]);
  });

  it("[K6] five rejections with no ServiceFailure (a ZodError) in a row end as failed with unreadable", async () => {
    const { events, readAt } = follow({ read: [{ reject: zodError }] });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(readAt).toHaveLength(policy.poll.unknownStrikes);
    expect(events).toEqual([{ kind: "failed", failure: unreadable }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[K6] unreadable answers that alternate with outages are never five in a row, so the wait goes on", async () => {
    const mixed = Array.from({ length: 12 }, (_, n) => (n % 2 === 0 ? { reject: zodError } : { reject: outage }));
    const { events, readAt } = follow({ read: [...mixed, "fetching"] });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(readAt.length).toBeGreaterThan(mixed.length);
    expect(events.filter(event => event.kind === "failed")).toEqual([]);
    expect(kinds(events).at(-1)).toBe("fetching");
  });

  it("[K6] outages that alternate with unreadable answers are never three in a row, so Making never says it cannot reach the service", async () => {
    const mixed = Array.from({ length: 8 }, (_, n) => (n % 2 === 0 ? { reject: outage } : { reject: zodError }));
    const { events } = follow({ read: [...mixed, "fetching"] });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(kinds(events)).toEqual(["fetching"]);
  });

  it("a read that never settles is cut after 20 s and counts as retryable", async () => {
    const { events, readAt } = follow({ read: ["hang", "queued"] });
    await vi.advanceTimersByTimeAsync(policy.timeoutMs.read - 1);
    expect(readAt).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1 + policy.poll.backoffMs[0]);
    expect(readAt).toEqual([0, policy.timeoutMs.read + policy.poll.backoffMs[0]]);
    expect(kinds(events)).toEqual(["queued"]);
  });

  it("[K3] stop() before the first read makes no read; stop() during a read drops its answer; stop() twice is safe", async () => {
    const early = follow({ read: ["queued"] });
    early.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(early.readAt).toEqual([]);

    let answer: (state: JobState) => void = () => undefined;
    const events: JobEvent[] = [];
    const stop = watchJob({ read: () => new Promise<JobState>(resolve => { answer = resolve; }) }, capability, event => events.push(event));
    await vi.advanceTimersByTimeAsync(0);
    stop();
    answer(jobFixtures.completed);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual([]);
    expect(() => stop()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never more than one read in flight, and no timer left after a terminal event or stop", async () => {
    let inFlight = 0;
    let most = 0;
    const states: JobState[] = [jobFixtures.queued, jobFixtures.fetching, jobFixtures.calculating, jobFixtures.completed];
    const slow: Pick<PlannerClient, "read"> = {
      read: () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        const state = states.shift() ?? jobFixtures.completed;
        return new Promise<JobState>(resolve => setTimeout(() => {
          inFlight -= 1;
          resolve(state);
        }, 4000));
      },
    };
    const events: JobEvent[] = [];
    watchJob(slow, capability, event => events.push(event));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(most).toBe(1);
    expect(events.at(-1)?.kind).toBe("completed");
    expect(vi.getTimerCount()).toBe(0);

    const hanging = follow({ read: ["hang"] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBe(1);
    hanging.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("[A10] the capability token never appears in any console call (console spied)", async () => {
    const calls: unknown[][] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    }
    follow({ read: [{ reject: outage }, { reject: zodError }, "queued", { reject: serviceError(limited) }, "completed"] });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const printed = calls.map(args => args.map(String).join(" ")).join("\n");
    expect(printed).not.toContain(capability.token);
    expect(calls).toEqual([]);
  });
});

describe("pure parts", () => {
  it("classifyReadError: PlannerServiceError-like with retryable false is terminal, with retryable true is retryable, a ZodError is unknown", () => {
    expect(classifyReadError(new PlannerServiceError(expired))).toEqual({ kind: "terminal", failure: expired });
    expect(classifyReadError(new PlannerServiceError(outage))).toEqual({ kind: "retryable", failure: outage });
    expect(classifyReadError(serviceError(limited))).toEqual({ kind: "retryable", failure: limited });
    expect(classifyReadError(new NoAnswerError())).toMatchObject({ kind: "retryable", failure: { code: "temporarily_unavailable" } });
    expect(classifyReadError(zodError)).toEqual({ kind: "unknown" });
    expect(classifyReadError({ failure: { code: "made_up", message: "x", retryable: false } })).toEqual({ kind: "unknown" });
    expect(classifyReadError("offline")).toEqual({ kind: "unknown" });
  });

  it("pollDelay table: 0 failures 2500; 1 to 4 failures 2500, 5000, 10000, 20000; 9 failures 20000; rate_limited 60000", () => {
    const retryable = { kind: "retryable", failure: outage } as const;
    expect(pollDelay({ failuresInARow: 0, last: null })).toBe(2500);
    expect([1, 2, 3, 4, 9].map(failuresInARow => pollDelay({ failuresInARow, last: retryable }))).toEqual([2500, 5000, 10_000, 20_000, 20_000]);
    expect(pollDelay({ failuresInARow: 1, last: { kind: "retryable", failure: limited } })).toBe(60_000);
  });

  it("withTimeout settles with the promise when it wins and clears its timer", async () => {
    const won = withTimeout(() => Promise.resolve("read"), 1000);
    await expect(won).resolves.toBe("read");
    expect(vi.getTimerCount()).toBe(0);

    const lost = withTimeout(() => new Promise(() => undefined), 1000);
    const caught = lost.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await caught).toBeInstanceOf(NoAnswerError);
    expect(vi.getTimerCount()).toBe(0);
  });
});
