# Testing strategy

## Platform (this repository)

- Runner: Vitest. `npm test` runs everything; `npm run typecheck` runs `tsc --noEmit` in strict mode.
- `packages/core`: orchestrator (gates, scoped approvals, revocation, retries, BLOCKED, waiting, timeouts, crash recovery, cancellation, checkpoints), task-graph validation, self-heal loop (pass, exhausted budget, no diagnosis, forbidden changes, regressions, no-ops).
- `packages/tools`: policy tables (allow/deny/approval), path jail, timeout kill, environment scrubbing and redaction, Git protected-branch behaviour (real temporary repositories).
- `packages/roles`: planner, executors against real temporary directories, deploy gating (scope mismatch, missing credentials, dry run), deploy and smoke with a stubbed provider and fetch.
- Not covered by automated tests: a real `wrangler` deployment (requires credentials and approval), the CLI argument parser, kill-9 recovery of a live process (the recovery logic is unit-tested by simulating the post-crash state).

## Generated sites (per project)

Type-check, lint, Vitest + React Testing Library, Playwright end-to-end at 375, 768 and 1280 px, axe-core accessibility checks, production build, `npm audit --audit-level=high`, and post-deploy smoke tests. Each run writes evidence to `docs/evidence/`.

## Rules

Never delete or weaken a failing test or security check to get a green result. Use deterministic fixtures. Mock external services in unit tests and test real integrations separately.
