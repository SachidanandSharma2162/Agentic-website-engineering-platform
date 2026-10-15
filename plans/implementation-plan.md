# Implementation plan and status

Approved at Gate A (platform plan), scope: milestones 1-6 first; milestones 7-8 deferred.

| Milestone | Status | Evidence |
|---|---|---|
| M1 Repository audit | Done | environment inventory presented at Gate A |
| M2 Architecture and plan | Done | docs/, this file |
| M3 Minimum viable platform | **Done** | core, tools, providers, roles, CLI; `npm test` 53 passing; `npm run typecheck` clean; CLI smoke test through Gate A |
| M4 First complete website (Focus Board) | Not started | next: spec, then **Gate A'** (site requirements) |
| M5 Testing and self-healing on the site | Not started | |
| M6 Deployment adapters, live deploy | Adapter written and unit-tested with stubs; **no real deployment performed** | needs Cloudflare credentials and Gates C/D |
| M7 Generalization | Deferred | |
| M8 Hardening | Deferred | |

## Not yet verified

- A real Cloudflare Pages deployment, and current free-tier limits.
- GitHub Actions workflow (`.github/workflows/ci.yml`): written but never run (no remote).
- The Playwright / axe / Vitest-in-React toolchain on Node 26.
- Crash-recovery with an actually killed process (logic is unit-tested via simulated state).

## Acceptance criteria for the platform MVP

1. `init` creates a schema-valid project: **met** (CLI smoke).
2. Planning produces requirements, stories, acceptance criteria, plan, risk register and halts at the next gate: **met** (draft quality; heuristic).
3. A gated task without approval cannot run: **met** (core tests).
4. Runner rejects off-allowlist commands, outside paths and redacts secrets: **met** (tools tests).
5. Resume skips completed work: **met by unit test with simulated crash**.
6. Self-heal fixes within the budget or blocks: **met in the library tests**; end-to-end on a real site is pending (M5).
7. Site-01 quality bars: pending (M4/M5).
8. Deploy only after approval, URL from real output, HTTP-verified: **unit-tested with stubs**; real run pending (M6).
9. Final report contains only produced evidence: pending (M4+).
