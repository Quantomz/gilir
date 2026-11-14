// Node environment. Parses src/app/globals.css as text. The tokens are the contract between the prototype's design and
// every component (graft from candidate 3: contrast computed from the file, so a changed token fails the build).
import { describe, it } from "vitest";

describe("Terrace tokens", () => {
  it.todo("[L6] the light, dark and high-contrast blocks each define every colour token that @theme inline maps (derived from the file, not a hand-kept list)");
  it.todo("[L6] text pairs reach 4.5:1 in all three modes: ink/bg, ink-2/bg, ink-2/sunk, on-brand/brand, leaf-text/bg, warn/warn-soft, warn/bg, water/bg, ok/ok-soft, on-night/panel, on-accent/accent");
  it.todo("[L6] control edges reach 3:1: line-strong on bg in all three modes; focus on bg in all three modes; focus-night on panel");
  it.todo("--shadow, --shadow-pop and --card-edge are never `none` (prototype-port.md 7.14)");
  it.todo("there is one dark block and no [data-theme] selector: the dark values are written once");
  it.todo("no @theme key redefines a Tailwind default (text-xl, radius-xl, any breakpoint), so F2's and F3's utilities keep their meaning");
  it.todo("[L2] --tap-min is at least 2.4rem, which is 48px at Normal on the 125% root");
  it.todo("[L7] no rule sits outside :root blocks, @theme, @custom-variant, @import or @layer, so no unlayered rule can beat a utility");
});
