# Design system: Studio Slot

## Concept: "morning light"
Calm, airy and warm, for people who want to book a quiet hour. Oat-coloured background, white rounded cards, one deep sage as the only strong colour (actions, current location), a soft clay used only to say "few spots left", and plenty of space. Shapes are round (pill buttons, 24 px cards); the one ornament is a small concentric "sun" mark, echoed by a slow breathing circle on the confirmation screen. It is deliberately different from Focus Board (paper, ink and a vermilion accent with a serif).

## Colour tokens and computed contrast

| Token | Value | Use |
|---|---|---|
| `--oat` | `#F4F1EA` | page background |
| `--surface` | `#FFFFFF` | cards, inputs |
| `--ink` | `#23302B` | text |
| `--muted` | `#566359` | secondary text |
| `--sage` | `#2F5D4E` | primary actions, current nav, links |
| `--sage-soft` | `#DCE8E1` | hover, badges, code box |
| `--clay` / `--clay-soft` | `#9C4A2F` / `#F3DDD3` | "Only N left" badge |
| `--err` / `--err-soft` | `#A32D2D` / `#F6DEDE` | errors |
| `--full` | `#E6E3DA` | full and cancelled badges, disabled |
| `--edge` | `#7B8A80` | borders of controls |
| `--line` | `#D8D3C6` | decorative hairlines only |
| `--focus` | `#0B5CAD` | focus ring |

Ratios computed with the WCAG relative-luminance formula (script run for this design). All text and control pairs pass AA:

| Pair | Ratio | Need |
|---|---|---|
| ink on oat / surface | 12.17 / 13.73 | 4.5 |
| muted on oat / surface | 5.60 / 6.32 | 4.5 |
| white on sage (primary button) | 7.51 | 4.5 |
| sage on oat / surface / sage-soft | 6.66 / 7.51 / 5.96 | 4.5 |
| ink on sage-soft | 10.90 | 4.5 |
| clay on clay-soft / surface / oat | 4.69 / 6.12 / 5.42 | 4.5 |
| err on err-soft / surface | 5.53 / 7.07 | 4.5 |
| muted and ink on full | 4.92 / 10.70 | 4.5 |
| edge on oat / surface (control borders) | 3.22 / 3.63 | 3.0 |
| focus ring on oat / surface / sage-soft | 5.91 / 6.67 / 5.30 | 3.0 |
| **line on oat** | **1.32** | 3.0, **fails by design: decoration only, never a control border** |

Colour is never the only signal: availability is a word, current page is a filled pill, errors are text, cancelled classes are struck through and labelled.

## Typography
`Optima, Candara, "Gill Sans", "Gill Sans MT", "Trebuchet MS", system-ui, sans-serif`: a humanist, slightly flared sans that is present on Apple and Windows systems, with no font download (zero font requests, which keeps the strict CSP). It will look different per operating system, and on many Android devices it falls back to `system-ui`; that is accepted. Weights 400 and 500, headings at normal tracking plus a little letter-spacing. Scale: h1 `clamp(1.9rem, 5.5vw, 2.75rem)`, h2 1.4 rem, h3 1.15 rem, body 1.0625 rem (17 px), small 0.875 to 0.9375 rem.

## Spacing, shape, elevation
4 px base (4, 8, 12, 16, 24, 32, 48, 72). Radii 14 (controls), 24 (cards), pill. One soft card shadow. Touch targets at least 44 px, buttons and inputs 48 to 50 px.

## Components and states
| Component | States |
|---|---|
| Button (primary, outline, danger) | default, hover, pressed (scale .98), focus-visible, disabled (grey with text, not just opacity) |
| NavPill | default, hover, current |
| ClassCard | open, few left, full, cancelled, entering (rise) |
| AvailabilityBadge | open, few, full, cancelled |
| TextField, Select | default, focus, invalid (red border plus message), disabled |
| Notice | informational (clay), error (red), always with text |
| Skeleton | loading placeholder for the schedule |
| EmptyState | heading, one sentence, one action |
| ConfirmDialog | native `<dialog>`, focus starts on the safe choice ("Keep it") |
| CodeBox | one-line cancellation code, selectable |

## Motion
Cards rise 8 px and fade in (400 ms); skeleton shimmer; a 5 s breathing circle on the confirmation. Only transform and opacity animate; buttons animate only their press (transform), never their colours, because a colour cross-fade passes through low-contrast states (found by an intermittent axe failure). `prefers-reduced-motion: reduce` removes all animation and transitions.

## Responsive rules
Fonts: the preferred stack is only present on some systems; layouts must also hold with a wide fallback font (tested with Verdana at 320, 375 and 768 px). The cancellation code scales with the viewport (`clamp(.9rem, 4.4vw, 1.9rem)`) and never wraps; below 360 px the nav pills shrink slightly.
Mobile first; content max width 960 px; breakpoint at 640 px where cards stack (time, then title, then badge and a full-width Book button) and the form grid becomes one column. The nav pills share a row at every width. No fixed-width text containers.

## Accessibility checklist
- [x] Landmarks (`header`, `nav`, `main`), one `h1` per route, day headings tied to their lists.
- [x] Skip link; focus moves to `main` on navigation; document titles per route.
- [x] Every control labelled; errors tied with `aria-describedby`, `aria-invalid` and text; first error receives focus.
- [x] Status messages in `aria-live` regions; alerts for failures.
- [x] Visible 3 px focus ring on everything; contrast computed (above); reduced motion respected.
- [x] Honeypot field hidden from sight and from assistive technology (`aria-hidden`, `tabindex=-1`).
- [ ] axe scan of every route and state; keyboard-only completion of booking and cancellation; screen reader spot check (test stage).

## Production notes
Tokens become CSS variables shared by the components; icons are not needed (the design uses none). The prototype's grey control bar, the demo passphrase and the in-memory data are prototype-only.
