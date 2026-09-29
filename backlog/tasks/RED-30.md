---
id: "RED-30"
title: "Blur strength is a slider on the box, from vaguely readable to strong, medium by default"
status: "open"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-30 · Blur strength is a slider on the box, from vaguely readable to strong, medium by default

*Shlomi, 2026-09-29: the slider is better than low, medium, high. Low was not low at all: a person who
wants something vaguely readable may have it, but the default stays medium, today's blur. The box must
stay movable and resizable, and clicking anywhere else deselects it.*

Sketched and agreed in a session on 2026-09-29 (inline widget, not in the repo).

- Strength becomes a continuous factor from **0.1 to 0.7**, replacing `light | medium | strong` in
  `src/editor/model/blurStrength.ts`. The rule stays **radius = factor × max(box height, 24pt)**.
  Medium (0.4) is the default and today's blur exactly; the knob snaps to it within ±0.02 and a tick
  on the track marks it.
- Saved boxes migrate: `light` → 0.3, `medium` → 0.4, `strong` → 0.5; a box with no strength stays 0.4.
- Below 0.3 is lighter than anything shipped today, on purpose. No warning, no Blackout suggestion
  (as RED-24). Update the `blurStrength.ts` header: lowering the floor here is a deliberate choice.
- **Desktop:** the slider sits just under the selected box, as wide as the box (at least 90px).
  **Phone:** the slider lives in the full-width toolbar, never under the box.
- The box keeps move and resize (corners and sides) while the slider is showing. Dragging the knob
  follows the gesture golden rule: the blur updates in the DOM during the drag and commits once on release.
- Clicking or tapping anywhere else on the page, or on another element, deselects the box and hides the
  slider.
- The strength is remembered per document and becomes the default for new documents (SIGN-32/33 memory).
- `BlurStrengthMenu.tsx` is retired.

## Acceptance

- A new box with no remembered choice is 0.4 and exports exactly like today's medium.
- A 0.1 box exports with radius 0.1 × max(h, 24pt); a 0.7 box with 0.7 × max(h, 24pt).
- A document saved with `strong` reopens at 0.5, looking the same as before.
- Move, resize, slider drag and deselect-on-click-elsewhere each work on desktop and on a phone viewport,
  where the slider is in the toolbar.

## Undo and redo

Through the existing stack (`historyStack.ts`), never a separate one.

- One slider drag, press to release, is one `update` entry on `strength`. Quick drags on the same box
  within `COALESCE_WINDOW_MS` fold into one step, as colour picks do today.
- The migration from `light | medium | strong` pushes no history. Old drafts carry those strings inside
  their persisted `actionHistory` snapshots, so undo and redo resolve a snapshot's strength through the
  same migration: undoing a pre-slider entry must restore the right blur, not the default.
- Move, resize and strength are separate fields, so a resize right after a strength drag stays its own
  step.

Acceptance: drag strength twice with a pause, undo twice returns to the original strength; redo twice
returns to the last. An old draft with `strong` in its history undoes and redoes to 0.5 after reload.
