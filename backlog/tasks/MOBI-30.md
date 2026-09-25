---
id: "MOBI-30"
title: "Tapping outside a text box on a phone leaves it selected, with its bar and handles up"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-09-24"
---

# MOBI-30 · Tapping outside a text box on a phone leaves it selected, with its bar and handles up

## What Shlomi saw

iPhone, form 101, 2026-09-24. A text box open for typing (keyboard up, element bar and handles
showing). A tap on the page outside it should close the edit session and deselect it, hiding the bar
and the handles. It does not: the box stays selected. "The work on mobile became very complex on
sign, seems like there are too many race conditions."

## Acceptance

At a touch phone viewport, in WebKit and Chromium, a tap on blank page area deselects the element
whether it is open for typing, selected but not open, or open with the keyboard already dismissed.
Guarded by an e2e, since the failure is in touch event ordering jsdom cannot reproduce.

## Outcome (2026-09-24)

Never reproduced: Playwright (Chromium, WebKit) and the iOS Simulator both deselected on a clean tap,
zoomed or not. Shipped the likely cause's fix anyway: a touch tap (one finger, under 16 screen points of
movement, under 500ms, no scroll or zoom during it) on blank page area deselects without relying on
`click`, which iOS drops when finger jitter turns a tap into a pan. `src/tools/sign/tapOutsideDeselect.ts`,
guarded by `tap-outside-deselect.spec.js`. If Shlomi still sees it on a device, reopen with where he tapped.
