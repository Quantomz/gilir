// Every number F1 chooses for itself, in one place (graft from candidate 3).
// None of them is a contract rule. Contract limits (12 crops, 64 entries, 65536 bytes) come from `inputLimits`
// in "@/contracts" and are never restated here.

/** The polling schedule, as a type so job tests can pass a short one. */
export interface PollTiming {
  readonly everyMs: number;
  readonly backoffMs: readonly number[];
  readonly rateLimitedMs: number;
  readonly unreachableAfter: number;
  readonly unknownStrikes: number;
}

export const policy = {
  history: {
    /** The repo catalogue has no season lengths (src/contracts/registry.ts:7-13), so a new bar is 90 days (prototype fallback). */
    newCropDays: 90,
    /** A new crop goes into a gap shorter than its length only when the gap has at least this many days. */
    minimumFitDays: 7,
    /** A typed crop name is 1 to 80 letters. The contract allows 240 (src/contracts/common.ts:5). 80 is a reading choice. */
    nameMaxChars: 80,
    /** Pointer travel under this many CSS px is a tap, not a drag. */
    dragThresholdPx: 5,
  },
  save: {
    /** Draft edits are written this long after the last change. Step, job and completion writes go at once. */
    debounceMs: 150,
  },
  timeoutMs: {
    /** The HTTP client has no timeout or abort signal (src/client/planner.ts:34-37), so F1 races each call. */
    catalogue: 15_000,
    submit: 45_000,
    read: 20_000,
  },
  poll: {
    /** One farmer makes 24 reads a minute. The server allows 600 a minute for everyone (src/server/jobs/http.ts:93-94). */
    everyMs: 2_500,
    /** Waits after 1, 2, 3 and 4 or more retryable read failures in a row. */
    backoffMs: [2_500, 5_000, 10_000, 20_000],
    /** The server sends Retry-After: 60 with rate_limited (src/server/jobs/http.ts:96). The client does not expose it. */
    rateLimitedMs: 60_000,
    /** Making says it keeps trying after this many retryable failures in a row. Retryable failures never end the wait. */
    unreachableAfter: 3,
    /** Reads that fail with no ServiceFailure (a malformed 200 body) end the wait after this many in a row. */
    unknownStrikes: 5,
  },
  toast: { plainMs: 7_000, undoMs: 15_000 },
} as const;
