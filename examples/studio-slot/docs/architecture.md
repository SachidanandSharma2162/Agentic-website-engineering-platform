# Architecture: Studio Slot

A modular monolith: one repository, a React single-page front end and a small TypeScript API, both served by Cloudflare Pages, with one SQLite database (Cloudflare D1). No microservices, no queue, no cron.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Front end | React 19, TypeScript, Vite, react-router, hand-built accessible components | same proven stack and design discipline as Focus Board |
| API | Cloudflare **Pages Functions** (`functions/api/**`, TypeScript) | same deploy unit and origin as the site, so no CORS and a strict CSP stays `connect-src 'self'` |
| Database | Cloudflare **D1** (SQLite) | relational constraints do the hard work (capacity, uniqueness); free tier is ample |
| Validation | zod (with `jitless`, see Focus Board finding) | one schema shared by client and server |
| Tests | Vitest (unit, API against a real in-memory SQLite via `node:sqlite`), Playwright (against `wrangler pages dev` with a local D1) in Chrome, Firefox, WebKit, axe | |

Rejected: Next.js (nothing needs server rendering), a separate Worker service (adds a second deployable and CORS), Supabase (adds a second vendor and credentials; D1 is enough), Firebase.

## Modules
```
src/                 React app: schedule, booking, cancel, admin screens, ui components
shared/              zod schemas, types, timezone helpers (used by app and API)
functions/api/       route handlers: thin; parse, authorise, call the service, shape the response
server/              pure services: bookings, classes, rate limit, session, ics, retention (take a Db interface)
server/db/           Db interface, D1 adapter, node:sqlite adapter for tests, migrations/*.sql
```
Services depend on a small `Db` interface (`prepare/bind/run/first/all/batch`), so the same SQL runs against D1 in production and against real SQLite in tests.

## Data model (SQLite)
```
classes(id TEXT PK, title TEXT, starts_at INTEGER /*epoch seconds UTC*/, duration_min INTEGER,
        capacity INTEGER CHECK(capacity BETWEEN 1 AND 100), cancelled INTEGER DEFAULT 0, created_at INTEGER)
bookings(id TEXT PK, class_id TEXT REFERENCES classes(id), name TEXT, email TEXT /*lower-cased*/,
         code_hash TEXT, created_at INTEGER, UNIQUE(class_id, email))
rate_limits(key TEXT, window INTEGER, count INTEGER, PRIMARY KEY(key, window))
```
Indexes: `classes(starts_at)`, `bookings(class_id)`. Migrations are numbered SQL files applied in order; they are additive and reversible by a documented down-script (an irreversible migration needs Gate E).

## The concurrency-safe booking
Capacity is enforced by the database in a single statement, not by "read count, then insert":
```sql
INSERT INTO bookings (id, class_id, name, email, code_hash, created_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6
WHERE (SELECT cancelled FROM classes WHERE id = ?2) = 0
  AND (SELECT starts_at FROM classes WHERE id = ?2) > ?6
  AND (SELECT COUNT(*) FROM bookings WHERE class_id = ?2) < (SELECT capacity FROM classes WHERE id = ?2);
```
`changes() = 1` means success. Zero changes is followed by a read to return the precise reason (full, cancelled, past, unknown). The UNIQUE constraint turns a duplicate email into a 409. SQLite serialises writes, so N concurrent requests produce exactly capacity successes; the API test proves it.

## API
| Method and path | Auth | Purpose |
|---|---|---|
| GET `/api/classes` | public | next 14 days with spots left |
| POST `/api/bookings` | public, rate limited | create booking; returns booking id and one-time cancellation code |
| POST `/api/bookings/cancel` | public (needs code), rate limited | cancel by class id and code |
| GET `/api/admin/session` | public | whether the owner is signed in (always 200, so no failing request) |
| POST `/api/admin/login` | passphrase, rate limited | start a session |
| POST `/api/admin/logout` | session | end it |
| GET `/api/admin/classes` | session | classes with rosters |
| POST `/api/admin/classes` | session | add a class |
| POST `/api/admin/classes/:id/cancel` | session | cancel a class |
| GET `/api/health` | public | liveness and schema version, no data |

Errors are JSON `{ error: { code, message, fields? } }` with accurate status codes. Request bodies are size-capped. Nothing logs names, emails, codes or the passphrase.

## Authentication and authorisation
- Visitors have no accounts. A cancellation code (75 bits of randomness from a 32-letter alphabet without look-alikes, shown once, only its SHA-256 stored; guessing is bounded by rate limiting) authorises one booking.
- Admin: `ADMIN_PASSPHRASE` and `SESSION_SECRET` are Worker secrets. Login compares in constant time and sets an HMAC-signed, expiring (8 h), `HttpOnly; Secure; SameSite=Strict` cookie. Every admin handler calls one `requireAdmin()` guard; a test enumerates the route table and asserts 401 for each without a session. State-changing admin calls also require the cookie plus a custom header (CSRF defence in addition to SameSite).
- Rate limiting: per-IP counters in D1 (`CF-Connecting-IP`), fixed windows; sign-in is stricter than booking.

