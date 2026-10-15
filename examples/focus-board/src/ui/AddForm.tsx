import { useId, useRef, useState, type FormEvent } from "react";
import type { TitleResult } from "../domain/tasks.ts";

/** Single-field "add" form with inline validation. Keeps focus in the field after a successful add so entries can be chained. */
export function AddForm({ label, placeholder, maxLength, onAdd }: { label: string; placeholder: string; maxLength: number; onAdd: (value: string) => TitleResult }) {
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = input.current;
    if (!el) return;
    const result = onAdd(el.value);
    if (!result.ok) {
      setError(result.error);
      el.focus();
      return;
    }
    setError("");
    el.value = "";
    el.focus();
  };

  return (
    <form className="add" onSubmit={submit} noValidate>
      <label className="field">
        <span className="sr">{label}</span>
        <input
          ref={input}
          className="input"
          name="value"
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={() => error && setError("")}
        />
      </label>
      <button className="btn primary" type="submit">
        Add
      </button>
      <p className="err" id={errorId} role="alert">
        {error}
      </p>
    </form>
  );
}
