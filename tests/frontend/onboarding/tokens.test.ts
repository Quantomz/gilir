// The Terrace tokens in src/app/globals.css are the contract between the design and every component, so these cases
// read the file itself: a changed token fails here, not on a farmer's phone.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const globalsPath = resolve(repo, "src/app/globals.css");
const globals = readFileSync(globalsPath, "utf8");

interface Rule {
  readonly prelude: string;
  readonly body: string | null;
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The top-level rules of a stylesheet: statements end in `;`, blocks keep their raw body. */
function rulesOf(css: string): Rule[] {
  const text = withoutComments(css);
  const rules: Rule[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === ";") {
      rules.push({ prelude: text.slice(start, i).trim(), body: null });
      start = i + 1;
    } else if (char === "{") {
      let depth = 1;
      let j = i + 1;
      while (depth > 0 && j < text.length) {
        if (text[j] === "{") depth += 1;
        if (text[j] === "}") depth -= 1;
        j += 1;
      }
      rules.push({ prelude: text.slice(start, i).trim(), body: text.slice(i + 1, j - 1) });
      start = j;
      i = j;
      continue;
    }
    i += 1;
  }
  return rules.filter(rule => rule.prelude !== "" || rule.body !== null);
}

function declarationsOf(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return found;
}

function blockBody(rules: readonly Rule[], prelude: string): string {
  const rule = rules.find(entry => entry.prelude === prelude);
  if (!rule?.body) throw new Error(`no ${prelude} block`);
  return rule.body;
}

const topLevel = rulesOf(globals);
const darkMedia = blockBody(topLevel, "@media (prefers-color-scheme: dark)");
const light = declarationsOf(blockBody(topLevel, ":root"));
const modes = {
  light,
  dark: declarationsOf(blockBody(rulesOf(darkMedia), ':root:not([data-contrast="high"])')),
  "high contrast": declarationsOf(blockBody(topLevel, ':root[data-contrast="high"]')),
} as const;
const theme = declarationsOf(blockBody(topLevel, "@theme inline"));

/** A mode block overrides :root, so a token it leaves out keeps its light value. */
function valueIn(mode: keyof typeof modes, token: string): string {
  const value = modes[mode].get(token) ?? light.get(token);
  if (value === undefined) throw new Error(`${token} is not defined`);
  return value;
}

