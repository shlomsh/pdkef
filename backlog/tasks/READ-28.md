---
id: "READ-28"
title: "Highlight's toolbar borrows the strip's outlined Download and soft hover"
status: "done"
priority: "P2"
epic: "highlight-pdf"
depends_on: []
---

# READ-28 · Highlight's tiles take two of the strip's signals

*Filed 2026-11-12.* RED-73 brought Redact to Sign's strip finish. Highlight keeps its own framed, stretched tiles,
because it is a reading tool, not a form of inputs. Shlomi picked two small polishes from the canvas
(https://claude.ai/artifact/7Uz5w2QLpjcThjREyfYbk8, page "Highlight") so it still feels like the same family:

1. **Download outlined.** A 1.5px `--color-border-strong` frame and a bold word, never filled, as in Sign and Redact.
   With Google Drive, the arrow joins Download inside the same frame.
2. **A quieter hover.** A hovered tile takes `--color-primary-soft` and keeps its `--color-border` frame, instead of
   the primary tint with a teal edge. The armed Marker keeps its fill under the pointer.

Not picked: Feedback without a tile.

## Acceptance

- Highlight's toolbar root carries `data-finish="tile"`; Sign and Redact render unchanged.
- At 1440 and 390: Download's border is 1.5px in `--color-border-strong`, its word is bold, its ground is never filled.
- At 1440: a hovered tile has `--color-primary-soft` ground and `--color-border` frame; hovered Download keeps its
  strong frame; the armed Marker keeps `--color-primary` under the pointer.
- With the Drive arrow beside Download, the two read as one framed control at the same height.

## Outcome

Landed on branch `read-28-tile-finish`. Highlight's toolbar root carries `data-finish="tile"`; six rules under it in
`SignToolbar.module.css` give a hovered tile `--color-primary-soft` with its quiet frame, keep the armed Marker's fill,
and outline Download (and a Drive arrow joined to it) in `--color-border-strong`, bold, never filled. The 1.5px frame is
a 1px border plus a 0.5px inset ring, because this Chromium floors a border's width to whole CSS pixels at every
device scale (a `1.5px` border computes and paints as `1px`). Guards: the unit in `HighlightWorkspace.test.tsx` and
`src/tools/highlight/e2e/toolbar-tile-finish.spec.js` (Download frame at 1440 and 390, soft hover, armed Marker, the
Drive arrow with its real class in the cascade), each seen failing first. Sign and Redact's toolbar specs pass
unchanged. Not done: Feedback without a tile (not picked).
