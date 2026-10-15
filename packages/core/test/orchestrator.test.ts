import { beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, StateStore, Task, validateGraph, type Executor } from "../src/index.ts";

const PID = "p1";
const mk = (id: string, extra: Partial<Task> = {}): Task =>
  Task.parse({ id, projectId: PID, title: id, phase: "IMPLEMENTATION", role: "frontend", action: "ok", ...extra });

let store: StateStore;
const ok: Executor = async () => ({ ok: true });

function setup(executors: Record<string, Executor>, tasks: Task[]) {
  store = new StateStore(":memory:");
  const now = new Date().toISOString();
  store.saveProject({
    id: PID, name: "t", request: "r", category: "x", complexity: "small", phase: "DISCOVERY",
    workDir: process.cwd(), approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now,
  });
  const orch = new Orchestrator({ store, executors });
  orch.addTasks(PID, tasks);
  return orch;
}

describe("task graph", () => {
  it("rejects cycles, unknown deps and duplicates", () => {
    expect(() => validateGraph([mk("a", { dependsOn: ["b"] }), mk("b", { dependsOn: ["a"] })])).toThrow(/cycle/i);
    expect(() => validateGraph([mk("a", { dependsOn: ["zzz"] })])).toThrow(/unknown/);
    expect(() => validateGraph([mk("a"), mk("a")])).toThrow(/Duplicate/);
  });
});

describe("approval gates", () => {
  beforeEach(() => {});

  it("does not run a gated task without approval", async () => {
    let ran = false;
    const orch = setup({ ok: async () => ((ran = true), { ok: true }) }, [mk("t", { gates: ["A"] })]);
    const s = await orch.run(PID);
    expect(ran).toBe(false);
    expect(store.getTask(PID, "t")!.status).toBe("NEEDS_APPROVAL");
    expect(s.needsApproval).toEqual([{ taskId: "t", gates: ["A"] }]);
    expect(s.done).toBe(false);
  });

  it("runs after approval, and a later rejection revokes it", async () => {
    const orch = setup({ ok }, [mk("t", { gates: ["A"] })]);
    await orch.run(PID);
    store.recordApproval({ projectId: PID, gate: "A", decision: "approved", by: "user" });
    const s = await orch.run(PID);
    expect(s.completed).toEqual(["t"]);

    const orch2 = setup({ ok }, [mk("t", { gates: ["A"] })]);
    store.recordApproval({ projectId: PID, gate: "A", decision: "approved", by: "user" });
    store.recordApproval({ projectId: PID, gate: "A", decision: "rejected", by: "user" });
    const s2 = await orch2.run(PID);
    expect(s2.completed).toEqual([]);
  });

  it("requires every listed gate, and an exact scope match when scoped", async () => {
    const orch = setup({ ok }, [mk("deploy", { gates: ["C", "D"], approvalScope: "cloudflare-pages:site" })]);
    store.recordApproval({ projectId: PID, gate: "C", decision: "approved", by: "u", scope: "cloudflare-pages:site" });
    let s = await orch.run(PID);
    expect(s.needsApproval[0]?.gates).toEqual(["D"]);
    store.recordApproval({ projectId: PID, gate: "D", decision: "approved", by: "u", scope: "cloudflare-pages:OTHER" });
    s = await orch.run(PID);
    expect(s.completed).toEqual([]);
    store.recordApproval({ projectId: PID, gate: "D", decision: "approved", by: "u", scope: "cloudflare-pages:site" });
    s = await orch.run(PID);
    expect(s.completed).toEqual(["deploy"]);
  });
});

