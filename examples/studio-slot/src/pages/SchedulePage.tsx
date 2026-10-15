import { Link } from "react-router";
import { dayKey, dayLabel, formatTime, zoneLabel } from "../../shared/time.ts";
import type { ClassView } from "../../shared/schema.ts";
import { api } from "../api.ts";
import { useLoad } from "../hooks.ts";
import { Badge, bookable, TimeBlock } from "../ui/ClassBits.tsx";
import { ProblemNotice } from "../ui/Notice.tsx";

const loadClasses = (signal: AbortSignal) => api.classes(signal);

export function SchedulePage() {
  const { state, reload } = useLoad(loadClasses);
  const studioTz = state.status === "ready" ? state.data.studioTimezone : "Asia/Kolkata";

  return (
    <>
      <section className="hero">
        <h1>Find your class</h1>
        <p>Small groups, unhurried pace. Pick a time and reserve your mat in under a minute. No account needed.</p>
        {state.status === "ready" && <span className="studio-tz">All times in studio time ({zoneLabel(studioTz, state.data.now)})</span>}
      </section>

      {state.status === "loading" && (
        <div aria-busy="true" aria-label="Loading classes">
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
        </div>
      )}

      {state.status === "error" && (
        <>
          <ProblemNotice error={state.error} />
          <p style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={reload}>
              Try again
            </button>
          </p>
        </>
      )}

      {state.status === "ready" && state.data.classes.length === 0 && (
        <div className="card empty">
          <h2>No classes in the next two weeks</h2>
          <p>New classes are added regularly. Please check back soon.</p>
        </div>
      )}

      {state.status === "ready" && state.data.classes.length > 0 && <Days classes={state.data.classes} studioTz={studioTz} now={state.data.now} />}
    </>
  );
}

function Days({ classes, studioTz, now }: { classes: ClassView[]; studioTz: string; now: number }) {
  const days = new Map<string, ClassView[]>();
  for (const c of classes) {
    const k = dayKey(c.startsAt, studioTz);
    days.set(k, [...(days.get(k) ?? []), c]);
  }
  return (
    <>
      {[...days.entries()].map(([key, list]) => (
        <section className="day" key={key} aria-labelledby={`day-${key}`}>
          <h2 id={`day-${key}`}>{dayLabel(list[0]!.startsAt, studioTz)}</h2>
          {list.map((c) => (
            <article className={`card cls${c.cancelled ? " is-cancelled" : ""}`} key={c.id}>
              <TimeBlock cls={c} studioTz={studioTz} />
              <div className="what">
                <h3>{c.title}</h3>
                <small>{c.durationMin} minutes</small>
              </div>
              <div className="act">
                <Badge cls={c} />
                {bookable(c, now) && (
                  <>
                    {" "}
                    <Link className="btn primary" to={`/class/${c.id}`} aria-label={`Book ${c.title} at ${formatTime(c.startsAt, studioTz)} on ${dayLabel(c.startsAt, studioTz)}`}>
                      Book
                    </Link>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
