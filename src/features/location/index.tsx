"use client";
// F1 renders the slot on page 1 inside its own <main>, section, h1 and dock, and the fixture lab renders a second one
// beside it. So the slot renders no <main>, no <h1>, no dock and no portal: everything stays inside one <div>, whose
// wrapper is the container the two-column layout measures.
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
 * The root's data attributes (the phase, the surface and the held field's lookup) are for the browser checks and show
 * nothing that is not already the picker's own output.
 */
export function FieldPicker(props: FieldPickerProps): ReactElement {
  const c = usePicker(props);
  const phase = phaseOf(c.picker);
  return (
    <div className="fp-box">
      <div
        className="fp"
        data-phase={phase}
        data-surface={c.picker.surface.kind}
        data-lookup={c.picker.outline?.marked.lookup.join(",")}
      >
        {phase === "finding" ? <FindPanel c={c} /> : <MarkHead c={c} />}
        <Notices c={c} where="above" />
        <MapArea c={c} />
        {phase === "finding" ? <PlaceCard c={c} /> : <MarkTools c={c} />}
        <Notices c={c} where="below" />
        {listShown(c.picker) ? <CornerList c={c} /> : null}
        {phase === "finding" ? null : <Precision c={c} />}
        <LiveRegion c={c} />
      </div>
    </div>
  );
}
