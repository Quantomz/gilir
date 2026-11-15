"use client";
// The F2 slot. `FieldPicker` is the only export of src/features/location, with exactly the frozen props
// (src/features/ports.ts:2). F1 renders it on page 1 inside its own <main>, its section, its h1 "Where is your farm?"
// and its dock with "Next: crops"; the fixture lab renders it bare beside a second one inside Onboarding. So it
// renders no <main>, no <h1>, no dock and no portal: everything stays inside this one <div>, in the page's flow.
import "maplibre-gl/dist/maplibre-gl.css";
import "./location.css";
import type { ReactElement } from "react";
import type { FieldPickerProps } from "../ports";
import { usePicker } from "./controller";
import { listShown, phaseOf } from "./picker";
import { FindPanel, PlaceCard } from "./views/find";
import { MapArea } from "./views/map";
import { CornerList, MarkHead, MarkTools, Precision } from "./views/mark";
import { LiveRegion, Notices } from "./views/parts";

/**
 * Find a place anywhere in the world, then mark one field.
 *
 * onChange is called only when the farmer changes the field, inside that event, with a value that passes the shared
 * parser and the server's geometry check. It is never called on mount, when `value` changes, or with a half-drawn
 * outline. `value` may be null, may arrive after mount, and may be handed straight back.
 *
 * The root carries three data attributes for the browser checks: the phase, the surface and the lookup of the field
 * the picker holds. They show nothing that is not already the picker's own output.
 */
export function FieldPicker(props: FieldPickerProps): ReactElement {
  const c = usePicker(props);
  const phase = phaseOf(c.picker);
  return (
    <div
      className="fp stack-s"
      data-phase={phase}
      data-surface={c.picker.surface.kind}
      data-lookup={c.picker.outline?.marked.lookup.join(",")}
    >
      {phase === "finding" ? <FindPanel c={c} /> : <MarkHead c={c} />}
      <Notices c={c} />
      <MapArea c={c} />
      {phase === "finding" ? <PlaceCard c={c} /> : <MarkTools c={c} />}
      {listShown(c.picker) ? <CornerList c={c} /> : null}
      {phase === "finding" ? null : <Precision c={c} />}
      <LiveRegion c={c} />
    </div>
  );
}
