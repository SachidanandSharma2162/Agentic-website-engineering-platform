# Platform architecture

A modular TypeScript monolith (npm workspaces). No services, no network dependencies for the core workflow.

```
apps/cli ──> roles ──> core <── tools
               │         ▲        ▲
               └──> providers ────┘
```

## State model (packages/core)

- **Project**: id, request, category, complexity, phase, `workDir` (the only directory it may modify), deployments, risks.
- **Task**: id, role, `action` (executor key), `dependsOn`, `gates`, optional `approvalScope`, status, `retryCount`/`maxRetries`, `timeoutMs`, `checkpoint`, artifacts, `lastError`.
  Status: PLANNED, READY, RUNNING, BLOCKED, NEEDS_APPROVAL, FAILED, COMPLETED.
- **Approval**: gate A-E, decision (approved/rejected), optional exact `scope`, who, when. For a gate (and scope) the **latest** decision wins, so a rejection revokes an earlier approval.
- **Event**: append-only audit record, stored in SQLite and mirrored to `state/events.jsonl`.

Storage is SQLite via the built-in `node:sqlite` (no native build) with JSON documents validated by zod on every read and write.

## Orchestrator

`run(projectId)` loops: recover tasks left RUNNING by a crash (back to READY, completed work is never redone) -> pick tasks whose dependencies are COMPLETED -> check gates -> checkpoint (optional) -> execute with a timeout -> record the outcome -> re-evaluate the graph.

Outcomes: completed; retry (bounded by `maxRetries`, then BLOCKED with the error preserved); non-retryable failure (immediately BLOCKED); waiting for the operator (no retry consumed); cancelled (task returns to READY). Tasks downstream of a BLOCKED task are reported as unreachable; independent branches continue.

## Standard website task graph (packages/roles)

```
spec -> architecture -> design[A] -> implement[A,B]* -> tests[B] -> quality[B]  -> release[B] -> deploy[C,D]* -> smoke[D] -> handover
                                         \------------------------> security[B] -/
[X] = requires approval of gate X.  * = checkpoint (git commit + tag) first.
```

## Deployment

The deploy executor re-verifies scoped gate C and D approvals on its own, uses a dedicated runner that is the only one holding provider credentials, takes the URL from the provider's real output, and records the deployment as unverified until the smoke-test task confirms the live URL. Dry-run mode and missing credentials both end in BLOCKED, never in a reported deployment.

## Known limits

- The command policy is a guard rail, not an OS sandbox: an allowed `node file.js` or `npm run x` executes project code.
- The self-heal loop (`selfHeal`) is a tested library. In the CLI workflow the *repair* itself is done by the operator and bounded by task retries; no LLM provider is wired in yet.
- Sequential execution only.
