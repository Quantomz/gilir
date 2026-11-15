"use client";
// The shell around the pure picker: one hook. It holds the Picker, runs `update`, and carries a Step out. Views call
// `send` and read `picker`; none of them keeps field state of its own. onChange is called inside `send`, during the
// farmer's own event, and never from an effect. So a parent that hands the field straight back (F1, the lab's
// useState) sees one call per accepted edit, also in Strict Mode.
// Text that is not yet a value (the search box, the corner rows) and the short-lived search and location requests stay
// in their own views: the picker only hears the place or the parsed corners.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FieldPickerProps } from "../ports";
import { openPicker, update } from "./picker";
import type { Action, Focus, Picker } from "./picker";
import { readProvider } from "./provider";
import type { Provider } from "./provider";

/** The parts that need a DOM id. Built from useId, so the two pickers on the fixture lab page never share one. */
export type Part = "search" | "search-hint" | "results" | "locate" | "heading" | "list" | "list-hint" | "problem" | "plan";

export interface Controller {
  readonly picker: Picker;
  /** The key, read once. `missing` turns search by name and close-up pictures off; everything else works. */
  readonly provider: Provider;
  /** The one way a view changes anything. Stable for the life of the picker, so globe.ts can keep it. */
  send(action: Action): void;
  idOf(part: Part): string;
  /** A stable ref callback for the element that takes focus when a step asks for `target`. */
  focusRef(target: Focus): (element: HTMLElement | null) => void;
}

export function usePicker({ value, onChange }: FieldPickerProps): Controller {
  const [provider] = useState(readProvider);
  const [picker, setPicker] = useState(() => openPicker(value));
  const current = useRef(picker);
  const latestOnChange = useRef(onChange);
  const wanted = useRef<Focus | null>(null);
  const elements = useRef(new Map<Focus, HTMLElement>());
  const callbacks = useRef(new Map<Focus, (element: HTMLElement | null) => void>());
  const base = useId();

  useEffect(() => { latestOnChange.current = onChange; }, [onChange]);

  const send = useCallback((action: Action) => {
    const step = update(current.current, action);
    if (step.picker !== current.current) {
      current.current = step.picker;
      setPicker(step.picker);
    }
    if (step.focus) wanted.current = step.focus;
    if (step.emit) latestOnChange.current(step.emit);
  }, []);

  // The value prop, on mount and on every change (F1 restores a draft after mount). On mount it is the value
  // openPicker already holds, so the picker returns the same object and nothing happens (P3).
  useEffect(() => { send({ kind: "adopt", field: value }); }, [send, value]);

  useEffect(() => {
    const target = wanted.current;
    if (target === null) return;
    wanted.current = null;
    elements.current.get(target)?.focus();
  }, [picker]);

  const idOf = useCallback((part: Part) => `${base}-${part}`, [base]);
  const focusRef = useCallback((target: Focus) => {
    const known = callbacks.current.get(target);
    if (known) return known;
    const callback = (element: HTMLElement | null) => {
      if (element) elements.current.set(target, element);
      else elements.current.delete(target);
    };
    callbacks.current.set(target, callback);
    return callback;
  }, []);

  return { picker, provider, send, idOf, focusRef };
}
