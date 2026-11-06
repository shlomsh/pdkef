---
id: "RED-70"
title: "Arming Blur or Whiteout leaves the page still"
status: "done"
priority: "P2"
epic: "redact"
depends_on: []
---

# RED-70 · Arming Blur or Whiteout leaves the page still

Found recording the blur how-to video on 2026-11-06. Blur and Whiteout show a Box / Brush row under
the toolbar while armed. It sat in the sticky card's flow, so arming pushed the page down 54px at
1920x1080 and the one-shot disarm pulled it back up: a box a person just drew jumped away from the
pointer on release. SIGN-30 guards the toolbar's top edge, never the page under it.

## Outcome

- With a mouse, Box / Brush is a submenu under its own tool button. It opens on hover or keyboard
  focus (ArrowDown goes in), closes when the pointer or focus leaves, and on a press of the tool.
  A pick arms the tool in the same step. Nothing stays over the document while drawing.
- On touch there is no hover, so the row hangs under the sticky card while armed, the way the done
  strip does (RED-66), adds no height, and the strip steps aside for it.
- The first page's top edge does not move between idle, armed and after a placement, for Blur and
  Whiteout, on desktop and on a phone.
- A box stays under the pointer on release.
