import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { Pencil, Pin, Trash2 } from "lucide-react";
import { LIMITS, type Priority, type Task } from "../../domain/schema.ts";
import { PRIORITIES } from "../../domain/tasks.ts";
import { useStore } from "../../state/store.tsx";
import { useToast } from "../../ui/Toast.tsx";

function TaskRow({ task }: { task: Task }) {
  const store = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [error, setError] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(task.title);
    setPriority(task.priority);
    setError("");
    setEditing(true);
  };

  const save = (refocus: boolean) => {
    const result = store.editTask(task.id, { title: draft, priority });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    restoreFocus.current = refocus;
    setEditing(false);
  };

  const cancel = (refocus: boolean) => {
    restoreFocus.current = refocus;
    setEditing(false);
  };

  const remove = () => {
    const removed = store.deleteTask(task.id);
    if (!removed) return;
    toast(`Deleted “${removed.task.title}”`, { label: "Undo", onAction: () => store.restoreTask(removed.task, removed.index) });
  };

  return (
    <m.li className={`card task${task.done ? " done" : ""}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <input className="chk" type="checkbox" checked={task.done} onChange={() => store.toggleTask(task.id)} aria-label={`Mark “${task.title}” as done`} />
      {editing ? (
        <form
          className="edit-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel(true);
            } else if (e.key === "Enter" && e.target instanceof HTMLSelectElement) {
              // Enter does not submit a form from a <select>, so handle it here to keep "Enter saves" consistent.
              e.preventDefault();
              save(true);
            }
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              // Leaving the row saves a valid edit and quietly discards an empty one.
              if (draft.trim()) save(false);
              else cancel(false);
            }
          }}
        >
          <input
            className="input"
            value={draft}
            maxLength={LIMITS.titleMax}
            aria-label="Task title"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
          />
          <select className="input" style={{ maxWidth: 120 }} aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="err" id={errorId} role="alert">
            {error}
          </p>
        </form>
      ) : (
        <span className="title">
          {task.title}
          {task.priority !== "normal" && <span className={`pri ${task.priority}`}>{task.priority}</span>}
        </span>
      )}
      {!editing && (
      <span className="actions">
        <button type="button" className="icon-btn" aria-pressed={task.today} aria-label={`Pin “${task.title}” to Today`} onClick={() => store.togglePin(task.id)}>
          <Pin aria-hidden="true" />
        </button>
        <button ref={editButton} type="button" className="icon-btn" aria-label={`Edit “${task.title}”`} onClick={startEdit}>
          <Pencil aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label={`Delete “${task.title}”`} onClick={remove}>
          <Trash2 aria-hidden="true" />
        </button>
      </span>
      )}
    </m.li>
  );
}

export function TaskList({ tasks, label }: { tasks: readonly Task[]; label: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <ul className="list" aria-label={label}>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      </LazyMotion>
    </MotionConfig>
  );
}
