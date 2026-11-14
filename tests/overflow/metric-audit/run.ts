import { assessClimate } from "@/engine/metrics";
import type { ClimateAssessment, MetricInput } from "@/contracts/engine";
import type { AssessmentMetric } from "@/contracts/result";
import { expected, fixture } from "./fixtures";

let failures = 0;
let passes = 0;
let details: string[] = [];
function check(name: string, action: () => void) {
  details = [];
  try {
    action();
    console.log(`PASS ${name}${details.length ? `: ${details.join(", ")}` : ""}`);
    passes++;
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function metric(metrics: readonly AssessmentMetric[], id: string): AssessmentMetric {
  const found = metrics.find(item => item.id === id);
  if (!found) throw new Error(`missing metric ${id}`);
  return found;
}
function number(item: AssessmentMetric): number {
  if (item.value.kind !== "available") throw new Error(`${item.id} unavailable: ${item.value.reason}`);
  if (item.unit !== "fraction") throw new Error(`${item.id} unit expected fraction, actual ${item.unit}`);
  return item.value.value;
}
function near(actual: number, wanted: number, tolerance: number = expected.tolerance) {
  if (!Number.isFinite(actual) || Math.abs(actual - wanted) > tolerance) throw new Error(`expected ${wanted} ± ${tolerance}, actual ${actual}`);
  details.push(`expected ${wanted} ± ${tolerance}, actual ${actual}`);
}
function denominator(item: AssessmentMetric, count: number, unit: "windows" | "occurrences" | "seasons") {
  if (item.denominator.kind !== "available") throw new Error(`${item.id} denominator unavailable`);
  const actual = item.denominator.value;
  if (actual.count !== count || actual.unit !== unit) throw new Error(`expected denominator ${count} ${unit}, actual ${actual.count} ${actual.unit}`);
  details.push(`denominator ${actual.count} ${actual.unit}`);
}
function assessed(input: MetricInput): Extract<ClimateAssessment, { kind: "assessed" }> {
  const result = assessClimate(input);
  if (result.kind !== "assessed") throw new Error(`expected assessed, actual ${result.kind}`);
  return result;
}
function occurrence(input: MetricInput, index: number, id: string): AssessmentMetric {
  const row = assessed(input).occurrences[index]?.seasonMetrics[0];
  if (!row) throw new Error(`missing occurrence ${index} season`);
  return metric(row.metrics, id);
}
function season(input: MetricInput, id: string): AssessmentMetric {
  const row = assessed(input).seasonMetrics[0];
  if (!row) throw new Error("missing season");
  return metric(row.metrics, id);
}
const four = fixture();
const rolling = fixture({ length: 9 });
const exactDay = fixture({ rain: [1, 100, 100, 100], windowDays: 1 });

check("adapted FAO day 187 ET0 inferred from one-day mismatch", () => {
  const item = occurrence(exactDay, 0, "mismatch");
  near(number(item), expected.dayMismatch);
  denominator(item, 4, "windows");
  const inferred = 1 / (1 - 4 * number(item));
  near(inferred, expected.dayEt0, 1e-9);
  near(inferred, 3.88, 0.02);
});
check("one-day window frequency", () => near(number(occurrence(exactDay, 0, "frequency")), 0.25));
check("four-day default window mismatch and denominator", () => {
  const item = occurrence(four, 0, "mismatch");
  near(number(item), expected.fourMismatch);
  denominator(item, 1, "windows");
});
check("four-day default window frequency", () => near(number(occurrence(four, 0, "frequency")), 1));
check("nine-day rolling frequency and denominator", () => {
  const item = occurrence(rolling, 0, "frequency");
  near(number(item), expected.meanFrequency);
  denominator(item, 3, "windows");
});
check("nine-day rolling mismatch and denominator", () => {
  const item = occurrence(rolling, 0, "mismatch");
  near(number(item), expected.meanMismatch);
  denominator(item, 3, "windows");
});
for (const repeats of [1, 2] as const) {
  const input = fixture({ length: 9, wetRepeats: repeats });
  for (const id of ["frequency", "mismatch"] as const) {
    const wanted = id === "frequency" ? expected.meanFrequency : expected.meanMismatch;
    check(`worst crop ${id} with ${repeats} wet occurrence(s)`, () => {
      const item = season(input, id);
      near(number(item), wanted);
      denominator(item, repeats + 1, "occurrences");
    });
    for (let i = 1; i <= repeats; i++) {
      check(`wet occurrence ${i} ${id} with ${repeats} wet occurrence(s)`, () => near(number(occurrence(input, i, id)), 0));
    }
  }
}
for (const precision of [0, 6]) {
  const input = fixture({ length: 9, precision });
  for (const [id, wanted] of [["mean_frequency", expected.meanFrequency], ["mean_mismatch", expected.meanMismatch]] as const) {
    check(`raw ${id} at ranking precision ${precision}`, () => {
      const item = metric(assessed(input).metrics, id);
      near(number(item), wanted);
      denominator(item, 1, "seasons");
    });
  }
}
for (const [name, input] of [
  ["missing humidity", fixture({ length: 9, missing: "humidityPct" })],
  ["missing rainfall", fixture({ length: 9, missing: "rainMm" })],
  ["zero Kc demand", fixture({ kc: 0 })],
] as const) {
  check(`${name} returns insufficient data`, () => {
    const result = assessClimate(input);
    if (result.kind !== "insufficient_data") throw new Error(`expected insufficient_data, actual ${result.kind}`);
    if (result.missing.length === 0) throw new Error("expected missing evidence");
  });
  for (const id of ["mean_frequency", "mean_mismatch"] as const) {
    check(`${name} makes ${id} unavailable`, () => {
      const item = metric(assessClimate(input).metrics, id);
      if (item.value.kind !== "unavailable") throw new Error(`expected unavailable, actual ${item.value.value}`);
    });
  }
}
console.log(`X3 engine audit: ${passes} passed, ${failures} failed, 0 skipped.`);
if (failures > 0) process.exitCode = 1;
