/** A calendar day in the user's local timezone, formatted YYYY-MM-DD. All day arithmetic is calendar-based, never 24h-millisecond offsets, so DST cannot skew it. */
export type DayKey = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number): string => String(n).padStart(2, "0");

export function toDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True only for real calendar dates (rejects 2025-02-30, 2025-13-01 and non-padded forms). */
export function isDayKey(s: string): boolean {
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function parseDayKey(key: DayKey): Date {
  const m = DAY_RE.exec(key);
  if (!m) throw new Error(`invalid day key: ${key}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

/** The n days ending at `end`, oldest first. */
export function lastNDays(end: DayKey, n: number): DayKey[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}
