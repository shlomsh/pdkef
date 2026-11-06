---
id: "READ-24"
title: "A rest only outlines a highlight, a click opens its row where you clicked"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 1
depends_on: []
---

# READ-24 · A rest only outlines a highlight, a click opens its row where you clicked

*Filed 2026-11-06. Shlomi said the in-context toolbar was good but something felt off, and picked sketch 2 ("Click opens") from the
critique's three directions. The sketches: https://claude.ai/artifact/H9RkMTtB9BXXewbxitQ2Sj*

The parts were good. What felt off was timing and order: a settings row arrived when a reader had a thought, not a setting.
Measured on pdkef.com at 1440x900: a 700 ms rest opened it over the lines around the mark and it was still open 2.5 s after the pointer
left; the opacity menu hid 30% of the mark it changed, More 18%; Comment was 8th of 9 controls; resting at the end of a long mark put
Yellow 791 px and Comment 453 px away.

## Outcome

- **A rest only draws the faint pencil outline.** It says "you can click this" and goes when the pointer leaves the mark. It opens nothing.
- **A click opens the row where you clicked,** centred on the pointer, above the line clicked. The full outline stays on while it is open. Keyboard focus still opens it at the mark's start edge (R39).
- **The row reads by intent:** Comment, the three colors and More, Look, Delete. Seven controls, not nine, and no frames inside the card.
- **Look is one button** holding kind (Highlight | Underline), stroke (Clean | Sketch | Pencil) and strength (opacity, or thickness for an underline).
- **Menus open away from the mark:** upward from the floating row, so a menu never covers what it changes. Where the row and its tallest menu have no room above the line (right under the stuck bar), the row opens just below the line and its menus open downward.
- **Delete offers Undo right there,** a chip for five seconds where the row was (guidelines §6). On a phone it sits at the foot of the screen.
- **On a phone** the same row sits under the toolbar, Comment keeps its word, the page glides down so the mark stays in view under the row and its menus, and "Swipe to highlight" steps aside while a mark is picked so the file name is whole.
- **The words match:** the one-time hint, the tool page, the paper reader guide, `docs/highlight-pdf.md` and READ-01's R2, R8, R47, R48.

Settled and unchanged: one panel, only a picked highlight opens it (R2, R47); finishing a stroke shows nothing (R1, R52); a change re-arms the pen (R5); nothing anchored to the mark on touch (guidelines §17). The U and P keys stay.

## Contract between the pieces

All paths under `src/tools/highlight/` unless named.

- `lib/marker/restDetector.ts`: `REST.restMs` is 300. `RestState.opened` becomes `rested: string | null`. A move that leaves the rested mark clears `rested`; small moves inside it keep it.
- `hooks/useRestToolbar.ts` returns `{ restId, targetId, anchor, hint, onPointerMove, onPointerLeave, strokeEnd, openFor(id, anchor?), close, showHint, clearHint }`. `restId` is the mark under a resting pointer, `targetId` the mark whose row is open, `anchor` a `PanelAnchor | null`. Only `openFor` opens.
- `lib/marker/panelAnchor.ts`: `type PanelAnchor = { x, y, bottom, pull }`, percent of the mark's box; `panelAnchor(bands, point)` keeps `point.x` and takes the band under `point`, the nearest band when none is; `focusAnchor(rtl)` stands on the whole mark at its start edge; `rowSide(lineTop, rowHeight, ceiling)` says above or below the line.
- `hooks/useMarkToolbarPlacement.ts`: `(rootRef, markId, rtl, anchorKey?)`. The reference is the page's `[data-panel-anchor]` node when there is one (a real node, so the shared placement keeps its page boundary and visual viewport clamp), sized to the bar so the bar sits where the anchor says; else the mark. The shared placement never flips, so below the line the anchor steps down past it. Returns `side`, which the row's menus follow.
- `MarkPanel` props: `{ look, onChange, onComment, onDelete, menu, onMenuChange, menuSide? }`, with `type PanelMenu = 'more' | 'look' | null` exported from `MarkPanel.tsx`, `menuSide` `'top' | 'bottom'`, default `'bottom'`. `MoreColors` and `LookMenu` take `{ open, onOpenChange, placement }`.
- `#shell/UndoChip.tsx`: `{ message, undoLabel, onUndo, class?, style? }`, the look ScanUndoChip had; Scan wraps it.
- `hooks/useRemovedMark.ts`: `useRemovedMark(elements)` returns `{ removed: { at: { x: number; y: number } | null } | null, show(at), dismiss() }`. Five seconds, and any later change to `elements` dismisses it, so its Undo can only ever undo the delete.
- `lib/marker/glide.ts`: `glideFor(markTop, coverBottom)`. `hooks/useMarkGlide.ts`: `useMarkGlide(markId, menu, panelRef)` writes `translate` on `[data-lamp-part="board"]`, and clears it, because any standing translate would make the board a containing block.
