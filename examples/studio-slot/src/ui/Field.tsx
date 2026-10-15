import { useId, type InputHTMLAttributes, type ReactNode } from "react";

/** A labelled input with its error message. The error is tied to the input (aria-describedby) but is not part of its name. */
export function Field({ label, error, children, ...input }: { label: string; error?: string | undefined; children?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={`${id}-err`} {...input} />
      {children}
      <span className="err" id={`${id}-err`}>
        {error}
      </span>
    </div>
  );
}

export function SelectField({ label, error, children, ...select }: { label: string; error?: string | undefined; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={`${id}-err`} {...select}>
        {children}
      </select>
      <span className="err" id={`${id}-err`}>
        {error}
      </span>
    </div>
  );
}

/** Move keyboard focus to the first invalid control once React has rendered the errors. */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
}