## Time
Instants are stored as UTC epoch seconds. The studio's IANA timezone is configuration (`STUDIO_TIMEZONE`, approved value `Asia/Kolkata`, UTC+5:30, no DST). Display uses `Intl.DateTimeFormat` with that zone, plus the visitor's local time when different. "Day" grouping on the schedule uses the studio zone, so a 23:30 IST class stays on its own day for a visitor in UTC. Helpers take the zone as an argument and are tested in three zones: `Asia/Kolkata` (half-hour offset, the production value), `America/New_York` (both DST transitions) and `UTC`.

## Privacy and retention
Only name and email are stored. Bookings are purged 90 days after the class by a lazy purge that runs on admin requests (no cron needed); a test advances a clock to prove it.

## Security headers
Same policy as Focus Board (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, no `unsafe-eval`), via `public/_headers`, served identically by `vite preview` and `wrangler pages dev` so local runs enforce it.

## Hosting feasibility (official Cloudflare documentation, fetched 2026-10-16)
| Resource | Free limit | Expected use (about 200 visits a day, 20 bookings a day) |
|---|---|---|
| Workers / Pages Functions requests | 100,000 a day, shared, resets 00:00 UTC | about 1,500 a day (1.5%) |
| Workers CPU time | 10 ms per request | validation and one or two queries: expected to fit, to be measured |
| D1 rows read | 5 million a day | about 100,000 a day (2%) |
| D1 rows written | 100,000 a day | about 100 a day (0.1%) |
| D1 storage | 5 GB total | well under 1 MB |
Over the daily limit D1 returns errors and Workers return error 1027, so the front end must show a friendly "try again later" state rather than breaking. Not stated in the pages consulted: per-database storage cap and the exact behaviour of the Pages-specific limit page; neither blocks the plan.

## Deployment shape and what needs approval
- `wrangler pages deploy dist` uploads the static build; the `functions/` directory next to it is compiled into the deployment; a D1 binding (`DB`) is attached to the Pages project.
- Creating the production D1 database, applying migrations, setting the two secrets, and adding D1 permission to the API token are infrastructure and permission changes: **Gate E**, requested individually, not covered by Gates C and D.
- Local development and CI need no Cloudflare account: `wrangler pages dev` uses a local D1.

## Known unknowns to resolve before Gate C
1. Exactly how the D1 binding is attached to a direct-upload Pages project from the CLI (wrangler.toml with `pages_build_output_dir` versus dashboard binding). Verified against current wrangler documentation and a local run before any production change.
2. Measured CPU time per request against the 10 ms limit.

## Decisions made while building (deviations from the approved plan)
1. **Calendar file is built in the browser** (`shared/ics.ts`), not by a server endpoint. The class details are already on the confirmation screen, so no extra request, no extra attack surface, and the file contains no personal data. The planned `GET /api/bookings/:id/ics` was dropped.
2. **Cancellation code is 75 bits, not 128.** Fifteen characters from a 32-letter alphabet is short enough to type from a screenshot or read aloud, and the cancel endpoint is rate limited and scoped to one class. The code is never stored, only its hash.
3. **`GET /api/admin/session` was added.** Asking "am I signed in?" by calling an owner endpoint that answers 401 produced a console error on every visit to the sign-in page, found by the browser-hygiene test.
4. **No Tailwind.** The approved design is plain CSS ported from the prototype, so there are no utility-class name collisions of the kind that broke Focus Board's progress ring.
5. **Deterministic ordering.** Rosters are ordered by insertion (`rowid`) and classes by start, title, id; ties on a random id made order vary between runs (found by a flaky test).
6. **The static `_headers` rules apply to the site, not to API responses** (that is how Cloudflare Pages works), so the API handler sets its own `Cache-Control` and `X-Content-Type-Options`.
7. **Pages answers unknown paths, including missing assets, with the app shell** (status 200); the local server answers 404. Tests assert only that a missing script is never served as script.

## How the D1 risk (R8) was checked
All SQL runs unchanged on Node's SQLite and on Cloudflare's runtime. `wrangler pages dev` (the real Pages Functions runtime, workerd, with a local D1) was run against the built site: all 41 end-to-end tests pass in Chrome, Firefox and WebKit, and 30 simultaneous bookings for 5 seats produced exactly 5 successes, three times. **Not yet verified:** the production D1 service itself and measured CPU time against the 10 ms limit; both need a deployment.
