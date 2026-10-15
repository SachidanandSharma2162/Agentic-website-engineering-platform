# Risk register: Studio Slot

| ID | Risk | Severity | Mitigation | Status |
|---|---|---|---|---|
| R1 | Overbooking under concurrent requests | high | One atomic conditional INSERT (capacity check and insert in a single statement) plus a UNIQUE(class, email) constraint; concurrent-request API test | open |
| R2 | Timezone and DST errors | high | UTC storage, studio IANA timezone, table-driven tests across DST changes in a DST timezone | open |
| R3 | Admin passphrase guessing or leakage | high | Constant-time compare, rate limit, signed expiring HttpOnly cookie, secret only as a Worker secret, never in code or logs | open |
| R4 | Insecure access to bookings (IDOR) | high | Cancellation needs class + secret code (hash stored); roster endpoints admin-only; tests for every route | open |
| R5 | Personal data (names, emails) exposure or over-retention | high | Store the minimum, retention purge, no export endpoint, no logging of personal data | open |
| R6 | Spam or abuse of booking | medium | Per-IP rate limit, validation, honeypot field, capacity cap bounds the damage; owner can cancel bookings | open |
| R7 | Free-tier exhaustion (100k requests/day shared, D1 100k writes/day, 10 ms CPU per request) | medium | Estimated load is about 1-2% of limits; hitting a daily limit returns errors, so the schedule page must degrade gracefully; monitor | open |
| R8 | Pages Functions + D1 binding in direct-upload deploys behaves differently from local | medium | `wrangler pages dev` with local D1 in E2E; the deploy mechanism is verified before Gate C; deploy fails closed | open |
| R9 | Deploy needs actions beyond the first site (database, secrets, token scope) | medium | Listed as Gate E items up front; nothing is created before explicit approval | open |
| R10 | Local SQLite semantics differ from production D1 | medium | Same SQL dialect; production smoke runs the real booking and cancel path with a clearly marked test class that is then cancelled | open |
| R11 | Vendor lock-in to Cloudflare | low | Thin data-access layer; plain SQL | accepted |
