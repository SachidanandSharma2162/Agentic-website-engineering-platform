# Architecture: Focus Board

A client-only single-page app. No server, no database, no secrets.

## Stack
React 19, TypeScript, Vite 8, Tailwind CSS 4, Motion (animations), lucide-react (icons), react-router.
Tests: Vitest + React Testing Library (jsdom), Playwright, @axe-core/playwright. Lint: ESLint.
Hosting: Cloudflare Pages (static, direct upload).

## Modules
```
src/
  domain/    pure logic, no React, no DOM: dates (local day keys), tasks, habits, streaks, filters
  storage/   versioned persistence adapter (localStorage) + zod schema; import/export validation
  state/     useReducer store + context; persists through the storage adapter
  ui/        accessible components (Button, Field, Dialog, Toast, ProgressRing, ...)
  features/  tasks/, habits/, settings/ screens
  app/       router, layout, not-found
```
- The clock is injected (`now()`), so streak logic is deterministic in tests.
- A "day" is a local-date string `YYYY-MM-DD`; arithmetic is done on calendar dates, never on 24h millisecond offsets (DST safe).
- The storage adapter is an interface; localStorage is the only implementation, which keeps a later Supabase sync an additive change.
- Persisted shape: `{ version: 1, tasks: Task[], habits: Habit[] }` where habit check-ins are a set of day keys. Loaded and imported data are parsed with zod; failures never overwrite existing data.

## Security
- No `dangerouslySetInnerHTML`; all user text rendered as text.
- Import is untrusted: size limit, JSON parse in try/catch, schema validation, string length caps, item count caps, prototype-pollution-safe parsing (zod rebuilds objects).
- `public/_headers`: CSP `default-src 'self'; style-src 'self' 'unsafe-inline'`, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none.
- SPA routing: Cloudflare Pages serves `index.html` for unknown paths when no top-level 404.html exists (to be verified in the smoke test, with a `_redirects` fallback if not).

## Decisions
- **No shadcn/ui, no Next.js:** the UI surface is about ten components and there is nothing to server-render. Hand-built accessible components avoid a CLI/registry dependency and keep the bundle small. (The platform default list allows this; recorded as an ADR.)
- **No backend/Supabase in the MVP:** nothing in the requirements needs it; adding it would add credentials, an attack surface and quota limits for no user value.
- **react-router:** needed for real URLs and refresh behaviour (AC13).

## Hosting feasibility (verified from Cloudflare's official docs on 2026-10-15)
Pages Free: 20,000 files per site, 25 MiB per file, 100 projects per account, 500 builds/month (Git-triggered). This app is a few dozen files totalling well under 1 MB. **Not stated in the docs consulted:** exact API-token permissions for direct upload, and whether direct uploads count against build limits. Neither blocks the plan; both are checked when credentials exist.
