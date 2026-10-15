# Requirements: Studio Slot

## Request
Appointment booking for a small yoga studio: a weekly class schedule where visitors book and cancel a spot, limited capacity per class, and a simple owner admin to add and cancel classes.

## Classification
Booking system, small-to-medium. Needs a backend and a database. No payments, no outgoing email, no public accounts.

## Target users
- **Visitors**: people who want to see this week's classes and reserve a spot in under a minute, usually on a phone.
- **Owner**: one person who adds classes, cancels classes and sees who has booked.

## Key journeys
1. Visitor opens the schedule, picks a class with spots left, enters name and email, sees a confirmation with a cancellation code and can download a calendar file.
2. Visitor later opens "Cancel a booking", enters the class and code, and the spot is released.
3. Owner signs in with a passphrase, adds a class (title, start, duration, capacity), views the roster, cancels a class.
4. Visitor tries to book a full, cancelled or past class and gets a clear message.

## Features
MVP:
- **F1 Schedule**: upcoming classes for the next 14 days grouped by day, each showing time in the studio's timezone (and the visitor's local time when different), spots left, and state (open, full, cancelled).
- **F2 Booking**: name + email; capacity enforced atomically so concurrent requests can never overbook; one booking per email per class.
- **F3 Cancellation**: by class + cancellation code (shown once at booking); frees the spot.
- **F4 Calendar file**: "Add to calendar" downloads an .ics for a confirmed booking (no email is sent).
- **F5 Owner admin**: passphrase sign-in (server-side check, signed HttpOnly cookie), add class, cancel class, roster view, sign out.
- **F6 Abuse protection**: server-side validation, per-IP rate limiting on booking and sign-in.
- **F7 Accessibility and responsive**: keyboard operable, labelled controls, AA contrast, reduced motion; 375, 768, 1280 px.
- **F8 SEO metadata** per page.

Optional (not required for release): reschedule, waitlist, recurring classes.
Future scope (not built): visitor accounts, payments, confirmation and reminder emails, multiple instructors or locations.

## Non-functional
- API responses under 300 ms p95 on the free tier; each request must fit the Workers Free 10 ms CPU limit, so validation stays lightweight.
- Privacy: only name and email are stored, with a stated retention (bookings deleted 90 days after the class); no analytics; no third-party requests; no cookies for visitors (only the admin session cookie).
- Security: all input validated on the server; parameterised queries only; admin endpoints reject unauthenticated requests with 401; constant-time passphrase comparison; strict CSP.
- Times are stored in UTC and shown in the studio's timezone; correct across DST changes.

## Actions that will need explicit approval (Gate E)
- Creating the production D1 database and applying migrations (infrastructure change).
- Setting production secrets (admin passphrase, session signing secret).
- Expanding the Cloudflare API token with D1 Edit permission (materially expands permissions).
- Any later addition of outgoing email (messages real users) or payments (money).

## Assumptions to confirm at Gate A
All approved at Gate A (2026-10-16), with the studio timezone set by the owner:
- **Studio timezone: `Asia/Kolkata`** (UTC+5:30, no daylight saving). It is configuration, not hard-coded. Tests also run with `America/New_York` (has DST) so the time logic is not accidentally correct only for a zone without DST, and with a half-hour offset zone (Kolkata) so it is not correct only for whole-hour offsets.
- Visitors do not need accounts; a cancellation code is enough.
- No confirmation email in the MVP (the on-screen confirmation and .ics file replace it).
- One owner, one shared admin passphrase.
- English only; booking window is the next 14 days; hosted at a `*.pages.dev` address.
