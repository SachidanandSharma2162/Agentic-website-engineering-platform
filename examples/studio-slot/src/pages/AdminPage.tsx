import { useRef, useState, type FormEvent } from "react";
import { ClassInput, LIMITS, type AdminClassView } from "../../shared/schema.ts";
import { dayLabel, formatTime, zonedWallTimeToUtc, zoneAbbr } from "../../shared/time.ts";
import { api, ApiError, isAbort } from "../api.ts";
import { useLoad } from "../hooks.ts";
import { Badge } from "../ui/ClassBits.tsx";
import { useConfirm } from "../ui/Confirm.tsx";
import { Field, focusFirstInvalid } from "../ui/Field.tsx";
import { Notice, ProblemNotice } from "../ui/Notice.tsx";

const unauthorized = (e: unknown): boolean => e instanceof ApiError && e.code === "unauthorized";

const loadAdminClasses = (signal: AbortSignal) => api.adminClasses(signal);

export function AdminPage() {
  const { state, reload } = useLoad(loadAdminClasses);
  const [status, setStatus] = useState<string | null>(null);

  if (state.status === "loading") return <div className="skel" aria-busy="true" aria-label="Checking sign-in" />;
  if (state.status === "error" && unauthorized(state.error)) return <Login onDone={() => { setStatus(null); reload(); }} status={status} />;
  if (state.status === "error") {
    return (
      <>
        <ProblemNotice error={state.error} />
        {state.error instanceof ApiError && state.error.status === 503 && state.error.code === "unavailable" && <Notice>{state.error.message}</Notice>}
        <p style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={reload}>
            Try again
          </button>
        </p>
      </>
    );
  }
  return <Dashboard data={state.data} reload={reload} onSignedOut={() => { setStatus("You have been signed out."); reload(); }} />;
}

function Login({ onDone, status }: { onDone: () => void; status: string | null }) {
  const [error, setError] = useState<string | undefined>();
  const [problem, setProblem] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const passphrase = String(new FormData(e.currentTarget).get("passphrase") ?? "");
    setProblem(null);
    if (!passphrase) {
      setError("Please enter the passphrase.");
      focusFirstInvalid(form.current);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await api.login(passphrase);
      onDone();
    } catch (err) {
      if (isAbort(err)) return;
      setBusy(false);
      if (unauthorized(err)) {
        setError((err as ApiError).message);
        focusFirstInvalid(form.current);
      } else setProblem(err);
    }
  };

  return (
    <>
      <section className="hero">
        <h1>Owner sign in</h1>
      </section>
      <form className="card stack" noValidate ref={form} onSubmit={submit} style={{ maxWidth: 460 }}>
        {status && <div role="status" className="notice">{status}</div>}
        <Field label="Passphrase" name="passphrase" type="password" autoComplete="current-password" error={error} />
        <div role="alert">
          {problem !== null && <ProblemNotice error={problem} />}
          {problem instanceof ApiError && problem.code === "unavailable" && problem.status === 503 && <Notice>{problem.message}</Notice>}
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}

