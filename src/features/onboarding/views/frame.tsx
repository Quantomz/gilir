"use client";
// The Terrace frame around every F1 screen and around F3's Results: the top bar, then <main id="main"> with the title,
// the page and the dock. The dock is inside <main> as the region "Next step", so landmark navigation and the skip link
// (in src/app/layout.tsx) reach the page's main action. The fixture lab wraps Onboarding in its own <main>, so the lab,
// and only the lab, shows a nested main.
// No frame piece moves focus on first paint. After that, the controller focuses #main-title on a page change.
import { Component, useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactElement, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useBackCloses, useBackLeaves } from "../back";
import { domIdOf } from "../model/flow";
import type { Notices, Step } from "../model/flow";
import { policy } from "../model/policy";
import { appName, notices as noticeWords, sheets, shell, stepCount, stepNames, titles } from "../model/words";
import { applyReading, canSpeak, readReading, speak, stopSpeaking, textSizes } from "../services/reading";
import type { ReadingPrefs, TextSize } from "../services/reading";
import { Icon, Mark } from "./icons";

/**
 * Public. The frame page.tsx wraps F3's Results in. No Back: Results offers Change inputs itself, and the phone's Back
 * leaves.
 */
export function AppFrame(props: { readonly children: ReactNode; readonly focusOnMount?: boolean }): ReactElement {
  const main = useRef<HTMLElement>(null);
  const { focusOnMount = false } = props;
  useBackLeaves();
  useEffect(() => {
    if (focusOnMount) main.current?.focus();
  }, [focusOnMount]);
  return (
    <div className="view">
      <TopBar onBack={null} />
      <main id="main" ref={main} className="page step-main" tabIndex={-1}>
        {props.children}
      </main>
    </div>
  );
}

const titleId = domIdOf({ kind: "title" });
const columnClass = { column: "col", timeline: "col ly-page", wide: "wide" } as const;

/** One input page: the top bar (Back, or the brand on page 1), the step head, the title, the page, then the dock. */
export function StepFrame(props: {
  readonly step: Step;
  readonly title: string;
  readonly lead?: string;
  readonly onBack: (() => void) | null;
  readonly dock: ReactNode;
  /** "wide" for the crop cards, "timeline" for page 4. */
  readonly width?: keyof typeof columnClass;
  readonly children: ReactNode;
}): ReactElement {
  const dock = useRef<HTMLDivElement>(null);
  useEdge(dock, "--bar-bottom");
  const width = props.width ?? "column";
  return (
    <div className="view">
      <TopBar onBack={props.onBack} />
      <main id="main" className="page step-main docked" tabIndex={-1}>
        <div className={`${columnClass[width]} stack`}>
          <StepHead step={props.step} />
          <div className="stack-xs">
            <Title>{props.title}</Title>
            {props.lead ? <p className="lead" data-say="">{props.lead}</p> : null}
          </div>
          {props.children}
        </div>
        <div ref={dock} className={width === "wide" ? "dock dock-wide" : "dock"} role="region" aria-label={shell.dock}>
          <div className="dock-in">{props.dock}</div>
        </div>
      </main>
    </div>
  );
}

/** The screens that are not input pages: Opening, Making, Failed. The same top bar and main, with a centred column. */
export function PlainFrame(props: { readonly onBack: (() => void) | null; readonly children: ReactNode }): ReactElement {
  return (
    <div className="view">
      <TopBar onBack={props.onBack} />
      <main id="main" className="page sys" tabIndex={-1}>
        <div className="col stack">{props.children}</div>
      </main>
    </div>
  );
}

function TopBar(props: { readonly onBack: (() => void) | null }): ReactElement {
  const bar = useRef<HTMLElement>(null);
  useEdge(bar, "--bar-top");
  return (
    <header ref={bar} className="topbar">
      <div className="topbar-in">
        {props.onBack ? (
          <button className="back" type="button" onClick={props.onBack}>
            <span className="back-c"><Icon name="back" /></span>
            <span>{shell.back}</span>
          </button>
        ) : (
          <span className="brand">
            <Mark />
            <span className="word">{appName}</span>
          </span>
        )}
        <Tools />
      </div>
    </header>
  );
}

