---
id: "READ-05"
title: "The fullscreen capsule, shared by Highlight PDF and Sign"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "next"
order: 4
depends_on: ["READ-01"]
---

# READ-05 · The fullscreen capsule

*Filed 2026-11-01, reshaped the same day by the sketches.* Shlomi: in fullscreen the toolbar should be as
small as possible and focused on the document. The behaviour is READ-01's requirements R15 to R19 (the
capsule) and R20 to R26 (zoom); design record [docs/highlight-pdf.md](../../docs/highlight-pdf.md),
"Fullscreen is the reading room".

## Outcome

In fullscreen both tools show one floating capsule instead of the toolbar: grey and faded at rest, awake
when reached for, dozing when the reader goes back to reading, carrying the armed tool and the zoom menu.
Coarse pointers keep 44 px targets. Leaving fullscreen restores today's toolbar exactly.

## Acceptance

- [ ] One fullscreen style in shared chrome (`src/editor-ui/`), not a container-query tier.
- [ ] The doze is driven by reading (scroll, a press on the page), never a timer; unit tests pin the states.
- [ ] An e2e at two desktop widths pins the capsule centred on the page column, and that nothing in the
  page moves when it wakes, dozes or opens a menu.
- [ ] Arming a tool in fullscreen does not move the capsule (the SIGN-30 rule).
- [ ] At 375 px the capsule fits the screen with 44 px targets (READ-01, R42).
