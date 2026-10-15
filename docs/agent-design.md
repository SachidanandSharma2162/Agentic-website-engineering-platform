# Agent / role design

## Honest model

The platform defines ten **roles** (see `packages/roles/src/roles.ts`): orchestrator, product, architect, designer, frontend, backend, QA, security, DevOps, docs. Each task names the role it is performed in. Roles execute **sequentially**; there are no independent concurrent agents, and reports must not claim otherwise.

## Who does the work

| Task kind | Executor | Done by |
|---|---|---|
| Draft spec docs | `builtin.generate-spec` | platform (heuristic draft; never overwrites existing files) |
| Architecture, design, implementation, tests, handover | `builtin.operator` | the **operator**: a human or an LLM session. The task reports `waiting` until the expected files exist. |
| Type-check/lint/tests/build/audit | `builtin.run-checks` | platform, via the policy-checked runner; evidence is written to `docs/evidence/` |
| Release report | `builtin.release-report` | platform, from recorded state only |
| Deploy / smoke test | `builtin.deploy`, `builtin.smoke-test` | platform, approval-gated |

An LLM provider is intentionally *not* required; adding one means implementing an executor for operator tasks behind the same interface.

## Self-healing

`selfHeal()` implements: check -> diagnose -> smallest fix -> rerun the failing check -> rerun the regression suite -> record, with a hard attempt limit. It refuses to proceed without a concrete root-cause diagnosis, rejects and reverts fixes that touch protected files (tests, lint or security configuration), counts no-op fixes as attempts, and reports `blocked` with the last failure preserved when the budget is spent. In the CLI workflow, repairs after a failed `run-checks` task are made by the operator and bounded by the task's `maxRetries` (default 3).
