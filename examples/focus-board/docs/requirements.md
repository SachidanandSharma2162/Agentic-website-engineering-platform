# Requirements: Focus Board

## Request
A small daily focus tracker: add and complete tasks, track habits with streaks, filter and search, keep data in the browser with JSON export and import, responsive and accessible.

## Classification
Web application, small. No backend, no accounts, no payments.

## Target users
Individuals who want a calm, fast, private place to plan today's tasks and keep a few daily habits. Data never leaves their browser.

## Features
MVP:
- F1 Tasks: add, edit title, set priority (high/normal/low), complete/uncomplete, delete (with undo).
- F2 Today list: tasks can be pinned to "Today"; Today view shows progress (done/total).
- F3 Filter and search: all/active/done filter plus text search over titles.
- F4 Habits: add/rename/delete habits; one check-in per habit per local day; current and best streak; last-7-days strip.
- F5 Persistence: all data saved in localStorage automatically; survives reload.
- F6 Export/import: download all data as JSON; import validates the file and replaces data only after confirmation.
- F7 Reset: delete all data after confirmation.
- F8 Routing: `/` Today, `/tasks`, `/habits`, `/settings`; direct load and refresh on any route works.
- F9 Accessibility: keyboard operable, visible focus, labelled controls, reduced-motion respected, WCAG AA contrast.
- F10 Responsive: usable at 375, 768 and 1280 px widths.

Optional (only if time permits, not required for release): keyboard shortcut `n` to focus the add field.

Future scope (not built): accounts and sync (Supabase), reminders, recurring tasks, themes.

## Non-functional
- Performance: first load under 200 KB gzipped JS; no network requests after load.
- Privacy: no analytics, no third-party requests, no cookies.
- Security: imported JSON is untrusted and schema-validated; no `dangerouslySetInnerHTML`; strict CSP via `_headers`.
- Browser support: current evergreen browsers.

## Assumptions (confirm at Gate A')
- Single user per browser; no sync across devices.
- Local timezone defines a "day".
- English only.
- One visual theme (a deliberately designed one) rather than a theme switcher.
- No custom domain; hosted at a `*.pages.dev` address.
