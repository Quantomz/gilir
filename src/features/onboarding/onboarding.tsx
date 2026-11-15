"use client";
// F1's public component, with exactly OnboardingProps.
//  - initialInput is read once, at open. A new value needs a new mount.
//  - onCompleted(snapshot) means "a plan is ready to show": a job completed (after the save that clears it), the
//    farmer opened the earlier plan from the failed screen, or a plan was saved and initialInput is null.
//    It is never called for a refused submission, a failed job or a cancelled job.
//  - Storage, polling and validation stay inside.
import type { ReactElement } from "react";
import type { OnboardingProps } from "../ports";
import { useOnboardingController } from "./controller";
import type { Controller } from "./controller";
import { domIdOf } from "./model/flow";
import type { Step } from "./model/flow";
import { Broken, Opening, StatusBars, StatusLine, ToastBar } from "./views/frame";
import { Failed, Making } from "./views/making";
import { CropsPage, FieldPage, WaterPage } from "./views/pages";
import { RotationPage } from "./views/rotation";
import { AddSheet, DatesSheet, EmptySheet, GapSheet } from "./views/sheets";

export function Onboarding(props: OnboardingProps): ReactElement {
  return (
    <Broken>
      <Flow {...props} />
    </Broken>
  );
}

function Flow(props: OnboardingProps): ReactElement {
  const c = useOnboardingController(props);
  const toast = c.toast;
  return (
    <>
      <StatusBars notices={c.flow.notices} onDismiss={c.dismissNotice} />
      <Screen c={c} />
      {toast ? <ToastBar key={toast.id} text={toast.text} onUndo={toast.undo ? c.undo : null} onDone={c.dismissToast} /> : null}
      <StatusLine said={c.said} />
      <OpenSheet c={c} />
    </>
  );
}

const pages: Readonly<Record<Step, (props: { readonly c: Controller }) => ReactElement>> = {
  1: FieldPage,
  2: CropsPage,
  3: WaterPage,
  4: RotationPage,
};

function Screen(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const mode = c.flow.mode;
  switch (mode.kind) {
    case "opening":
      return <Opening />;
    case "editing": {
      const Page = pages[mode.step];
      return <Page c={c} />;
    }
    case "making":
      return <Making c={c} job={mode.job} />;
    case "failed":
      return <Failed c={c} failure={mode.failure} />;
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

function OpenSheet(props: { readonly c: Controller }): ReactElement | null {
  const { c } = props;
  const sheet = c.flow.sheet;
  if (sheet === null || c.flow.mode.kind !== "editing") return null;
  switch (sheet.kind) {
    case "add":
      return <AddSheet c={c} within={sheet.within} />;
    case "dates":
      return <DatesSheet key={`${sheet.entryId} ${sheet.end}`} c={c} entryId={sheet.entryId} end={sheet.end} returnTo={domIdOf(sheet.returnTo)} />;
    case "gap":
      return <GapSheet c={c} gap={sheet.gap} />;
    case "empty":
      return <EmptySheet c={c} entryId={sheet.entryId} />;
  }
}
