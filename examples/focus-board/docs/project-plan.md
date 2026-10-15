# Project plan: Focus Board

Executed as the platform task graph (`sdlc status focus-board`).

| Task | Role | Gate required | Output |
|---|---|---|---|
| spec | product | none | requirements, stories, acceptance criteria, plan, risk register |
| architecture | architect | none | docs/architecture.md |
| **Gate A'** | | you approve requirements, plan, hosting | |
| design | designer | A | sitemap, design system, runnable HTML prototype (desktop/tablet/mobile) |
| **Gate B** | | you approve the design | |
| implement | frontend | A, B | app code (checkpoint commit first) |
| tests | qa | B | unit, component, E2E, a11y tests |
| quality | qa | B | type-check, lint, tests, build; evidence recorded |
| security | security | B | `npm audit --audit-level=high` |
| release | orchestrator | B | release report built from recorded state |
| **Gate C** | | you approve the release candidate | |
| deploy | devops | C, D (scope `cloudflare-pages:focus-board`) | live URL from provider output |
| **Gate D** | | you approve deploying to that target (needs your Cloudflare credentials) | |
| smoke | qa | D | production smoke tests |
| handover | docs | none | README, final report |

Planned demonstration of self-healing: an off-by-one defect in streak calculation is introduced after the first green run; the tests must catch it, it is diagnosed and fixed, and the regression suite re-run.
