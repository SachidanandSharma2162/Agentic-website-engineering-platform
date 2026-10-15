# Final report: Focus Board

Date: 2026-10-15. Everything here is backed by files in `docs/evidence/`, the git history, or the linked reports.

## Outcome

Focus Board is live at **https://focus-board.pages.dev** (Cloudflare Pages Free, project `focus-board`, production branch `main`). It has been deployed twice:

1. Release candidate 1 (`https://365fdff5.focus-board.pages.dev`). Cross-browser testing later found that this bundle triggered a Content-Security-Policy `eval` report on every page load (a zod probe, caught and harmless to behaviour).
2. **Release candidate 2 (current, `https://95252136.focus-board.pages.dev`, repository commit `d03060e`)** with the fix. Verified: bundle SHA-256 equals the local build; the platform's stricter smoke test passed (four routes with content checks plus three security headers); the full E2E suite passed on the live site in Chrome, Firefox and WebKit (114 of 114, twice in a row). A first run immediately after the deploy had two failures that did not reproduce (see `docs/evidence/live-verification.json`).

## Lifecycle against the platform's gates

| Stage | Result | Evidence |
|---|---|---|
| Gate A' requirements and plan | approved by Sachidanand Sharma | `sdlc status` approvals |
| Design (sitemap, design system, runnable prototype) and Gate B | approved | `docs/sitemap.md`, `docs/design-system.md`, `prototype/` |
| Implementation and tests | 116 unit/component + 37 E2E tests pass | `docs/test-report.md`, `docs/evidence/quality.json` |
| Defect detection and repair | one injected defect caught, repaired, regression re-run | `docs/self-heal-report.md` |
| Security audit | `npm audit --audit-level=high`: 0 vulnerabilities | `docs/evidence/security.json` |
| Gate C and Gate D (scope `cloudflare-pages:focus-board`) | approved | approvals recorded with notes |
| Deployment | project created, 4 files uploaded, URL taken from wrangler output | `docs/evidence/deploy-*.json` |
| Production verification | bundle SHA-256 equals local build; security headers present; 37/37 E2E pass live | `docs/evidence/live-verification.json` |

## What went wrong along the way (kept on record)

- The first deploy failed closed because the Pages project did not exist; the adapter now creates the approved project and retries once (unit-tested).
- The first platform smoke attempt failed with a TLS error on the brand-new per-deployment hostname; it passed on the next run once Cloudflare finished provisioning. The platform did not force a pass.
- The platform's built-in smoke task only checks `/` for HTTP 200. Gate D asks for more, so routes, headers, bundle identity and a full E2E run were done separately and recorded. Making the smoke task configurable per route with content checks is a known improvement.
- Four visual defects were visible only in screenshots and slipped past every behavioural check before being fixed (details in `docs/test-report.md`).

## Known limitations

- Single user per browser, no sync; data loss if browser storage is cleared (export is provided).
- Tested in Chrome only; no manual screen-reader session.
- Cloudflare free-tier quotas have not been observed under real traffic.
- A missing `/assets/*` path returns the app shell with HTTP 200 rather than 404.
- GitHub Actions workflow has never run (no remote repository yet).

## Rollback and recovery

Cloudflare Pages keeps every deployment. To roll back: Cloudflare dashboard -> Workers & Pages -> `focus-board` -> Deployments -> pick the last good deployment -> Rollback. Then re-run the live E2E: `BASE_URL=https://focus-board.pages.dev npm run e2e`. A failed `wrangler pages deploy` does not replace the live deployment. To take the site down, delete the Pages project in the dashboard (a Gate E action under the platform's policy).

## Redeploying a change

```
# from the repo root, after editing the site
npm run sdlc -- reopen focus-board quality --reason "<what changed>"
npm run sdlc -- run focus-board     # quality, release; stops at Gate C
```
A new release candidate needs fresh Gate C and D approvals, because approvals are scoped to a decision, not blanket permission.

## Maintenance recommendations

1. Revoke the Cloudflare API token used for this deployment (dashboard -> API tokens) unless you will redeploy soon; create a new short-lived one when needed.
2. Push the repository to GitHub so CI and Dependabot can run, then confirm the `focus-board` CI job passes once.
3. Re-run `npm audit` and the E2E suite monthly or before each change.
4. Add Firefox and WebKit projects to the Playwright config.
5. Consider Supabase sync only if multi-device use is wanted; the storage adapter interface is the seam.
