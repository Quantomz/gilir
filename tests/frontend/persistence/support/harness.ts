// Vite comes from `vitest/node` because vite is not a direct dependency.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, test as base } from "@playwright/test";
import type { BrowserContext, Frame, Page } from "@playwright/test";
import { chromiumPath } from "./chromium";

const repo = resolve(import.meta.dirname, "../../../..");

export interface Harness {
  /** "http://127.0.0.1:<port>". The farmer's shelf at /, the lab's at /dev/fixtures/, an opaque origin at /sandboxed.html. */
  readonly origin: string;
  close(): Promise<void>;
}

/**
 * Port 0 lets parallel workers under the root config take free ports. `cors: true` lets sandboxed.html load the modules
 * from its opaque origin. The dependencies are bundled before the first page asks for them, because Vite reloads a page
 * when it discovers a new dependency.
 */
export async function serveHarness(): Promise<Harness> {
  const { createViteServer } = await import("vitest/node");
  const server = await createViteServer({
    configFile: false,
    root: join(repo, "tests/frontend/persistence/harness"),
    cacheDir: join(tmpdir(), "gilir-f4-harness-vite"),
    resolve: { alias: { "@": join(repo, "src") } },
    optimizeDeps: { include: ["idb", "zod", "pdf-lib"], noDiscovery: true },
    plugins: [withoutViteClient],
    server: { host: "127.0.0.1", port: Number(process.env.F4_PORT ?? 0), strictPort: true, cors: true, fs: { allow: [repo] }, hmr: false, ws: false },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") throw new Error("The harness has no port.");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

/** Vite's client script reloads the page when its socket drops, which an offline test causes. */
const withoutViteClient = {
  name: "gilir-f4-without-vite-client",
  transformIndexHtml: {
    order: "post" as const,
    handler: (html: string) => html.replace(/<script type="module" src="\/@vite\/client"><\/script>/, ""),
  },
};

export const test = base.extend<{}, { harness: Harness }>({
  harness: [
    async ({}, use) => {
      const harness = await serveHarness();
      await use(harness);
      await harness.close();
    },
    { scope: "worker" },
  ],
});

export async function openHarness(page: Page, url: string): Promise<Page> {
  await page.goto(url);
  await page.waitForFunction(() => window.gilirF4 !== undefined);
  return page;
}

/** The harness inside sandboxed.html's frame, an opaque origin where IndexedDB throws SecurityError. */
export async function sandboxedHarness(page: Page, origin: string): Promise<Frame> {
  await page.goto(`${origin}/sandboxed.html`);
  const frame = page.frames().find(candidate => candidate !== page.mainFrame());
  if (frame === undefined) throw new Error("sandboxed.html has no frame.");
  await frame.waitForFunction(() => window.gilirF4 !== undefined);
  return frame;
}

/** Every browser `run` launched is closed and the user data folder removed afterwards. */
export async function withUserDataFolder<T>(run: (launch: () => Promise<BrowserContext>) => Promise<T>): Promise<T> {
  const folder = await mkdtemp(join(tmpdir(), "gilir-f4-profile-"));
  const open: BrowserContext[] = [];
  const launch = async () => {
    const context = await chromium.launchPersistentContext(folder, {
      executablePath: chromiumPath,
      headless: true,
    });
    open.push(context);
    return context;
  };
  try {
    return await run(launch);
  } finally {
    await Promise.all(open.map(context => context.close().catch(() => undefined)));
    await rm(folder, { recursive: true, force: true });
  }
}
