// What every browser F2 runs in has and jsdom lacks, so the views call these APIs directly. The ui tests install it in
// beforeEach; vi.unstubAllGlobals, vi.restoreAllMocks and unstubBrowser undo it in afterEach.
import { vi } from "vitest";

export function stubBrowser(): void {
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value() {} });
  // jsdom has no canvas, as a phone with no WebGL2 has none; returning null keeps its "not implemented" noise out of the run.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
}

export function unstubBrowser(): void {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
}
