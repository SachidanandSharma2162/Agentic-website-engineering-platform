/**
 * Time zone helpers. Instants are epoch milliseconds (UTC). Every function takes the zone explicitly, so nothing depends
 * on the machine's own zone, and the same code runs in the browser, on the server and in tests.
 */

export const DEFAULT_STUDIO_TZ = "Asia/Kolkata";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

/** Wall-clock fields of an instant in a zone. */
function zonedParts(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  });
  const get = (type: string): number => Number(f.formatToParts(ms).find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** The zone's offset from UTC at an instant, in milliseconds (positive east of UTC, e.g. +19,800,000 for Kolkata). */
export function offsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

/** "6:30 AM" in the zone. */
export function formatTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(ms)
    .replace(/[\u202f\u00a0]/g, " ");
}

/** The calendar day of an instant in the zone, "YYYY-MM-DD". */
export function dayKey(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** "Friday 16 October" in the zone. */
export function dayLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(ms).replace(",", "");
}

function wallKey(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)}`;
}

/**
 * Convert a wall-clock date and time in a zone to an instant, or null if the input is not a real date and time.
 * Daylight saving: a wall time that does not exist (spring forward) moves forward past the gap, and an ambiguous one
 * (fall back) means the first occurrence. Zones without daylight saving, such as Asia/Kolkata, are unaffected.
 */
export function zonedWallTimeToUtc(date: string, time: string, tz: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(guess);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;

  const offsets = [...new Set([offsetMs(guess - 86_400_000, tz), offsetMs(guess + 86_400_000, tz)])];
  const wanted = `${date} ${time}`;
  const valid = offsets.map((o) => guess - o).filter((t) => wallKey(t, tz) === wanted);
  if (valid.length > 0) return Math.min(...valid);
  return guess - Math.min(...offsets); // in a gap: use the offset from before the change, which lands after it
}

export interface LocalTimeNote {
  time: string;
  /** Weekday name, present only when the visitor's calendar day differs from the studio's. */
  weekday?: string;
}

/** What to show a visitor whose zone differs from the studio's; null when their clock reads the same. */
export function visitorTimeNote(ms: number, studioTz: string, visitorTz: string): LocalTimeNote | null {
  if (studioTz === visitorTz) return null;
  const time = formatTime(ms, visitorTz);
  const sameDay = dayKey(ms, studioTz) === dayKey(ms, visitorTz);
  if (time === formatTime(ms, studioTz) && sameDay) return null;
  return sameDay ? { time } : { time, weekday: dayLabel(ms, visitorTz).split(" ")[0] };
}

/** "Kolkata, IST": a short, human label for the studio's zone at a given instant. */
export function zoneLabel(tz: string, ms: number): string {
  const city = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  const abbr = new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short" }).formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? "";
  return abbr ? `${city}, ${abbr}` : city;
}

/** Just the abbreviation ("IST", "EDT", "GMT+1") for use after a time. */
export function zoneAbbr(tz: string, ms: number): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, timeZoneName: "short" }).formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? "";
}
