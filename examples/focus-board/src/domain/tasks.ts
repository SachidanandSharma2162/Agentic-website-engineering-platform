import { LIMITS, type AppData, type Priority, type Task } from "./schema.ts";

export type TitleResult = { ok: true; title: string } | { ok: false; error: string };

/** Trim, reject empty, cap length. */
export function normalizeTitle(raw: string, max: number = LIMITS.titleMax): TitleResult {
  const title = raw.trim().slice(0, max).trim();
  return title ? { ok: true, title } : { ok: false, error: "Enter a title first." };
}

export function addTask(data: AppData, task: Task): AppData {
  return { ...data, tasks: [task, ...data.tasks] };
}

export function updateTask(data: AppData, id: string, patch: Partial<Pick<Task, "title" | "priority" | "done" | "today">>): AppData {
  return { ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function removeTask(data: AppData, id: string): { data: AppData; removed: Task | null; index: number } {
  const index = data.tasks.findIndex((t) => t.id === id);
  const removed = index === -1 ? null : (data.tasks[index] ?? null);
  if (!removed) return { data, removed: null, index: -1 };
  return { data: { ...data, tasks: data.tasks.filter((t) => t.id !== id) }, removed, index };
}

/** Put a removed task back at its original position (clamped to the list length). */
export function restoreTask(data: AppData, task: Task, index: number): AppData {
  if (data.tasks.some((t) => t.id === task.id)) return data;
  const at = Math.min(Math.max(index, 0), data.tasks.length);
  const tasks = [...data.tasks];
  tasks.splice(at, 0, task);
  return { ...data, tasks };
}

export type StatusFilter = "all" | "active" | "done";

export function filterTasks(tasks: readonly Task[], status: StatusFilter, query: string): Task[] {
  const q = query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (status === "active" && t.done) return false;
    if (status === "done" && !t.done) return false;
    return q === "" || t.title.toLowerCase().includes(q);
  });
}

export function todayProgress(tasks: readonly Task[]): { done: number; total: number; fraction: number } {
  const pinned = tasks.filter((t) => t.today);
  const done = pinned.filter((t) => t.done).length;
  return { done, total: pinned.length, fraction: pinned.length === 0 ? 0 : done / pinned.length };
}

export const PRIORITIES: readonly Priority[] = ["high", "normal", "low"];
