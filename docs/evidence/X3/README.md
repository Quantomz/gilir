# X3 independent numerical audit

X3 adds independent reference values and a runnable comparison against the public `assessClimate` entrypoint. The audit exposes one E2 defect through four failed checks. It does not fix E2 or certify the assembled application.

## Observed E2 result

The audit ran on E2 PR #28 at `1563e0ab1f756194ebd1bbaca16f971b3c735365`. Its production source was unchanged. Only the X3 test directory was copied into that detached checkout.

The result was **25 passed, 4 failed, 0 skipped**, with exit status 1. [The full comparison log](e2-audit.log) preserves expected and observed values.

The adapted FAO ET0 example, four-day demand, rolling windows, missing humidity, missing rainfall, zero demand, and worst-crop aggregation passed. Adding wet repeats preserved the worst crop's annual values.

All four failures concern raw assessment means. The contract preserves those values for display and audit. E3 rounds them when comparing candidates.

| Assessment field | Ranking precision | Expected raw value | Observed value |
| --- | --- | --- | --- |
| `mean_frequency` | 0 | 0.6666666666666666 | 1 |
| `mean_mismatch` | 0 | 0.32214141184171 | 0 |
| `mean_frequency` | 6 | 0.6666666666666666 | 0.666667 |
| `mean_mismatch` | 6 | 0.32214141184171 | 0.322141 |

E2's `roundedMean` applies the ranking precision before returning assessment evidence. E2's owner must preserve the raw mean and leave comparison rounding to E3. These failures remain open in E2. X3's purpose is to confirm or expose numerical errors, so an accurately reported failing comparison is an audit finding.

## Run the checks

Run the reference checks from the repository root.

```sh
npx vitest run tests/overflow/metric-audit
```

These three tests check independent arithmetic and synthetic fixture validity. They explicitly report **zero engine comparisons**. They do not establish that E2 passes.

Run the actual engine audit separately.

```sh
node --import tsx tests/overflow/metric-audit/run.ts
```

The command uses that checkout's public implementation. It runs every check and exits nonzero for any exception or discrepancy. It has no skip, fallback calculator, or alternate target loader. Current main at `4334d1e995ecbadb014821be52987656e6b5c889` still has the E2 stub. [Its audit log](main-audit.log) records 0 passed and 29 failed, all due to the unimplemented entrypoint. This is not a numerical verdict on E2.

To reproduce the pinned E2 comparison, run these commands from an X3 checkout with that E2 commit available locally. Choose an unused worktree path.

```sh
git worktree add --detach /tmp/gilir-x3-e2 1563e0ab1f756194ebd1bbaca16f971b3c735365
git archive HEAD tests/overflow/metric-audit | tar -x -C /tmp/gilir-x3-e2
cd /tmp/gilir-x3-e2
npm ci
git diff --exit-code HEAD -- src
node --import tsx tests/overflow/metric-audit/run.ts
```

Record the X3 revision separately from the target revision. The detached target's HEAD identifies E2, not the copied audit files. The expected outcome for the recorded E2 revision is exit status 1 with the four failures above. Rerun against each corrected E2 revision before claiming that finding is fixed.

## Verification evidence

Verification used Node 24 and the existing disposable local PostgreSQL database.

| Check | Observed outcome |
| --- | --- |
| X3 Vitest filter | 3 reference tests passed; zero engine comparisons |
| `npm run check` | 294 passed, 1 intentional live-climate skip; typecheck and import boundaries passed |
| `npm run build` | Passed |
| Main public audit | Exit 1; 0 passed, 29 unimplemented-entrypoint failures |
| Exact E2 PR28 public audit | Exit 1; 25 passed, 4 raw-mean precision failures |
| Deliberately wrong reference | Increasing expected daily ET0 by 1 mm/day produced the expected additional failure; the original fixture was restored |

Logs are [check.log](check.log), [build.log](build.log), and [negative-control.log](negative-control.log). The negative control changed only an X3 expectation in the disposable E2 checkout. It did not change E2 source.

Read [the source derivation and tolerances](reference.md). A separate source reviewer independently recalculated every daily value and rolling window without inspecting E2 or candidate code. Agreement was within 1e-12. The source review establishes the worksheet, not the implementation's correctness.

## Scope and review

All changed files belong to `tests/overflow/metric-audit/` or `docs/evidence/X3/`. Production code, contracts, dependencies, E1 data, and E2 implementation are unchanged. The fixtures are synthetic component evidence. They do not prove real NASA ingestion, crop applicability, deployed behavior, or I1/I2/I3 completion.

This work uses `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, the Feature playbook, and separate architecture and implementation candidates. Model the Domain gives the fixtures public typed inputs. Test Behavior, Not Implementation keeps comparisons on `assessClimate`. Separate Before Serializing Shared State gives candidates isolated worktrees. Prove It Works requires the actual pinned E2 execution, including its failures.

The operator configured no cross-family judge, so no cross-family review is claimed. The dedicated Comment Sicko agent type is unavailable in this host. A fresh independent reviewer checks comments, suppressions, code, and evidence instead. Final review evidence is recorded separately before merge.
