# Self-healing demonstration: Focus Board

Purpose: show the platform detecting a real defect through its own quality gate, bounding the retry, and verifying the repair with the full regression suite. Everything below comes from recorded evidence files, not from memory.

## What was and was not autonomous

- The defect was **deliberately introduced by the operator** (this session's engineer) into `src/domain/streaks.ts` after a green run. It is not a defect the system discovered on its own.
- **Detection, retry bounding, evidence capture and regression re-run were done by the platform** (`sdlc run`, the `quality` task, `builtin.run-checks`).
- **Diagnosis and the fix were made by the operator** reading the recorded failure output. The platform's design assigns repairs to the operator; it does not generate code. No LLM API was called by the platform.
- The demonstration was run three times while the evidence format was being improved (first two runs lost their failing evidence to overwriting, which is what motivated per-attempt timestamped files). Only the third run's evidence files are in the repository and are cited here.

## The defect

```diff
-    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
+    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 0;
```
In `bestStreak`, a new run of consecutive days started counting at 0 instead of 1 (an off-by-one). It was committed as `90b3523` for the first run; the third run used an uncommitted working-tree change that reverted to the committed (correct) code once fixed.

## Attempt 1 (failed, preserved)

Evidence: `docs/evidence/quality.2026-10-15T17-44-33-935Z.attempt-1.json`

| Check | Exit |
|---|---|
| type-check | 0 |
| lint | 0 |
| **unit-tests** | **1** |
| production-build | 0 |
| e2e (Playwright, 37 tests) | 0 |

Nine unit/component tests failed: eight `bestStreak (AC8)` cases (single day, isolated days, two runs, unordered input, leap day, DST change, duplicates, year end) and the component test `AC7 > shows streaks and the last-7-days summary`. The task returned to READY with `retry 1 of 3 used`, and the CLI stopped and printed the failure instead of silently retrying (`retryMode: "per-run"`).

## Diagnosis (from the evidence)

- Only best-streak behaviour failed. `currentStreak` tests passed, so the fault is not in the shared date arithmetic (`addDays`).
- Every failing case was under by exactly one (for example expected 3, received 2; expected 1, received 0 for a single day).
- Type-check, lint, build and all 37 E2E tests passed, so the fault is isolated to domain logic.
- Under-counting by exactly one on every run, including a run of length one, means the counter starts at 0 when a run begins. Root cause: the run-start branch of `bestStreak`.

## Fix and regression (attempt 2, passed)

Evidence: `docs/evidence/quality.2026-10-15T17-45-23-457Z.attempt-2.json`

- Change: the single character `0` back to `1` in `src/domain/streaks.ts`. No test, lint, security or build configuration file was modified (`git diff --name-only` listed only the source file and the evidence file before the rerun).
- Result: type-check, lint, unit-tests, production-build and e2e all exit 0. The regression set was the entire suite, not just the failing test.
- Task history: `quality` COMPLETED with `retries 1`.

## Platform changes this demonstration required

Running a real repair cycle exposed platform gaps, which were fixed and tested:

1. A retryable failure re-ran immediately, spending the whole retry budget before any repair. Added `retryMode: "per-run"` (CLI default).
2. A COMPLETED task could not be re-validated after a code change. Added `reopen` (resets a task and its dependents, requires a reason, refuses to undo a completed deployment).
3. Evidence from a failed attempt was overwritten by the next run. Evidence is now also written per attempt with a timestamp, and terminal colour codes are stripped.

## Limits of this demonstration

- One injected defect, one fix. It shows the loop works; it is not evidence about how often real defects get diagnosed correctly.
- The platform's `selfHeal()` library function (diagnosis gating, forbidden-file rejection, no-op detection) is unit-tested separately; this demonstration used the CLI workflow, in which the operator performs the repair.
