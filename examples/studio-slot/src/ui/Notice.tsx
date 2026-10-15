import type { ReactNode } from "react";
import { serviceProblem } from "../api.ts";

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <div className={`notice${tone === "error" ? " err-box" : ""}`} role="alert">
      {children}
    </div>
  );
}

/** The standard message for outages, the daily limit and rate limiting; renders nothing for errors about the visitor's input. */
export function ProblemNotice({ error }: { error: unknown }) {
  const p = serviceProblem(error);
  if (!p) return null;
  return <Notice tone={p.kind === "outage" ? "error" : "info"}>{p.text}</Notice>;
}
