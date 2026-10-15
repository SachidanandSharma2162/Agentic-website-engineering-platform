import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type RefObject } from "react";

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

/**
 * Returns a function that moves keyboard focus to the form's first invalid control. The move happens in an effect, after
 * React has committed the error state, so aria-invalid is guaranteed to be in the DOM (focusing earlier, for example in
 * requestAnimationFrame, sometimes ran before the render and focus went nowhere).
 */
export function useFocusInvalid(form: RefObject<HTMLFormElement | null>): () => void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick > 0) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [tick, form]);
  return () => setTick((t) => t + 1);
}
