// The phone's Back button, with no URL change, so no step can be deep-linked and no capability reaches a URL.
// The entry the app opened on is marked "base" and one "guard" entry is pushed over it. A Back from the guard lands
// on the base. If something handled it, the guard is pushed again. With nothing to go back to, the browser goes back
// once more and leaves. Any other entry (a #main skip-link entry, the guard itself) is not ours to handle.
import { useEffect, useEffectEvent } from "react";

const guardKey = "gilirBack";

// Dialogs outside the flow's own sheets (the Text size sheet in the top bar). Back closes the newest one first.
const closers: (() => void)[] = [];

/** In-app Back for the phone's Back button. `back` returns false on page 1, where Back leaves the app. */
export function usePhoneBack(back: () => boolean, enabled: boolean): void {
  const onBack = useEffectEvent(back);
  useEffect(() => {
    if (!enabled) return;
    // A remount finds the guard already on top and pushes nothing.
    if (markOf(history.state) !== "guard") {
      const current: unknown = history.state;
      history.replaceState({ ...(typeof current === "object" ? current : null), [guardKey]: "base" }, "");
      pushGuard();
    }
    return listenForBase(() => onBack());
  }, [enabled]);
}

/** A screen with no in-app Back, such as Results: the phone's Back leaves at the first press. */
export function useBackLeaves(): void {
  useEffect(() => listenForBase(() => false), []);
}

/** While `open`, the phone's Back calls `close` instead of leaving the screen. */
export function useBackCloses(open: boolean, close: () => void): void {
  const onClose = useEffectEvent(close);
  useEffect(() => {
    if (!open) return;
    const closer = () => onClose();
    closers.push(closer);
    return () => {
      closers.splice(closers.indexOf(closer), 1);
    };
  }, [open]);
}

function listenForBase(back: () => boolean): () => void {
  const onPop = (event: PopStateEvent) => {
    if (markOf(event.state) !== "base") return;
    const close = closers.at(-1);
    if (close !== undefined) close();
    if (close !== undefined || back()) pushGuard();
    else history.back();
  };
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}

function pushGuard(): void {
  history.pushState({ [guardKey]: "guard" }, "");
}

function markOf(state: unknown): unknown {
  return typeof state === "object" && state !== null ? Reflect.get(state, guardKey) : undefined;
}
