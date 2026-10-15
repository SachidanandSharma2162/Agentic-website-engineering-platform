import { Link } from "react-router";
import { parseDayKey } from "../../domain/dates.ts";
import { LIMITS } from "../../domain/schema.ts";
import { calcStreakLabel } from "../habits/streakLabel.ts";
import { todayProgress } from "../../domain/tasks.ts";
import { useStore } from "../../state/store.tsx";
import { AddForm } from "../../ui/AddForm.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { ProgressRing } from "../../ui/ProgressRing.tsx";
import { TaskList } from "./TaskList.tsx";

export function TodayPage() {
  const store = useStore();
  const pinned = store.data.tasks.filter((t) => t.today);
  const { done, total } = todayProgress(store.data.tasks);
  const date = parseDayKey(store.today).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Today</p>
          <h1>{date}</h1>
        </div>
        <ProgressRing done={done} total={total} />
      </div>

      <AddForm label="New task for today" placeholder="What will you focus on today?" maxLength={LIMITS.titleMax} onAdd={(v) => store.addTask(v, { pinned: true })} />

      {pinned.length === 0 ? (
        <EmptyState
          title="Nothing pinned for today"
          action={
            <Link className="btn" to="/tasks">
              Browse tasks
            </Link>
          }
        >
          Add a task above, or pin one from your task list.
        </EmptyState>
      ) : (
        <TaskList tasks={pinned} label="Today's tasks" />
      )}

      <h2 className="section-title">Habits today</h2>
      <div className="card mini">
        {store.data.habits.length === 0 ? (
          <div className="row">
            <span>No habits yet.</span>
            <Link to="/habits">Add one</Link>
          </div>
        ) : (
          store.data.habits.map((h) => {
            const checked = h.checkIns.includes(store.today);
            return (
              <div className="row" key={h.id}>
                <span>{h.name}</span>
                <span className="eyebrow">{calcStreakLabel(h.checkIns, store.today)}</span>
                <input className="chk" type="checkbox" checked={checked} onChange={() => store.toggleHabitToday(h.id)} aria-label={`Check in “${h.name}” for today`} />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
