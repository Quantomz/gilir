// Reading preferences (Text size, High contrast) and read aloud (Listen).
// They are not answers, so they are not in LocalState. They live in F1's own localStorage key, and every access is in
// try/catch: private windows and blocked storage throw, and the page must render correctly with none of it.
// The root rule is `html { font-size: calc(125% * var(--scale)) }` (globals.css), so 1rem is 20px at Normal, 23.6px at
// Large and 27.2px at Largest, and every rem-sized utility grows with it. Media queries ignore the root size, so Large
// and Largest also set `.big-text` on <html> for layout switches (prototype-port.md 7.3).
// Nothing here touches the DOM at module load, so head.ts can import the script string on the server.

export type TextSize = "normal" | "large" | "largest";

export interface ReadingPrefs {
  readonly textSize: TextSize;
  readonly highContrast: boolean;
}

export const readingKey = "gilir.reading";
export const textScale: Readonly<Record<TextSize, number>> = { normal: 1, large: 1.18, largest: 1.36 };
export const bigTextClass = "big-text";
export const contrastAttribute = "data-contrast";
export const defaultReading: ReadingPrefs = { textSize: "normal", highContrast: false };

export function readReading(): ReadingPrefs {
  throw new Error("not implemented");
}

/** Apply to <html> (--scale, .big-text, data-contrast) and remember it. Called by the Text size sheet. */
export function applyReading(prefs: ReadingPrefs): void {
  throw new Error("not implemented");
}

/**
 * Inline script for <head> in src/app/layout.tsx. It runs before first paint, so a Largest-text farmer never sees the
 * page jump. Built from the constants above (graft from candidates 2 and 3), so it cannot drift from applyReading.
 * <html> carries suppressHydrationWarning because the server render has none of these attributes.
 */
export const readingHeadScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(readingKey)})||"{}")||{};var s=${JSON.stringify(textScale)}[p.textSize]||1;var r=document.documentElement;r.style.setProperty("--scale",String(s));if(s>1)r.classList.add(${JSON.stringify(bigTextClass)});if(p.highContrast===true)r.setAttribute(${JSON.stringify(contrastAttribute)},"high")}catch(e){}})();`;

/** Read aloud exists only where the browser has speech synthesis (jsdom and some phones do not). Listen is hidden then. */
export function canSpeak(): boolean {
  throw new Error("not implemented");
}

/** Speak the texts in order. `onEnd` runs when speech finishes or is stopped. */
export function speak(texts: readonly string[], onEnd: () => void): void {
  throw new Error("not implemented");
}

export function stopSpeaking(): void {
  throw new Error("not implemented");
}
