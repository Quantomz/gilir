import { parseIsoDate } from "@/contracts/common";
import { farmInputSchema, inputLimits } from "@/contracts/input";
import type { LngLat } from "@/contracts/input";
import type { InputIssue, JobCapability, JobStore } from "@/contracts/jobs";
import type { RegistryRelease } from "@/contracts/registry";
import type { ServiceFailure } from "@/contracts/result";
import { readRegistryRelease } from "@/registry";
import { DatabaseNotConfiguredError, jobStore } from "./index";

interface PlanApiOptions {
  readonly store: JobStore;
  readonly readRegistry: () => RegistryRelease;
  readonly now?: () => Date;
  readonly requestsPerMinute?: number;
  readonly dataCutoff?: string;
}

const failure = (code: ServiceFailure["code"], message: string, retryable = false): ServiceFailure => ({ code, message, retryable });
const notFound = failure("not_found", "The job was not found.");
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const errorResponse = (error: ServiceFailure, status: number) => json({ error }, status);
const unavailable = (error: unknown) => error instanceof DatabaseNotConfiguredError
  ? failure("not_configured", "The planning database is not configured.")
  : failure("temporarily_unavailable", "The planning service is temporarily unavailable.", true);

function capabilityFor(request: Request, jobId: string): JobCapability | null {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 520) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization);
  return match ? { jobId, token: match[1] } : null;
}

function unsupportedGeometry(ring: readonly LngLat[]): boolean {
  const points: [number, number][] = [];
  for (const [lng, lat] of ring) {
    const previous = points.at(-1)?.[0] ?? lng;
    const x = lng + 360 * Math.round((previous - lng) / 360);
    if (Math.abs(x - previous) >= 180 || Math.abs(lat) === 90) return true;
    points.push([x, lat]);
  }
  if (points.at(-1)?.[0] !== points[0][0]) return true;
  const count = points.length - 1;
  const cross = (a: LngLat, b: LngLat, c: LngLat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: LngLat, b: LngLat, p: LngLat) => cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[i + 1], c = points[(i + 2) % count];
    if (a[0] === b[0] && a[1] === b[1]) return true;
    if (cross(a, b, c) === 0 && ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) > 0) return true;
    for (let j = i + 1; j < count; j++) {
      if (j === i + 1 || (i === 0 && j === count - 1)) continue;
      const c = points[j], d = points[j + 1];
      if (onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
        || (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)) return true;
    }
  }
  return false;
}

async function readBody(request: Request): Promise<{ kind: "body"; text: string } | { kind: "too_large" }> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > inputLimits.payloadBytes) return { kind: "too_large" };
  const reader = request.body?.getReader();
  if (!reader) return { kind: "body", text: "" };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > inputLimits.payloadBytes) {
        await reader.cancel();
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return { kind: "body", text: new TextDecoder("utf-8", { fatal: true }).decode(all) };
}

export function createPlanApi({ store, readRegistry, now = () => new Date(), requestsPerMinute = 60, dataCutoff }: PlanApiOptions) {
  let windowStart = -1;
  let submissions = 0;
  let reads = 0;
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const timestamp = now();
    const minute = Math.floor(timestamp.getTime() / 60000);
    if (windowStart !== minute) { windowStart = minute; submissions = 0; reads = 0; }
    const isSubmission = request.method === "POST" && url.pathname === "/api/plans";
    if (isSubmission ? ++submissions > requestsPerMinute : ++reads > requestsPerMinute * 10) {
      const response = errorResponse(failure("rate_limited", "The request limit was reached. Try again shortly.", true), 429);
      response.headers.set("Retry-After", "60");
      return response;
    }
    if (request.method === "GET" && url.pathname === "/api/catalogue") {
      try { return json(readRegistry().catalogue); }
      catch (error) { return errorResponse(unavailable(error), 503); }
    }
    if (isSubmission) {
      let raw: unknown;
      try {
        const body = await readBody(request);
        if (body.kind === "too_large") return errorResponse(failure("payload_too_large", "The request body exceeds the size limit."), 413);
        raw = JSON.parse(body.text);
      } catch {
        return json({ kind: "invalid", issues: [{ path: [], message: "Provide a valid UTF-8 JSON request body." }] }, 400);
      }
      const parsed = farmInputSchema.safeParse(raw);
      if (!parsed.success) return json({ kind: "invalid", issues: parsed.error.issues.map(issue => ({ path: issue.path, message: issue.message })) }, 400);
      if (unsupportedGeometry(parsed.data.field.ring)) return json({ kind: "invalid", issues: [{ path: ["field", "ring"], message: "Provide one simple field boundary without intersecting edges, pole crossings, or ambiguous half-world edges." }] }, 400);
      try {
        const registry = readRegistry();
        const ids = new Set(registry.catalogue.entries.map(entry => entry.id));
        const issues: InputIssue[] = parsed.data.cropPurposeIds.flatMap((id, index) => ids.has(id) ? [] : [{ path: ["cropPurposeIds", index], message: "Select a crop from the current catalogue." }]);
        if (issues.length) return json({ kind: "invalid", issues }, 400);
        const cutoff = parseIsoDate(dataCutoff ?? new Date(timestamp.getTime() - 86400000).toISOString().slice(0, 10));
        const capability = await store.create({ input: parsed.data, registry: registry.identity, cutoff, createdAt: timestamp.toISOString() });
        return json({ kind: "accepted", capability }, 202);
      } catch (error) { return json({ kind: "unavailable", failure: unavailable(error) }, 503); }
    }
    const match = /^\/api\/plans\/([^/]+)$/.exec(url.pathname);
    if (match && (request.method === "GET" || request.method === "DELETE")) {
      const capability = capabilityFor(request, match[1]);
      if (!capability) return errorResponse(notFound, 404);
      try {
        if (request.method === "DELETE") return await store.delete(capability)
          ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : errorResponse(notFound, 404);
        const state = await store.get(capability);
        return state ? json(state) : errorResponse(notFound, 404);
      } catch (error) { return errorResponse(unavailable(error), 503); }
    }
    return errorResponse(notFound, 404);
  };
}

export const planApi = createPlanApi({ store: jobStore, readRegistry: readRegistryRelease, dataCutoff: process.env.GILIR_DATA_CUTOFF });
