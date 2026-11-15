// CI does not run Playwright. Run it locally:
//   PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test -c tests/frontend/persistence/playwright.config.ts
// The harness takes a free port, so runs can overlap. Set F4_PORT to pin one.
import { defineConfig } from "@playwright/test";
import { chromiumPath } from "./support/chromium";

export default defineConfig({
  testDir: "..",
  testMatch: ["persistence/*.spec.ts", "pdf/*.spec.ts"],
  workers: 1,
  use: {
    acceptDownloads: true,
    launchOptions: { executablePath: chromiumPath },
    trace: "retain-on-failure",
  },
});
