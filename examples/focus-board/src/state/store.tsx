import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toDayKey, type DayKey } from "../domain/dates.ts";
import { addHabit, removeHabit, renameHabit, toggleCheckIn } from "../domain/habits.ts";
import { emptyData, LIMITS, type AppData, type Priority, type Task } from "../domain/schema.ts";
import { addTask, normalizeTitle, removeTask, restoreTask, updateTask, type TitleResult } from "../domain/tasks.ts";
import type { StorageAdapter } from "../storage/storage.ts";

export interface Clock {
  now(): Date;
}

export interface Store {
  data: AppData;
  today: DayKey;
  /** Why data could not be loaded, if so. */
  notice: string | null;
  /** Why the last save failed, if so. */
  saveError: string | null;
  dismissNotice(): void;
  addTask(title: string, opts?: { pinned?: boolean }): TitleResult;
  editTask(id: string, patch: { title?: string; priority?: Priority }): TitleResult;
  toggleTask(id: string): void;
  togglePin(id: string): void;
  deleteTask(id: string): { task: Task; index: number } | null;
  restoreTask(task: Task, index: number): void;
  addHabit(name: string): TitleResult;
  renameHabit(id: string, name: string): void;
  deleteHabit(id: string): void;
  toggleHabitToday(id: string): void;
  replaceAll(data: AppData): void;
  resetAll(): void;
}

const StoreContext = createContext<Store | null>(null);

const defaultClock: Clock = { now: () => new Date() };

const defaultId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function StoreProvider({
  storage,
  clock = defaultClock,
  newId = defaultId,
  children,
}: {
  storage: StorageAdapter;
  clock?: Clock;
  newId?: () => string;
  children: ReactNode;
}) {
  const [initial] = useState(() => storage.load());
  const [data, setData] = useState<AppData>(initial.data);
  const [notice, setNotice] = useState<string | null>(initial.notice ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [today, setToday] = useState<DayKey>(() => toDayKey(clock.now()));

  // Only persist after the user changes something, so unreadable stored data is never overwritten just by opening the app.
  const dirty = useRef(false);
  const dataRef = useRef(data);

  const commit = useCallback((next: AppData) => {
    dirty.current = true;
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    setSaveError(storage.save(data));
  }, [data, storage]);

  // A "day" rolls over at local midnight even if the tab stays open: re-check when the tab regains attention and once a minute.
  useEffect(() => {
    const refresh = () => setToday(toDayKey(clock.now()));
    const interval = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [clock]);

  const store = useMemo<Store>(
    () => ({
      data,
      today,
      notice,
      saveError,
      dismissNotice: () => setNotice(null),
      addTask(title, opts) {
        const r = normalizeTitle(title);
        if (!r.ok) return r;
        if (dataRef.current.tasks.length >= LIMITS.maxTasks) return { ok: false, error: `You have reached the limit of ${LIMITS.maxTasks} tasks.` };
        const task: Task = { id: newId(), title: r.title, priority: "normal", done: false, today: opts?.pinned ?? false, createdAt: clock.now().toISOString() };
        commit(addTask(dataRef.current, task));
        return r;
      },
      editTask(id, patch) {
        const next: Partial<Pick<Task, "title" | "priority">> = {};
        let result: TitleResult = { ok: true, title: "" };
        if (patch.title !== undefined) {
          result = normalizeTitle(patch.title);
          if (!result.ok) return result;
          next.title = result.title;
        }
        if (patch.priority) next.priority = patch.priority;
        commit(updateTask(dataRef.current, id, next));
        return result;
      },
      toggleTask(id) {
        const t = dataRef.current.tasks.find((x) => x.id === id);
        if (t) commit(updateTask(dataRef.current, id, { done: !t.done }));
      },
      togglePin(id) {
        const t = dataRef.current.tasks.find((x) => x.id === id);
        if (t) commit(updateTask(dataRef.current, id, { today: !t.today }));
      },
      deleteTask(id) {
        const r = removeTask(dataRef.current, id);
        if (!r.removed) return null;
        commit(r.data);
        return { task: r.removed, index: r.index };
      },
      restoreTask(task, index) {
        commit(restoreTask(dataRef.current, task, index));
      },
      addHabit(name) {
        const r = normalizeTitle(name, LIMITS.habitNameMax);
        if (!r.ok) return r;
        if (dataRef.current.habits.length >= LIMITS.maxHabits) return { ok: false, error: `You have reached the limit of ${LIMITS.maxHabits} habits.` };
        commit(addHabit(dataRef.current, { id: newId(), name: r.title, checkIns: [] }));
        return r;
      },
      renameHabit: (id, name) => commit(renameHabit(dataRef.current, id, name)),
      deleteHabit: (id) => commit(removeHabit(dataRef.current, id)),
      toggleHabitToday: (id) => commit(toggleCheckIn(dataRef.current, id, toDayKey(clock.now()))),
      replaceAll: (next) => commit(next),
      resetAll: () => commit(emptyData()),
    }),
    [data, today, notice, saveError, newId, clock, commit],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
