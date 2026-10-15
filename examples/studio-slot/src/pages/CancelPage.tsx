import { useRef, useState, type FormEvent } from "react";
import { CancelInput } from "../../shared/schema.ts";
import { dayLabel, formatTime } from "../../shared/time.ts";
import { api, ApiError, isAbort } from "../api.ts";
import { useLoad } from "../hooks.ts";
import { Field, useFocusInvalid, SelectField } from "../ui/Field.tsx";
import { Notice, ProblemNotice } from "../ui/Notice.tsx";

const loadClasses = (signal: AbortSignal) => api.classes(signal);

export function CancelPage() {
  const { state, reload } = useLoad(loadClasses);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const focusInvalid = useFocusInvalid(form);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const parsed = CancelInput.safeParse({ classId: String(data.get("classId") ?? ""), code: String(data.get("code") ?? "") });
    setMessage(null);
    setProblem(null);
    if (!parsed.success) {
      setFields({ code: parsed.error.issues[0]?.message ?? "Please enter your code." });
      focusInvalid();
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api.cancelBooking(parsed.data);
      form.current?.reset();
      setMessage("Your spot is cancelled. See you another time.");
      reload();
    } catch (err) {
      if (isAbort(err)) return;
      if (err instanceof ApiError && err.code === "not_found") {
        setFields({ code: err.message });
        focusInvalid();
      } else if (err instanceof ApiError && err.code === "class_started") setProblem(err);
      else setProblem(err);
    } finally {
      setBusy(false);
    }
  };

  const tz = state.status === "ready" ? state.data.studioTimezone : "Asia/Kolkata";
  const options = state.status === "ready" ? state.data.classes.filter((c) => !c.cancelled) : [];

  return (
    <>
      <section className="hero">
        <h1>Cancel a booking</h1>
        <p>Enter the class and the code you were given when you booked. This frees your spot for someone else.</p>
      </section>
      {state.status === "error" ? (
        <>
          <ProblemNotice error={state.error} />
          <p style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={reload}>
              Try again
            </button>
          </p>
        </>
      ) : (
        <form className="card stack" noValidate ref={form} onSubmit={submit}>
          <SelectField label="Class" name="classId" disabled={state.status !== "ready"}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {dayLabel(c.startsAt, tz)}, {formatTime(c.startsAt, tz)} - {c.title}
              </option>
            ))}
          </SelectField>
          <Field label="Cancellation code" name="code" autoComplete="off" spellCheck={false} error={fields.code} />
          <div role="alert">{problem !== null && <ProblemNotice error={problem} />}{problem instanceof ApiError && problem.code === "class_started" && <Notice>{problem.message}</Notice>}</div>
          <div role="status">{message && <div className="notice">{message}</div>}</div>
          <button className="btn primary" type="submit" disabled={busy || state.status !== "ready"}>
            {busy ? "Cancelling…" : "Cancel my spot"}
          </button>
        </form>
      )}
    </>
  );
}
