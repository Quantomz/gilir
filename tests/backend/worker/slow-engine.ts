import type { FrozenRun } from "@/contracts";
import { resultForRun } from "./support";

export function calculate(run: FrozenRun) {
  const until = Date.now() + 450;
  while (Date.now() < until) Math.sqrt(1234567);
  return resultForRun(run);
}
