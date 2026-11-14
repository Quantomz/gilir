# X1 independent crop-source audit

**Source verdict: ISSUES.** This audit identifies source agreements, qualifications and unresolved mappings in [E1 PR #33](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/33) at `090626a6b172fb05901a5e4fafa15be497bcae7e`. It does not approve E1 for release or establish farm suitability. Findings belong to [E1 issue #8](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/8); X1 is [issue #14](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/14).

## Scope and evidence

| Layer | Coverage | Meaning |
| --- | --- | --- |
| Core executable comparison | Original 12 profiles in first and latest releases: 24 profile instances | Timing, Kc, planting-month interpretation and scheduling-assumption agreement with independently extracted source values |
| Expanded FAO source review | 86 distinct profiles, 42 crop purposes; 229 repeated release instances | Cited source rows and explicit qualifications; this broader review is separate from the core runner |
| Temperature source review | 32 distinct rules across 22 crop purposes in the latest release | 28 mappings unsupported by accessed evidence; 4 unverified overall with a demonstrated co-citation mismatch |
| Applicability probes | 12 resolver calls at four illustrative points | Actual resolver behavior with synthetic annual climates; no field or NASA validation |

The first release (`fao56-2026-11-14`) has 12 profiles and **zero temperature rules**. The latest (`fao56-temperature-rules-2026-11-15`) has 86 profiles and 32 unique temperature rules. Twenty latest crop purposes have no released temperature rule. None of the 32 complete daily mappings was established by the evidence accessed; this is not a claim that their numbers were all disproved.

- [FAO review](fao-review.md) and [source comparisons](fao-source-comparison.json): all 258 selected Kc numbers agree with source rows, inheritance or ranges. Evidence support for the checked fields is 67 supported, 14 qualified and 5 literal-source discrepancies. Those five concern conflicting duration totals, not five proven agronomic errors.
- [Grains and pulses](temperature-grains-and-pulses.md), with [structured records](x1-temperature-a.json): 19 rules, source measurements, periods, stages and access gaps.
- [Vegetables and potato](temperature-vegetables.md), with [structured records](x1-temperature-b.json): 13 rules, including constant seed incubation, night means and multi-hour experiments converted to daily weather predicates.
- [Applicability](applicability.md), with [captured probes](applicability-probes.json): source conditions recorded in prose can remain unenforced by regional rectangles and recommended months.

## Findings for the profile owner

The temperature mappings need exact support for their variable, exposure period and sensitive stage under spec 5.3. Matching a treatment temperature does not establish an isolated daily threshold. Source limitations and original-publication access gaps remain explicit. Unsupported rules can remain unassessed while plans are generated; temperature does not enter ranking.

The FAO review requests clarification of derived versus printed duration totals, dry-faba harvest applicability and conditional stalk management, and the pepper month interpretation. Existing disclosed qualifications are preserved. The audit neither patches the owner's active data nor invents replacement scientific thresholds.

## Verification

Observed with Node v24.22.3 on 15 November 2026 (Asia/Bangkok):

| Command | Observed result |
| --- | --- |
| `npx vitest run tests/overflow/profile-audit` | 21 passed; worksheet and synthetic mechanics, zero real-subject comparisons |
| `npm run check` with all three test-database variables set | 497 passed, 1 skipped; real disposable PostgreSQL 18; typecheck and module boundaries passed |
| `npm run build` | Production build passed |
| Pinned CLI below | Complete; 24 core profile comparisons, 302 mechanical checks, zero mechanical discrepancies; source findings retained; exit 1 |
| Same CLI with a 40-zero SHA | Incomplete; zero profile comparisons; findings retained; exit 2 |

The skipped test is strict live I1 acceptance, which requires `I1_LIVE=1`. Controlled runtime/database tests passing do not complete I1. X1 made no new live NASA retrieval or deployment claim.

```sh
TSX_DISABLE_CACHE=1 node --import tsx tests/overflow/profile-audit/run.ts \
  --subject /absolute/path/to/clean-e1-checkout \
  --expect-sha 090626a6b172fb05901a5e4fafa15be497bcae7e
```

The subject checkout must contain that exact commit, installed dependencies, and no source/config overlays. A normal `node_modules` directory or an existing symlink is accepted. The runner uses the subject's cwd, tsconfig and public registry entrypoint, with a bounded subprocess and a minimal environment. It checks the subject before and after execution and records resolved dependencies and file hashes. It neither fetches data nor changes the subject.

Exit 0 means complete without findings; exit 1 means complete with discrepancies or unresolved source findings; exit 2 means incomplete execution or invalid evidence/subject. The expected result for this subject is **1**, even though all core mechanical checks agree. Twenty-eight unsupported and four unverified temperature mappings, seven FAO finding records and all qualifications remain visible.

[Verification summary](verification.json) records hashes, counts, commands and limitations. Its pre-commit capture binds the tested implementation bytes by hash; the recorded checkout HEAD is the base, not an assertion that the new files already existed in that commit. Independent PR review binds the final committed change separately.

## Workflow and limits

Pstack entrypoint: `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Feature playbook. Grounding used the public registry contract. Independent source partitions covered FAO and two temperature families. Two design candidates considered a static report, a full executable claim framework and a bounded executable core; both selected the bounded core plus explicit expanded evidence. Implementation candidates use isolated worktrees. Root coordinates evidence packaging and final integration.

The throughput checkpoint was: freeze subject/source scope before implementation; parallelize independent source families and isolated candidates; keep E1 read-only and final writes under one owner; keep the coupled runner and worksheet together. The operator configured no cross-family judge pool. All model reviews are GPT-family and local to this workflow; no Cursor cloud, cross-family, human or agronomist approval is claimed.

Publications are linked, with factual cells and paraphrased findings retained. Full texts and local browser captures are not bundled. A reproduced FAO table is not an independent agronomic experiment. Numeric agreement, source support, resolver behavior, CI, deployment and end-to-end integration are distinct evidence layers. X1 completion does not complete I1, I2 or I3.