function luminance(hex: string): number {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? [...digits].map(d => d + d).join("") : digits;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`${hex} is not a hex colour`);
  const [r, g, b] = [0, 2, 4].map(at => {
    const channel = parseInt(full.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function shortfalls(pairs: readonly string[], minimum: number): string[] {
  return Object.keys(modes).flatMap(mode =>
    pairs.flatMap(pair => {
      const [fg, bg] = pair.split("/");
      const ratio = contrast(valueIn(mode as keyof typeof modes, `--${fg}`), valueIn(mode as keyof typeof modes, `--${bg}`));
      return ratio < minimum ? [`${mode} ${pair} ${ratio.toFixed(2)}`] : [];
    }),
  );
}

describe("Terrace tokens", () => {
  it("[L6] the light, dark and high-contrast blocks each define every colour token that @theme inline maps (derived from the file, not a hand-kept list)", () => {
    const mapped = [...theme].filter(([key]) => key.startsWith("--color-")).map(([, value]) => value.match(/^var\((--[\w-]+)\)$/)?.[1] ?? value);
    expect(mapped).toContain("--bg");
    expect(mapped).toContain("--ink");
    for (const [mode, declarations] of Object.entries(modes)) {
      expect({ mode, missing: mapped.filter(token => !declarations.has(token)) }).toEqual({ mode, missing: [] });
    }
  });

  it("[L6] text pairs reach 4.5:1 in all three modes", () => {
    const text = [
      "ink/bg", "ink-2/bg", "ink-2/sunk", "on-brand/brand", "leaf-text/bg", "warn/warn-soft", "warn/bg", "water/bg", "ok/ok-soft",
      "on-night/panel", "on-accent/accent", "ink/raised", "ink-2/raised", "ink/sunk", "ink/mint", "ink/water-soft", "warn/raised",
      "leaf-text/raised", "leaf-text/mint", "water/raised", "ok/raised", "bg/warn", "on-mint-pill/mint-pill", "on-sprout/sprout",
    ];
    expect(shortfalls(text, 4.5)).toEqual([]);
  });

  it("[L6] control edges and focus rings reach 3:1 in all three modes", () => {
    const edges = ["line-strong/bg", "line-strong/raised", "line-strong/sunk", "focus/bg", "focus/raised", "focus/mint", "focus-night/panel"];
    expect(shortfalls(edges, 3)).toEqual([]);
  });

  it("the contrast check fails a pair that is too faint, so a passing run means something", () => {
    expect(contrast("#7EDE56", "#F3F6F0")).toBeLessThan(3);
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("--shadow, --shadow-pop and --card-edge are never `none`, because they sit in comma lists", () => {
    for (const [mode, declarations] of Object.entries(modes)) {
      for (const token of ["--shadow", "--shadow-pop", "--card-edge"]) {
        const value = declarations.get(token);
        expect({ mode, token, defined: value !== undefined, none: /\bnone\b/.test(value ?? "") }).toEqual({ mode, token, defined: true, none: false });
      }
    }
  });

  it("there is one dark block and no [data-theme] selector: the dark values are written once", () => {
    const css = withoutComments(globals);
    expect(css.match(/prefers-color-scheme:\s*dark/g)).toHaveLength(1);
    expect(css).not.toContain("data-theme");
  });

  it("no @theme key redefines a Tailwind default (text-xl, radius-xl, any breakpoint), so F2's and F3's utilities keep their meaning", () => {
    const tailwindTheme = readFileSync(resolve(repo, "node_modules/tailwindcss/theme.css"), "utf8");
    const defaults = new Set(rulesOf(tailwindTheme).flatMap(rule => (rule.prelude.startsWith("@theme") && rule.body ? [...declarationsOf(rule.body).keys()] : [])));
    expect(defaults).toContain("--text-xl");
    expect(defaults).toContain("--radius-xl");
    const ours = [...theme.keys()];
    expect(ours.filter(key => defaults.has(key) || key.startsWith("--breakpoint-") || key.endsWith("-*"))).toEqual([]);
  });

  it("[L2] --tap-min is at least 48px at Normal, because the root is 125% of 16px", () => {
    const base = rulesOf(blockBody(topLevel, "@layer base"));
    const rootSize = declarationsOf(blockBody(base, "html")).get("font-size");
    expect(rootSize).toBe("calc(125% * var(--scale))");
    const tapMin = light.get("--tap-min") ?? "";
    expect(tapMin).toMatch(/^[\d.]+rem$/);
    expect(parseFloat(tapMin) * 16 * 1.25).toBeGreaterThanOrEqual(48);
  });

  it("[L7] no rule sits outside :root blocks, @theme, @custom-variant, @source, @import or @layer, so no unlayered rule can beat a utility", () => {
    const stray = topLevel.filter(rule => {
      if (/^@(import|custom-variant|source)\b/.test(rule.prelude) && rule.body === null) return false;
      if (/^@(theme|layer)\b/.test(rule.prelude)) return false;
      if (/^:root\b/.test(rule.prelude)) return false;
      if (rule.prelude === "@media (prefers-color-scheme: dark)" && rule.body) return !rulesOf(rule.body).every(inner => inner.prelude.startsWith(":root"));
      return true;
    });
    expect(stray.map(rule => rule.prelude)).toEqual([]);
    const terrace = rulesOf(readFileSync(resolve(repo, "src/features/onboarding/terrace.css"), "utf8"));
    expect(terrace.map(rule => rule.prelude)).toEqual(["@layer components"]);
  });

  it("[L7] Tailwind compiles globals.css, and token utilities read the live token, so they follow the mode", async () => {
    const compiler = await compile(globals, {
      base: dirname(globalsPath),
      from: globalsPath,
      loadStylesheet: async (id, base) => {
        const path = id === "tailwindcss" ? resolve(repo, "node_modules/tailwindcss/index.css") : resolve(base, id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    });
    const css = compiler.build(["bg-raised", "text-title", "min-h-tap-min", "shadow-card", "hc:border-ink", "big-text:grid-cols-1"]);
    const ruleFor = (selector: string) => css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector)) + 1);
    expect(ruleFor(".bg-raised")).toContain("background-color: var(--raised)");
    expect(ruleFor(".text-title")).toContain("font-size: var(--fs-xl)");
    expect(ruleFor(".min-h-tap-min")).toContain("min-height: var(--tap-min)");
    expect(ruleFor(".shadow-card")).toContain("var(--shadow), var(--card-edge)");
    expect(css).toMatch(/\.hc\\:border-ink:where\(\[data-contrast="high"\], \[data-contrast="high"\] \*\)/);
    expect(css).toMatch(/\.big-text\\:grid-cols-1:where\(\.big-text, \.big-text \*\)/);
    expect(css).toMatch(/@layer components \{[\s\S]*\.ly-h-plant/);
  });
});
