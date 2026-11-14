// Following one plan request until it ends. No React. Plain timers, so fake timers test it.
//
// The two clients F1 meets fail differently, and both are handled here and nowhere else:
//  - The HTTP client's read() REJECTS on every non-200 with PlannerServiceError(failure) (src/client/planner.ts:58-62).
//    An expired job (404, not_found, retryable false) arrives as a rejection. A malformed 200 throws a plain ZodError
//    with no failure. A network error rejects with temporarily_unavailable, retryable true (planner.ts:22, :36).
//  - The fixture client RESOLVES { state: "failed", failure: not_found } for an unknown job
//    (src/fixtures/client.ts:15-19) and returns one fixed state forever after submit (client.ts:20).
//
// Rules (graft from candidate 3 on rules 3 to 5):
//  1. Read at once, then every policy.poll.everyMs while queued, fetching or calculating. Report each state.
//  2. completed -> completed(snapshot). failed -> failed(failure). Then stop: no read after a terminal state.
//  3. A rejection whose failure has retryable === false ends the wait as failed(failure) (known issue 22).
//  4. A retryable rejection, or a read slower than policy.timeoutMs.read, backs off along pollDelay and never ends
//     the wait on its own. After policy.poll.unreachableAfter in a row, report reachable(false). The farmer can Cancel.
//  5. A rejection with no ServiceFailure ends the wait after policy.poll.unknownStrikes in a row, as `unreadable`.
//  6. stop() is idempotent. After stop() no callback runs, even for a read already in flight. Never more than one read
//     in flight. No timer is left running after a terminal event or stop (the prototype's abort timers leaked).
//  7. The capability never appears in a log, a URL or the DOM (spec.md:421, AGENTS.md:65).
import { serviceFailureSchema } from "@/contracts";
import type { CompletedSnapshot, JobCapability, PlannerClient, ServiceFailure } from "@/contracts";
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
  throw new Error("not implemented");
  // TODO: tick() = withTimeout(client.read(capability), policy.timeoutMs.read) -> resolved state or classifyReadError;
  //       schedule the next tick with pollDelay; first tick with setTimeout(0) so cleanup can cancel it before it starts.
}

/** The ServiceFailure a thrown value carries, parsed with the contract schema. Null for anything else (a ZodError). */
export function failureOf(error: unknown): ServiceFailure | null {
  const candidate = typeof error === "object" && error !== null && "failure" in error ? error.failure : null;
  const parsed = serviceFailureSchema.safeParse(candidate);
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

/** Settle with `promise`, or reject with `unreachable` after `ms`. Clears its own timer either way. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  throw new Error("not implemented");
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
