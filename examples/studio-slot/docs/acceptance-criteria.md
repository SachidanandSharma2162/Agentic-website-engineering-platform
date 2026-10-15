# Acceptance criteria: Studio Slot

Verified by: U = unit, API = API/integration test against a real SQLite database, C = component, E = Playwright end-to-end (Chrome, Firefox, WebKit), A = axe, S = production smoke.

| ID | Feature | Criterion | Verified by |
|---|---|---|---|
| AC1 | F1 | The schedule lists classes for the next 14 days in start order with spots left; cancelled and full classes are labelled; an empty week shows an empty state. | API, C, E |
| AC2 | F1 | Times display in the studio timezone, with the visitor's local time when it differs, correctly across spring-forward and fall-back dates. | U (table-driven), E |
| AC3 | F2 | A valid booking returns 201 with a cancellation code; the spot count drops by one. Invalid name or email returns field-level 400 errors and changes nothing. | API, C, E |
| AC4 | F2 | **Capacity is never exceeded**: N concurrent booking requests for a class with M spots (N > M) produce exactly M successes and N-M "full" responses. | API (concurrent) |
| AC5 | F2 | The same email cannot book the same class twice (409). Booking a full, cancelled or past class is rejected with a specific error. | API, E |
| AC6 | F3 | Cancelling with the correct code frees the spot (re-bookable); a wrong code or wrong class returns 404 without revealing whether the class exists; a code works once. | API, E |
| AC7 | F4 | The .ics file is valid, contains UTC start and end, the class title, and no personal data. | U, E |
| AC8 | F5 | Every admin endpoint returns 401 without a valid session (tested for each route); a wrong passphrase returns 401; the session cookie is HttpOnly, Secure, SameSite=Strict and expires. | API |
| AC9 | F5 | Admin can add a class (validated: future start, capacity 1-100, duration 15-240) and cancel it; cancelling keeps bookings visible in the roster as cancelled. | API, E |
| AC10 | F6 | After the rate limit is exceeded, booking and sign-in return 429 with Retry-After; legitimate traffic from another client is unaffected. | API |
| AC11 | NFR | Inputs containing markup render as text; SQL metacharacters cannot alter queries; oversize bodies are rejected. | U, API |
| AC12 | F7 | axe finds no serious or critical violations on every route and key state; keyboard-only completion of booking and cancellation; reduced motion respected. | A, E |
| AC13 | F7 | No horizontal scroll at 375, 768 and 1280 px. | E |
| AC14 | NFR | No console errors, no CSP violations, no cross-origin requests on any route, in Chrome, Firefox and WebKit. | E |
| AC15 | NFR | `npm audit --audit-level=high` clean; type-check, lint and all tests pass. | CI |
| AC16 | Deploy | The live URL passes the same E2E suite and the platform smoke checks (routes, content, security headers); the deployed bundle hash equals the approved build. | S |
| AC17 | NFR | Retention: bookings older than 90 days past the class are purged (tested against a clock). | API |