/**
 * Text size and Listen, each an icon with its word. Tools owns the Text size sheet, so AppFrame, outside Onboarding's
 * controller, has the same tools. Listen reads every [data-say] in #main and stops when the screen changes.
 */
function Tools(): ReactElement {
  // The server render cannot know about speech, so Listen appears just after hydration instead of mismatching it.
  const speech = useSyncExternalStore(noSubscription, canSpeak, () => false);
  const [sheetOpen, setSheetOpen] = useState(false);
  useBackCloses(sheetOpen, () => setSheetOpen(false));
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0);
  useEffect(() => () => {
    if (run.current === 0) return;
    run.current += 1;
    stopSpeaking();
  }, []);

  function listen(): void {
    run.current += 1;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const mine = run.current;
    setSpeaking(true);
    speak(textsToSay(), () => {
      if (run.current === mine) setSpeaking(false);
    });
  }

  return (
    <div className="tools">
      <button className="tool tool-text" type="button" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
        <Icon name="textsize" />
        <span>{shell.textSize}</span>
      </button>
      {speech ? (
        <button className="tool" type="button" aria-pressed={speaking} onClick={listen}>
          <Icon name={speaking ? "stop" : "speaker"} />
          <span>{speaking ? shell.stop : shell.listen}</span>
        </button>
      ) : null}
      {sheetOpen ? <TextSheet onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}

function textsToSay(): string[] {
  const main = document.getElementById("main");
  if (!main) return [];
  const said = Array.from(main.querySelectorAll("[data-say]"), plainText).filter(Boolean);
  if (said.length) return said;
  const title = main.querySelector("h1");
  return title ? [plainText(title)] : [];
}

/**
 * The words of one [data-say] block. Text from two elements that touch with no space between them, such as a
 * choice's name and its detail, becomes two sentences, so the voice pauses instead of running them together.
 * A button's label and aria-hidden parts are not read.
 */
function plainText(element: Element): string {
  let said = "";
  let lastParent: Node | null = null;
  const visit = (node: Node): void => {
    if (node instanceof Element) {
      if (!node.matches("button, [aria-hidden='true']")) node.childNodes.forEach(visit);
      return;
    }
    const text = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "") : "";
    if (node.parentNode !== lastParent && /\S$/.test(said) && /^[^\s,.;:!?)]/.test(text)) said += /[.!?:;…]$/.test(said) ? " " : ". ";
    said += text;
    lastParent = node.parentNode;
  };
  element.childNodes.forEach(visit);
  return said.replace(/\s+/g, " ").trim();
}

function noSubscription(): () => void {
  return () => undefined;
}

const sizeSample: Readonly<Record<TextSize, string>> = { normal: "1.4rem", large: "1.8rem", largest: "2.2rem" };

