// Following one plan request until it ends. No React. Plain timers, so fake timers test it.
//
// The two clients F1 meets fail differently, and both are handled here and nowhere else:
//  - The HTTP client's read() REJECTS on every non-200 with a PlannerServiceError carrying a ServiceFailure. An
//    expired job (404, not_found, retryable false) arrives as a rejection. A malformed 200 throws a plain ZodError with
//    no failure. A network error rejects with temporarily_unavailable, retryable true.
//  - The fixture client RESOLVES { state: "failed", failure: not_found } for an unknown job, and returns one fixed
//    state forever after submit.
import { serviceFailureSchema } from "@/contracts";
import type { CompletedSnapshot, JobCapability, JobState, PlannerClient, ServiceFailure } from "@/contracts";
import { policy } from "../model/policy";
import type { PollTiming } from "../model/policy";
import type { Progress } from "../model/flow";

export type JobEvent =
  | { readonly kind: "progress"; readonly progress: Progress }
  | { readonly kind: "reachable"; readonly reachable: boolean }
  | { readonly kind: "completed"; readonly snapshot: CompletedSnapshot }
  | { readonly kind: "failed"; readonly failure: ServiceFailure };

export type ReadFailure =
  | { readonly kind: "terminal"; readonly failure: ServiceFailure }
  | { readonly kind: "retryable"; readonly failure: ServiceFailure }
  | { readonly kind: "unknown" };

/** Start following `capability`. Returns stop. Strict Mode safe: an effect that mounts twice starts, stops, starts. */
export function watchJob(
  client: Pick<PlannerClient, "read">,
  capability: JobCapability,
  onEvent: (event: JobEvent) => void,
  timing: PollTiming = policy.poll,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelRead: (() => void) | null = null;
  let reported: Progress | null = null;
  let reachable = true;
  let failuresInARow = 0;
  let unknownInARow = 0;

  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    cancelRead?.();
    timer = null;
    cancelRead = null;
  };
  const end = (event: JobEvent) => {
    onEvent(event);
    stop();
  };
  const later = (ms: number) => {
    timer = setTimeout(tick, ms);
  };
  const setReachable = (now: boolean) => {
    if (now === reachable) return;
    reachable = now;
    onEvent({ kind: "reachable", reachable: now });
  };

  const read = (state: JobState) => {
    failuresInARow = 0;
    unknownInARow = 0;
    setReachable(true);
    if (state.state === "completed") return end({ kind: "completed", snapshot: state.snapshot });
    if (state.state === "failed") return end({ kind: "failed", failure: state.failure });
    if (state.state !== reported) {
      reported = state.state;
      onEvent({ kind: "progress", progress: state.state });
    }
    later(timing.everyMs);
  };

  const fail = (error: unknown) => {
    const failure = classifyReadError(error);
    if (failure.kind === "terminal") return end({ kind: "failed", failure: failure.failure });
    failuresInARow += 1;
    unknownInARow = failure.kind === "unknown" ? unknownInARow + 1 : 0;
    if (unknownInARow >= timing.unknownStrikes) return end({ kind: "failed", failure: unreadable });
    // An answer that is not the planner's (a captive portal's page) also means the planner is out of reach.
    if (failuresInARow >= timing.unreachableAfter) setReachable(false);
    later(pollDelay({ failuresInARow, last: failure }, timing));
  };

  function tick() {
    timer = null;
    const race = raceTimeout(() => client.read(capability), policy.timeoutMs.read);
    cancelRead = race.cancel;
    race.promise.then(
      state => {
        cancelRead = null;
        if (!stopped) read(state);
      },
      error => {
        cancelRead = null;
        if (!stopped) fail(error);
      },
    );
  }

  // The first read waits one macrotask, so a Strict Mode cleanup can stop it before any request is made.
  later(0);
  return stop;
}

/** The ServiceFailure a thrown value carries, parsed with the contract schema. Null for anything else (a ZodError). */
export function failureOf(error: unknown): ServiceFailure | null {
  const carried = typeof error === "object" && error !== null && "failure" in error ? error.failure : null;
  const parsed = serviceFailureSchema.safeParse(carried);
  return parsed.success ? parsed.data : null;
}

/** A rejected read to a decision. Duck-typed, so it needs no import of the HTTP client's error class. */
export function classifyReadError(error: unknown): ReadFailure {
  const failure = failureOf(error);
  if (failure === null) return { kind: "unknown" };
  return failure.retryable ? { kind: "retryable", failure } : { kind: "terminal", failure };
}

/** Milliseconds to wait before the next read. Pure, so the whole schedule is one table test. */
export function pollDelay(
  state: { readonly failuresInARow: number; readonly last: ReadFailure | null },
  timing: PollTiming = policy.poll,
): number {
  if (state.last?.kind === "retryable" && state.last.failure.code === "rate_limited") return timing.rateLimitedMs;
  if (state.failuresInARow === 0) return timing.everyMs;
  const index = Math.min(state.failuresInARow, timing.backoffMs.length) - 1;
  return timing.backoffMs[index] ?? timing.everyMs;
}

/**
 * Settle with what `call` returns, or reject with an error carrying `unreachable` after `ms`. A client that throws
 * instead of rejecting becomes a rejection too. Clears its own timer either way.
 */
export function withTimeout<T>(call: () => Promise<T>, ms: number): Promise<T> {
  return raceTimeout(call, ms).promise;
}

/** Thrown when a call never answered: it carries `unreachable`, so classifyReadError calls it retryable. */
export class NoAnswerError extends Error {
  readonly failure = unreachable;
  constructor() {
    super(unreachable.message);
    this.name = "NoAnswerError";
  }
}

function raceTimeout<T>(call: () => Promise<T>, ms: number): { readonly promise: Promise<T>; readonly cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      reject(new NoAnswerError());
    }, ms);
  });
  return { promise: Promise.race([Promise.resolve().then(call), timeout]).finally(cancel), cancel };
}

/** A read or submit that never answered, or a client that threw with no failure. */
export const unreachable: ServiceFailure = {
  code: "temporarily_unavailable",
  message: "The planning service could not be reached. Try again shortly.",
  retryable: true,
};

/** Reads kept coming back in a shape the contract does not allow. */
export const unreadable: ServiceFailure = {
  code: "processing_failed",
  message: "The plan request could not be read.",
  retryable: false,
};
