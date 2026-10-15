import { checkGates } from "./gates.ts";
import { runnable, unreachable, validateGraph } from "./graph.ts";
import type { Project, Task } from "./schema.ts";
import type { StateStore } from "./store.ts";

export interface TaskResult {
  ok: boolean;
  /** Work needs an operator (human or LLM session) before it can finish; not a failure, no retry consumed. */
  waiting?: boolean;
  /** When false the failure is permanent and the task goes straight to BLOCKED. Default true. */
  retryable?: boolean;
  artifacts?: string[];
  message?: string;
  error?: string;
}

export interface TaskContext {
  project: Project;
  task: Task;
  store: StateStore;
  signal: AbortSignal;
  log: (message: string, data?: Record<string, unknown>) => void;
}

export type Executor = (ctx: TaskContext) => Promise<TaskResult>;

export interface OrchestratorOptions {
  store: StateStore;
  executors: Record<string, Executor>;
  /** Called before tasks flagged `checkpoint`. If it throws, the task is not run. */
  onCheckpoint?: (project: Project, task: Task) => Promise<void>;
  /**
   * What happens after a retryable failure.
   * "immediate" (default): the task is re-run straight away within the same run, which suits transient failures.
   * "per-run": the run stops for that task and reports it in `retrying`, so an operator can repair the cause before the
   * next run. Each run then consumes at most one retry per task, and the retry budget still bounds total attempts.
   */
  retryMode?: "immediate" | "per-run";
}

export interface RunSummary {
  completed: string[];
  needsApproval: { taskId: string; gates: string[] }[];
  waiting: { taskId: string; message: string }[];
  blocked: { taskId: string; reason: string }[];
  /** Per-run mode only: tasks that failed this run and still have retry budget; repair, then run again. */
  retrying: { taskId: string; attempt: number; maxRetries: number; error: string }[];
  unreachable: string[];
  cancelled: boolean;
  /** True only when every task is COMPLETED. */
  done: boolean;
}

export class Orchestrator {
  readonly store: StateStore;
  private executors: Record<string, Executor>;
  private onCheckpoint: OrchestratorOptions["onCheckpoint"];
  private retryMode: NonNullable<OrchestratorOptions["retryMode"]>;

  constructor(opts: OrchestratorOptions) {
    this.store = opts.store;
    this.executors = opts.executors;
    this.onCheckpoint = opts.onCheckpoint;
    this.retryMode = opts.retryMode ?? "immediate";
  }

  /** Persist a task graph (validated). Existing tasks with the same id are left untouched. */
  addTasks(projectId: string, tasks: Task[]): void {
    const existing = this.store.listTasks(projectId);
    const known = new Set(existing.map((t) => t.id));
    const fresh = tasks.filter((t) => !known.has(t.id));
    validateGraph([...existing, ...fresh]);
    for (const t of fresh) this.store.saveTask(t);
    this.store.appendEvent({ projectId, type: "tasks.added", data: { count: fresh.length } });
  }

  /** Any task left RUNNING by a crash is returned to READY; completed work is never redone. */
  recover(projectId: string): string[] {
    const recovered: string[] = [];
    for (const t of this.store.listTasks(projectId)) {
      if (t.status === "RUNNING") {
        this.store.updateTask(projectId, t.id, { status: "READY", blockedReason: "recovered after interruption" });
        this.store.appendEvent({ projectId, type: "task.recovered", taskId: t.id });
        recovered.push(t.id);
      }
    }
    return recovered;
  }

  async run(projectId: string, signal?: AbortSignal): Promise<RunSummary> {
    const project = this.store.getProject(projectId);
    if (!project) throw new Error(`Unknown project ${projectId}`);
    this.recover(projectId);

    const completed: string[] = [];
    const skippedThisRun = new Set<string>();
    const waiting = new Map<string, string>();
    const retrying = new Set<string>();
    let cancelled = false;

    for (;;) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const tasks = this.store.listTasks(projectId);
      const candidates = runnable(tasks).filter((t) => !skippedThisRun.has(t.id));
      let ran = false;
      for (const task of candidates) {
        const gate = checkGates(this.store, task);
        if (!gate.satisfied) {
          if (task.status !== "NEEDS_APPROVAL") {
            this.store.updateTask(projectId, task.id, {
              status: "NEEDS_APPROVAL",
              blockedReason: `awaiting approval: gate ${gate.missing.join(", ")}`,
            });
            this.store.appendEvent({ projectId, type: "task.needs_approval", taskId: task.id, data: { gates: gate.missing } });
          }
          skippedThisRun.add(task.id);
          continue;
        }
        const outcome = await this.execute(project, task, signal);
        if (outcome === "completed") completed.push(task.id);
        if (outcome === "waiting") {
          const t = this.store.getTask(projectId, task.id)!;
          waiting.set(task.id, t.blockedReason ?? "waiting for operator");
          skippedThisRun.add(task.id);
        }
        if (outcome === "retry" && this.retryMode === "per-run") {
          retrying.add(task.id);
          skippedThisRun.add(task.id);
        }
        if (outcome === "cancelled") cancelled = true;
        ran = true;
        break; // re-evaluate the graph after every task
      }
      if (cancelled || !ran) break;
    }

