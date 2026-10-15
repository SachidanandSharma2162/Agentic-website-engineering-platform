# Test report: Studio Slot

Re-run with `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e:all`. The platform's `quality` and `security` tasks record their output in `docs/evidence/`.

## Summary
| Check | Result |
|---|---|
| Type-check (`tsc -b`, strict), lint | pass |
| Unit, component and API tests (Vitest, real SQLite) | 116 passed: 31 time zone, 23 component, 60 API, 2 multi-process concurrency |
| End-to-end (Playwright, built site + API + SQLite) | 41 tests in Chrome, Firefox and WebKit: 123 of 123 passed |
| Same E2E suite on the real Cloudflare Pages Functions runtime with a local D1 (`wrangler pages dev`) | 123 of 123 passed |
| Concurrency on that runtime | 30 simultaneous bookings for 5 seats gave exactly 5 successes, 3 runs out of 3 |
| Production build | pass; JavaScript 113.7 KB gzipped (budget 200 KB), CSS 2.3 KB |
| `npm audit --audit-level=high` | 0 vulnerabilities |

## Traceability: acceptance criteria to tests
| AC | Where it is verified |
|---|---|
| AC1 schedule | API `schedule` (4); component `schedule` (3); E2E visitor journey and card states |
| AC2 time zones | `time.test.ts` (31: Kolkata, New York both DST transitions, UTC, a sweep of every half hour across both transitions); E2E in a Kolkata and a New York browser |
| AC3 booking | API `booking` (10); component `booking` (5); E2E booking form and journey |
| AC4 capacity never exceeded | API: 20 simultaneous requests for 5 spots; **concurrency test: 16 separate processes, separate connections, exactly 5 win**; same on the Cloudflare runtime |
| AC5 duplicates and closed classes | API `booking` (full, cancelled, started, unknown, duplicate email); E2E duplicate and "filled up while typing" |
| AC6 cancelling | API `cancelling` (5: identical answers for wrong code/class/unknown/garbage, code works once, hash only); E2E |
| AC7 calendar file | `time.test.ts` (well-formed, UTC, escaping, no personal data); E2E real download |
| AC8 owner authentication | API: every owner route 401 without a session, forged/tampered/expired cookie, cookie flags, CSRF header, fails closed, secrets never in responses |
| AC9 owner classes | API validation (9 cases), roster, cancel keeps bookings; component conversion of 06:30 IST to 01:00 UTC; E2E add, roster, cancel |
| AC10 abuse protection | API: 429 with Retry-After, other clients unaffected, window reopens, sign-in and cancel limits, no address stored; E2E messages for 429 and outages |
| AC11 hostile input | API: markup and SQL metacharacters stored as text and database intact, oversize/415/malformed JSON, 404/405, uncacheable responses |
| AC12 accessibility | axe on schedule (all states), booking (empty and error), confirmation, cancel, owner (sign-in, dashboard with roster, errors, dialog), not-found and outage; keyboard-only booking and cancelling; focus rings on every tab stop (Chrome, Firefox); dialog focus handling; reduced motion |
| AC13 responsive | 3 widths x every screen: no horizontal scroll, no overflowing element, cancellation code on one line, nav pills on one row |
| AC14 hygiene | no console errors, CSP violations, failed or cross-origin requests on every screen; security headers; owner cookie scoped, HttpOnly, SameSite=Strict, not readable by scripts; API never cached |
| AC15 | audit, type-check, lint, tests: see summary |
| AC16 live | **not run** (not deployed) |
| AC17 retention | API: purged at 91 days, kept at 89, bookings cascade |

Mutation checks (tests proven able to fail): removing the capacity condition fails the API and concurrency tests (16 of 16 processes overbook); making any cookie count as a session fails 2 tests; removing the CSRF header check fails 2 tests.

## Defects found and fixed while testing
| Defect | How found |
|---|---|
| Owner page asked "am I signed in?" via a request that fails with 401, logging a console error on every visit | browser hygiene test; added `GET /api/admin/session` |
| "Class added." disappeared: the dashboard unmounted while its data reloaded | E2E; the loader now keeps previous data while refreshing |
| Focus sometimes did not move to the invalid field (moved in `requestAnimationFrame`, before React rendered the error) | an intermittent E2E failure; focus now moves in an effect after commit; 10 of 10 clean loops afterwards |
| Roster order varied between runs (ties broken by a random id) | a flaky API test; ordering is now deterministic |
| Intermittent axe `color-contrast` failure (2 of 25 runs in WebKit): a disabled button turning enabled cross-faded its colours for 200 ms and passed through a low-contrast state | repeated runs captured the violation; button colour transitions removed, regression test added; 40 of 40 clean afterwards |
| Prototype race: navigating away during loading wrote into the wrong screen | found in design review; the real loader ignores and cancels stale requests (component test) |
| Honeypot response had a different shape from a real success | review; now identical |

Several failures were mistakes in my own tests (ambiguous locators, assertions on the wrong wording, racing page render); each was fixed in the test, not by weakening an assertion.

## Browser and platform notes
- Playwright's WebKit build does not Tab onto links (Safari's default), so the tab-stop focus-ring walk runs in Chrome and Firefox; WebKit still runs the keyboard-only booking flow by focusing links directly.
- Running three browsers at once on one machine caused timeouts that were overload, not defects; multi-browser runs use 3 workers.
- Cloudflare Pages answers unknown paths with the app shell (status 200); the local server answers 404. The test asserts only that a missing script is never served as script.

## Not verified
- **Production D1 and measured CPU time** against the 10 ms limit (need a deployment); the local D1 and workerd runtime are the same engine family but not the service.
- **Real Safari on macOS** (only Playwright's WebKit on Windows) and **screen readers** (axe and keyboard walkthroughs only).
- **How the D1 binding attaches in a direct-upload Pages deploy** (see `docs/deployment.md`, step 4).
- **GitHub Actions** for this project until it has run once after the next push.
- Free-tier quotas under real traffic.
