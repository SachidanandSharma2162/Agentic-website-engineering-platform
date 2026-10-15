/** A minimal, valid iCalendar file for one class. It contains the class title and UTC times and no personal data. */

const stamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** RFC 5545 TEXT escaping. */
const escapeText = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export interface IcsInput {
  uid: string;
  title: string;
  startMs: number;
  durationMin: number;
  /** Time the file was made, injected so output is deterministic. */
  nowMs: number;
}

export function buildIcs(i: IcsInput): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studio Slot//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${i.uid}@studio-slot`,
    `DTSTAMP:${stamp(i.nowMs)}`,
    `DTSTART:${stamp(i.startMs)}`,
    `DTEND:${stamp(i.startMs + i.durationMin * 60_000)}`,
    `SUMMARY:${escapeText(i.title)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
