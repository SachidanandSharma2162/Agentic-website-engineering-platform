# Testing strategy

## Platform (this repository)

- Runner: Vitest. `npm test` runs everything; `npm run typecheck` runs `tsc --noEmit` in strict mode.
- `packages/core`: orchestrator (gates, scoped approvals, revocation, retries, BLOCKED, waiting, timeouts, crash recovery, cancellation, checkpoints), task-graph validation, self-heal loop (pass, exhausted budget, no diagnosis, forbidden changes, regressions, no-ops).
- `packages/tools`: policy tables (allow/deny/approval), path jail, timeout kill, environment scrubbing and redaction, Git protected-branch behaviour (real temporary repositories).
- `packages/core` also has a crash test that starts a real child process, kills it while a task is RUNNING, and resumes from the same on-disk database (finished work is kept, the interrupted task re-runs once). It was checked to fail when recovery is disabled.
- `packages/roles`: planner (including the optional backend task), category templates and feature modules (registry integrity, Gate E flags, a nine-request generalisation matrix, drafts never satisfying operator tasks), executors against real temporary directories, deploy gating (scope mismatch, missing credentials, dry run), deploy and smoke with a stubbed provider and fetch (per-route status and content checks, required headers).
- `packages/providers`: the Cloudflare Pages adapter against a scripted fake runner (project creation on first deploy, no creation for other failures).
- Not covered by automated tests: the CLI argument parser; deploying to any provider other than Cloudflare Pages. The real Cloudflare deployment was exercised once by hand through the platform (see the Focus Board evidence).

## Generated sites (per project)

Type-check, lint, Vitest + React Testing Library, Playwright end-to-end at 375, 768 and 1280 px, axe-core accessibility checks, production build, `npm audit --audit-level=high`, and post-deploy smoke tests. Each run writes evidence to `docs/evidence/`.

Lessons that became rules:
- Run E2E under the **same security headers as production** (serve the `_headers` file from the preview server) and listen for `securitypolicyviolation` events: a CSP violation reached production because local runs had no CSP and Chrome did not print it to the console.
- Run the E2E suite in **Chrome, Firefox and WebKit** (`BROWSERS=all`). Firefox surfaced the CSP issue first.
- Re-run the same suite **against the live URL** (`BASE_URL=...`) after every deploy.
- Review **screenshots**: four visual defects passed every behavioural and axe check.
- Tests must **wait for first render** before measuring or pressing keys; races only show on slower hosts.

## Rules

Never delete or weaken a failing test or security check to get a green result. Use deterministic fixtures. Mock external services in unit tests and test real integrations separately.
