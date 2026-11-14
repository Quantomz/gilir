"use client";
// Pages 1 to 3. One primary task and one primary button each (docs/cards/F1.md:34, spec.md:35).
// Page 4 is views/rotation.tsx because it holds the history editor.
// Next is never a disabled button: a disabled control cannot be focused or say why. Pressed without the page's
// minimum (model/check.ts stepComplete), it shows the page's "needs" words as role="alert" in the dock and moves focus
// to the missing control (flow Mode.editing.asked).
import type { ReactElement } from "react";
import { FieldPicker } from "@/features/location";
import type { Controller } from "../controller";

/**
 * The F2 slot, with exactly its frozen props (src/features/ports.ts:2). Search, globe, GPS, voice, the field box and
 * typed corners are F2's, behind the slot. The slot cannot emit null, so a marked field can be replaced, not cleared.
 * Written out in full: tsc checks the slot's props here.
 */
export function FieldSlot(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  return <FieldPicker value={c.flow.editor.draft.field ?? null} onChange={field => c.edit({ kind: "field", field })} />;
}

/**
 * Page 1, "Where is your farm?". F1 owns the frame, the title, field issues and "Next: crops":
 *
 *   <section aria-labelledby="main-title" id={domIdOf({ kind: "pageControl", page: 1 })} tabIndex={-1}>
 *     <FieldSlot c={c} />
 *   </section>
 *   <IssueList c={c} page={1} />
 *   dock: {asked && <p class="error-text" role="alert">Mark your field to go on.</p>}
 *         <button class="btn btn-primary btn-block" onClick={c.next}>Next: crops</button>
 *
 * On "/" today the F2 stub never emits a field (src/features/location/index.tsx:3-5), so production waits on page 1
 * until F2 lands. Tests mock @/features/location. The browser run seeds initialInput (src/app/page.tsx devInput).
 * No Back on page 1: there is no page before it and no landing page. The brand shows instead (prototype TopBar).
 */
export function FieldPage(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * Page 2, "Which crops do you want to grow?". Loads the list on first entry (flow.catalogue idle -> loading).
 *  idle/loading -> "Loading the crop list…" (role="status") and 6 skeleton cards (aria-hidden)
 *  failed       -> note-warn (role="alert"): "We couldn’t load the crop list" + body + "Try again" (c.retryCatalogue)
 *  ready, empty -> note: "No crops are available yet" + body. No dock count and no Next (known issue 11). This is what
 *                  production shows first: the released catalogue is empty (src/registry/index.ts:9).
 *  ready        -> one list <ul class="crop-grid" role="list"> of cards. Each card is a real checkbox stretched over a
 *                  label: a sprout mark (no crop art: the catalogue has only id, label, purpose, src/contracts/registry.ts:7-13),
 *                  the label, "Grown for food" / "Cover crop" (aria-describedby), and when picked a 3px ink ring, a
 *                  badge and the word "Picked", so state never rests on colour. Cover crops count the same (spec.md:272).
 *                  Picked ids the list lacks show above it: "{id} is not on the current crop list." + "Remove {id}".
 *                  They are never removed for the farmer (docs/cards/F1.md:36).
 *  dock (ready and non-empty only): "{n} picked" (aria-live polite, sr list of names), the needs alert, "Next: water".
 *  A 13th pick is refused with a toast (inputLimits.selectedCrops). Removing a pick toasts Undo.
 * No "Often grown near" grouping and no "Say your crops" (no zone data; voice is F2's).
 */
export function CropsPage(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * Page 3, "Where does your water come from?". <fieldset class="choices"> with an sr-only legend (the title) and three
 * real radios name="water" stretched over choice cards: Rain only / Rain + water when it’s dry / I’m not sure, each with
 * its one-line detail. Checked: mint fill, 3px ink ring, filled tick. Lead: "We plan with rain alone…" (spec.md:20).
 * Choosing writes only `water` (model/draft.ts I6). Dock: the needs alert, "Next: your rotation".
 */
export function WaterPage(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/** A page's issues beside its control: <div class="issues" id tabIndex={-1}> of error-text lines with an alert icon. */
export function IssueList(props: { readonly c: Controller; readonly page: 1 | 2 | 3 | 4 }): ReactElement | null {
  throw new Error("not implemented");
}
