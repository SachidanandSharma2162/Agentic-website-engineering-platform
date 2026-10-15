import { addDays, type DayKey } from "./dates.ts";

/**
 * Consecutive checked days ending today, or ending yesterday when today is not yet checked
 * (so a streak is not lost before the day is over). Any gap resets it to 0.
 */
export function currentStreak(checkIns: Iterable<DayKey>, today: DayKey): number {
  const set = new Set(checkIns);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Length of the longest run of consecutive checked days ever recorded. */
export function bestStreak(checkIns: Iterable<DayKey>): number {
  const days = [...new Set(checkIns)].sort();
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const day of days) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}
