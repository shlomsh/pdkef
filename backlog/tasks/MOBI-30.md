---
id: "MOBI-30"
title: "Tapping outside a text box on a phone leaves it selected, with its bar and handles up"
status: "in_progress"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
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
