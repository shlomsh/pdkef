---
id: "MOBI-25"
title: "Next on a pinch-zoomed iPhone throws the page to its top"
status: "retired"
priority: "P1"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-22"]
legacy_state: "Open"
---

# MOBI-25 · Next on a pinch-zoomed iPhone throws the page to its top

Reported in production on 2026-09-22: on an iPhone, pinch-zoomed in, with the keyboard up in the first box of
form 101, the next-field chevron sent the page all the way to its top (the hero), although the next field was
already on screen beside the box.

**What changed.** `scrollFieldIntoView` in `useFieldNavigation.ts`:

- does not scroll at all when the field is already fully inside the visible band, so a hop to a visible
  neighbour no longer moves the page (it used to re-centre on every move);
- when the page is pinch-zoomed (`visualViewport.scale > 1`), hands the reveal to the browser
  (`scrollIntoView({ block: 'nearest', inline: 'nearest' })`) instead of its own arithmetic, which mixes
  layout-viewport rects with the visual viewport's offset and passes the sum to `window.scrollTo`;
- bails on non-finite inputs.

Guards: `field-move-scroll.spec.js`'s last two tests, each red without the change.

## Still open

- The exact iOS mechanism was not reproduced: Playwright cannot pinch-zoom WebKit or raise its keyboard, so
  the zoomed branch is pinned by what it calls, not by where iOS lands. Confirm on a real iPhone, zoomed and
  not, with the keyboard up, both for a visible neighbour and for a field a page away.

## Retired 2026-09-25 into the next-generation Sign

Retired, not fixed. Shlomi stopped local mobile fixes on 2026-09-25, because each one was locally right and
created the next edge. This ticket is a symptom of a cause the new editor removes by design. Its failure
case is carried into SNG-05's acceptance. See `docs/sign-next-gen.md` §1-2 and the SNG epic.
