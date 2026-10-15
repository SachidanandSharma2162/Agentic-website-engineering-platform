# Sitemap and screens: Studio Slot

Runnable prototype: `prototype/index.html` (open it directly; data is in memory, there is no server). The grey bar at the bottom is prototype-only: it switches the visitor's timezone and simulates an outage or the daily limit so those states can be reviewed. Screenshots at 375, 768 and 1280 px are in `prototype/screenshots/`.

## Routes

| Route | Screen | Who | Features |
|---|---|---|---|
| `/` | Schedule | visitor | F1, entry to F2 |
| `/class/:id` | Book a class | visitor | F2 |
| `/booked` | Confirmation (code shown once, calendar file) | visitor | F2, F4 |
| `/cancel` | Cancel a booking | visitor | F3 |
| `/admin` | Owner sign in, then Classes (add, roster, cancel) | owner | F5 |
| `*` | Not found | all | |

(The prototype uses hash routes only so it runs from a file; the real app uses real paths with the Cloudflare SPA fallback.)

## Navigation
One primary navigation landmark with three destinations: Schedule, Cancel a booking, Owner. It is a row of pills at every width (on phones the three pills share one row). The current page has `aria-current="page"` and a filled pill, not colour alone. A skip link jumps to `<main>`; on every route change focus moves to `<main>` and the document title updates.

## Screens, content and states

**Schedule.** Hero line, a note that all times are studio time (Kolkata, IST), then the next 14 days grouped by day with a sticky day heading in the studio's timezone. Each class card: start and end time in IST, title, duration, an availability badge (`14 spots left`, `Only 2 left` in clay, `Full`, `Cancelled`), and a Book button only when bookable. When the visitor's timezone differs from the studio's, each card adds "2:00 AM your time" (with the weekday if the day differs).
States: loading (skeleton cards, `aria-busy`), empty ("No classes in the next two weeks"), service outage (friendly message and Try again), daily limit reached (its own message, says it resets at 5:30 AM IST), cancelled class (struck-through title), full class (no button).

**Book a class.** Class summary, then name and email, a hidden honeypot field, a one-line privacy statement (what is stored, 90-day retention, no emails), and Reserve my spot. Inline field errors with `aria-invalid` and text; focus moves to the first error. Server-side outcomes surfaced in words: class just filled up (with a link back), duplicate email, cancelled or already-started class, outage, daily limit.

**Confirmation.** A calm breathing circle (static under reduced motion), "You're booked", the class details, the cancellation code in large type on one line (shown once, with a plain warning), Add to calendar (.ics download), Back to schedule.

**Cancel a booking.** Class selector and code field. A wrong code or wrong class gives the same message ("We couldn't find a booking with that class and code") so nothing about other people's bookings can be probed. Success is a status message.

**Owner.** Passphrase sign in (server-checked), then Classes: add-class form (title, date, start time in studio time, capacity 1 to 100; inline validation including "must start in the future"), upcoming classes with rosters (names and emails are visible only here), Cancel class with a confirmation dialog, Sign out.

**Not found.** Heading, one sentence, button to the schedule.

## Wireframe (desktop schedule)
```
(o) Studio Slot                 [Schedule] Cancel a booking  Owner
 Find your class
 Small groups, unhurried pace...
 (All times in studio time (Kolkata, IST))
 Friday 16 October
 +----------------------------------------------------------+
 | 6:30 AM     Sunrise Vinyasa                       (Full) |
 | to 7:30 AM  60 minutes                                   |
 +----------------------------------------------------------+
 | 8:00 AM     Gentle Flow          (Only 2 left)  [ Book ] |
 +----------------------------------------------------------+
```

## What the prototype review checked (evidence, in a real Chrome)
- Flows driven by script: schedule renders 36 classes; full, few-left and cancelled states appear; dual time appears for a London visitor ("2:00 AM your time"); empty form shows two field errors; booking returns a code and a downloadable .ics; the same email cannot book twice; a wrong cancellation code gives the non-revealing message; outage and daily-limit states show their own messages; a wrong passphrase is rejected; admin validation shows errors; sign out returns to the login.
- No horizontal overflow on the schedule, booking, cancel, admin and confirmation screens at 375, 768 and 1280 px; no console or page errors after the fixes below.
- Defects found in review and fixed before this gate: (1) the third nav pill wrapped onto its own row on phones; (2) the prototype control bar covered half of a phone screen; (3) the cancellation code wrapped mid-code on phones (now one line down to 320 px); (4) navigating away while the schedule was loading threw errors because the stale view still wrote to the page. The real app must not update a view that is no longer on screen (cancel the request or ignore its result).

## Not yet checked
axe results, a keyboard-only walkthrough and cross-browser rendering are test-stage work (AC12 to AC14). Fonts differ by operating system (see the design system).
