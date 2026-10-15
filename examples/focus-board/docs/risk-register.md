# Risk register: Focus Board

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| R1 | Streak/date logic wrong across month, year or DST boundaries | high | Pure date-key arithmetic, injected clock, table-driven tests | open |
| R2 | Imported JSON corrupts or overwrites data | high | Size cap, schema validation, confirmation, no write on failure | open |
| R3 | localStorage unavailable or full (private mode) | medium | try/catch, in-memory fallback, visible notice | open |
| R4 | Very new toolchain on Node 26 (Vite 8, Vitest 5, jsdom 30, ESLint 10) breaks | medium | Install and run a smoke build/test early; fall back to Node 24 LTS or older majors with an ADR | open |
| R5 | Cloudflare token permissions or free-tier details differ from docs | medium | Preflight; checked when credentials are provided; deploy fails closed | open |
| R6 | SPA route refresh returns 404 on Pages | medium | AC13 smoke test; `_redirects` fallback | open |
| R7 | Animations hurt accessibility or performance | low | Respect `prefers-reduced-motion`, animate transform/opacity only | open |
| R8 | Data loss because storage is per-browser | medium | Prominent export; documented in the UI; sync listed as future scope | accepted |
| R9 | No credentials available at deploy time | medium | All other stages complete; exact blocker reported | open |
