import { useEffect, useRef } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router";
import { Flame, ListChecks, Settings, Target } from "lucide-react";
import { HabitsPage } from "../features/habits/HabitsPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { TasksPage } from "../features/tasks/TasksPage.tsx";
import { TodayPage } from "../features/tasks/TodayPage.tsx";
import { StoreProvider, useStore, type Clock } from "../state/store.tsx";
import type { StorageAdapter } from "../storage/storage.ts";
import { ConfirmProvider } from "../ui/Confirm.tsx";
import { ToastProvider } from "../ui/Toast.tsx";
import { NotFound } from "./NotFound.tsx";

const NAV = [
  { to: "/", label: "Today", icon: Target, end: true },
  { to: "/tasks", label: "Tasks", icon: ListChecks, end: false },
  { to: "/habits", label: "Habits", icon: Flame, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

const TITLES: Record<string, string> = { "/": "Today", "/tasks": "Tasks", "/habits": "Habits", "/settings": "Settings" };

function Shell() {
  const store = useStore();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // On navigation: update the document title and move focus to <main> so keyboard and screen-reader users land on the new content.
  useEffect(() => {
    document.title = `${TITLES[pathname] ?? "Page not found"} · Focus Board`;
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <nav className="nav" aria-label="Primary">
          <span className="brand">
            <i aria-hidden="true" />
            Focus Board
          </span>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <main id="main" ref={main} tabIndex={-1}>
          {store.notice && (
            <div className="notice" role="status">
              {store.notice}{" "}
              <button type="button" className="btn" onClick={store.dismissNotice}>
                Dismiss
              </button>
            </div>
          )}
          {store.saveError && (
            <div className="notice" role="alert">
              {store.saveError}
            </div>
          )}
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

/** Application root. The router is supplied by the caller (BrowserRouter in production, MemoryRouter in tests). */
export function App({ storage, clock }: { storage: StorageAdapter; clock?: Clock }) {
  return (
    <StoreProvider storage={storage} clock={clock}>
      <ToastProvider>
        <ConfirmProvider>
          <Shell />
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
