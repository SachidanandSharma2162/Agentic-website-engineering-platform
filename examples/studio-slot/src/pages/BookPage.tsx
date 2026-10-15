import { useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BookingInput, LIMITS } from "../../shared/schema.ts";
import { dayLabel, formatTime, zoneAbbr } from "../../shared/time.ts";
import { api, ApiError, isAbort } from "../api.ts";
import { useLoad } from "../hooks.ts";
import { rememberBooking } from "../lastBooking.ts";
import { Badge } from "../ui/ClassBits.tsx";
import { Field, useFocusInvalid } from "../ui/Field.tsx";
import { Notice, ProblemNotice } from "../ui/Notice.tsx";
import { NotFound } from "./NotFound.tsx";

const loadClasses = (signal: AbortSignal) => api.classes(signal);

export function BookPage() {
  const { id = "" } = useParams();
  const { state, reload } = useLoad(loadClasses);

  if (state.status === "loading") return <div className="skel" aria-busy="true" aria-label="Loading class" />;
  if (state.status === "error") {
    return (
      <>
        <ProblemNotice error={state.error} />
        <p style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={reload}>
            Try again
          </button>
        </p>
      </>
    );
  }
  const { studioTimezone: tz, now } = state.data;
  const cls = state.data.classes.find((c) => c.id === id);
  if (!cls) return <NotFound title="We couldn't find that class" body="It may have already happened, or it is more than two weeks away." />;

  const closed = cls.cancelled ? "This class has been cancelled." : cls.startsAt <= now ? "This class has already started." : cls.spotsLeft <= 0 ? "This class is full." : "";
  return (
    <>
      <p>
        <Link to="/">Back to schedule</Link>
      </p>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <h1>{cls.title}</h1>
        <p>
          {dayLabel(cls.startsAt, tz)}, {formatTime(cls.startsAt, tz)} to {formatTime(cls.startsAt + cls.durationMin * 60_000, tz)} {zoneAbbr(tz, cls.startsAt)} &middot; <Badge cls={cls} />
        </p>
      </section>
      {closed ? (
        <Notice>
          {closed} <Link to="/">See other classes</Link>.
        </Notice>
      ) : (
        <BookingForm classId={cls.id} studioTimezone={tz} />
      )}
    </>
  );
}

function BookingForm({ classId, studioTimezone }: { classId: string; studioTimezone: string }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<unknown>(null);
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const focusInvalid = useFocusInvalid(form);
  const privacyId = useId();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const input = { classId, name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), website: String(data.get("website") ?? "") };

    const parsed = BookingInput.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setFields(next);
      setProblem(null);
      focusInvalid();
      return;
    }
    setFields({});
    setProblem(null);
    setFull(null);
    setBusy(true);
    try {
      const r = await api.book(parsed.data);
      rememberBooking({ ...r, studioTimezone });
      navigate("/booked");
    } catch (err) {
      if (isAbort(err)) return;
      setBusy(false);
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else if (err instanceof ApiError && ["class_full", "class_cancelled", "class_started", "class_not_found"].includes(err.code)) setFull(err.message);
      else setProblem(err);
    }
  };

  return (
    <form className="card stack" noValidate ref={form} onSubmit={submit} aria-describedby={privacyId}>
      <div className="grid2">
        <Field label="Your name" name="name" autoComplete="name" maxLength={LIMITS.nameMax} error={fields.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" maxLength={LIMITS.emailMax} error={fields.email} />
      </div>
      {/* Honeypot: invisible and unreachable for people; bots tend to fill every field. */}
      <label className="hp" aria-hidden="true">
        Leave this empty
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p id={privacyId} style={{ color: "var(--muted)", fontSize: ".9375rem" }}>
        We store only your name and email, and delete them 90 days after the class. No emails are sent. You'll get a cancellation code on the next screen.
      </p>
      <div role="alert">
        {full && (
          <Notice tone="error">
            {full} <Link to="/">Choose another class</Link>.
          </Notice>
        )}
        {problem !== null && <ProblemNotice error={problem} />}
      </div>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Reserving…" : "Reserve my spot"}
      </button>
    </form>
  );
}
