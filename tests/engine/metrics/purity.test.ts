import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static guard on top of scripts/check-boundaries.mjs, scoped to E2's own files.
const root = join(process.cwd(), "src/engine");
const dir = join(root, "metrics");
const files = () => [
  join(root, "metrics.ts"),
  ...(existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(f => f.endsWith(".ts")).map(f => join(dir, f)) : []),
];
const imports = (text: string) => [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(m => m[1]);

describe("engine purity", () => {
  it("the metrics module directory exists (a missing implementation is not a pass)", () => {
    expect(existsSync(dir)).toBe(true);
    expect(files().length).toBeGreaterThan(1);
  });

  it("imports only contracts, engine or registry modules (no React, Next, pg, node:, server or fixtures)", () => {
    for (const file of files()) {
      for (const spec of imports(readFileSync(file, "utf8"))) {
        const local = spec.startsWith("@/") || spec.startsWith(".");
        expect(local, `${file} imports ${spec}`).toBe(true);
        expect(spec, `${file} imports ${spec}`).not.toMatch(/^@\/(?!contracts|engine|registry)/);
      }
    }
  });

  it("has no network, randomness or wall-clock calls", () => {
    for (const file of files()) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\bfetch\s*\(/);
      expect(text, file).not.toMatch(/Math\.random\s*\(/);
      expect(text, file).not.toMatch(/Date\.now\s*\(/);
      expect(text, file).not.toMatch(/new Date\(\s*\)/);
      expect(text, file).not.toMatch(/performance\.now\s*\(/);
    }
  });

  it("does not compute any pest or weed metric (spec 1.1)", () => {
    for (const file of files()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/rule_breaches|break_shortfall/);
    }
  });
});
