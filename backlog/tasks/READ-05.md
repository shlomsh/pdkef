---
id: "READ-05"
title: "The fullscreen capsule, shared by Highlight PDF and Sign"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 4
depends_on: ["READ-01"]
---

# READ-05 · The fullscreen capsule

*Filed 2026-11-01, reshaped the same day by the sketches.* Shlomi: in fullscreen the toolbar should be as
small as possible and focused on the document. The behaviour is READ-01's requirements R15 to R19 (the
capsule) and R20 to R26 (zoom); design record [docs/highlight-pdf.md](../../docs/highlight-pdf.md),
"Fullscreen is the reading lamp".

## Outcome

In fullscreen both tools show one floating capsule instead of the toolbar: grey and faded at rest, awake
when reached for, dozing when the reader goes back to reading, carrying the armed tool and the zoom menu.
Coarse pointers keep 44 px targets. Leaving fullscreen restores today's toolbar exactly.

## The name

**Reading lamp** (Hebrew: מנורת קריאה), Shlomi, 2026-11-01: one lit lamp over the page, dimming and waking
as the capsule does. Chosen from a second round written for the café-like audience of art and psychology
students. Considered and passed over: Reading room (the working name), Window light, North light, Close
read, Flow, Corner table, Study, Folio, Long table, Deep read, Hush, Whole page. Dropped: Window seat (reads
as a flight), Nook (an e-reader brand), Margins (collides with "no margins" in the zoom menu), Paper (Dropbox
Paper).

## Acceptance

- [ ] One fullscreen style in shared chrome (`src/editor-ui/`), not a container-query tier.
- [ ] The doze is driven by reading (scroll, a press on the page), never a timer; unit tests pin the states.
- [ ] An e2e at two desktop widths pins the capsule centred on the page column, and that nothing in the
  page moves when it wakes, dozes or opens a menu.
- [ ] Arming a tool in fullscreen does not move the capsule (the SIGN-30 rule).
- [ ] The mode is called Reading lamp in its tooltip and labels ("Reading lamp", "Leave the reading lamp"),
  and מנורת קריאה on the Hebrew edition.
- [ ] At 375 px the capsule fits the screen with 44 px targets (READ-01, R42).
