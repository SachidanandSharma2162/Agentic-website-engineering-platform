# Implementation plan and status

Approved at Gate A (platform plan), scope: milestones 1-6 first; milestones 7-8 deferred.

| Milestone | Status | Evidence |
|---|---|---|
| M1 Repository audit | Done | environment inventory presented at Gate A |
| M2 Architecture and plan | Done | docs/, this file |
| M3 Minimum viable platform | **Done** | core, tools, providers, roles, CLI; `npm test` 53 passing; `npm run typecheck` clean; CLI smoke test through Gate A |
| M4 First complete website (Focus Board) | **Built and tested; not deployed** | Gates A' and B approved; 116 unit/component + 37 E2E tests, axe clean, 143 KB gzip JS; see examples/focus-board/docs/test-report.md |
| M5 Testing and self-healing on the site | **Demonstrated once** | one deliberately injected defect detected by the quality gate, repaired by the operator, full regression re-run: examples/focus-board/docs/self-heal-report.md |
| M6 Deployment adapters, live deploy | Adapter written and unit-tested with stubs; **no real deployment performed** | needs Gate C approval, Gate D approval and Cloudflare credentials |
| M7 Generalization | Deferred | |
| M8 Hardening | Deferred | |

## Platform changes made while building the first site

- `retryMode: "per-run"` (CLI default): a failed check pauses the run so an operator can repair before the next attempt.
- `reopen`: re-run a task and its dependents after a code change; requires a reason; refuses to undo a completed deployment.
- Per-attempt, timestamped evidence files; terminal colour codes stripped from evidence.
- Root vitest scoped to platform packages; example sites are standalone projects with their own lockfile.

## Not yet verified

- A real Cloudflare Pages deployment, and current free-tier limits.
- GitHub Actions workflow (`.github/workflows/ci.yml`): written but never run (no remote).
- Firefox and Safari; manual screen-reader testing of the site.
- The Cloudflare Pages `_headers` CSP and SPA fallback (only checkable on a real deployment).
- Crash-recovery with an actually killed process (logic is unit-tested via simulated state).

## Acceptance criteria for the platform MVP

1. `init` creates a schema-valid project: **met** (CLI smoke).
2. Planning produces requirements, stories, acceptance criteria, plan, risk register and halts at the next gate: **met** (draft quality; heuristic).
3. A gated task without approval cannot run: **met** (core tests).
4. Runner rejects off-allowlist commands, outside paths and redacts secrets: **met** (tools tests).
5. Resume skips completed work: **met by unit test with simulated crash**.
6. Self-heal fixes within the budget or blocks: **met in the library tests**; end-to-end on a real site is pending (M5).
7. Site-01 quality bars: **met locally** (AC1-AC17 verified by tests; AC18 needs the live URL).
8. Deploy only after approval, URL from real output, HTTP-verified: **unit-tested with stubs**; real run pending (M6).
9. Final report contains only produced evidence: pending (M4+).
