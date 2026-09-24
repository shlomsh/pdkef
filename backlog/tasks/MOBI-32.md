---
id: "MOBI-32"
title: "Zoomed in, a box near the top of the screen is hidden under its own full toolbar"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-17"]
legacy_state: "Open"
---

# MOBI-32 · Zoomed in, a box near the top of the screen is hidden under its own full toolbar

Split out of MOBI-17 so it could close.

Seen on the iOS Simulator, 2026-09-24, form 101: page pinch-zoomed about 3x, the employer phone box sits
just below the sticky tool strip. Tapping "Aa" opens the full bar. There is no room above the box, so
`visualViewportClamp.ts` pushes the bar down to just below the sticky strip, which puts it on top of the
box it edits. The compact bar fits above the box, so this only happens with the full bar.

DraggableWrapper deliberately never flips the bar below the element (see `.claude/rules/editor.md`), so
the fix is not simply `flip()`. Options: let the clamp place the bar below the box only when the space
above is under the sticky strip, or scroll the box down by the bar's height when the full bar opens.

## Acceptance

Zoomed 3x with the box just under the sticky strip, opening the full bar leaves the box and the bar both
fully visible, neither overlapping the other or the strip. Checked on the iOS Simulator.
