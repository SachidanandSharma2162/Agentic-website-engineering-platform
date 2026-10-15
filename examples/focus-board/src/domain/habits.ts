import type { DayKey } from "./dates.ts";
import { LIMITS, type AppData, type Habit } from "./schema.ts";

export function addHabit(data: AppData, habit: Habit): AppData {
  return { ...data, habits: [...data.habits, habit] };
}

export function renameHabit(data: AppData, id: string, name: string): AppData {
  const trimmed = name.trim().slice(0, LIMITS.habitNameMax);
  if (!trimmed) return data;
  return { ...data, habits: data.habits.map((h) => (h.id === id ? { ...h, name: trimmed } : h)) };
}

export function removeHabit(data: AppData, id: string): AppData {
  return { ...data, habits: data.habits.filter((h) => h.id !== id) };
}

/** One check-in per habit per day: checking an already-checked day unchecks it. */
export function toggleCheckIn(data: AppData, id: string, day: DayKey): AppData {
  return {
    ...data,
    habits: data.habits.map((h) => {
      if (h.id !== id) return h;
      const has = h.checkIns.includes(day);
      return { ...h, checkIns: has ? h.checkIns.filter((d) => d !== day) : [...h.checkIns, day].sort() };
    }),
  };
}
