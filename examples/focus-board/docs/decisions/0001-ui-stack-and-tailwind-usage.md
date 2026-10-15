# ADR 0001: Hand-built components, Tailwind as base layer

Status: accepted (Gate A', recorded here because the implementation refines it).

## Context
The platform default UI stack lists shadcn/ui and Tailwind. The app has about ten small components and a design that was approved as a runnable prototype with its own CSS.

## Decision
- No shadcn/ui. Components are hand-built (native `<dialog>`, native inputs) to keep the bundle small and avoid a registry/CLI dependency.
- Tailwind 4 is installed for its reset and for exposing the design tokens as theme variables. The approved prototype's component CSS is ported as-is rather than re-expressed as utilities, so the shipped UI matches what was approved at Gate B.

## Consequences
- Tailwind owns utility class names. A component class named `ring` silently picked up Tailwind's `ring` utility and drew a box around the progress ring. The class is now `progress-ring`, and a regression test checks the ring has no box-shadow. New component class names must not collide with Tailwind utilities.
- Tailwind is used lightly; if it stays unused beyond the reset it can be removed.
