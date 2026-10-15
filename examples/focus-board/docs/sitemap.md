# Sitemap and screens: Focus Board

Runnable prototype: `prototype/index.html` (open directly in a browser; data is in memory only). Side-by-side review at exact widths: `prototype/viewports.html?r=<route>`. Screenshots: `prototype/screenshots/`.

## Routes

| Route | Screen | Purpose | Features |
|---|---|---|---|
| `/` | Today | Plan and finish today | F2, F1, F4 (quick check-in) |
| `/tasks` | Tasks | Full list, filter, search | F1, F3 |
| `/habits` | Habits | Daily habits, streaks | F4 |
| `/settings` | Settings | Export, import, reset | F6, F7 |
| `*` | Not found | Recover from bad URL | F8 |

Production uses real paths (react-router); the prototype uses hash routes only so it runs from a file.

## Navigation

One primary navigation landmark with four destinations. It adapts by width:

| Width | Pattern |
|---|---|
| >= 1024 px | Sticky left rail (240 px), content column max 760 px |
| 640-1023 px | Top bar, brand left, links right |
| < 640 px | Fixed bottom tab bar (icon above label), safe-area aware |

The active route has `aria-current="page"` plus a coloured underline/overline, not colour alone. A skip link jumps to `<main>`. On route change focus moves to `<main>` and the document title updates.

## Screen content and states

**Today.** Long-form date as the heading, progress ring (done/total of pinned tasks), quick-add field, pinned task list, "Habits today" card with one-tap check-ins.
Empty: "Nothing pinned for today" with a link to Tasks. Error: empty title shows an inline message and keeps focus in the field.

**Tasks.** Quick-add, search field, segmented All/Active/Done filter, list. Each row: checkbox, title, priority badge (only for high/low), pin, edit, delete.
Empty (no tasks): prompt to add the first one. Empty (filtered): "No matching tasks" with Clear filters. Delete shows a 6 s toast with Undo; the item returns to its original index. Edit is inline: Enter or blur saves, Escape cancels.

**Habits.** Quick-add, one card per habit: name, Check in today toggle, current and best streak, last-7-days strip (weekday initial + tick), delete with confirmation dialog.
Empty: prompt to add one small daily habit.

**Settings.** Three cards: Export (download JSON), Import (file picker, 1 MB cap, invalid files show an error and change nothing, valid files need confirmation), Reset (confirmation dialog). The Export card states that data lives only in this browser.

**Not found.** Heading, one sentence, button back to Today.

## Wireframes (desktop)

```
+----------+------------------------------------------------+
| o Focus  |  TODAY                                  (1/3)  |
| Board    |  Thursday, October 15                   ring   |
|          |  [ What will you focus on today?   ] [Add]     |
| > Today  |  [ ] Draft the Q4 outline  HIGH   pin edit del |
|   Tasks  |  [x] Reply to Priya...            pin edit del |
|   Habits |  Habits today                                  |
|   Settings| [ Walk 20 min        2 day streak      [ ] ]  |
+----------+------------------------------------------------+
```

Mobile keeps the same vertical order, with the tab bar fixed at the bottom and action buttons at 44 px touch targets.

## Verified in the prototype (evidence, not a promise)

- Layout checked at 375, 768 and 1280 px on all four routes in headless Chrome: no horizontal overflow (measured `scrollWidth` vs `clientWidth` inside exact-width frames).
- Defect found and fixed during review: the priority badge wrapped ("LO/W") at 375 px; fixed with `white-space: nowrap`.
- Not yet verified: screen-reader behaviour, axe results, keyboard walkthrough in a real browser session, Safari/Firefox. Those are covered by AC14 in the test stage.
