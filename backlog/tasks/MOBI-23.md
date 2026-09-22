---
id: "MOBI-23"
title: "A narrow text box that is selected but not open is all resize handle on touch"
status: "open"
priority: "P3"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-21"]
legacy_state: "Open"
---

# MOBI-23 · A narrow text box that is selected but not open is all resize handle on touch

Split out of MOBI-21 so that one could close.

On a coarse pointer each text resize handle's hit area reaches about 22px inward from its side of the box
whatever the box's height (`--handle-size` cancels between the handle's `left` offset and the halo inset in
`EditorElement.module.css`). So a text box narrower than ~46 CSS px has no tappable text at all, and a 60px
box has a 14px strip in the middle.

MOBI-21's one-tap entry means this no longer locks anyone out from the common state: a deselected box has no
handles, so the first tap opens it. What is left is a box that is **selected but not being edited** - which on
a phone happens after a drag. A tap on it there starts a resize instead of opening it.

## Acceptance

At a phone viewport, after dragging a text box narrower than 46px, one tap opens it for typing. The 44px
target on each handle stays where the box is wide enough to afford it; where it is not, the handles give way
to the text rather than covering it. Guarded in `touch-edit-reentry.spec.js`.
