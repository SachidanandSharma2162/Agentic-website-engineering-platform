# Acceptance criteria: Focus Board

Each criterion names how it is verified. U = unit test, C = component test (React Testing Library), E = Playwright end-to-end, A = axe accessibility check, S = production smoke test.

| ID | Feature | Criterion | Verified by |
|---|---|---|---|
| AC1 | F1 | Submitting a non-empty title adds a task to the top of the list and clears the field; empty or whitespace-only titles are rejected with a visible error. | C, E |
| AC2 | F1 | Toggling a task moves it between active and done and updates counts. Titles are trimmed and capped at 120 characters. | U, C |
| AC3 | F1 | Editing saves on Enter/blur and cancels on Escape. | C |
| AC4 | F1 | Deleting shows an undo notice for 6 seconds; Undo restores the task at its original position. | C, E |
| AC5 | F2 | Pinned tasks appear on Today; the progress label equals done/total of pinned tasks and shows an empty state when none are pinned. | U, E |
| AC6 | F3 | Status filter and case-insensitive search combine; no matches shows an empty state with a clear-filters action. | U, C |
| AC7 | F4 | Checking a habit records today (local date); checking again unchecks it. | U, C |
| AC8 | F4 | Current streak = consecutive days with a check-in ending today, or ending yesterday if today is not yet checked. A gap resets it to 0. Best streak is the longest run ever. | U (table-driven, includes month/year/DST boundaries) |
| AC9 | F5 | After reload, tasks, habits and check-ins are identical. Corrupt stored data does not crash the app (it starts empty and shows a notice). | U, E |
| AC10 | F6 | Export downloads valid JSON that re-imports to identical data. | U, E |
| AC11 | F6 | Importing invalid JSON, wrong schema, oversize file (>1 MB) or unknown version changes nothing and shows an error. Valid import requires confirmation. | U, E |
| AC12 | F7 | Reset requires confirmation and then leaves empty state. | E |
| AC13 | F8 | Loading `/habits`, `/tasks`, `/settings` directly and refreshing returns the right page; unknown routes show a helpful not-found page with a link home. | E (against `vite preview`), S |
| AC14 | F9 | axe finds no serious or critical violations on every route; all interactive elements are reachable and operable by keyboard; focus is visible; `prefers-reduced-motion` disables non-essential animation. | A, E |
| AC15 | F10 | No horizontal scroll and no overlapping content at 375, 768 and 1280 px. | E |
| AC16 | NFR | Production build: no console errors on any route; no requests to other origins; JS under 200 KB gzipped. | E, build report |
| AC17 | NFR | `npm audit --audit-level=high` reports no vulnerabilities; type-check, lint and all tests pass. | CI |
| AC18 | Deploy | The live URL (from provider output) returns 200 on `/` and `/habits` with expected content. | S |