/** Changes apply at once and are remembered on this device. */
function TextSheet(props: { readonly onClose: () => void }): ReactElement {
  const [prefs, setPrefs] = useState<ReadingPrefs>(readReading);
  function choose(next: ReadingPrefs): void {
    applyReading(next);
    setPrefs(next);
  }
  return (
    <Sheet title={sheets.textTitle} returnTo={null} onClose={props.onClose}>
      <fieldset className="stack-s">
        <legend className="sr">{sheets.textTitle}</legend>
        <div className="sizes">
          {textSizes.map(size => (
            <label className="size-opt" key={size}>
              <input
                type="radio"
                name="text-size"
                checked={prefs.textSize === size}
                data-autofocus={prefs.textSize === size ? "" : undefined}
                onChange={() => choose({ ...prefs, textSize: size })}
              />
              <span>
                <b aria-hidden="true" style={{ fontSize: sizeSample[size] }}>{sheets.sizeLetters}</b>
                {sheets.sizes[size]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="muted">{sheets.sizeSample}</p>
      <label className="switch">
        <span>
          <b>{sheets.contrast}</b>
          <br />
          <span className="muted">{sheets.contrastHint}</span>
        </span>
        <input type="checkbox" role="switch" checked={prefs.highContrast} onChange={event => choose({ ...prefs, highContrast: event.target.checked })} />
      </label>
      <button className="btn btn-primary btn-block" type="button" onClick={props.onClose}>
        {sheets.done}
      </button>
    </Sheet>
  );
}

const steps: readonly Step[] = [1, 2, 3, 4];

/** "Step N of 4 · {name}" is read. The four segments and their labels repeat it for the eye only. */
function StepHead(props: { readonly step: Step }): ReactElement {
  const mark = (n: Step) => ({ "data-on": n < props.step ? "" : undefined, "data-now": n === props.step ? "" : undefined });
  return (
    <div className="stephead">
      <p className="stepcount">
        {stepCount(props.step)}
        <span className="stepname">{stepNames[props.step]}</span>
      </p>
      <div className="stepbar" aria-hidden="true">
        {steps.map(n => <span key={n} {...mark(n)} />)}
      </div>
      <div className="steplabels" aria-hidden="true">
        {steps.map(n => <span key={n} {...mark(n)}>{stepNames[n]}</span>)}
      </div>
    </div>
  );
}

/** The screen's one h1. The controller focuses it on every screen change after the first paint. */
export function Title(props: { readonly children: ReactNode }): ReactElement {
  return (
    <h1 id={titleId} className="screen-title" tabIndex={-1} data-say="">
      {props.children}
    </h1>
  );
}

/** The one polite live region of the flow, always mounted: drag results, toasts, Making's step sentence. */
export function StatusLine(props: { readonly said: string }): ReactElement {
  return (
    <p className="sr" role="status" aria-live="polite">
      {props.said}
    </p>
  );
}

/**
 * A note under the top bar. It stays 7 s, or 15 s when it offers Undo, and the time stops while the pointer is on it
 * or focus is in it. The words reach screen readers through StatusLine, so this box is not a live region.
 */
export function ToastBar(props: { readonly text: string; readonly onUndo: (() => void) | null; readonly onDone: () => void }): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const done = useEffectEvent(() => props.onDone());
  const undoable = props.onUndo !== null;
  useEffect(() => {
    if (hovered || focused) return;
    const timer = setTimeout(done, undoable ? policy.toast.undoMs : policy.toast.plainMs);
    return () => clearTimeout(timer);
  }, [hovered, focused, undoable, props.text]);
  useBelowTopBar(box);
  return (
    <div
      ref={box}
      className="toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setFocused(false);
      }}
    >
      <span>{props.text}</span>
      {props.onUndo ? <button type="button" onClick={props.onUndo}>{shell.undo}</button> : null}
    </div>
  );
}

/**
 * The quiet lines above the top bar. Storage not saving and kept newer answers each have Got it. The offline line
 * follows the browser's online and offline events and goes away by itself. None of them blocks input.
 */
export function StatusBars(props: { readonly notices: Notices; readonly onDismiss: (notice: keyof Notices) => void }): ReactElement {
  const offline = useSyncExternalStore(subscribeToConnection, () => !navigator.onLine, () => false);
  function gotIt(notice: keyof Notices): void {
    props.onDismiss(notice);
    (document.getElementById(titleId) ?? document.getElementById("main"))?.focus();
  }
  return (
    <>
      {offline ? (
        <div className="offline-bar" role="status">
          <Icon name="wifioff" />
          {noticeWords.offline}
        </div>
      ) : null}
      {props.notices.storageFailing ? <NoticeBar text={noticeWords.notSaving} onGotIt={() => gotIt("storageFailing")} /> : null}
      {props.notices.keptNewer ? <NoticeBar text={noticeWords.keptNewer} onGotIt={() => gotIt("keptNewer")} /> : null}
    </>
  );
}

function NoticeBar(props: { readonly text: string; readonly onGotIt: () => void }): ReactElement {
  return (
    <div className="notice-bar" role="status">
      <div className="notice-in">
        <Icon name="info" />
        <p>{props.text}</p>
        <button className="btn btn-small" type="button" onClick={props.onGotIt}>
          {noticeWords.gotIt}
        </button>
      </div>
    </div>
  );
}

function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Shown while storage answers. It is also the prerendered HTML of "/", so it reads nothing from the browser. */
export function Opening(): ReactElement {
  return (
    <PlainFrame onBack={null}>
      <div className="stack-s opening" role="status">
        <Title>{titles.opening}</Title>
        <p className="row muted">
          <span className="spinner" aria-hidden="true" />
          <span data-say="">{titles.openingLead}</span>
        </p>
        <div className="stack-s" aria-hidden="true">
          <div className="skel skel-l" />
          <div className="skel skel-s" />
          <div className="skel skel-s" />
        </div>
      </div>
    </PlainFrame>
  );
}

/**
 * A modal sheet: a bottom sheet on phones, centred from 720px. Focus goes to [data-autofocus] or the first control,
 * or to the title when that control starts out below the sheet's visible part. Tab stays inside, and Escape or the
 * scrim closes it. On close, focus goes to the element whose id is `returnTo` (read when the sheet opens), else back
 * to the control that opened it.
 * It is portalled to <body> because the top bar and the dock blur their backdrop, which would trap a fixed child.
 */
export function Sheet(props: {
  readonly title: string;
  readonly returnTo: string | null;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const sheet = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const { returnTo } = props;
  useEffect(() => {
    const opener = document.activeElement;
    const box = sheet.current;
    const first = box?.querySelector<HTMLElement>("[data-autofocus]") ?? focusablesIn(box)[0];
    first?.focus({ preventScroll: true });
    // Scrolling a tall sheet to its control would push the title off a small screen at a large text size, so the
    // title takes focus instead and the farmer reads the sheet from its top.
    if (box && first && first.getBoundingClientRect().bottom > box.getBoundingClientRect().bottom) heading.current?.focus();
    return () => {
      const back = returnTo === null ? null : document.getElementById(returnTo);
      const target = back ?? (opener instanceof HTMLElement && opener.isConnected ? opener : null);
      target?.focus();
    };
    // returnTo is fixed when the sheet opens.
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusablesIn(sheet.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const content = (
    <>
      <div className="scrim" onClick={props.onClose} />
      <section ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="sheet-head">
          <h2 id={titleId} ref={heading} className="sheet-title" tabIndex={-1}>{props.title}</h2>
          <button className="btn btn-small btn-close" type="button" onClick={props.onClose}>
            <Icon name="close" />
            {sheets.close}
          </button>
        </div>
        {props.children}
      </section>
    </>
  );
  return createPortal(content, document.body);
}

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
}

/** Around the whole flow. A screen that fails to draw says so plainly; reopening keeps the saved answers. */
export class Broken extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidUpdate(_props: unknown, previous: { readonly failed: boolean }): void {
    if (this.state.failed && !previous.failed) document.getElementById(titleId)?.focus();
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view">
        <main id="main" className="page sys" tabIndex={-1}>
          <div className="col stack">
            <span className="sys-ic warn"><Icon name="alert" /></span>
            <Title>{shell.broken.title}</Title>
            <p className="lead" data-say="">{shell.broken.body}</p>
            <button className="btn btn-primary btn-block" type="button" onClick={() => window.location.reload()}>
              <Icon name="refresh" />
              {shell.broken.action}
            </button>
          </div>
        </main>
      </div>
    );
  }
}

/** Keeps the scroll padding in globals.css equal to the bars that stick over the page, so focus never hides under them. */
function useEdge(ref: RefObject<HTMLElement | null>, edge: "--bar-top" | "--bar-bottom"): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = document.documentElement.style;
    const measure = () => {
      const box = element.getBoundingClientRect();
      style.setProperty(edge, `${Math.round(box.height)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      style.removeProperty(edge);
    };
  }, [ref, edge]);
}

/**
 * Keeps the toast just under the top bar. While a notice line above the bar is on screen the bar sits lower than its
 * own height, so the toast follows the bar's edge on scroll instead of covering the notice. Its own bottom edge
 * becomes --bar-toast, so focused controls scroll out from under it.
 */
function useBelowTopBar(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement.style;
    let frame = 0;
    const place = () => {
      frame = 0;
      const bar = document.querySelector(".topbar")?.getBoundingClientRect();
      if (bar) element.style.setProperty("--toast-top", `${Math.max(0, Math.round(bar.bottom))}px`);
      root.setProperty("--bar-toast", `${Math.round(element.getBoundingClientRect().bottom)}px`);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.removeProperty("--bar-toast");
    };
  }, [ref]);
}
