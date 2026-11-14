import type { IsoDate } from "@/contracts/common";
import type { ClimateCache, ClimateCacheKey, ClimateSnapshot, EngineSettings } from "@/contracts/climate";
import type { FarmInput } from "@/contracts/input";
import type { ClimatePreparation } from "@/contracts/jobs";
import { historicalPeriod } from "./dates";
import { cacheProductVersion, nativeCell, products, sourceUrl } from "./products";
import { ClimateProviderError, normalizePowerResponse, sha256 } from "./power";

export { historicalPeriod, maximumPermittedLookbackDays } from "./dates";

export interface PrepareClimateInput {
  readonly input: FarmInput;
  readonly cutoff: IsoDate;
  readonly settings: EngineSettings;
  readonly cache: ClimateCache;
}

interface ProviderDependencies {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly onResponse?: (response: { readonly url: string; readonly text: string; readonly retrievedAt: string; readonly productId: string }) => Promise<void>;
}

export function createMemoryClimateCache(): ClimateCache {
  const entries = new Map<string, ClimateSnapshot>();
  return {
    async read(key) { return entries.get(JSON.stringify(key)) ?? null; },
    async put(key, snapshot) { entries.set(JSON.stringify(key), snapshot); },
  };
}

export function createPrepareClimate(dependencies: ProviderDependencies = {}) {
  const request = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const inFlight = new WeakMap<ClimateCache, Map<string, Promise<ClimateSnapshot>>>();
  let requestQueue = Promise.resolve();

  async function fetchText(url: string): Promise<string> {
    let release = () => {};
    const previous = requestQueue;
    requestQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        let response: Response;
        let content = "";
        try {
          response = await request(url, { signal: AbortSignal.timeout(60_000), headers: { Accept: "application/json" } });
          if (response.ok) content = await response.text();
        }
        catch {
          if (attempt === 2) throw new ClimateProviderError("NASA POWER could not be reached after three bounded attempts.", true);
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        if (response.ok) {
          if (content.length > 20_000_000) throw new ClimateProviderError("NASA POWER response exceeds the supported data size.", false);
          return content;
        }
        const retryable = response.status === 429 || response.status >= 500;
        await response.body?.cancel();
        if (!retryable || attempt === 2) throw new ClimateProviderError(`NASA POWER returned HTTP ${response.status}.`, retryable);
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        await sleep(Math.min(10_000, Math.max(1_000 * 2 ** attempt, Number.isFinite(seconds) ? seconds * 1_000 : 0)));
      }
      throw new ClimateProviderError("NASA POWER retry limit was reached.", true);
    } finally { release(); }
  }

  return async function prepareClimate(args: PrepareClimateInput): Promise<ClimatePreparation> {
    const period = historicalPeriod(args.input.planningStart, args.cutoff, args.settings);
    const snapshots: ClimateSnapshot[] = [];
    let unavailable = false;
    for (const product of products) {
      const cell = nativeCell(product, ...args.input.field.lookup);
      const key: ClimateCacheKey = {
        provider: "NASA POWER", product: product.id, productVersion: cacheProductVersion,
        nativeCellId: cell.id, fields: product.fields.map(({ field }) => field),
        start: period.start, endExclusive: period.endExclusive, timeStandard: "UTC",
      };
      try {
        let snapshot = await args.cache.read(key);
        if (snapshot && (snapshot.kind !== "provider" || snapshot.products.length !== 1 || snapshot.products[0].cellId !== cell.id)) {
          throw new ClimateProviderError("The climate cache returned an incompatible or synthetic snapshot.", false);
        }
        if (!snapshot) {
          let requests = inFlight.get(args.cache);
          if (!requests) { requests = new Map(); inFlight.set(args.cache, requests); }
          const serialized = JSON.stringify(key);
          let pending = requests.get(serialized);
          if (!pending) {
            const url = sourceUrl(product, cell, key);
            pending = (async () => {
              const text = await fetchText(url);
              const retrievedAt = now().toISOString();
              await dependencies.onResponse?.({ url, text, retrievedAt, productId: product.id });
              const result = normalizePowerResponse({ text, product, cell, key, cutoff: args.cutoff, retrievedAt, url });
              await args.cache.put(key, result);
              return result;
            })();
            requests.set(serialized, pending);
          }
          try { snapshot = await pending; }
          finally { requests.delete(serialized); }
        }
        if (snapshot.cutoff !== args.cutoff) {
          snapshot = { ...snapshot, cutoff: args.cutoff, id: `power-${sha256(JSON.stringify({ key, cutoff: args.cutoff, contentHash: snapshot.contentHash, retrievedAt: snapshot.retrievedAt }))}` };
        }
        snapshots.push(snapshot);
        if (product.fields.some(({ field }) => !snapshot.days.some((day) => day[field].kind === "available"))) unavailable = true;
      } catch (error) {
        if (!(error instanceof ClimateProviderError)) throw error;
        return { kind: "failed", failure: { code: "retrieval_failed", message: error.message, retryable: error.retryable }, snapshots };
      }
    }
    return unavailable
      ? { kind: "unavailable", reason: "NASA POWER has no observations for at least one required field in the requested historical period.", snapshots }
      : { kind: "ready", snapshots };
  };
}

export const prepareClimate = createPrepareClimate();
