# F2 logo comment review

The goal is to preserve the approved linked MapTiler logo fix while checking only new or changed comments and suppressions.

The scoped comment-hygiene review passes with no required fixes. This is not an independent functional verdict.

Reviewed `fix/f2-maptiler-logo` against `4692f82e9aed34ff8ab1a108b41c0811b5637563`, including its working tree. The final observed HEAD was `578177da54157fb7f77b3e7ca17bc936eceb7bb9`. All seven scoped files were committed and clean at the final check.

The scope includes `src/features/location/provider.ts`, `src/features/location/views/map.tsx`, `src/features/location/location.css`, `tests/frontend/location/live.spec.ts`, `tests/frontend/location/provider.spec.ts`, `tests/frontend/location/ui/picker.test.tsx`, and the new `public/maptiler-logo.svg` asset. Generated `AGENTS.md` content, the `node_modules` symlink, and existing comments outside changed lines were excluded from findings.

This refreshed review includes the fallback grid, responsive heights shared through grouped selectors, the fallback footer regression cases at 360 and 1280 pixels, and the live logo assertion and screenshot framing.

The final incremental review inspected only the diff from `f8462257ddaf8cff9b7a5cab8ba02d92d1287060` to `578177da54157fb7f77b3e7ca17bc936eceb7bb9`. That delta changes `src/features/location/location.css` and `tests/frontend/location/live.spec.ts`. It replaces custom properties with grouped selectors and frames the existing live fallback screenshot around `.fp-map-wrap`. It adds or removes no comments and adds no suppressions. The earlier scoped verdict therefore carries forward to the final commit.

- New or changed comments in the scoped diff. 0.
- Comment deletions already present in the scoped diff. 1.
- Comments deleted or restored by this reviewer. 0.
- New lint, TypeScript, formatting, or coverage suppressions. 0.
- Suppressions found anywhere in the six scoped source and test files. 0.
- XML comments in the new SVG. 0. No provenance comment requires a keep decision.
- Review refreshes after source changes. 2. Rejected-report reruns. 0.
- Architect sketches, implementation fixes, encoding offers, encodings, unenforced comment constraints, and open comment findings. None.

The deleted CSS comment claimed map-footer content never takes taps. The new provider link intentionally restores pointer events through `.fp-provider-logo`. Removing that comment is consistent with the changed behavior, and the CSS states the behavior directly. No replacement comment is needed.

Verification inspected the actual diff and scanned its added and removed lines for comment tokens and suppression directives. The full scoped source and test files were also scanned for ESLint, TSLint, Stylelint, TypeScript, Prettier, coverage, Biome, and Deno suppressions. It separately scanned the SVG for XML comments. The Prove It Works principle required checking the current files instead of relying on the parent report.

The final scoped zero-context diff SHA-256 was `ea4813776266d84240ef2ceacefae451e1bb979c140c47a813e7b209bd8fc839`. This identity covers the six source and test files listed above relative to the base commit. The final incremental zero-context diff SHA-256 was `6829f9262341df3943de617e7a5add82dadad99ec3d622bee50f687e27475bdc`. The separately checked 16,656-byte SVG SHA-256 remained `c2fef38a1e77e9ff774dc1b21a2e931c81eab12191395be726c594404e4bf332`.

The review used `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and `/Users/kyusuku/.codex/skills/no-comments/SKILL.md`. It remained read-only in the repository. No child agents were started because the caller explicitly prohibited them. No credentials, external services, browser behavior, asset-origin comparison, tests, or deployment were inspected or run by this reviewer.
