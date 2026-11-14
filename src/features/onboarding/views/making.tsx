"use client";
// Making and the failed screen.
import type { ReactElement } from "react";
import type { Controller } from "../controller";

/**
 * "Making your plan". TopBar with Back (Back leaves Making with the request still running; page 4 then offers
 * "See how it’s going"). A progress ring (aria-hidden; 14, 46, 78 percent by state; no photo: F1 owns no licensed
 * image), the title, "This usually takes less than a minute. {field.label}.", the three steps as a list with
 * "Done" / "Working on it" / "Waiting" words (not colour alone), and Cancel (48px, quiet).
 * When job.reachable is false: a visible note "We can’t reach the planning service right now. We keep trying."
 * (graft from candidates 2 and 3).
 * Announcements: only the one status-line sentence "Step 2 of 3: Getting NASA weather records for your area."
 * (known issue 19). The visible list is not a live region.
 */
export function Making(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}

/**
 * A failed request (JobState failed, a read rejected with retryable false, or unreadable reads). Never shows a plan
 * and never calls onCompleted (docs/cards/F1.md:42). Sys pattern: warn icon disc, failureWords title and body,
 * "No plan was made."; actions: "Make my plan again" (not_found) or "Try again" (retryable), both c.makePlan;
 * "Change my answers" (page 4, answers intact; the primary button when there is no retry); and
 * "Open my earlier plan, made {local date of completedAt}" when one was saved before this visit (known issue 23).
 * No failure code or helpline code on screen (known issue 10). The title takes focus when this screen appears
 * (known issue 17).
 */
export function Failed(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}
