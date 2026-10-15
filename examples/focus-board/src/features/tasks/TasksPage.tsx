import { useState } from "react";
import { LIMITS } from "../../domain/schema.ts";
import { filterTasks, type StatusFilter } from "../../domain/tasks.ts";
import { useStore } from "../../state/store.tsx";
import { AddForm } from "../../ui/AddForm.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { TaskList } from "./TaskList.tsx";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
];

export function TasksPage() {
  const store = useStore();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const visible = filterTasks(store.data.tasks, status, query);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">All tasks</p>
          <h1>Tasks</h1>
        </div>
      </div>

      <AddForm label="New task" placeholder="Add a task" maxLength={LIMITS.titleMax} onAdd={(v) => store.addTask(v)} />

      <div className="toolbar">
        <label className="field" style={{ flex: "1 1 200px" }}>
          <span className="sr">Search tasks</span>
          <input className="input" type="search" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => setStatus(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length > 0 ? (
        <TaskList tasks={visible} label="Tasks" />
      ) : store.data.tasks.length === 0 ? (
        <EmptyState title="No tasks yet">Add your first task above.</EmptyState>
      ) : (
        <EmptyState
          title="No matching tasks"
          action={
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          }
        >
          Try a different search or filter.
        </EmptyState>
      )}
    </>
  );
}
