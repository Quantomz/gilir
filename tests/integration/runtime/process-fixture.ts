import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode === "split-event") {
  process.stdout.write('{"event":"first","value":1}\n{"event":');
  await delay(100);
  process.stdout.write('"split","value":2}\n');
} else if (mode === "exit-stall") {
  process.once("SIGTERM", () => {});
  process.stdout.write('{"event":"tick"}\n');
  setInterval(() => {}, 1000);
} else if (mode === "diagnostic-stall") {
  const { executeInThread } = await import("../../../scripts/worker");
  const { frozenRunFixture } = await import("@/fixtures/science");
  const { controlledRegistry } = await import("./support");
  await executeInThread(frozenRunFixture, controlledRegistry, fileURLToPath(new URL("./stalled-engine.ts", import.meta.url)));
} else if (mode === "signal-exit") {
  process.kill(process.pid, "SIGKILL");
} else {
  throw new Error("Unknown process fixture.");
}
