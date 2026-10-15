import { describe, expect, it } from "vitest";
import { buildIcs } from "../../shared/ics.ts";
import { dayKey, dayLabel, formatTime, isValidTimeZone, offsetMs, visitorTimeNote, zonedWallTimeToUtc } from "../../shared/time.ts";

const KOLKATA = "Asia/Kolkata";
const NY = "America/New_York";
const H = 3_600_000;
const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

describe("offsets and formatting (AC2)", () => {
  it("Kolkata is a fixed +5:30 all year, a half-hour offset", () => {
    for (const month of [1, 4, 7, 10]) expect(offsetMs(utc(2026, month, 15, 12), KOLKATA)).toBe(5.5 * H);
  });

  it("New York changes with daylight saving; UTC never does", () => {
    expect(offsetMs(utc(2026, 1, 15, 12), NY)).toBe(-5 * H);
    expect(offsetMs(utc(2026, 7, 15, 12), NY)).toBe(-4 * H);
    expect(offsetMs(utc(2026, 7, 15, 12), "UTC")).toBe(0);
  });

  it.each([
    ["Kolkata", KOLKATA, "6:30 AM"],
    ["New York (EDT)", NY, "9:00 PM"],
    ["London (BST)", "Europe/London", "2:00 AM"],
    ["UTC", "UTC", "1:00 AM"],
  ])("formats 01:00 UTC on 16 Oct 2026 for %s", (_n, tz, expected) => {
    expect(formatTime(utc(2026, 10, 16, 1, 0), tz)).toBe(expected);
  });

  it("keeps a late-evening studio class on the studio's own day for a UTC visitor", () => {
    const lateIst = utc(2026, 10, 16, 18, 0); // 23:30 IST on 16 Oct
    expect(dayKey(lateIst, KOLKATA)).toBe("2026-10-16");
    const earlyIst = utc(2026, 10, 16, 19, 0); // 00:30 IST on 17 Oct
    expect(dayKey(earlyIst, KOLKATA)).toBe("2026-10-17");
    expect(dayKey(earlyIst, "UTC")).toBe("2026-10-16");
    expect(dayLabel(earlyIst, KOLKATA)).toBe("Saturday 17 October");
  });

  it("validates zone names", () => {
    expect(isValidTimeZone(KOLKATA)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("studio wall time to instant (admin adds a class)", () => {
  it("Kolkata: 06:30 on 16 Oct is 01:00 UTC, with no daylight-saving surprises", () => {
    expect(zonedWallTimeToUtc("2026-10-16", "06:30", KOLKATA)).toBe(utc(2026, 10, 16, 1, 0));
    expect(zonedWallTimeToUtc("2026-03-08", "06:30", KOLKATA)).toBe(utc(2026, 3, 8, 1, 0));
    expect(zonedWallTimeToUtc("2026-12-31", "23:59", KOLKATA)).toBe(utc(2026, 12, 31, 18, 29));
  });

  it("UTC is the identity", () => {
    expect(zonedWallTimeToUtc("2026-10-16", "06:30", "UTC")).toBe(utc(2026, 10, 16, 6, 30));
  });

  describe("New York spring forward (2026-03-08, 02:00 jumps to 03:00)", () => {
    it.each([
      ["01:30 exists, still EST", "01:30", utc(2026, 3, 8, 6, 30)],
      ["02:30 does not exist: moves forward past the gap to 03:30 EDT", "02:30", utc(2026, 3, 8, 7, 30)],
      ["03:30 exists, EDT", "03:30", utc(2026, 3, 8, 7, 30)],
    ])("%s", (_n, time, expected) => {
      expect(zonedWallTimeToUtc("2026-03-08", time, NY)).toBe(expected);
    });
  });

  describe("New York fall back (2026-11-01, 02:00 EDT becomes 01:00 EST)", () => {
    it.each([
      ["00:30 is EDT", "00:30", utc(2026, 11, 1, 4, 30)],
      ["01:30 happens twice: the first occurrence (EDT)", "01:30", utc(2026, 11, 1, 5, 30)],
      ["02:30 is EST", "02:30", utc(2026, 11, 1, 7, 30)],
    ])("%s", (_n, time, expected) => {
      expect(zonedWallTimeToUtc("2026-11-01", time, NY)).toBe(expected);
    });
  });

  it.each(["2026-02-30", "2026-13-01", "2026-1-1", "", "abc"])("rejects the impossible date %j", (d) => {
    expect(zonedWallTimeToUtc(d, "10:00", KOLKATA)).toBeNull();
  });
  it.each(["24:00", "10:60", "9:00", "", "ab:cd"])("rejects the impossible time %j", (t) => {
    expect(zonedWallTimeToUtc("2026-10-16", t, KOLKATA)).toBeNull();
  });

  it("round-trips every half hour across both New York transitions, and across a year in Kolkata", () => {
    const wall = (t: number, tz: string) => `${dayKey(t, tz)} ${formatTime(t, tz)}`;
    const toIn = (t: number, tz: string) => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(t);
      return zonedWallTimeToUtc(dayKey(t, tz), p, tz);
    };
    let checked = 0;
    for (const [from, to] of [[utc(2026, 3, 7), utc(2026, 3, 10)], [utc(2026, 10, 31), utc(2026, 11, 3)]] as const) {
      for (let t = from; t < to; t += H / 2) {
        const r = toIn(t, NY);
        expect(r, `${new Date(t).toISOString()}`).not.toBeNull();
        expect(wall(r!, NY)).toBe(wall(t, NY)); // the result always reads as the requested wall time (gap: moved forward)
        expect([0, H]).toContain(t - r!); // equal, or the repeated second occurrence mapping to the first
        checked++;
      }
    }
    for (let t = utc(2026, 1, 1); t < utc(2027, 1, 1); t += 6 * H + H / 2) {
      expect(toIn(t, KOLKATA)).toBe(t);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe("what a visitor in another zone sees", () => {
  const sixThirtyIst = utc(2026, 10, 16, 1, 0);

  it("shows nothing extra for a visitor in the studio's zone, or one whose clock reads the same", () => {
    expect(visitorTimeNote(sixThirtyIst, KOLKATA, KOLKATA)).toBeNull();
    expect(visitorTimeNote(sixThirtyIst, KOLKATA, "Asia/Calcutta")).toBeNull(); // alias of the same zone
  });

  it("shows the visitor's local time, and the weekday only when their day differs", () => {
    expect(visitorTimeNote(sixThirtyIst, KOLKATA, "Europe/London")).toEqual({ time: "2:00 AM" });
    expect(visitorTimeNote(sixThirtyIst, KOLKATA, NY)).toEqual({ time: "9:00 PM", weekday: "Thursday" });
    expect(visitorTimeNote(sixThirtyIst, KOLKATA, "Australia/Sydney")).toEqual({ time: "12:00 PM" });
  });
});

describe("calendar file (AC7)", () => {
  const ics = buildIcs({ uid: "abc", title: "Yin, Restore; and \\ more", startMs: utc(2026, 10, 16, 13, 0), durationMin: 75, nowMs: utc(2026, 10, 1, 9, 5) });

  it("is a well-formed iCalendar with UTC start and end and CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261016T130000Z");
    expect(ics).toContain("DTEND:20261016T141500Z");
    expect(ics).toContain("DTSTAMP:20261001T090500Z");
    expect(ics.split("\n").every((l) => l === "" || l.endsWith("\r"))).toBe(true);
  });

  it("escapes text, and contains no personal data", () => {
    expect(ics).toContain("SUMMARY:Yin\\, Restore\\; and \\\\ more");
    expect(ics).not.toMatch(/ATTENDEE|ORGANIZER|@example|mailto:/i);
  });
});
