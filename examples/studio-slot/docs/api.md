# API reference: Studio Slot

One JSON API under `/api`, implemented once in `server/app.ts` as a function from `Request` to `Response`. In production it runs as a Cloudflare Pages Function (`functions/api/[[path]].ts`) on D1; locally the same function runs in a Node server on SQLite (`server/dev-server.ts`). Every response carries `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Conventions
- Requests with a body must be `Content-Type: application/json` and at most 4096 bytes (otherwise 415 or 413).
- Times are epoch milliseconds (UTC). The studio's IANA zone is returned as `studioTimezone`; clients format times themselves.
- Errors always look like `{ "error": { "code": "...", "message": "...", "fields": { "email": "..." } } }`. `fields` appears for validation problems. Messages are written for the visitor.
- Unknown paths give 404 `not_found`; a known path with the wrong method gives 405 with an `Allow` header.

## Public endpoints

### `GET /api/health`
`200 { "ok": true }` after a trivial database query. No data.

### `GET /api/classes`
Classes starting within the next 14 days, soonest first.
```json
{ "studioTimezone": "Asia/Kolkata", "now": 1792096899128,
  "classes": [{ "id": "…", "title": "Sunrise Vinyasa", "startsAt": 1792200000000, "durationMin": 60,
                "capacity": 12, "spotsLeft": 3, "cancelled": false }] }
```
Never includes names or emails.

### `POST /api/bookings`
Body `{ "classId", "name", "email", "website"? }`. `name` 1-60 characters without control characters, `email` valid and at most 120 characters, `website` is a honeypot that must stay empty.

- `201 { "bookingId", "code", "class" }`. `code` looks like `K7QM2-X9PTA-4RWNE` and is **shown once**; only its SHA-256 is stored.
- `400 validation` with `fields`. `404 class_not_found`. `409 already_booked` (same email, case-insensitive), `409 class_full`, `409 class_cancelled`, `409 class_started`. `429 rate_limited` with `Retry-After`.
- A filled honeypot returns an identical-looking `201` and stores nothing.

Capacity is enforced inside the database by a single conditional `INSERT`, so concurrent requests can never exceed it (see `server/services/bookings.ts`).

### `POST /api/bookings/cancel`
Body `{ "classId", "code" }`. Codes are accepted in any case and with or without dashes.
- `200 { "ok": true }`: the booking row is deleted, so a code works once.
- `404 not_found` for a wrong code, a wrong class, an unknown class or a malformed code, all with the same message so bookings cannot be probed.
- `409 class_started` once the class has begun. `429 rate_limited`.

## Owner endpoints
Authentication is a signed, expiring cookie (`studio_admin`, 8 hours, `HttpOnly; Secure; SameSite=Strict; Path=/api/admin`). State-changing owner requests (every POST except login) must also send `X-Requested-With: studio-slot`, or they get `403 forbidden`. Without a valid session every owner endpoint except login and session answers `401 unauthorized`.

### `POST /api/admin/login`
Body `{ "passphrase" }`. `200` and a `Set-Cookie` on success; `401 unauthorized` otherwise; `429` after too many attempts; `503 unavailable` when the passphrase or signing secret is not configured (fails closed).

### `GET /api/admin/session`
`200 { "signedIn": true | false }`. Never 401, so the owner page can check without a failing request.

### `POST /api/admin/logout`
`200`, clears the cookie.

### `GET /api/admin/classes`
Classes from yesterday onwards with `roster: [{ name, email }]`. This is the only place names and emails leave the database. Also deletes classes (and their bookings) that started more than 90 days ago.

### `POST /api/admin/classes`
Body `{ "title", "startsAt", "durationMin", "capacity" }`: title 1-60 characters, `startsAt` in the future and within a year, duration 15-240, capacity 1-100 (integers). `201` with the class, or `400 validation` with `fields`.

### `POST /api/admin/classes/:id/cancel`
Marks the class cancelled (its bookings stay visible in the roster). `200`; repeating it is safe; unknown id gives `404 class_not_found`.

## Rate limits
Per client address (stored only as a keyed hash), fixed 10-minute windows. Defaults: 10 bookings, 20 cancellation attempts, 8 sign-in attempts. Configurable with `RATE_LIMIT_BOOK`, `RATE_LIMIT_CANCEL`, `RATE_LIMIT_LOGIN`.

## Failure behaviour
- Free-tier daily limits: a database error mentioning a limit becomes `503 daily_limit` with `Retry-After`; Cloudflare's own request limit is a non-JSON `429` that the front end explains as a capacity limit.
- Any other unexpected error becomes `503 unavailable` with a generic message; details are logged without personal data and never returned.

## Configuration
| Name | Kind | Purpose |
|---|---|---|
| `DB` | D1 binding | the database |
| `ADMIN_PASSPHRASE` | secret | owner passphrase |
| `SESSION_SECRET` | secret, 16+ characters | signs session cookies and keys rate-limit hashes |
| `STUDIO_TIMEZONE` | variable | IANA zone, default `Asia/Kolkata`; an invalid value makes every endpoint answer 503 |
| `COOKIE_INSECURE` | variable | `1` only for plain-http local development |
| `RATE_LIMIT_*` | variables | optional overrides |

## Schema
`migrations/0001_init.sql`: `classes`, `bookings` (unique on class + email, unique on class + code hash, cascade delete from classes), `rate_limits`. Migrations are additive; anything destructive needs explicit approval.
