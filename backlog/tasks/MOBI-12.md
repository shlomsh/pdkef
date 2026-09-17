---
id: "MOBI-12"
title: "A touch on a text box's corner handle resizes the font, not the comb span"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-09-18"
---

# MOBI-12 · A touch on a text box's corner handle resizes the font, not the comb span

## Scope and acceptance

**On a phone, dragging a corner handle of a date (or any short text box) does not change its size;
only the toolbar's A+ does.** Reported 2026-09-18 from a real device on a landscape A4 scan.

The cause is a hit-target overlap, not the resize math. Under `pointer: coarse` every resizer gets a
46px halo (`EditorElement.module.css`, the `-18px` inset that makes each one a WCAG 44px target). A
text box renders six handles: four corners, which set the font size, and two mid-edge side handles,
which set the comb span. The side handles come last in `textDefinition.resizeBehavior.handles`, so at
equal `z-index` they win every overlap, and on a text box shorter than about 38 CSS px their halo
covers both corner dots on that side completely. A date at 12pt is ~9px tall on a phone and ~36px at
the 72pt maximum, so a corner touch always lands on the span handle: it widens the box into a comb
(or, below the comb floor, does nothing visible) and never touches the font. A mouse has no halo, so
the desktop never showed it.

Three 44px targets do not fit in 38px of edge, so no halo geometry fixes this. Instead the press is
routed to the handle whose centre is nearest the touch point, whichever handle's halo the browser
happened to hit: a Voronoi split of the overlap, which is the most a user can mean by "the corner".

**Acceptance.** In jsdom, a press on the side handle's node at a corner's position starts a corner
resize; a press at mid-edge still starts the span resize. On a phone-sized viewport, dragging the
bottom-right corner of a freshly placed date grows its font. Redact's box elements, which have no
side/corner conflict, keep their behaviour.

## Outcome (2026-09-18)

`ElementResizers.tsx` exports `nearestHandle(event, pressed, fallback)`: on mouse-down or touch-start
it reads every sibling `[data-editor-resizer]`'s rect and hands `onResizeStart` the handle whose
centre is nearest the pointer, falling back to the pressed one when nothing has layout (jsdom, or a
hidden node). No CSS changed: the halos stay at 44px, and the fix is in which handle a press means.

Measured on a 375px viewport with `pointer: coarse` on the dev server: a freshly placed date is a
31x7px box whose six handle centres sit within 4px of one another; `elementFromPoint` at the
bottom-right corner returns the `right` span handle, and a touch drag from there now grows the font
from 5.2px to 20.7px with no comb, where before it went to `applyCombWidth`.
`ElementResizers.test.tsx` pins the routing for a corner touch, a mid-edge touch, a mouse press and
the no-layout fallback.

Not changed here: `MAX_FONT_SIZE_PT` is 72 in both the handle and the toolbar path, and the report's
screenshot shows both elements already at it. Whether 72pt is the right ceiling on a landscape A4
scan viewed on a phone is a product question, not this bug.