describe("retries, blocking, waiting, timeouts", () => {
  it("retries up to maxRetries then BLOCKS and preserves the error", async () => {
    let calls = 0;
    const orch = setup({ ok: async () => (calls++, { ok: false, error: "boom" }) }, [mk("t", { maxRetries: 2 }), mk("after", { dependsOn: ["t"] })]);
    const s = await orch.run(PID);
    expect(calls).toBe(3); // first attempt + 2 retries
    expect(store.getTask(PID, "t")).toMatchObject({ status: "BLOCKED", lastError: "boom", retryCount: 3 });
    expect(s.blocked[0]?.taskId).toBe("t");
    expect(s.unreachable).toEqual(["after"]);
  });

  it("succeeds when a retry works", async () => {
    let calls = 0;
    const orch = setup({ ok: async () => (++calls < 2 ? { ok: false, error: "flaky" } : { ok: true }) }, [mk("t")]);
    const s = await orch.run(PID);
    expect(s.done).toBe(true);
    expect(calls).toBe(2);
  });

  it("non-retryable failures block immediately", async () => {
    let calls = 0;
    const orch = setup({ ok: async () => (calls++, { ok: false, retryable: false, error: "nope" }) }, [mk("t")]);
    await orch.run(PID);
    expect(calls).toBe(1);
    expect(store.getTask(PID, "t")!.status).toBe("BLOCKED");
  });

  it("blocks a task with no registered executor", async () => {
    const orch = setup({}, [mk("t")]);
    await orch.run(PID);
    expect(store.getTask(PID, "t")).toMatchObject({ status: "BLOCKED" });
  });

  it("waiting tasks consume no retries and are reported", async () => {
    const orch = setup({ ok: async () => ({ ok: false, waiting: true, message: "write the code" }) }, [mk("t")]);
    const s = await orch.run(PID);
    expect(s.waiting).toEqual([{ taskId: "t", message: "write the code" }]);
    expect(store.getTask(PID, "t")).toMatchObject({ status: "READY", retryCount: 0 });
  });

  it("times out a hung executor", async () => {
    const orch = setup({ ok: () => new Promise(() => {}) }, [mk("t", { timeoutMs: 30, maxRetries: 0 })]);
    await orch.run(PID);
    expect(store.getTask(PID, "t")).toMatchObject({ status: "BLOCKED" });
    expect(store.getTask(PID, "t")!.lastError).toMatch(/timed out/);
  });

  it("an executor that throws is treated as a failure", async () => {
    const orch = setup({ ok: async () => { throw new Error("kaboom"); } }, [mk("t", { maxRetries: 0 })]);
    await orch.run(PID);
    expect(store.getTask(PID, "t")!.lastError).toBe("kaboom");
  });
});

describe("resume and cancellation", () => {
  it("recovers RUNNING tasks and never reruns COMPLETED ones", async () => {
    const calls: string[] = [];
    const orch = setup({ ok: async (c) => (calls.push(c.task.id), { ok: true }) }, [
      mk("a"), mk("b", { dependsOn: ["a"] }), mk("c", { dependsOn: ["b"] }),
    ]);
    // simulate a crash: a done, b was RUNNING when the process died
    store.updateTask(PID, "a", { status: "COMPLETED" });
    store.updateTask(PID, "b", { status: "RUNNING" });
    const s = await orch.run(PID);
    expect(calls).toEqual(["b", "c"]);
    expect(s.done).toBe(true);
    expect(store.listEvents(PID).some((e) => e.type === "task.recovered" && e.taskId === "b")).toBe(true);
  });

  it("stops on cancellation and leaves the task READY", async () => {
    const ac = new AbortController();
    const orch = setup(
      { ok: async (c) => new Promise((res) => { c.signal.addEventListener("abort", () => res({ ok: false })); setTimeout(() => ac.abort(), 10); }) },
      [mk("a"), mk("b", { dependsOn: ["a"] })],
    );
    const s = await orch.run(PID, ac.signal);
    expect(s.cancelled).toBe(true);
    expect(store.getTask(PID, "a")!.status).toBe("READY");
    expect(store.getTask(PID, "b")!.status).toBe("PLANNED");
  });

  it("runs the checkpoint hook before flagged tasks and blocks if it fails", async () => {
    const seen: string[] = [];
    store = new StateStore(":memory:");
    const now = new Date().toISOString();
    store.saveProject({ id: PID, name: "t", request: "r", category: "x", complexity: "small", phase: "DISCOVERY", workDir: ".", approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now });
    const orch = new Orchestrator({ store, executors: { ok }, onCheckpoint: async (_p, t) => { seen.push(t.id); throw new Error("dirty tree"); } });
    orch.addTasks(PID, [mk("t", { checkpoint: true })]);
    await orch.run(PID);
    expect(seen).toEqual(["t"]);
    expect(store.getTask(PID, "t")).toMatchObject({ status: "BLOCKED" });
  });
});
