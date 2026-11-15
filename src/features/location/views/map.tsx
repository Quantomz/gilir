"use client";
// The map area: the globe when it can start, the flat plan when it cannot. Both draw sceneOf(c.picker) and both send
// the picker's actions, so nothing else knows which one is on screen.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, RefObject } from "react";
import { coordsText } from "../coordinates";
import type { Controller } from "../controller";
import { pinPath, startGlobe } from "../globe";
import type { Globe } from "../globe";
import { planOf } from "../outline";
import { sceneOf } from "../picker";
import type { Scene } from "../picker";
import { creditsFor, picturesFor } from "../provider";
import { credits, map, newTab } from "../words";
import { Icon, Notices } from "./parts";

export function MapArea(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const { picker, provider, send } = c;
  const container = useRef<HTMLDivElement>(null);
  const [globe, setGlobe] = useState<Globe | null>(null);
  const surface = picker.surface.kind;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const stop = new AbortController();
    let started: Globe | null = null;
    void startGlobe({ container: element, pictures: picturesFor(provider), reducedMotion: prefersReducedMotion(), signal: stop.signal, send }).then(start => {
      if (stop.signal.aborted) {
        if (start.kind === "globe") start.globe.destroy();
        return;
      }
      if (start.kind === "none") {
        send({ kind: "surface", surface: { kind: "plan", why: start.why } });
        return;
      }
      started = start.globe;
      setGlobe(start.globe);
      send({ kind: "surface", surface: { kind: "globe", pictures: "loading" } });
    });
    return () => {
      stop.abort();
      started?.destroy();
    };
  }, [provider, send]);

  useEffect(() => {
    if (globe === null) return;
    if (surface === "plan") globe.destroy();
    else globe.show(sceneOf(picker));
  }, [globe, surface, picker]);

  return (
    <div className="fp-map-wrap stack-xs">
      <div className="fp-map" ref={c.mapRef}>
        {surface === "plan" ? <FlatPlan scene={sceneOf(picker)} describedBy={c.idOf("list")} /> : <div className="fp-map-gl" ref={container} />}
        {surface === "globe" && globe ? (
          <div className="fp-map-ctrls">
            <MapButton icon="plus" label={map.zoomIn} onClick={() => globe.zoomBy(1)} />
            <MapButton icon="minus" label={map.zoomOut} onClick={() => globe.zoomBy(-1)} />
          </div>
        ) : null}
        <div className="fp-map-foot">
          <Notices c={c} where="on" />
          {surface === "plan" ? <p className="fp-tag">{map.planTag}</p> : null}
          {surface === "starting" ? <p className="fp-loading"><span className="spinner" aria-hidden="true" />{map.loading}</p> : null}
        </div>
      </div>
      <Credits c={c} />
    </div>
  );
}

