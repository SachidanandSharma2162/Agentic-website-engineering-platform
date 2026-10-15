# Human-in-the-loop policy

## Gates

| Gate | Approves | Enforced by |
|---|---|---|
| A | requirements and project plan | `design` (and everything after) cannot run without it |
| B | design | `implement`, `tests`, `quality`, `security`, `release` |
| C | the release candidate | `deploy` (scoped to the exact target) |
| D | deploying to a specific target/environment | `deploy`, `smoke` (scoped) |
| E | high-risk actions: spending, deleting production data, DNS, production secrets, messaging real users, sensitive data | command policy returns "approval required"; actions must be granted explicitly |

## Rules

1. Enforcement is in code (`checkGates`, the deploy executor, and the runner policy), not just convention.
2. A scoped approval (e.g. `cloudflare-pages:focus-board`) covers only that scope. An approval for another target does not satisfy the gate.
3. The latest decision wins: a rejection revokes an earlier approval.
4. Approvals are recorded with `sdlc approve <project> <gate> --by <name>`. `--by` is required. **An approval must reflect an explicit decision by the human owner. The operator/LLM must never record one on their behalf.**
5. A previously approved plan is not blanket permission for destructive or materially different actions; those need Gate E.
6. Without credentials, deploy stops with the exact missing variable names. Nothing is faked.
