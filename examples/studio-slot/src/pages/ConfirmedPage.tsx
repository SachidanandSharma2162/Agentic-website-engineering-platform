import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { buildIcs } from "../../shared/ics.ts";
import { dayLabel, formatTime, zoneAbbr } from "../../shared/time.ts";
import { forgetBooking, peekBooking } from "../lastBooking.ts";

export function ConfirmedPage() {
  // Captured once so the screen keeps working through React's development re-mount; forgotten when the visitor leaves.
  const [booking] = useState(peekBooking);
  useEffect(() => () => forgetBooking(), []);

  if (!booking) return <Navigate to="/" replace />;
  const { class: c, code, bookingId, studioTimezone: tz } = booking;

  const download = () => {
    const ics = buildIcs({ uid: bookingId, title: c.title, startMs: c.startsAt, durationMin: c.durationMin, nowMs: Date.now() });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "studio-slot-class.ics";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card confirm" aria-labelledby="booked-h">
      <div className="breath" aria-hidden="true" />
      <h1 id="booked-h">You're booked</h1>
      <p>
        <strong>{c.title}</strong>
        <br />
        {dayLabel(c.startsAt, tz)}, {formatTime(c.startsAt, tz)} {zoneAbbr(tz, c.startsAt)}
      </p>
      <p>
        Your cancellation code. <strong>Save it now: it is shown only once.</strong>
      </p>
      <div className="code" aria-label="Cancellation code" data-testid="code">
        {code}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button type="button" className="btn primary" onClick={download}>
          Add to calendar
        </button>
        <Link className="btn" to="/">
          Back to schedule
        </Link>
      </div>
    </section>
  );
}
