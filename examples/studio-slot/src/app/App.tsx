import { useEffect, useRef } from "react";
import { Link, Route, Routes, useLocation } from "react-router";
import { AdminPage } from "../pages/AdminPage.tsx";
import { BookPage } from "../pages/BookPage.tsx";
import { CancelPage } from "../pages/CancelPage.tsx";
import { ConfirmedPage } from "../pages/ConfirmedPage.tsx";
import { NotFound } from "../pages/NotFound.tsx";
import { SchedulePage } from "../pages/SchedulePage.tsx";
import { ConfirmProvider } from "../ui/Confirm.tsx";

const NAV = [
  { to: "/", label: "Schedule" },
  { to: "/cancel", label: "Cancel a booking" },
  { to: "/admin", label: "Owner" },
] as const;

interface PageMeta {
  title: string;
  description: string;
}

const DEFAULT_DESCRIPTION = "Book a yoga class in under a minute. See the schedule, reserve a spot and cancel with a code. No account needed.";

function metaFor(path: string): PageMeta {
  if (path === "/") return { title: "Class schedule", description: "See the next two weeks of yoga classes, how many spots are left, and book in under a minute." };
  if (path.startsWith("/class/")) return { title: "Book a class", description: "Reserve your spot with just a name and email. You'll get a cancellation code and a calendar file." };
  if (path === "/booked") return { title: "You're booked", description: DEFAULT_DESCRIPTION };
  if (path === "/cancel") return { title: "Cancel a booking", description: "Cancel your spot with the code you were given, and free it for someone else." };
  if (path === "/admin") return { title: "Owner", description: "Studio owner sign in: add classes, see who has booked and cancel classes." };
  return { title: "Page not found", description: DEFAULT_DESCRIPTION };
}

/** Which nav item a path belongs to: the booking flow lives under "Schedule". */
const navFor = (path: string): string => (path === "/" || path.startsWith("/class/") || path === "/booked" ? "/" : path);

export function App() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // On navigation: update the title and description, and move focus to <main> so keyboard and screen-reader users land on the new content.
  useEffect(() => {
    const m = metaFor(pathname);
    document.title = `${m.title} · Studio Slot`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", m.description);
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <ConfirmProvider>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <Link className="brand" to="/">
          <span className="sun" aria-hidden="true" />
          Studio Slot
        </Link>
        <nav aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} aria-current={navFor(pathname) === n.to ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/class/:id" element={<BookPage />} />
          <Route path="/booked" element={<ConfirmedPage />} />
          <Route path="/cancel" element={<CancelPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </ConfirmProvider>
  );
}
