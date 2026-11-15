// Card I3's own config, for a port of its own or a stack that already runs:
//   npx playwright test -c tests/integration/browser/playwright.config.ts
// I3_PORT picks the dev server's port (default 3300). With I3_BASE_URL no server is started.
// `npx playwright test tests/integration/browser` with the root config runs the same specs on port 3000.
import { defineConfig } from "@playwright/test";

const port = Number(process.env.I3_PORT ?? 3300);
const external = process.env.I3_BASE_URL;
const local = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../../test-results/i3",
  workers: 1,
  use: { baseURL: external ?? local, trace: "off" },
  webServer: external === undefined
    ? { command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`, url: local, reuseExistingServer: false, timeout: 120_000 }
    : undefined,
});
