# Focus Board

A calm, private daily planner: tasks with a Today list, habits with streaks, filter and search, JSON export and import. All data stays in your browser (localStorage). No accounts, no analytics, no third-party requests.

Live URL: **not deployed yet** (deployment needs approval at Gates C and D and Cloudflare credentials).

## Run it

Requires Node >= 22.18.

```
npm install
npm run dev        # development server
npm run build      # production build into dist/
npm run preview    # serve the build at http://127.0.0.1:4173
```

## Quality checks

```
npm run typecheck
npm run lint
npm test           # Vitest unit and component tests
npm run e2e        # Playwright against the production build (uses installed Chrome; set CI=1 to use Playwright's Chromium)
```
Regenerate the screenshots in `docs/screenshots/` with `SCREENSHOTS=1 npm run e2e -- screenshots`.

## Structure

| Path | Purpose |
|---|---|
| `src/domain/` | pure logic: local-day arithmetic, streaks, task and habit operations, zod schema |
| `src/storage/` | versioned localStorage adapter, import and export validation |
| `src/state/` | store and context (injected clock) |
| `src/ui/`, `src/features/`, `src/app/` | components, screens, routing |
| `tests/unit/`, `tests/e2e/` | unit, component and end-to-end tests |
| `public/_headers` | CSP and security headers (applied by Cloudflare Pages) |
| `docs/` | requirements, architecture, design system, test report, self-heal report, risk register, ADRs |

## Data and privacy

Data is stored under the key `focus-board:v1` in your browser only. Use Settings -> Export regularly: clearing site data or switching browsers loses it. Imports are validated and capped at 1 MB; nothing is replaced unless the file is valid and you confirm.

## Known limitations

See `docs/test-report.md` (section "Not verified") and `docs/risk-register.md`. In short: single user per browser, no sync, English only, tested in Chrome only, screen-reader behaviour not manually verified.
