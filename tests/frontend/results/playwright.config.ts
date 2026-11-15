// A card-local Playwright config, so F3's browser run uses the card's own port. The root playwright.config.ts starts
// `npm run dev` on port 3000 and also matches results.spec.ts, so CI needs nothing from this file.
// Run: PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test -c tests/frontend/results/playwright.config.ts
// With F3_EVIDENCE=1 the teardown copies the staged evidence into docs/evidence/F3 after a complete, passing run.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.F3_PORT ?? 3200);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../../test-results/f3",
  fullyParallel: true,
  workers: 3,
  timeout: 120_000,
  globalTeardown: "./support/evidence.ts",
  use: { baseURL: origin, trace: "retain-on-failure", reducedMotion: "reduce" },
  webServer: {
    command: `npx next dev --webpack --hostname 127.0.0.1 --port ${port}`,
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
