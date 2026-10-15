# Test report: Focus Board

Results below were produced by the platform's `quality` and `security` tasks (raw output in `docs/evidence/`). Re-run locally with `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`.

## Summary

| Check | Result |
|---|---|
| Type-check (`tsc -b`, strict, `noUncheckedIndexedAccess`) | pass |
| Lint (ESLint 10; `dangerouslySetInnerHTML` is a lint error) | pass |
| Unit and component tests (Vitest, jsdom, TZ=America/New_York) | 116 passed |
| End-to-end (Playwright, installed Chrome, production build via `vite preview`) | 37 passed (12 more are the screenshot generator, skipped unless `SCREENSHOTS=1`) |
| Production build | pass; JS 143 KB gzip (budget 200 KB), CSS 5 KB |
| `npm audit --audit-level=high` | 0 vulnerabilities |

## Traceability: acceptance criteria to tests

| AC | Where it is verified |
|---|---|
| AC1 add task, empty rejected | `app.test.tsx` AC1 (3); E2E "add, complete..." and "empty title" |
| AC2 toggle, trim, 120 cap | `domain.test.ts` normalizeTitle; `app.test.tsx` AC2, AC1 cap |
| AC3 edit Enter/blur/Escape | `app.test.tsx` AC3 (4) |
| AC4 delete + 6 s undo, original position | `domain.test.ts`; `app.test.tsx` AC4 (fake timers); E2E delete and undo |
| AC5 Today and progress | `domain.test.ts`; `app.test.tsx` AC5; E2E |
| AC6 filter and search | `domain.test.ts`; `app.test.tsx` AC6 (3); E2E |
| AC7 habit check-in | `domain.test.ts`; `app.test.tsx` AC7 (3); E2E habits |
| AC8 streaks incl. month, leap, year, DST | `domain.test.ts` (10 current-streak, 7 boundary, 9 best-streak cases; TZ guard test); midnight-rollover component test |
| AC9 reload persistence, corrupt data | `storage.test.ts`; `app.test.tsx` AC9; E2E reload and corrupt-data test |
| AC10 export round trip | `storage.test.ts`; `app.test.tsx`; E2E real download then re-import |
| AC11 invalid import changes nothing | `storage.test.ts` (12 rejection cases, prototype pollution, >1 MB); `app.test.tsx` (4); E2E (4 bad files) |
| AC12 reset | `app.test.tsx`; E2E (cancel, Escape, confirm) |
| AC13 routes direct load and refresh | `app.test.tsx` AC13; E2E on `vite preview` incl. unknown route |
| AC14 accessibility | axe on all routes plus empty, edit, toast and modal states; keyboard-only task flow; focus ring on every tab stop; dialog focus behaviour; reduced motion |
| AC15 no overflow at 375/768/1280 | 12 viewport tests, nav adaptation, 4 visual-integrity regressions |
| AC16 no console errors, no cross-origin requests, size | E2E hygiene test on every route; build report |
| AC17 audit, type-check, lint, tests | `quality` and `security` evidence |
| AC18 live URL returns 200 | platform smoke task (`/` -> 200) plus the full E2E suite re-run against the live URL: 37 passed (`docs/evidence/live-verification.json`) |

## Defects found and fixed during testing

| Defect | How found | Regression test |
|---|---|---|
| Enter on the priority dropdown did not save the edit | component test | `AC3 saves on Enter, including a priority change` |
| Progress ring drew a stray box (Tailwind `ring` utility collided with a component class) | screenshot review; no automated check noticed | `visual integrity: ring ... no stray box` (verified to fail without the fix) |
| Ring arc never drawn (CSS `calc()` overrode the SVG attribute) | screenshot review | same test, plus a unit test of the inline style |
| Habit names broke mid-word on phones | screenshot review | `habit names wrap at word boundaries` (failed 110 px vs 45 px limit before the fix) |
| Tablet top bar stretched to ~240 px on short pages | screenshot review | `top bar keeps its natural height` (failed at 241 px before the fix) |
| Deliberately injected `bestStreak` off-by-one | quality gate (see `self-heal-report.md`) | existing `bestStreak` table tests |

Lesson recorded: four of the five real defects were visible only in screenshots. Behavioural tests, axe and overflow checks all passed while the ring was visibly broken. Screenshot review stays a required step of the release checklist.

## Not verified (stated plainly)

- **Screen readers.** axe and a keyboard walkthrough passed; no manual NVDA/VoiceOver session was run.
- **Other browsers.** Only Chrome was exercised. Firefox and Safari are untested.
- **GitHub Actions.** The workflow has never run (no remote).
- **Midnight rollover** is covered by a component test with an injected clock, not in a real browser across midnight.
- Cloudflare free-tier quotas under real traffic (only a single deployment of 4 files was made).

## Verified on the live site (2026-10-15)

- Deployed JS bundle is byte-identical to the approved local build (SHA-256 equal).
- CSP, Permissions-Policy, Referrer-Policy and X-Content-Type-Options headers are served. The full E2E suite (37 tests: journeys, downloads, axe, keyboard, reduced motion, overflow, console and cross-origin hygiene) passes against `https://focus-board.pages.dev` under those headers, so the CSP does not break the app.
- Deep links (`/habits`, `/tasks`, `/settings`) and unknown paths return the app (SPA fallback works). Quirk: a missing `/assets/*` file also returns the app shell with HTTP 200 instead of 404.
- The per-deployment hostname failed its TLS handshake for roughly the first minutes after creation and then worked; the production hostname worked immediately.