function MapButton(props: { readonly icon: "plus" | "minus"; readonly label: string; onClick(): void }): ReactElement {
  return (
    <button className="fp-map-btn" type="button" onClick={props.onClick}>
      <span className="fp-map-btn-c"><Icon name={props.icon} /></span>
      <span className="fp-map-btn-t">{props.label}</span>
    </button>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const fallbackSize = { width: 400, height: 300 } as const;

/** SVG units equal CSS pixels, so the corner numbers and the scale keep their real text size. */
function useSize(element: RefObject<HTMLElement | null>): { readonly width: number; readonly height: number } {
  const [size, setSize] = useState<{ readonly width: number; readonly height: number }>(fallbackSize);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = target;
      if (width > 0 && height > 0) setSize(old => (old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

const gridStepPx = 40;
const cornerPx = 14;
const selectedPx = 22;
const numberOffsetPx = 18;
/** Room around the outline for the scale bar, the north arrow and the tag. */
const insetPx = 24;

/**
 * The 2D fallback: a drawing of the outline, north up, with a scale bar and the corners numbered as in the corner list.
 * View only: with no pictures under it, a dragged corner would match nothing on the ground, so the corner list, the
 * size buttons, the search and the phone's location change it. A new pin wins over a field still marked, and shows its
 * coordinates on an empty grid, never an invented landscape.
 */
function FlatPlan(props: { readonly scene: Scene; readonly describedBy: string }): ReactElement {
  const { scene } = props;
  const frame = useRef<HTMLDivElement>(null);
  const { width, height } = useSize(frame);
  const plan = scene.outline && !scene.pin ? planOf(scene.outline, width - 2 * insetPx, height - 2 * insetPx) : null;
  const grid = (count: number) => Array.from({ length: Math.floor(count / gridStepPx) }, (_, index) => (index + 1) * gridStepPx);
  return (
    <div className="fp-plan" ref={frame}>
      <svg role="img" aria-label={map.plan} aria-describedby={props.describedBy} viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
        {grid(width).map(x => <line key={`x${x}`} className="fp-plan-grid" x1={x} y1={0} x2={x} y2={height} />)}
        {grid(height).map(y => <line key={`y${y}`} className="fp-plan-grid" x1={0} y1={y} x2={width} y2={y} />)}
        {plan ? (
          <>
            <g transform={`translate(${insetPx} ${insetPx})`}>
              <path className="fp-plan-under" d={plan.path} />
              <path className="fp-plan-edge" d={plan.path} />
              <circle className="fp-plan-point" cx={plan.lookup.x} cy={plan.lookup.y} r={6} />
              {plan.corners.map(({ x, y }, index) => {
                const side = index === scene.selected ? selectedPx : cornerPx;
                const [dx, dy] = [x - width / 2 + insetPx, y - height / 2 + insetPx];
                const away = Math.hypot(dx, dy) || 1;
                return (
                  <Fragment key={index}>
                    <rect className="fp-plan-corner" x={x - side / 2} y={y - side / 2} width={side} height={side} rx={3} />
                    <text x={x + (dx / away) * numberOffsetPx} y={y + (dy / away) * numberOffsetPx} textAnchor="middle" dominantBaseline="central">
                      {index + 1}
                    </text>
                  </Fragment>
                );
              })}
            </g>
            <g className="fp-plan-scale">
              <path d={`M 16 22 V 30 H ${16 + plan.barPx} V 22`} />
              <text x={16} y={50}>{map.scale(plan.barM)}</text>
            </g>
          </>
        ) : scene.pin ? (
          <>
            <path className="fp-plan-pin" transform={`translate(${width / 2 - 24} ${height / 2 - 62})`} d={pinPath} />
            <text x={width / 2} y={height / 2 + 24} textAnchor="middle">{coordsText(scene.pin, 3)}</text>
          </>
        ) : null}
        <g className="fp-plan-north" transform={`translate(${width - 28} 16)`}>
          <path d="M 0 22 L 8 0 L 16 22 L 8 16 Z" />
          <text x={8} y={42} textAnchor="middle">{map.north}</text>
        </g>
      </svg>
    </div>
  );
}

/**
 * Always visible, at the smallest text size, never behind MapLibre's 12 px control. With the flat plan it credits only
 * the place search, so with no key it shows nothing.
 */
export function Credits(props: { readonly c: Controller }): ReactElement | null {
  const { provider, picker } = props.c;
  const pictures = picker.surface.kind !== "plan";
  const shown = creditsFor(provider, pictures);
  if (shown.length === 0) return null;
  const words = credits[!pictures ? "search" : provider.kind === "ready" ? "pictures_and_search" : "pictures"];
  return (
    <div className="fp-credits">
      <p>
        {words.lead}{" "}
        {shown.map((credit, index) => (
          <Fragment key={credit.text}>
            {index > 0 ? ", " : null}
            {credit.href ? <a href={credit.href} target="_blank" rel="noopener noreferrer" aria-label={newTab(credit.text)}>{credit.text}</a> : credit.text}
          </Fragment>
        ))}
      </p>
      <p className="muted">{words.privacy}</p>
    </div>
  );
}
