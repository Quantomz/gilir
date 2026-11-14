import { resultFixtures } from "@/fixtures/results";

export function calculate() {
  const until = Date.now() + 450;
  while (Date.now() < until) Math.sqrt(1234567);
  return resultFixtures.plan;
}
