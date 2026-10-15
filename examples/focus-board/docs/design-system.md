# Design system: Focus Board

## Concept: "paper and ink"
A calm desk, not a dashboard. Warm paper background with a faint dot grid, near-black ink, one confident vermilion accent used sparingly (primary action, progress, current location). Serif display type gives the date and headings a printed-planner feel; the body stays plain system sans for speed and legibility. No gradients, no glassmorphism, no stock illustrations.

## Colour tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5EFE3` | page background |
| `--surface` | `#FCFAF5` | cards, inputs, nav |
| `--ink` | `#1F1C16` | text, selected segment |
| `--muted` | `#5C5648` | secondary text |
| `--accent` | `#B8400D` | primary button, progress, active marker |
| `--accent-soft` | `#F6DFD0` | hover and active backgrounds, badges |
| `--ok` | `#2E6B40` | completed state |
| `--line` | `#CFC6B2` | decorative hairlines only |
| `--edge` | `#857B66` | borders of interactive controls |
| `--focus` | `#0B5CAD` | focus ring |

Contrast, computed with the WCAG relative-luminance formula (script run during design, results below):

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| ink on paper / surface | 14.84 / 16.29 | 4.5 | pass |
| muted on paper / surface | 6.37 / 6.99 | 4.5 | pass |
| accent on paper / surface | 4.85 / 5.33 | 4.5 | pass |
| white on accent (button) | 5.56 | 4.5 | pass |
| ok on surface / paper | 6.11 / 5.57 | 4.5 | pass |
| ink on accent-soft | 13.26 | 4.5 | pass |
| edge on paper / surface (control borders) | 3.65 / 4.01 | 3.0 | pass |
| focus ring on paper / surface | 5.82 / 6.39 | 3.0 | pass |
| **accent on accent-soft** | **4.34** | 4.5 | **fails, so never used for text** (badge text is ink) |
| **line on paper** | **1.48** | 3.0 | **fails, so reserved for decoration; controls use `--edge`** |

Colour is never the only signal: done = checkmark plus strikethrough, current route = marker bar plus bold, priority = text badge, errors = text.

## Typography
- Display: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`, weights 600/700, tight tracking. System fonts only, so there are zero font requests (fits the strict CSP and the no-third-party-requests rule).
- Body: `system-ui` stack, 16 px base, 1.5 line height.
- Scale: h1 `clamp(2rem, 5vw, 3rem)`, h2 1.5 rem, h3 1.2 rem, body 1 rem, label 0.9375 rem, eyebrow 0.8125 rem uppercase with 0.12 em tracking.

## Spacing, shape, elevation
- 4 px base: 4, 8, 12, 16, 24, 32, 48, 72.
- Radius: 6 (small), 12 (controls), 20 (cards).
- One shadow level for cards; dialogs use a larger one.
- Minimum touch target 44 x 44 px; text inputs 48 px tall.

## Components

| Component | States specified |
|---|---|
| Button (primary, secondary, danger) | default, hover, active (1 px press), focus-visible, disabled |
| IconButton | default, hover, focus, pressed (pin) |
| TextField | default, focus, invalid (accent border plus message), with live error region |
| Checkbox (custom, native input) | unchecked, checked, focus, disabled |
| SegmentedControl | pressed/unpressed buttons with `aria-pressed` |
| TaskRow | default, done, editing, entering (fade up) |
| HabitCard | unchecked, checked, 7-day strip |
| ProgressRing | 0 to 1, animated stroke, `role="img"` with text alternative |
| Dialog | native `<dialog>`, focus trap, Escape cancels, labelled |
| Toast | 6 s, Undo action, announced through a polite live region |
| EmptyState | heading, one sentence, one action |
| NavRail / TopBar / TabBar | one component, three layouts |

Loading state: the app reads localStorage synchronously, so there is no spinner; if storage is unreadable a notice banner explains that data could not be loaded and the app starts empty.

## Motion
- Entry: 6 px rise plus fade, 280 ms, `cubic-bezier(.2,.7,.2,1)`. Ring stroke 500 ms. Button press 120 ms.
- Only `transform` and `opacity` (plus the ring's stroke offset) animate.
- `prefers-reduced-motion: reduce` disables all animation and transitions.

## Responsive rules
- Mobile-first. Breakpoints: 640 px (top bar replaces tab bar) and 1024 px (left rail).
- Content column max 760 px, centred; side padding 16 px (mobile) to 32 px (desktop).
- No fixed widths on text containers; long titles use `overflow-wrap: anywhere`.
- Bottom tab bar respects `env(safe-area-inset-bottom)`; page has bottom padding so content is never hidden behind it.

## Accessibility checklist (to be verified in the test stage, AC14)
- [x] Semantic landmarks: `nav`, `main`, headings in order (one `h1` per route).
- [x] Skip link; focus moves to `main` on navigation.
- [x] Every control has a visible label or `aria-label` naming the item (e.g. "Delete “Water the plants”").
- [x] Visible 3 px focus ring on all interactive elements.
- [x] Errors and toasts are announced (`role="alert"`, polite live region).
- [x] Contrast computed (table above).
- [x] Reduced motion respected.
- [ ] axe-core scan of each route (pending, test stage).
- [ ] Manual keyboard walkthrough and screen reader spot check (pending, test stage).

## Production notes
- Tokens become Tailwind 4 theme variables so the same values are used in components and tests.
- Icons: lucide-react replaces the inline SVGs used in the prototype.
- The prototype's "PROTOTYPE" ribbon and in-memory data are prototype-only.
