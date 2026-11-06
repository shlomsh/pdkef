---
id: "RED-70"
title: "Arming Blur or Whiteout leaves the page still"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-70 · Arming Blur or Whiteout leaves the page still

Found recording the blur how-to video on 2026-11-06. Blur and Whiteout show a Box / Brush row under
the toolbar while armed. It sat in the sticky card's flow, so arming pushed the page down 54px at
1920x1080 and the one-shot disarm pulled it back up: a box a person just drew jumped away from the
pointer on release. SIGN-30 guards the toolbar's top edge, never the page under it.

## Outcome

- The row hangs under the sticky card, the way the done strip does (RED-66), and adds no height.
- The first page's top edge does not move between idle, armed and after a placement, for Blur and
  Whiteout, on desktop and on a phone.
- A box stays under the pointer on release.
- The done strip hangs in the same place, so it steps aside while either tool is armed.
