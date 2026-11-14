"use client";
// The whole production composition: a two-state switch between the farmer's inputs and a completed plan.
// "use client" because `client` is an object of functions, which a server component cannot pass to a client one
// (repo-baseline.md gotcha 18). That makes this a browser file for scripts/check-boundaries.mjs:32, so it imports the
// real HTTP client and never @/fixtures (check-boundaries.mjs:38). A page file may only default-export.
// The entry rule lives in Onboarding (model/flow.ts openFlow). This file never touches storage, never polls and never
// validates. There is no landing page, no sign in and no sign up: the first screen is Onboarding's.
import { useState } from "react";
import type { CompletedSnapshot, FarmInput } from "@/contracts";
import { farmInputSchema } from "@/contracts/input";
import { plannerClient } from "@/client/planner";
import { AppFrame, Onboarding } from "@/features/onboarding";
import { Results } from "@/features/results";

type View =
  | { readonly kind: "inputs"; readonly initialInput: FarmInput | null }
  | { readonly kind: "plan"; readonly snapshot: CompletedSnapshot };

export default function Page() {
  const [view, setView] = useState<View>(() => ({ kind: "inputs", initialInput: devInput() }));
  if (view.kind === "plan") {
    return (
      <AppFrame focusOnMount>
        <Results snapshot={view.snapshot} onChangeInputs={input => setView({ kind: "inputs", initialInput: input })} />
      </AppFrame>
    );
  }
  return (
    <Onboarding
      client={plannerClient}
      initialInput={view.initialInput}
      onCompleted={snapshot => setView({ kind: "plan", snapshot })}
    />
  );
}

/**
 * Development only (graft from candidates 2 and 3, kept out of the feature's public surface). A browser test puts a
 * FarmInput on `window.__gilirDevInput` with page.addInitScript, and it opens as initialInput. That is the only way
 * past page 1 on "/" while the F2 slot cannot emit a field (src/features/location/index.tsx:3-5) and every storage call
 * rejects (src/client/storage.ts:14-16). `process.env.NODE_ENV` is inlined at build time, so `npm run build` drops the
 * branch. The value is parsed with the shared schema, so a bad seed is ignored, never trusted. Remove when F2 lands.
 */
function devInput(): FarmInput | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return null;
  const parsed = farmInputSchema.safeParse(Reflect.get(window, "__gilirDevInput"));
  return parsed.success ? parsed.data : null;
}
