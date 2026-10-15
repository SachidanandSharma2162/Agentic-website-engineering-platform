import { Link } from "react-router";

export function NotFound({ title = "Page not found", body = "That page doesn't exist." }: { title?: string; body?: string }) {
  return (
    <div className="card empty">
      <h1>{title}</h1>
      <p style={{ margin: "8px 0 16px" }}>{body}</p>
      <Link className="btn primary" to="/">
        Back to the schedule
      </Link>
    </div>
  );
}
