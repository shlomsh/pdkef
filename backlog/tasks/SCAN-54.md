---
id: "SCAN-54"
title: "A mouse drag on a corner shows the magnifier, as a finger does"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-54 · The corner magnifier on desktop

*Opened 2026-11-05* from Shlomi placing corners on desktop: he could not set them as exactly as on the phone,
because the magnifier was missing. `CornerEditor` showed the loupe on touch only, on the reasoning that a mouse
pointer does not cover the point. The handle's ring does.

## Outcome

Dragging a corner with a mouse shows the same loupe as a touch drag, and release hides it.
