"use client";
// F1's public entrypoint (docs/contracts.md:9). Two names only.
//  - Onboarding: the frozen OnboardingProps component (src/features/ports.ts:3).
//  - AppFrame: the Terrace frame page.tsx wraps F3's Results in, so Text size and Listen work on every screen.
// The only other public file is ./head.ts (server-safe, for layout.tsx). Everything under ./model, ./services and
// ./views is F1-internal. tests/frontend/onboarding/conventions.test.ts fails `npm run check` if a file outside this
// folder imports them, because the boundary checker cannot make internals unreachable (design-red-flags).
export { Onboarding } from "./onboarding";
export { AppFrame } from "./views/frame";
