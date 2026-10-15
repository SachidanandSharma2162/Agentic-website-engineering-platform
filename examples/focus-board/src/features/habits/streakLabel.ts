import type { DayKey } from "../../domain/dates.ts";
import { currentStreak } from "../../domain/streaks.ts";

export function calcStreakLabel(checkIns: readonly DayKey[], today: DayKey): string {
  const n = currentStreak(checkIns, today);
  return `${n} day streak`;
}
