// The phone's position, once. The only file that touches navigator.geolocation. The fix goes to the picker and to no
// service, so "We use it once" stays true.
import { round6, wrapLng } from "./outline";
import type { LocateFailure, Place } from "./picker";

export type LocateOutcome =
  | { readonly kind: "found"; readonly place: Extract<Place, { readonly kind: "gps" }> }
  | { readonly kind: "failed"; readonly why: LocateFailure };

/** Outdoors a first fix can take this long, and the words say so. */
const timeoutMs = 15_000;

/** Never rejects: the browser reports every failure through the error callback. */
export function locateOnce(): Promise<LocateOutcome> {
  const geolocation = typeof navigator === "undefined" ? undefined : navigator.geolocation;
  if (!geolocation) return Promise.resolve({ kind: "failed", why: "unsupported" });
  return new Promise(resolve => {
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        kind: "found",
        place: { kind: "gps", at: [round6(wrapLng(coords.longitude)), round6(coords.latitude)], accuracyM: coords.accuracy },
      }),
      error => resolve({ kind: "failed", why: error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable" }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
