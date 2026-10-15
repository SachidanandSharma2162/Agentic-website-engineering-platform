# ADR 0002: localStorage persistence with explicit failure handling

Status: accepted.

- Persisted shape is `{ version: 1, tasks, habits }`, validated with zod on every load and import. Check-ins are `YYYY-MM-DD` local-day strings validated as real calendar dates.
- Data is written only after the user changes something. Opening the app never overwrites stored data, so unreadable data is not destroyed by a visit. When stored data fails validation, a copy is kept under `focus-board:v1:corrupt-backup` and the user sees a notice.
- Blocked or full storage degrades to in-memory use with a visible message; the Export feature is the safety net, and the Settings page says data lives only in this browser.
- Streak logic is pure and takes the day as an argument; the clock is injected in the store, which also re-reads the day when the tab regains focus and once a minute so midnight rollover works without a reload.
