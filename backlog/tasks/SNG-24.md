---
id: "SNG-24"
title: "Sign on a phone: a one-line hero once a file is open and the airplane line below the card, without moving the field toolbar"
status: "done"
priority: "P3"
epic: "sign-fill-mode"
depends_on: []
---

# SNG-24 · Sign on a phone: a one-line hero once a file is open

*Filed 2026-10-17 from HERO-08.* Every other tool's hero, Redact's included, folds to one line on a phone
once a file is loaded, and its airplane-mode line sits below the card. Doing either on Sign made
`src/tools/sign/e2e/toolbar-zoom-physical-size.spec.js:292` see the full field toolbar's anchor move from
x 389.9 to 240.9 at 1.8x zoom, so both were held back as a possible layout fault under Sign's freeze for
patches ([docs/sign-next-gen.md](../../docs/sign-next-gen.md)).

## What it was (2026-10-17)

Not a layout fault, and no change to Sign's editor. The spec zooms with `Emulation.setPageScaleFactor`,
which shrinks the visual viewport to 244px wide at 1.8x on a 440px phone with no pan. An RTL field near
the left edge places its bar at x 50 to 390 at rest; at 1.8x that rest is outside the viewport, and
`visualViewportClamp` (src/editor-ui/hooks/visualViewportClamp.ts) pulls the bar back to 240.9, the
viewport's edge less its 4px margin, as it is meant to. The spec only asserted the anchor while the field
was inside the zoomed viewport; the folded hero moved the field up into that region, which exposed the
clamp it had always skipped. Measured on the run: rest 49.9..389.9, viewport 0..244.4, clamped to
52.0..240.9, with physical size and row count unchanged.

## Done

- The spec asserts the anchor and gap only where the bar's rest fits the zoomed viewport, and otherwise
  that the clamp keeps the bar on screen; size and row count are asserted at every scale as before.
- Sign carries `data-hero-editor-fold` like Redact, and its airplane line sits below the card
  (ToolPageLayout.astro has one airplane line for every tool again).

## Acceptance

- [x] Sign on a 375px phone shows a one-line hero once a file is open (58px, was 363px).
- [x] Sign's airplane line sits below the card, as on every other tool.
- [x] The toolbar-zoom spec, its real-pinch suite, tool-layout and the first-screen guard stay green.
