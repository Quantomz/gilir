import { openDB } from "idb";
import type { DBSchema, IDBPDatabase, IDBPTransaction } from "idb";
import type { z } from "zod";
import { farmInputSchema, farmInputSchemaVersion } from "@/contracts/input";
import type { FarmInput } from "@/contracts/input";
import { jobCapabilitySchema } from "@/contracts/jobs";
import type { JobCapability } from "@/contracts/jobs";
import { completedSnapshotSchema, runManifestSchema } from "@/contracts/result";
import type { CompletedSnapshot } from "@/contracts/result";

export interface LocalState {
  readonly draft: Partial<FarmInput> | null;
  readonly step: number;
  readonly activeJob: JobCapability | null;
  readonly snapshot: CompletedSnapshot | null;
}
export interface LocalPlans {
  load(): Promise<LocalState | null>;
  save(state: LocalState): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The farmer's state in this browser. Pages under /dev/ use a separate database, so fixture data never meets a
 * farmer's. A rejection means this device can't do it now; null means nothing is saved. Every call settles within
 * CALL_LIMIT_MS, and a rejected call changes nothing.
 *  load:  the readable state, or null when nothing readable is saved. A part this version can't read is moved, exactly
 *         as found, to a set-aside record that readStorageNotice describes. On a full device that move waits for the
 *         next save, and load still resolves. Rejects "unavailable" or "newer"; unreadable parts are never a reason.
 *  save:  replaces the whole state, so load first. A part of the old state this version can't read is set aside
 *         first. Rejects "unavailable", "full" (the previous state stays) or "newer".
 *  clear: removes the state and everything set aside. Rejects "newer" rather than delete what a later build wrote.
 *         Sends no request: deleting the server job is the caller's job.
 */
export const localPlans: LocalPlans = {
  load: () => started(onShelf(loadTurn)),
  save: state => started(onShelf(stored => saveTurn(stored, state))),
  clear: () => started(onShelf(clearTurn)),
};

let lastCall: Promise<unknown> = Promise.resolve();

function started<T>(call: Promise<T>): Promise<T> {
  lastCall = call.catch(() => undefined);
  return call;
}

/** Why a storage call rejected: the three things a farmer can act on. */
export type StorageReason = "unavailable" | "full" | "newer";

/**
 * The reason and the farmer's words for anything a storage call rejected with. Total: a test double's plain Error or
 * a raw `new DOMException("", "QuotaExceededError")` reads by its name, and anything unknown reads as "unavailable",
 * the reason that never invites a write.
 */
export function storageProblem(error: unknown): { readonly reason: StorageReason; readonly text: string } {
  const reason = error instanceof StorageFailure ? error.reason : reasonOf(error);
  return { reason, text: problemWords[reason] };
}

/** Saved data this version left out, in the farmer's words, with the one action that may remove it. */
export interface StorageNotice {
  readonly text: string;
  /**
   * Removes the set-aside findings this notice showed, and only those. Never rejects; on failure the notice shows again
   * later. A part still in the saved state can't be removed here, so it shows again until a save or load sets it aside.
   */
  dismiss(): Promise<void>;
}

/**
 * What was set aside on this shelf and not yet dismissed, and any part of the saved state this version can't read that
 * a full device kept from being set aside, or null. It first waits for a localPlans call started on this page in the
 * same tick or earlier, so it names what that load found whichever was called first. Reads only, so React Strict Mode's
 * second effect sees the same notice. Never rejects: a shelf that can't be read has nothing to tell, and `load` already
 * said why.
 */
export async function readStorageNotice(): Promise<StorageNotice | null> {
  await null;
  await lastCall;
  const { setAside, inState } = await onShelf(noticeTurn).catch((): Noticed => ({ setAside: [], inState: null }));
  const finds = inState === null ? setAside : [...setAside, inState];
  if (finds.length === 0) return null;
  return {
    text: noticeText(finds),
    dismiss: () => onShelf(stored => dismissTurn(stored, setAside.length)).catch(() => undefined),
  };
}

/** Raising it sends versionchange to every open tab, and an older page then fails to open with VersionError. */
const DATABASE_VERSION = 1;
const RECORD_VERSION = 1;
/**
 * The contracts kept schemaVersion 1 while they added required fields (docs/contracts.md), so a restored value is
 * parsed, never trusted by its version. Only a value above these marks data from a newer build. Every record carries
 * its writer's versions: F1's drafts hold no schemaVersion, and reading a draft drops answer keys it doesn't know.
 */
const CONTRACTS = {
  input: farmInputSchemaVersion,
  snapshot: Math.max(...completedSnapshotSchema.unwrap().options.map(schema => schema.shape.schemaVersion.value)),
  manifest: Math.max(...runManifestSchema.unwrap().options.map(schema => schema.shape.schemaVersion.value)),
} as const;

type Contract = keyof typeof CONTRACTS;

const versionsInState: { readonly [C in Contract]: readonly (readonly string[])[] } = {
  input: [["draft", "schemaVersion"], ["snapshot", "input", "schemaVersion"]],
  snapshot: [["snapshot", "schemaVersion"]],
  manifest: [["snapshot", "result", "details", "provenance", "manifest", "value", "schemaVersion"]],
};
const contractNames = Object.keys(CONTRACTS) as Contract[];
const CALL_LIMIT_MS = 5_000;
const STORE = "records";
const LAST_STEP = 4;

type Key = "state" | "set-aside";

interface ShelfSchema extends DBSchema {
  records: { key: Key; value: unknown };
}

interface StateRecord {
  readonly format: "gilir.local-state";
  readonly version: typeof RECORD_VERSION;
  readonly contracts: typeof CONTRACTS;
  readonly state: LocalState;
}

type DraftKey = Exclude<keyof FarmInput, "schemaVersion">;

type LeftOut = "record" | "draft" | `draft.${DraftKey}` | "activeJob" | "snapshot";

interface Find {
  readonly parts: readonly [LeftOut, ...LeftOut[]];
  readonly answersKept: boolean;
  readonly raw: unknown;
}

interface SetAsideRecord {
  readonly format: "gilir.set-aside";
  readonly version: typeof RECORD_VERSION;
  readonly contracts: typeof CONTRACTS;
  readonly finds: readonly Find[];
}

interface Stored {
  readonly state: unknown;
  readonly setAside: unknown;
}

function readHeader(raw: unknown): "empty" | "ours" | "newer" | "foreign" {
  if (raw === undefined) return "empty";
  if (!isObject(raw) || raw.format !== "gilir.local-state") return "foreign";
  if (isAbove(raw.version, RECORD_VERSION)) return "newer";
  if (raw.version !== RECORD_VERSION) return "foreign";
  const newer = stampedNewer(raw)
    || contractNames.some(contract => versionsInState[contract].some(path => isAbove(at(raw.state, path), CONTRACTS[contract])));
  return newer ? "newer" : "ours";
}

function stampedNewer(record: Record<string, unknown>): boolean {
  return contractNames.some(contract => isAbove(at(record.contracts, [contract]), CONTRACTS[contract]));
}

function at(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((part, key) => (isObject(part) ? part[key] : undefined), value);
}

type Reading =
  | { readonly kind: "empty" }
  | { readonly kind: "newer" }
  | { readonly kind: "read"; readonly state: LocalState | null; readonly leftOut: readonly LeftOut[] };

function readRecord(raw: unknown): Reading {
  const header = readHeader(raw);
  if (header === "empty" || header === "newer") return { kind: header };
  if (header === "foreign" || !isObject(raw) || !isObject(raw.state)) return { kind: "read", state: null, leftOut: ["record"] };
  const draft = readPart.draft(raw.state.draft);
  const step = readPart.step(raw.state.step);
  const activeJob = readPart.activeJob(raw.state.activeJob);
  const snapshot = readPart.snapshot(raw.state.snapshot);
  const state: LocalState = { draft: draft.value, step: step.value, activeJob: activeJob.value, snapshot: snapshot.value };
  const leftOut = [...draft.leftOut, ...step.leftOut, ...activeJob.leftOut, ...snapshot.leftOut];
  const nothingLeft = leftOut.length > 0 && !hasAnswer(state.draft) && state.activeJob === null && state.snapshot === null;
  return { kind: "read", state: nothingLeft ? null : state, leftOut };
}

interface PartReading<T> {
  readonly value: T;
  readonly leftOut: readonly LeftOut[];
}

const draftShape = farmInputSchema.unwrap().shape;
const draftKeys = Object.keys(draftShape).filter((key): key is DraftKey => key !== "schemaVersion");

const readPart: { readonly [K in keyof LocalState]: (raw: unknown) => PartReading<LocalState[K]> } = {
  // Each answer is parsed alone because zod's .partial() throws on a schema with refinements.
  draft: raw => {
    if (raw === null || raw === undefined) return { value: null, leftOut: [] };
    if (!isObject(raw) || (raw.schemaVersion !== undefined && !draftShape.schemaVersion.safeParse(raw.schemaVersion).success)) {
      return { value: null, leftOut: ["draft"] };
    }
    const answers: Record<string, unknown> = raw.schemaVersion === undefined ? {} : { schemaVersion: raw.schemaVersion };
    const leftOut: LeftOut[] = [];
    for (const key of draftKeys) {
      if (raw[key] === undefined) continue;
      const parsed = draftShape[key].safeParse(raw[key]);
      if (parsed.success) answers[key] = parsed.data;
      else leftOut.push(`draft.${key}`);
    }
    const draft = answers as Partial<FarmInput>;
    return { value: leftOut.length > 0 && !hasAnswer(draft) ? null : draft, leftOut };
  },
  step: raw => ({
    value: typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= LAST_STEP ? raw : 1,
    leftOut: [],
  }),
  activeJob: nullablePart(jobCapabilitySchema, "activeJob"),
  snapshot: nullablePart(completedSnapshotSchema, "snapshot"),
};

function nullablePart<T>(schema: z.ZodType<T>, part: LeftOut): (raw: unknown) => PartReading<T | null> {
  return raw => {
    if (raw === null || raw === undefined) return { value: null, leftOut: [] };
    const parsed = schema.safeParse(raw);
    return parsed.success ? { value: parsed.data, leftOut: [] } : { value: null, leftOut: [part] };
  };
}

function hasAnswer(draft: Partial<FarmInput> | null): boolean {
  return draft !== null && draftKeys.some(key => draft[key] !== undefined);
}

function readFinds(raw: unknown): readonly Find[] | "newer" {
  if (raw === undefined) return [];
  if (isObject(raw) && raw.format === "gilir.set-aside") {
    if (isAbove(raw.version, RECORD_VERSION) || stampedNewer(raw)) return "newer";
    if (raw.version === RECORD_VERSION && Array.isArray(raw.finds) && raw.finds.every(isFind)) return raw.finds;
  }
  return [{ parts: ["record"], answersKept: false, raw }];
}

const leftOutParts: ReadonlySet<unknown> = new Set<LeftOut>([
  "record", "draft", "activeJob", "snapshot", ...draftKeys.map(key => `draft.${key}` as const),
]);

function isFind(value: unknown): value is Find {
  return isObject(value) && Array.isArray(value.parts) && value.parts.length > 0
    && value.parts.every(part => leftOutParts.has(part)) && typeof value.answersKept === "boolean" && "raw" in value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbove(version: unknown, ours: number): boolean {
  return typeof version === "number" && version > ours;
}

interface Turn<T> {
  readonly outcome: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: StorageReason };
  readonly state: "keep" | "delete" | StateRecord;
  readonly setAside: "keep" | "delete" | SetAsideRecord;
  readonly writesOptional?: true;
}

function loadTurn(stored: Stored): Turn<LocalState | null> {
  const reading = readRecord(stored.state);
  const finds = readFinds(stored.setAside);
  if (reading.kind === "newer" || finds === "newer") return refused("newer");
  if (reading.kind === "empty") return settled(null);
  const find = findIn(reading, stored.state, reading.state);
  if (find === null) return settled(reading.state);
  return {
    outcome: { ok: true, value: reading.state },
    state: reading.state === null ? "delete" : stateRecord(reading.state),
    setAside: setAsideRecord([...finds, find]),
    writesOptional: true,
  };
}

function saveTurn(stored: Stored, next: LocalState): Turn<void> {
  const reading = readRecord(stored.state);
  const finds = readFinds(stored.setAside);
  if (reading.kind === "newer" || finds === "newer") return refused("newer");
  const find = reading.kind === "read" ? findIn(reading, stored.state, next) : null;
  return { outcome: { ok: true, value: undefined }, state: stateRecord(next), setAside: find === null ? "keep" : setAsideRecord([...finds, find]) };
}

function findIn(reading: Extract<Reading, { kind: "read" }>, raw: unknown, resulting: LocalState | null): Find | null {
  const [first, ...rest] = reading.leftOut;
  return first === undefined ? null : { parts: [first, ...rest], answersKept: hasAnswer(resulting?.draft ?? null), raw };
}

function clearTurn(stored: Stored): Turn<void> {
  if (holdsNewer(stored)) return refused("newer");
  return { outcome: { ok: true, value: undefined }, state: "delete", setAside: "delete" };
}

interface Noticed {
  readonly setAside: readonly Find[];
  readonly inState: Find | null;
}

function noticeTurn(stored: Stored): Turn<Noticed> {
  const reading = readRecord(stored.state);
  const finds = readFinds(stored.setAside);
  if (reading.kind === "newer" || finds === "newer") return settled({ setAside: [], inState: null });
  return settled({ setAside: finds, inState: reading.kind === "read" ? findIn(reading, stored.state, reading.state) : null });
}

function dismissTurn(stored: Stored, shownCount: number): Turn<void> {
  const finds = readFinds(stored.setAside);
  if (finds === "newer" || readHeader(stored.state) === "newer") return refused("newer");
  const unseen = finds.slice(shownCount);
  return { outcome: { ok: true, value: undefined }, state: "keep", setAside: unseen.length === 0 ? "delete" : setAsideRecord(unseen) };
}

function holdsNewer(stored: Stored): boolean {
  return readHeader(stored.state) === "newer" || readFinds(stored.setAside) === "newer";
}

function settled<T>(value: T): Turn<T> {
  return { outcome: { ok: true, value }, state: "keep", setAside: "keep" };
}

function refused(reason: StorageReason): Turn<never> {
  return { outcome: { ok: false, reason }, state: "keep", setAside: "keep" };
}

function stateRecord({ draft, step, activeJob, snapshot }: LocalState): StateRecord {
  return { format: "gilir.local-state", version: RECORD_VERSION, contracts: CONTRACTS, state: { draft, step, activeJob, snapshot } };
}

function setAsideRecord(finds: readonly Find[]): SetAsideRecord {
  return { format: "gilir.set-aside", version: RECORD_VERSION, contracts: CONTRACTS, finds };
}

type ShelfName = "gilir" | "gilir-fixture-lab";

function shelfHere(): ShelfName {
  return globalThis.location?.pathname.startsWith("/dev/") ? "gilir-fixture-lab" : "gilir";
}

class StorageFailure extends Error {
  constructor(readonly reason: StorageReason, readonly browserError: string | null) {
    super(`Local storage failed: ${reason}${browserError ? ` (${browserError})` : ""}.`);
    this.name = "StorageFailure";
  }
}

function reasonOf(error: unknown): StorageReason {
  switch (nameOf(error)) {
    case "QuotaExceededError": return "full";
    case "VersionError": return "newer";
    default: return "unavailable";
  }
}

function nameOf(error: unknown): string | null {
  return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : null;
}

type Connection = IDBPDatabase<ShelfSchema>;
type Transaction = IDBPTransaction<ShelfSchema, [typeof STORE], "readwrite">;

const connections = new Map<ShelfName, Promise<Connection>>();

/**
 * Closing on `blocking` lets a newer tab's upgrade go ahead instead of waiting on this page. openDB throws synchronously
 * with no indexedDB or in an opaque origin, so it runs inside a promise.
 */
function connect(shelf: ShelfName): Promise<Connection> {
  const cached = connections.get(shelf);
  if (cached !== undefined) return cached;
  const opening = new Promise<Connection>((resolve, reject) => {
    openDB<ShelfSchema>(shelf, DATABASE_VERSION, {
      upgrade: database => { database.createObjectStore(STORE); },
      blocking: () => drop(shelf, opening),
      terminated: () => drop(shelf, opening),
    }).then(resolve, reject);
  });
  connections.set(shelf, opening);
  return opening;
}

function drop(shelf: ShelfName, opening: Promise<Connection>): void {
  if (connections.get(shelf) === opening) connections.delete(shelf);
  opening.then(database => database.close(), () => undefined);
}

function abandon(transaction: Transaction): void {
  transaction.done.catch(() => undefined);
  try {
    transaction.abort();
  } catch {
    // abort() throws InvalidStateError when the transaction has already finished.
  }
}

/** Nothing but the gets is awaited before the writes, or IndexedDB would commit the transaction early. */
async function onShelf<T>(turn: (stored: Stored) => Turn<T>): Promise<T> {
  const shelf = shelfHere();
  let expired = false;
  let opening: Promise<Connection> | null = null;
  let transaction: Transaction | null = null;
  const stop = () => {
    if (transaction !== null) abandon(transaction);
    if (opening !== null) drop(shelf, opening);
  };
  const attempt = async (): Promise<Turn<T>> => {
    transaction = null;
    opening = connect(shelf);
    try {
      const database = await opening;
      if (expired) throw timedOut();
      const running: Transaction = database.transaction(STORE, "readwrite");
      transaction = running;
      const { store } = running;
      const [state, setAside] = await Promise.all([store.get("state"), store.get("set-aside")]);
      const decided = turn({ state, setAside });
      const write = (key: Key, change: "keep" | "delete" | object) =>
        change === "keep" ? undefined : change === "delete" ? store.delete(key) : store.put(change, key);
      try {
        await Promise.all([write("state", decided.state), write("set-aside", decided.setAside), running.done]);
      } catch (error) {
        if (!decided.writesOptional || nameOf(error) !== "QuotaExceededError") throw error;
        abandon(running);
      }
      return decided;
    } catch (error) {
      stop();
      throw error;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      stop();
      reject(timedOut());
    }, CALL_LIMIT_MS);
  });
  const work = attempt().catch((error: unknown) => {
    if (expired || !connectionDied.has(nameOf(error) ?? "")) throw error;
    return attempt();
  });
  try {
    const { outcome } = await Promise.race([work, limit]);
    if (!outcome.ok) throw new StorageFailure(outcome.reason, null);
    return outcome.value;
  } catch (error) {
    throw error instanceof StorageFailure ? error : new StorageFailure(reasonOf(error), nameOf(error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * InvalidStateError: the connection was already closed. AbortError: Chromium aborts the transaction when site data is
 * cleared while the page is open, before the connection's close event arrives.
 */
const connectionDied: ReadonlySet<string> = new Set(["InvalidStateError", "AbortError"]);

function timedOut(): StorageFailure {
  return new StorageFailure("unavailable", "TimeoutError");
}

const problemWords: Record<StorageReason, string> = {
  unavailable: "This browser isn’t letting Gilir open or save your answers on this device.",
  full: "This device has no room left to save Gilir.",
  newer: "Gilir has a newer version. Close this page and open Gilir again to see what you saved.",
};

const leftOutWords = {
  record: "Your saved answers couldn’t be read, so Gilir starts again from the beginning.",
  snapshot: "Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it.",
  activeJob: "The plan that was being made can’t be followed any more. Make the plan again.",
  draft: "Your saved answers don’t match this version of Gilir, so they were left out.",
  someAnswers: (names: string) => `Some saved answers don’t match this version and were left out: ${names}. Please check your answers.`,
  answersKept: "Your answers are kept.",
} as const;

const answerNames: Record<DraftKey, string> = {
  field: "your field",
  cropPurposeIds: "your crops",
  water: "your water answer",
  planningStart: "the day your field is ready",
  history: "what you told us about last year",
};

function noticeText(finds: readonly Find[]): string {
  const parts = new Set(finds.flatMap(find => find.parts));
  if (parts.has("record")) return leftOutWords.record;
  const answers = draftKeys.filter(key => parts.has(`draft.${key}`)).map(key => answerNames[key]);
  const aboutAnswers = parts.has("draft") ? leftOutWords.draft
    : answers.length > 0 ? leftOutWords.someAnswers(list(answers))
    : finds.some(find => find.answersKept) ? leftOutWords.answersKept
    : null;
  return [
    parts.has("snapshot") ? leftOutWords.snapshot : null,
    parts.has("activeJob") ? leftOutWords.activeJob : null,
    aboutAnswers,
  ].filter(sentence => sentence !== null).join(" ");
}

function list(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
