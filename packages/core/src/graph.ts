import type { Task } from "./schema.ts";

/** Throws on duplicate ids, unknown dependencies, self-dependencies, or cycles. */
export function validateGraph(tasks: Task[]): void {
  const ids = new Set(tasks.map((t) => t.id));
  if (ids.size !== tasks.length) throw new Error("Duplicate task ids");
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (d === t.id) throw new Error(`Task ${t.id} depends on itself`);
      if (!ids.has(d)) throw new Error(`Task ${t.id} depends on unknown task ${d}`);
    }
  }
  const state = new Map<string, 1 | 2>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visit = (id: string, path: string[]): void => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) throw new Error(`Dependency cycle: ${[...path, id].join(" -> ")}`);
    state.set(id, 1);
    for (const d of byId.get(id)!.dependsOn) visit(d, [...path, id]);
    state.set(id, 2);
  };
  for (const t of tasks) visit(t.id, []);
}

/** Unfinished tasks whose dependencies are all COMPLETED. */
export function runnable(tasks: Task[]): Task[] {
  const done = new Set(tasks.filter((t) => t.status === "COMPLETED").map((t) => t.id));
  return tasks.filter(
    (t) => ["PLANNED", "READY", "NEEDS_APPROVAL"].includes(t.status) && t.dependsOn.every((d) => done.has(d)),
  );
}

/** Unfinished tasks that can never run because a dependency is BLOCKED or FAILED (transitively). */
export function unreachable(tasks: Task[]): Task[] {
  const dead = new Set(tasks.filter((t) => t.status === "BLOCKED" || t.status === "FAILED").map((t) => t.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (!dead.has(t.id) && t.dependsOn.some((d) => dead.has(d))) {
        dead.add(t.id);
        changed = true;
      }
    }
  }
  return tasks.filter((t) => dead.has(t.id) && t.status !== "BLOCKED" && t.status !== "FAILED");
}
