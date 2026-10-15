# Studio Slot

A small booking website for a yoga studio. Visitors see the next two weeks of classes with spots left, book with a name and email (no account), get a one-time cancellation code and a calendar file, and can cancel with the code. The owner signs in with a passphrase to add classes, see rosters and cancel classes. Times are shown in the studio's timezone (Asia/Kolkata) and, for visitors elsewhere, in their own.

**Status: built and tested, not deployed.** Nothing has been created in any Cloudflare account. See `docs/deployment.md` for the plan and the approvals it needs.

## Run it locally
Requires Node >= 22.18.
```
npm install
npm run build
npm start          # site + API on http://127.0.0.1:8788, SQLite file in .data/, owner passphrase "dev-passphrase"
```
`npm run dev` runs Vite with a proxy to `npm run dev:api` for front-end work.

## Checks
```
npm run typecheck
npm run lint
npm test           # 117 unit, component and API tests (real SQLite; includes multi-process concurrency)
npm run e2e        # Playwright against the built site and API (Chrome)
npm run e2e:all    # the same in Chrome, Firefox and WebKit (npx playwright install firefox webkit once)
```
Run the E2E suite against the real Cloudflare Functions runtime with a local D1:
```
npx wrangler d1 migrations apply studio-slot-db --local
npx wrangler pages dev --port 8790 --binding ADMIN_PASSPHRASE=e2e-passphrase --binding SESSION_SECRET=e2e-session-secret-0123456789abcdef --binding COOKIE_INSECURE=1 --binding RATE_LIMIT_BOOK=100000 --binding RATE_LIMIT_CANCEL=100000 --binding RATE_LIMIT_LOGIN=100000
BASE_URL=http://127.0.0.1:8790 E2E_ADMIN_PASSPHRASE=e2e-passphrase npm run e2e
```
Regenerate the screenshots in `docs/screenshots/` with `SCREENSHOTS=1 npm run e2e -- screenshots`.

## Structure
| Path | Purpose |
|---|---|
| `shared/` | code used by browser and server: time zone logic, validation schemas, calendar file |
| `server/` | the API as one `Request -> Response` function, services (bookings, classes, rate limit, session, retention), database adapters, dev server |
| `functions/api/[[path]].ts` | the Cloudflare Pages Function that mounts the API |
| `migrations/` | numbered SQL migrations (D1 and SQLite) |
| `src/` | React front end |
| `public/_headers` | CSP and security headers for the site |
| `tests/` | `unit/` (time, components), `api/` (real SQLite, concurrency), `e2e/` (Playwright) |
| `docs/` | requirements, architecture, API, design system, deployment, test report, risks |
| `prototype/` | the approved clickable design prototype |

## Privacy and security in brief
Only name and email are stored, deleted 90 days after the class. Cancellation codes are stored as hashes. Client addresses are never stored (only a keyed hash for rate limiting). The owner area uses a signed, expiring, HttpOnly, SameSite=Strict cookie plus a CSRF header, and fails closed if its secrets are missing. Nothing is sent to third parties and no email is sent.

## Known limitations
No visitor accounts, no emails, no payments, one shared owner passphrase, English only, the 14-day window is fixed. Not yet verified: the production D1 service and measured CPU time (need a deployment), real Safari, and screen readers (see `docs/test-report.md`).
