// Reading preferences (Text size, High contrast) and read aloud (Listen).
// They are not answers, so they stay out of LocalState, in F1's own localStorage key. Private windows and blocked
// storage throw, so every access is guarded and the page works without it.
// The head script copies the stored choice onto <html> before first paint. From then on <html> is the truth:
// readReading reads it back, and applyReading writes both.
// Nothing here touches the DOM at module load, so head.ts can hand the script string to the server layout.

export type TextSize = "normal" | "large" | "largest";

export interface ReadingPrefs {
  readonly textSize: TextSize;
  readonly highContrast: boolean;
}

export const readingKey = "gilir.reading";
export const textSizes: readonly TextSize[] = ["normal", "large", "largest"];
export const textScale: Readonly<Record<TextSize, number>> = { normal: 1, large: 1.18, largest: 1.36 };
/** Media queries ignore the root font size, so Large and Largest also need a class for their layout switches. */
const bigTextClass = "big-text";
const contrastAttribute = "data-contrast";

export function readReading(): ReadingPrefs {
  const root = document.documentElement;
  const scale = Number(root.style.getPropertyValue("--scale"));
  return {
    textSize: textSizes.find(size => textScale[size] === scale) ?? "normal",
    highContrast: root.getAttribute(contrastAttribute) === "high",
  };
}

/** Apply to <html> and remember the choice. The page changes even when storage refuses the write. */
export function applyReading(prefs: ReadingPrefs): void {
  const root = document.documentElement;
  root.style.setProperty("--scale", String(textScale[prefs.textSize]));
  root.classList.toggle(bigTextClass, prefs.textSize !== "normal");
  if (prefs.highContrast) root.setAttribute(contrastAttribute, "high");
  else root.removeAttribute(contrastAttribute);
  try {
    localStorage.setItem(readingKey, JSON.stringify(prefs));
  } catch {}
}

/**
 * Runs in <head> before first paint, so a farmer who chose Largest never sees the page jump. It is built from the
 * constants above so it cannot drift from applyReading. <html> carries suppressHydrationWarning because the server
 * render has none of these attributes.
 */
export const readingHeadScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(readingKey)})||"{}")||{};var s=${JSON.stringify(textScale)}[p.textSize]||1;var r=document.documentElement;r.style.setProperty("--scale",String(s));if(s>1)r.classList.add(${JSON.stringify(bigTextClass)});if(p.highContrast===true)r.setAttribute(${JSON.stringify(contrastAttribute)},"high")}catch(e){}})();`;

/** Speech exists only where the browser has it (not in every phone browser), so Listen is shown only then. */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** Speak the texts as sentences, in order. `onEnd` runs once speech finishes, fails or is stopped. */
export function speak(texts: readonly string[], onEnd: () => void): void {
  if (!canSpeak()) {
    onEnd();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new window.SpeechSynthesisUtterance(texts.map(sentence).join(" "));
  utterance.lang = "en";
  utterance.rate = 0.9;
  let ended = false;
  utterance.onend = utterance.onerror = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

function sentence(text: string): string {
  return /[.!?…:]$/.test(text) ? text : `${text}.`;
}
