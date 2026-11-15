"use client";
// F1's public entrypoint, with two names. Onboarding is the OnboardingProps component. AppFrame is the Terrace frame
// page.tsx wraps F3's Results in, so Text size and Listen work on every screen. The only other public file is
// ./head.ts, the server-safe values for layout.tsx. Everything under ./model, ./services and ./views is F1-internal:
// tests/frontend/onboarding/conventions.test.ts fails the check when a file outside this folder imports one.
export { Onboarding } from "./onboarding";
export { AppFrame } from "./views/frame";
