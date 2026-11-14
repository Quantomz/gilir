"use client";
// F1's public component. Props are exactly OnboardingProps (src/features/ports.ts:3).
import type { ReactElement } from "react";
import type { OnboardingProps } from "../ports";

/**
 * Renders by flow.mode:
 *   opening -> <Opening/>  (also the prerendered HTML of "/", repo-baseline.md gotcha 20)
 *   editing -> step 1 FieldPage | 2 CropsPage | 3 WaterPage | 4 RotationPage, plus the open sheet
 *   making  -> <Making/>
 *   failed  -> <Failed/>
 * Always mounted around them: <StatusLine said/>, <ToastBar/> when a toast is up, and <StatusBars/> for the storage,
 * offline and kept-newer notices, all inside <Broken> (error boundary).
 * The switch over flow.mode.kind ends in a `never` check, so a new mode fails the build until it is drawn.
 *
 * Contract with the caller:
 *  - initialInput is read once, at open. A new value needs a new mount (page.tsx remounts by switching screens).
 *  - onCompleted(snapshot) means "a plan is ready to show". It is called at most once per mount: when a job completes
 *    (after the save that clears activeJob), when the farmer opens the earlier plan from the failed screen, or at open
 *    when a plan is saved and initialInput is null (the entry rule, model/flow.ts openFlow).
 *  - It is never called for a refused submission, a failed job or a cancelled job.
 *  - Nothing else leaves this component. Storage, polling and validation stay inside.
 */
export function Onboarding(props: OnboardingProps): ReactElement {
  throw new Error("not implemented");
  // TODO: const c = useOnboardingController(props); return <Broken>{screenFor(c)}<StatusLine said={c.said} />…</Broken>
}
