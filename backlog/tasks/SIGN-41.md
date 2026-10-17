---
id: "SIGN-41"
title: "Sign: a click between two fields snaps to a different one depending on where the page sits on screen"
status: "open"
priority: "P2"
epic: "sign-fill-mode"
horizon: "next"
depends_on: []
---

# SIGN-41 · A click between two fields snaps to a different one depending on where the page sits

*Filed 2026-10-17 from SNG-24.* Moving Sign's airplane-mode line from above the card to below it shifts
the page 31px up on a 1280x720 desktop (overlay top 394 to 363 in document coordinates) and changes
nothing else: the overlay is 1196x1693 in both layouts. With that shift alone,
`src/tools/sign/e2e/per-document-style.spec.js` ("an app-wide default follows the latest choice")
failed 5 of 5: a Text placement at (0.2, 0.2) of `public/images/redaction-guide/sample.pdf`, in the
gap between the Full name field and the ID number comb, became a comb element (whose input draws no
text, so its color reads transparent). With the old layout it stays a free text box, 3 of 3, and
still does with field detection waited for first, so it is not detection timing.

The click itself is page-relative and identical in both runs (Playwright clicked the overlay at
239.2, 338.66). So the choice of field reacts to the page's on-screen offset, which suggests some
step of the nearest-field or snap logic mixes viewport and page or document coordinates. Inferred,
not traced.

The spec now places that text clear of every field (0.85, 0.2), which is what it meant to test.

## Outcome

- Trace the snap path from the overlay pointer event to the chosen field and find where an
  on-screen offset enters. Fix it so the same page point picks the same field at any scroll or
  offset.
- A unit or e2e test that places at the same page point under two different page offsets and gets
  the same result, seen failing first.
