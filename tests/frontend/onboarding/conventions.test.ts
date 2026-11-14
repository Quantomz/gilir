// Node environment. Rules that would otherwise be prose, made into failing tests inside `npm run check`
// (encode-lessons-in-structure; graft from candidate 3). Each case reads source files as text and parses imports with
// the installed `typescript`, like scripts/check-boundaries.mjs. Tests are not scanned by that script, so they may
// import src/fixtures and node:fs.
import { describe, it } from "vitest";

describe("public surface", () => {
  it.todo("src/features/onboarding/index.tsx exports exactly Onboarding and AppFrame");
  it.todo("no file under src/ outside src/features/onboarding imports @/features/onboarding/<path> except @/features/onboarding/head");
  it.todo("only services/saved.ts imports @/client/storage at runtime; only src/app/page.tsx imports @/client/planner");
  it.todo("model/ imports no react, no services/ and no views/; services/ imports no react and no views/");
});

describe("repo rules F1 must not break", () => {
  it.todo("[A7][K7] no file under src/features/onboarding or src/app/page.tsx imports @/fixtures, @/server, @/engine or @/registry");
  it.todo("[A2] no file under src/features/onboarding or src/app declares z.object, z.strictObject or z.enum (no copied contract)");
  it.todo("[A6] no fetch, XMLHttpRequest, WebSocket or sendBeacon under src/features/onboarding: the injected PlannerClient is the only network");
  it.todo("[A10] no console. call under src/features/onboarding or in src/app/page.tsx");
  it.todo("no crypto.randomUUID under src/features/onboarding (a phone on plain http lacks it)");
  it.todo("no `dark:` class and no hex colour in any .tsx under src/features/onboarding: modes arrive through tokens");
  it.todo("no long dash character in any file under src/features/onboarding, src/app/page.tsx or src/app/layout.tsx");
  it.todo("[B7] src/app/layout.tsx keeps <html lang=\"en\"> and exports metadata and viewport; src/app/page.tsx exports no metadata");
});

describe("frozen files stay untouched", () => {
  it.todo("[A1][A8] src/features/ports.ts, src/features/location/index.tsx and src/features/results/index.tsx equal their main versions (git show main:path)");
  it.todo("[A2] src/contracts/**, package.json and package-lock.json equal their main versions");
});
