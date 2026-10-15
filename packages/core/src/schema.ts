import { z } from "zod";

export const GATES = ["A", "B", "C", "D", "E"] as const;
export const GateId = z.enum(GATES);
export type GateId = z.infer<typeof GateId>;

export const TASK_STATUSES = [
  "PLANNED",
  "READY",
  "RUNNING",
  "BLOCKED",
  "NEEDS_APPROVAL",
  "FAILED",
  "COMPLETED",
] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const PHASES = [
  "DISCOVERY",
  "SPECIFICATION",
  "ARCHITECTURE",
  "UI_UX",
  "IMPLEMENTATION",
  "TESTING",
  "RELEASE_READINESS",
  "DEPLOYMENT",
  "HANDOVER",
] as const;
export const Phase = z.enum(PHASES);
export type Phase = z.infer<typeof Phase>;

export const RoleId = z.enum([
  "orchestrator",
  "product",
  "architect",
  "designer",
  "frontend",
  "backend",
  "qa",
  "security",
  "devops",
  "docs",
]);
export type RoleId = z.infer<typeof RoleId>;

export const Task = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  phase: Phase,
  role: RoleId,
  /** Key into the executor registry. */
  action: z.string().min(1),
  /** Free-form parameters for the executor. */
  params: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
  /** Every listed gate must hold a current approval before the task may run. */
  gates: z.array(GateId).default([]),
  /** If set, the approval for each gate must carry exactly this scope. */
  approvalScope: z.string().optional(),
  status: TaskStatus.default("PLANNED"),
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(3),
  timeoutMs: z.number().int().positive().default(10 * 60_000),
  /** Create a checkpoint (e.g. git commit) before running. */
  checkpoint: z.boolean().default(false),
  artifacts: z.array(z.string()).default([]),
  lastError: z.string().optional(),
  blockedReason: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});
export type Task = z.infer<typeof Task>;

export const Approval = z.object({
  id: z.string(),
  projectId: z.string(),
  gate: GateId,
  decision: z.enum(["approved", "rejected"]),
  /** What exactly was approved, e.g. "cloudflare-pages:focus-board". */
  scope: z.string().optional(),
  by: z.string().min(1),
  note: z.string().optional(),
  at: z.string(),
});
export type Approval = z.infer<typeof Approval>;

export const Deployment = z.object({
  id: z.string(),
  provider: z.string(),
  target: z.string(),
  url: z.string().url().optional(),
  verified: z.boolean(),
  at: z.string(),
});
export type Deployment = z.infer<typeof Deployment>;

export const Risk = z.object({
  id: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  mitigation: z.string(),
  status: z.enum(["open", "mitigated", "accepted"]).default("open"),
});
export type Risk = z.infer<typeof Risk>;

export const Project = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  request: z.string().min(1),
  category: z.string().default("unclassified"),
  complexity: z.enum(["small", "medium", "large"]).default("small"),
  phase: Phase.default("DISCOVERY"),
  /** Absolute path of the directory the project is allowed to modify. */
  workDir: z.string(),
  approvedScope: z.string().default(""),
  deployments: z.array(Deployment).default([]),
  risks: z.array(Risk).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof Project>;

export const EventRecord = z.object({
  ts: z.string(),
  projectId: z.string(),
  type: z.string(),
  taskId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type EventRecord = z.infer<typeof EventRecord>;
