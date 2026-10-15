# Project plan: Studio Slot

Executed as the platform task graph (`sdlc status studio-slot`).

| Task | Role | Gate | Output |
|---|---|---|---|
| spec | product | none | requirements, stories, acceptance criteria, plan, risks (done) |
| architecture | architect | none | docs/architecture.md and ADRs |
| **Gate A** | | you approve requirements, plan, hosting, assumptions | |
| design | designer | A | sitemap, design system, runnable prototype at 3 widths; computed contrast |
| **Gate B** | | you approve the design | |
| implement | frontend | A, B | React front end |
| backend | backend | A, B | Pages Functions API, D1 schema and migrations, seed data, docs/api.md |
| tests | qa | B | unit, API (real SQLite), component, E2E, a11y |
| quality | qa | B | type-check, lint, tests, build, E2E in Chrome, Firefox, WebKit |
| security | security | B | audit; authorization tests on every admin route |
| release | orchestrator | B | release report from recorded state |
| **Gate C** | | you approve the release candidate | |
| deploy | devops | C, D | **needs Gate E first**: D1 database, migrations, secrets, token permission |
| **Gate D** | | you approve the production target | |
| smoke | qa | D | routes, content, headers, full E2E on the live URL |
| handover | docs | none | README, final report |

What is different from the first site: a backend and a database, a concurrency requirement, timezone and DST logic, and server-side authorization. The platform's backend task, template-driven spec and per-route smoke checks are used for the first time on a real project.
