import type { ClassView } from "../../shared/schema.ts";
import { formatTime, visitorTimeNote, zoneAbbr } from "../../shared/time.ts";
import { visitorZone } from "../hooks.ts";

/** Start and end in studio time, plus the visitor's own time when their clock differs. */
export function TimeBlock({ cls, studioTz }: { cls: ClassView; studioTz: string }) {
  const endMs = cls.startsAt + cls.durationMin * 60_000;
  const note = visitorTimeNote(cls.startsAt, studioTz, visitorZone());
  return (
    <span className="when">
      {formatTime(cls.startsAt, studioTz)}
      <small>
        to {formatTime(endMs, studioTz)} {zoneAbbr(studioTz, cls.startsAt)}
      </small>
      {note && (
        <small>
          {note.time} your time{note.weekday ? ` (${note.weekday})` : ""}
        </small>
      )}
    </span>
  );
}

export function Badge({ cls }: { cls: ClassView }) {
  if (cls.cancelled) return <span className="badge cancelled">Cancelled</span>;
  if (cls.spotsLeft <= 0) return <span className="badge full">Full</span>;
  const few = cls.spotsLeft <= 3;
  return <span className={`badge${few ? " few" : ""}`}>{few ? `Only ${cls.spotsLeft} left` : `${cls.spotsLeft} spots left`}</span>;
}

export const bookable = (c: ClassView, now: number): boolean => !c.cancelled && c.spotsLeft > 0 && c.startsAt > now;
