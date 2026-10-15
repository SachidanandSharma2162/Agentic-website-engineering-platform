import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Orchestrator, StateStore, Task } from "../src/index.ts";

const CHILD = fileURLToPath(new URL("./fixtures/crash-child.ts", import.meta.url));
let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "sdlc-crash-")));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mk = (id: string, dependsOn: string[] = []) => Task.parse({ id, projectId: "p1", title: id, phase: "IMPLEMENTATION", role: "frontend", action: "work", dependsOn });
const waitFor = async (cond: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe("crash recovery with a real killed process", () => {
  it("resumes from the last safe checkpoint: finished work is kept, the interrupted task re-runs, nothing is redone", async () => {
    const dbPath = join(dir, "state.db");
    const counter = join(dir, "counter.txt");
    const marker = join(dir, "started.txt");

    // Seed the project and a 3-task chain a -> b -> c in a real database file.
    const seed = new StateStore(dbPath);
    const now = new Date().toISOString();
    seed.saveProject({ id: "p1", name: "t", request: "r", category: "x", complexity: "small", phase: "DISCOVERY", workDir: dir, approvedScope: "", deployments: [], risks: [], createdAt: now, updatedAt: now });
    new Orchestrator({ store: seed, executors: {} }).addTasks("p1", [mk("a"), mk("b", ["a"]), mk("c", ["b"])]);
    seed.close();

    // Run the orchestrator in a separate process and kill it while task b is executing.
    const child = spawn(process.execPath, [CHILD, dbPath, counter, marker], { stdio: "ignore" });
    const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
    await waitFor(() => existsSync(marker), 30_000);
    child.kill("SIGKILL");
    await exited;

    // State on disk after the crash: a finished, b still marked RUNNING, c untouched.
    const after = new StateStore(dbPath);
    expect(after.getTask("p1", "a")?.status).toBe("COMPLETED");
    expect(after.getTask("p1", "b")?.status).toBe("RUNNING");
    expect(after.getTask("p1", "c")?.status).not.toBe("COMPLETED");
    expect(readFileSync(counter, "utf8")).toBe("ab");

    // A new orchestrator recovers and finishes; task a must not run again.
    const orch = new Orchestrator({ store: after, executors: { work: async ({ task }) => (appendFileSync(counter, task.id), { ok: true }) } });
    const summary = await orch.run("p1");
    expect(summary.done).toBe(true);
    expect(readFileSync(counter, "utf8")).toBe("abbc"); // a once; b interrupted then re-run; c once
    expect(after.listEvents("p1").some((e) => e.type === "task.recovered" && e.taskId === "b")).toBe(true);
    expect(after.getTask("p1", "a")?.retryCount).toBe(0);
    after.close();
  }, 60_000);
});
