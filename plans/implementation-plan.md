# Implementation plan and status

Approved at Gate A (platform plan), scope: milestones 1-6 first; milestones 7-8 deferred.

| Milestone | Status | Evidence |
|---|---|---|
| M1 Repository audit | Done | environment inventory presented at Gate A |
| M2 Architecture and plan | Done | docs/, this file |
| M3 Minimum viable platform | **Done** | core, tools, providers, roles, CLI; `npm test` 53 passing; `npm run typecheck` clean; CLI smoke test through Gate A |
| M4 First complete website (Focus Board) | **Built, tested and deployed: https://focus-board.pages.dev** | Gates A' and B approved; 116 unit/component + 37 E2E tests, axe clean, 143 KB gzip JS; see examples/focus-board/docs/test-report.md |
| M5 Testing and self-healing on the site | **Demonstrated once** | one deliberately injected defect detected by the quality gate, repaired by the operator, full regression re-run: examples/focus-board/docs/self-heal-report.md |
| M6 Deployment adapters, live deploy | **Cloudflare Pages deployed for real** (Gates C and D approved, scoped to `cloudflare-pages:focus-board`); adapter now creates the missing project on first deploy | evidence: examples/focus-board/docs/evidence/ (deploy-*, smoke.json, live-verification.json). Only one provider exists; others are untested |
| M7 Generalization | **Done (templates, not a second site)** | 9 category templates, 16 feature modules with acceptance templates and Gate E flags, template-driven spec drafts, optional backend task, `sdlc templates`; 9-request generalisation matrix test; CLI run on two different requests. No second full website has been built with the platform yet |
| M8 Hardening | **Partly done** | done: crash recovery verified with a killed process, approval revocation for new releases, cross-browser E2E, production headers in local preview, CSP finding fixed, richer smoke checks, Dependabot config. Not done: see "Not yet verified" |

## Platform changes made while building the first site

- `retryMode: "per-run"` (CLI default): a failed check pauses the run so an operator can repair before the next attempt.
- `reopen`: re-run a task and its dependents after a code change; requires a reason; refuses to undo a completed deployment.
- Per-attempt, timestamped evidence files; terminal colour codes stripped from evidence.
- Root vitest scoped to platform packages; example sites are standalone projects with their own lockfile.

## Release candidate 2 (Focus Board)

Validated through the platform (117 unit/component tests; 114 E2E runs across Chrome, Firefox and WebKit; 0 audit findings). **It is not deployed**: the live site still serves the first candidate, whose bundle triggers a CSP `eval` report (harmless, caught, but visible in Firefox). Deploying candidate 2 needs fresh Gate C and D approvals (the old ones were revoked by `reopen --new-release`) and a new Cloudflare token.

## Not yet verified

- Cloudflare free-tier limits under real traffic (one 4-file deployment was made).
- GitHub Actions workflow (`.github/workflows/ci.yml`): written but never run (no remote).
- Real Safari on macOS (only Playwright's WebKit build on Windows was run); manual screen-reader testing of the site.
- GitHub Actions: no run had appeared on GitHub when last checked.
- A second, structurally different site built end to end (the templates are tested, not proven by a second build).
- Providers other than Cloudflare Pages.
- Dependabot (config written, never run).
- Crash-recovery with an actually killed process (logic is unit-tested via simulated state).

## Acceptance criteria for the platform MVP

1. `init` creates a schema-valid project: **met** (CLI smoke).
2. Planning produces requirements, stories, acceptance criteria, plan, risk register and halts at the next gate: **met** (draft quality; heuristic).
3. A gated task without approval cannot run: **met** (core tests).
4. Runner rejects off-allowlist commands, outside paths and redacts secrets: **met** (tools tests).
5. Resume skips completed work: **met by unit test with simulated crash**.
6. Self-heal fixes within the budget or blocks: **met in the library tests**; end-to-end on a real site is pending (M5).
7. Site-01 quality bars: **met locally** (AC1-AC17 verified by tests; AC18 needs the live URL).
8. Deploy only after approval, URL from real output, HTTP-verified: **met** on a real deployment (note: the built-in smoke task only checks `/` for HTTP 200; deeper checks were run separately and recorded).
9. Final report contains only produced evidence: pending (M4+).
