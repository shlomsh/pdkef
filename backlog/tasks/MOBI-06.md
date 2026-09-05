---
id: "MOBI-06"
title: "Field-to-field navigation so filling a form never needs aiming"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-04"]
legacy_state: "Open"
---

# MOBI-06 · Field-to-field navigation so filling a form never needs aiming

## Scope and acceptance

**Once the regions are known, the remaining cost of filling a form on a phone is travel, not typing.**
MOBI-04 removes the aiming from one field. A person filling income tax form 101 still has 17 comb runs
on page 1 alone to find, each of which means dismissing the keyboard, pinch-zooming out, locating the
next box, zooming back in and tapping it. The keyboard covers roughly half a phone screen while it is
open, so the field being typed into and the field after it are rarely both visible.

Give the editor a next and previous field move, ordered by the detected regions, that commits the
current element, selects the next one, scrolls it into view above the keyboard, and opens it for
typing. Then a whole page is: tap the first field, type, Next, type, Next.

Where the control lives matters more than usual. `EditorToolStatus.jsx` is the shared status line both
Sign and Redact already render, and the "Stop" chip in it exists because Escape and double-click are
not available on touch. This is the same class of problem and should reuse that surface rather than
inventing a second floating control, and it must stay clear of the toolbar's own 44x44 touch-target
and per-row-cap rules in `SignToolbar.module.css`, which are load-bearing and easy to break by adding
one control.

Ordering is a real decision, not an implementation detail. **Both evidence forms are Hebrew and read
right to left**, so a naive left-to-right, top-to-bottom order walks every row backwards. Derive the
order from the document's own direction rather than hard-coding either one, and record how that
direction is determined.

**Acceptance.** On the committed form 101 fixture, every comb run on a page is reachable by repeated
Next from the first, in the order a person reading that form would fill them, with right-to-left row
order proven on the Hebrew fixture. The target is scrolled fully clear of the on-screen keyboard at a
real phone viewport, which needs a browser test rather than jsdom. Previous returns through the same
order. The current element is committed before the move, so nothing is lost. Escape still unwinds one
level at a time and the arming model is unchanged. The added control does not break the toolbar's
touch-target floor or its wrapped-row cap.
