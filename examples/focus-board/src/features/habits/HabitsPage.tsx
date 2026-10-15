import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { lastNDays, parseDayKey } from "../../domain/dates.ts";
import { LIMITS, type Habit } from "../../domain/schema.ts";
import { bestStreak, currentStreak } from "../../domain/streaks.ts";
import { useStore } from "../../state/store.tsx";
import { AddForm } from "../../ui/AddForm.tsx";
import { useConfirm } from "../../ui/Confirm.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { useToast } from "../../ui/Toast.tsx";

function HabitCard({ habit }: { habit: Habit }) {
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(habit.name);
  const editButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const inputId = useId();

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const checked = habit.checkIns.includes(store.today);
  const week = lastNDays(store.today, 7);
  const weekCount = week.filter((d) => habit.checkIns.includes(d)).length;

  const finish = (save: boolean) => {
    if (save && draft.trim()) store.renameHabit(habit.id, draft);
    refocus.current = true;
    setEditing(false);
  };

  const remove = async () => {
    const ok = await confirm({ title: "Delete habit?", body: `“${habit.name}” and its check-in history will be removed.`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    store.deleteHabit(habit.id);
    toast(`Deleted habit “${habit.name}”`);
  };

  return (
    <article className="card habit" aria-label={habit.name}>
      <div className="habit-top">
        {editing ? (
          <form
            style={{ flex: 1, display: "flex" }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              finish(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                finish(false);
              }
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                if (draft.trim()) store.renameHabit(habit.id, draft);
                setEditing(false);
              }
            }}
          >
            <label htmlFor={inputId} className="sr">
              Habit name
            </label>
            <input id={inputId} className="input" value={draft} maxLength={LIMITS.habitNameMax} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setDraft(e.target.value)} />
          </form>
        ) : (
          <h2 style={{ fontSize: "1.2rem", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{habit.name}</h2>
        )}
        <button type="button" className={`btn${checked ? "" : " primary"}`} aria-pressed={checked} onClick={() => store.toggleHabitToday(habit.id)}>
          {checked ? "Checked in ✓" : "Check in today"}
        </button>
        {!editing && (
          <>
            <button ref={editButton} type="button" className="icon-btn" aria-label={`Rename habit “${habit.name}”`} onClick={() => { setDraft(habit.name); setEditing(true); }}>
              <Pencil aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" aria-label={`Delete habit “${habit.name}”`} onClick={remove}>
              <Trash2 aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <div className="streaks">
        <span>
          <b>{currentStreak(habit.checkIns, store.today)}</b>current streak
        </span>
        <span>
          <b>{bestStreak(habit.checkIns)}</b>best streak
        </span>
      </div>
      <div className="week" role="img" aria-label={`Last 7 days: ${weekCount} of 7 checked in`}>
        {week.map((d) => {
          const on = habit.checkIns.includes(d);
          return (
            <span key={d}>
              {parseDayKey(d).toLocaleDateString("en-US", { weekday: "narrow" })}
              <i className={on ? "on" : ""}>{on ? "✓" : ""}</i>
            </span>
          );
        })}
      </div>
    </article>
  );
}

export function HabitsPage() {
  const store = useStore();
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Daily</p>
          <h1>Habits</h1>
        </div>
      </div>
      <AddForm label="New habit" placeholder="Add a habit" maxLength={LIMITS.habitNameMax} onAdd={(v) => store.addHabit(v)} />
      {store.data.habits.length === 0 ? (
        <EmptyState title="No habits yet">Start with one small thing you want to do every day.</EmptyState>
      ) : (
        <div className="stack">
          {store.data.habits.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}
    </>
  );
}
