# Risk register: Focus Board

Status as of the release candidate (Gate C).

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| R1 | Streak/date logic wrong across month, year or DST boundaries, or at midnight | high | Pure date-key arithmetic, injected clock, table-driven tests run in a DST timezone (with a guard test), midnight-rollover test | **mitigated** (tests pass; real-browser midnight not exercised) |
| R2 | Imported JSON corrupts or overwrites data | high | Size cap, schema validation, confirmation, no write on failure; 12 rejection cases plus E2E with real bad files | **mitigated** |
| R3 | localStorage unavailable or full | medium | try/catch, memory fallback, visible notice, corrupt-data backup copy | **mitigated** (unit-tested with fakes; real private-mode behaviour not exercised) |
| R4 | Very new toolchain on Node 26 breaks | medium | Install and run early | **closed**: Vite 8.3.4, Vitest 5.0.5, jsdom 30, ESLint 10, Playwright 1.64 and TypeScript 5.9 all install and run on Node 26.4 |
| R5 | Cloudflare token permissions or free-tier details differ from docs | medium | Preflight; checked when credentials are provided; deploy fails closed | **open** (no credentials yet) |
| R6 | SPA route refresh returns 404 on Pages | medium | AC13 E2E on preview; smoke test; `_redirects` fallback ready to add | **open** (verified on `vite preview` only) |
| R7 | Animations hurt accessibility or performance | low | `prefers-reduced-motion` test, transform/opacity only | **mitigated** |
| R8 | Data loss because storage is per-browser | medium | Export prominent; UI states it; sync listed as future scope | accepted |
| R9 | No credentials available at deploy time | medium | All other stages complete; exact blocker reported | **open** |
| R10 | Strict CSP in `_headers` blocks something the app needs, and cannot be tested locally | medium | Headers are applied only by Cloudflare; checked in the production smoke test (console errors on every route); the CSP only allows same-origin scripts, which the build satisfies | **open** |
| R11 | Visual defects slip past behavioural and axe tests | medium | Four such defects were found by screenshot review and now have regression tests; screenshots are a release-checklist step | **mitigated, residual** |
