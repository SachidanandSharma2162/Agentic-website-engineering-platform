# Agentic SDLC Platform

A reusable engineering workflow for turning a natural-language website request into a tested, deployed site, with human approval gates at every important decision.

**Status: milestones 1-7 done and milestone 8 partly done. The first site (Focus Board) is built, tested and live at https://focus-board.pages.dev; a newer release candidate is validated but not yet deployed.** See [plans/implementation-plan.md](plans/implementation-plan.md) for what exists, what is verified and what is not yet done.

## What it is (and is not)

- A **workflow orchestrator**: persistent task graph, approval gates A-E enforced in code, bounded retries, timeouts, checkpoints, resume after interruption.
- A **policy-checked command runner**: allowlisted executables, project-root path jail, scrubbed environment, secret redaction.
- **Roles** (product, architect, designer, frontend, backend, QA, security, DevOps, docs) are *sequential responsibilities*, not concurrent independent agents. Authoring tasks are completed by an **operator** (a human or an LLM session). The platform verifies the expected artifacts and checks exist. No LLM API key is needed.
- A **deployment adapter** for Cloudflare Pages (fails closed without credentials and approvals).

## Quick start

Requires Node >= 22.18 (developed on Node 26; uses built-in `node:sqlite` and native TypeScript type stripping).

```
npm install
npm test            # all unit and integration tests
npm run typecheck
npm run sdlc -- init "My Site" "a portfolio with a project gallery and contact form"
npm run sdlc -- run my-site
npm run sdlc -- status my-site
npm run sdlc -- approve my-site A --by "<your name>"
npm run sdlc -- reopen my-site quality --reason "code changed"   # re-run a task and everything downstream
npm run sdlc -- reopen my-site quality --reason "..." --new-release   # also revokes Gate C/D for a deployed site
npm run sdlc -- templates            # category templates and feature modules
```

State lives in `state/platform.db` (SQLite) with an append-only `state/events.jsonl` audit log; both are git-ignored. Set `SDLC_STATE_DIR` to use another location.

## Layout

| Path | Purpose |
|---|---|
| `packages/core` | schema (zod), SQLite store, gate engine, task graph, orchestrator, self-heal loop |
| `packages/tools` | command runner + policy, secret redaction, Git tool |
| `packages/providers` | deployment provider interface + Cloudflare Pages adapter |
| `packages/roles` | role definitions, request classifier, task-graph template, built-in executors |
| `apps/cli` | `sdlc` command |
| `examples/` | generated sites |
| `docs/` | requirements, architecture, agent design, HITL policy, security, deployment, testing strategy |

## Documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/agent-design.md](docs/agent-design.md)
- [docs/hitl-policy.md](docs/hitl-policy.md)
- [docs/security.md](docs/security.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/testing-strategy.md](docs/testing-strategy.md)
- [docs/decisions/](docs/decisions/)
