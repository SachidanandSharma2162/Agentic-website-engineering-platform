import type { Approval, GateId, Task } from "./schema.ts";
import type { StateStore } from "./store.ts";

export const GATE_DESCRIPTIONS: Record<GateId, string> = {
  A: "Requirements and project plan",
  B: "Design approval",
  C: "Implementation and release candidate",
  D: "Production deployment (target and environment)",
  E: "High-risk action (spend, delete, DNS, secrets, real-user messages, sensitive data)",
};

/**
 * The latest decision for a gate (and scope, when scoped) wins, so a later rejection
 * revokes an earlier approval and a re-approval restores it.
 */
export function currentApproval(store: StateStore, projectId: string, gate: GateId, scope?: string): Approval | undefined {
  const all = store.listApprovals(projectId, gate);
  const relevant = scope === undefined ? all : all.filter((a) => a.scope === scope);
  return relevant.at(-1);
}

export interface GateCheck {
  satisfied: boolean;
  missing: GateId[];
}

export function checkGates(store: StateStore, task: Task): GateCheck {
  const missing: GateId[] = [];
  for (const gate of task.gates) {
    const a = currentApproval(store, task.projectId, gate, task.approvalScope);
    if (!a || a.decision !== "approved") missing.push(gate);
  }
  return { satisfied: missing.length === 0, missing };
}