function Dashboard({ data, reload, onSignedOut }: { data: { studioTimezone: string; now: number; classes: AdminClassView[] }; reload: () => void; onSignedOut: () => void }) {
  const tz = data.studioTimezone;
  const confirm = useConfirm();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<unknown>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const handleFailure = (err: unknown) => {
    if (isAbort(err)) return;
    if (unauthorized(err)) {
      reload(); // the session ended: the page falls back to the sign-in form
      return;
    }
    setProblem(err);
  };

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const date = get("date");
    const time = get("time");
    const startsAt = zonedWallTimeToUtc(date, time, tz);
    const errors: Record<string, string> = {};
    if (!date) errors.date = "Pick a date.";
    if (!time) errors.time = "Pick a start time.";
    if (date && time && startsAt === null) errors.date = "That is not a real date and time.";
    const parsed = ClassInput.safeParse({ title: get("title"), startsAt: startsAt ?? 1, durationMin: Number(get("duration")), capacity: Number(get("capacity")) });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = ({ startsAt: "date", durationMin: "duration" } as Record<string, string>)[String(issue.path[0])] ?? String(issue.path[0]);
        if (key !== "date" || !errors.date) errors[key] ??= issue.message;
      }
    }
    if (startsAt !== null && startsAt <= data.now) errors.date = "The class must start in the future.";
    setProblem(null);
    setStatus(null);
    if (Object.keys(errors).length) {
      setFields(errors);
      focusFirstInvalid(form.current);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api.addClass(parsed.data!);
      form.current?.reset();
      setStatus("Class added.");
      reload();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setFields(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k === "startsAt" ? "date" : k === "durationMin" ? "duration" : k, v])));
        focusFirstInvalid(form.current);
      } else handleFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (c: AdminClassView) => {
    const ok = await confirm({
      title: "Cancel this class?",
      body: `${c.title} will show as cancelled. ${c.roster.length} booking${c.roster.length === 1 ? "" : "s"} stay visible in the roster so you can let people know.`,
      confirmLabel: "Cancel class",
    });
    if (!ok) return;
    setProblem(null);
    try {
      await api.cancelClass(c.id);
      setStatus("Class cancelled.");
      reload();
    } catch (err) {
      handleFailure(err);
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch (err) {
      if (!unauthorized(err)) return handleFailure(err);
    }
    onSignedOut();
  };

  return (
    <>
      <section className="hero" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <h1>Classes</h1>
        <button type="button" className="btn" onClick={signOut}>
          Sign out
        </button>
      </section>

      <form className="card stack" noValidate ref={form} onSubmit={add} aria-labelledby="add-h">
        <h2 id="add-h">Add a class</h2>
        <div className="grid2">
          <Field label="Title" name="title" maxLength={LIMITS.titleMax} error={fields.title} />
          <Field label="Date" name="date" type="date" error={fields.date} />
          <Field label={`Start (studio time, ${zoneAbbr(tz, data.now)})`} name="time" type="time" error={fields.time} />
          <Field label="Duration (minutes)" name="duration" type="number" min={LIMITS.durationMin} max={LIMITS.durationMax} defaultValue={60} error={fields.duration} />
          <Field label="Capacity (1 to 100)" name="capacity" type="number" min={LIMITS.capacityMin} max={LIMITS.capacityMax} defaultValue={12} error={fields.capacity} />
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add class"}
        </button>
      </form>

      <div role="status">{status && <div className="notice" style={{ marginTop: 16 }}>{status}</div>}</div>
      <div role="alert">{problem !== null && <div style={{ marginTop: 16 }}><ProblemNotice error={problem} /></div>}</div>

      <h2 style={{ marginTop: 32 }}>Upcoming</h2>
      {data.classes.length === 0 && (
        <div className="card empty">
          <h2>No classes yet</h2>
          <p>Add your first class above.</p>
        </div>
      )}
      {data.classes.map((c) => (
        <article className="card acls" key={c.id} aria-label={`${c.title}, ${dayLabel(c.startsAt, tz)}`}>
          <header>
            <div>
              <h3>{c.title}</h3>
              <span style={{ color: "var(--muted)" }}>
                {dayLabel(c.startsAt, tz)}, {formatTime(c.startsAt, tz)} {zoneAbbr(tz, c.startsAt)} &middot; {c.capacity - c.spotsLeft}/{c.capacity} booked
              </span>
            </div>
            {c.cancelled ? <Badge cls={c} /> : (
              <button type="button" className="btn danger" onClick={() => cancel(c)} aria-label={`Cancel class ${c.title} on ${dayLabel(c.startsAt, tz)}`}>
                Cancel class
              </button>
            )}
          </header>
          {c.roster.length ? (
            <ul className="rost" aria-label={`Roster for ${c.title}`}>
              {c.roster.map((r, i) => (
                <li key={i}>
                  {r.name} &middot; {r.email}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)" }}>No bookings yet.</p>
          )}
        </article>
      ))}
    </>
  );
}