    const finalTasks = this.store.listTasks(projectId);
    return {
      completed,
      needsApproval: finalTasks
        .filter((t) => t.status === "NEEDS_APPROVAL")
        .map((t) => ({ taskId: t.id, gates: checkGates(this.store, t).missing })),
      waiting: [...waiting].map(([taskId, message]) => ({ taskId, message })),
      blocked: finalTasks
        .filter((t) => t.status === "BLOCKED" || t.status === "FAILED")
        .map((t) => ({ taskId: t.id, reason: t.lastError ?? t.blockedReason ?? "unknown" })),
      retrying: finalTasks
        .filter((t) => retrying.has(t.id) && t.status === "READY")
        .map((t) => ({ taskId: t.id, attempt: t.retryCount, maxRetries: t.maxRetries, error: t.lastError ?? "unknown" })),
      unreachable: unreachable(finalTasks).map((t) => t.id),
      cancelled,
      done: finalTasks.length > 0 && finalTasks.every((t) => t.status === "COMPLETED"),
    };
  }

  private async execute(
    project: Project,
    task: Task,
    outer?: AbortSignal,
  ): Promise<"completed" | "retry" | "blocked" | "waiting" | "cancelled"> {
    const { store } = this;
    const executor = this.executors[task.action];
    if (!executor) {
      store.updateTask(project.id, task.id, {
        status: "BLOCKED",
        lastError: `no executor registered for action "${task.action}"`,
        finishedAt: new Date().toISOString(),
      });
      store.appendEvent({ projectId: project.id, type: "task.blocked", taskId: task.id, data: { reason: "no executor" } });
      return "blocked";
    }

    if (task.checkpoint && this.onCheckpoint) {
      try {
        await this.onCheckpoint(project, task);
        store.appendEvent({ projectId: project.id, type: "checkpoint", taskId: task.id });
      } catch (e) {
        store.updateTask(project.id, task.id, { status: "BLOCKED", lastError: `checkpoint failed: ${errMsg(e)}` });
        return "blocked";
      }
    }

    store.updateTask(project.id, task.id, {
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      blockedReason: undefined,
    });
    store.appendEvent({ projectId: project.id, type: "task.started", taskId: task.id, data: { attempt: task.retryCount + 1 } });

    const ac = new AbortController();
    const onAbort = () => ac.abort();
    outer?.addEventListener("abort", onAbort);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<TaskResult>((resolve) => {
      timer = setTimeout(() => {
        ac.abort();
        resolve({ ok: false, error: `timed out after ${task.timeoutMs}ms` });
      }, task.timeoutMs);
    });

    let result: TaskResult;
    try {
      const ctx: TaskContext = {
        project,
        task,
        store,
        signal: ac.signal,
        log: (message, data) => store.appendEvent({ projectId: project.id, type: "task.log", taskId: task.id, data: { message, ...data } }),
      };
      result = await Promise.race([executor(ctx), timeout]);
    } catch (e) {
      result = { ok: false, error: errMsg(e) };
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    }

    if (outer?.aborted) {
      store.updateTask(project.id, task.id, { status: "READY", blockedReason: "cancelled" });
      store.appendEvent({ projectId: project.id, type: "task.cancelled", taskId: task.id });
      return "cancelled";
    }

    const finishedAt = new Date().toISOString();
    if (result.ok) {
      store.updateTask(project.id, task.id, {
        status: "COMPLETED",
        artifacts: result.artifacts ?? task.artifacts,
        lastError: undefined,
        blockedReason: undefined,
        finishedAt,
      });
      store.appendEvent({ projectId: project.id, type: "task.completed", taskId: task.id, data: { message: result.message } });
      return "completed";
    }

    if (result.waiting) {
      store.updateTask(project.id, task.id, { status: "READY", blockedReason: result.message ?? "waiting for operator" });
      store.appendEvent({ projectId: project.id, type: "task.waiting", taskId: task.id, data: { message: result.message } });
      return "waiting";
    }

    const retryCount = task.retryCount + 1;
    const error = result.error ?? "unknown failure";
    if (result.retryable === false || retryCount > task.maxRetries) {
      store.updateTask(project.id, task.id, { status: "BLOCKED", retryCount, lastError: error, finishedAt });
      store.appendEvent({ projectId: project.id, type: "task.blocked", taskId: task.id, data: { error, retryCount } });
      return "blocked";
    }
    store.updateTask(project.id, task.id, { status: "READY", retryCount, lastError: error });
    store.appendEvent({ projectId: project.id, type: "task.retry", taskId: task.id, data: { error, retryCount } });
    return "retry";
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
