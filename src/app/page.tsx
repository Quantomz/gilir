"use client";
// The whole production composition: the farmer's inputs until a plan is ready, then the plan.
// "use client" because `client` is an object of functions, which a server component cannot pass to a client one. That
// makes this a browser file, so it imports the real HTTP client and never the fixtures. Storage, polling, validation
// and the choice of what opens first all live in Onboarding. There is no landing page, sign in or sign up.
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
 * Development only. A browser test puts a FarmInput on `window.__gilirDevInput` before the page loads, and it opens
 * as initialInput: the only way past page 1 on "/" until the field picker can mark a field and storage can keep one.
 * `npm run build` inlines NODE_ENV and drops the branch. The seed is parsed with the shared schema, so a bad one is
 * ignored. Onboarding reads initialInput only after it opens, so the first render still matches the prerendered HTML.
 */
function devInput(): FarmInput | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return null;
  const parsed = farmInputSchema.safeParse(Reflect.get(window, "__gilirDevInput"));
  return parsed.success ? parsed.data : null;
}
