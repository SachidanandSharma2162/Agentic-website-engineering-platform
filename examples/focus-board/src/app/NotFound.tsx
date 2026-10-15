import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="card empty">
      <h1>Page not found</h1>
      <p style={{ marginTop: 8 }}>That address doesn’t exist in Focus Board.</p>
      <Link className="btn primary" to="/">
        Back to Today
      </Link>
    </div>
  );
}
