---
id: "MOBI-31"
title: "Dragging a text box's side handle on a phone moves the box instead of resizing it"
status: "in_progress"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MOBI-31 · Dragging a text box's side handle on a phone moves the box instead of resizing it

## What Shlomi saw

iPhone, form 101, 2026-09-24. A phone number typed into a detected field came out as a spaced,
multi-column (comb) element by mistake. To make it a plain text box again he pressed the left middle
handle to narrow it, and the drag moved the whole element left instead of resizing it.

## Acceptance

At a touch phone viewport, press-dragging any visible side handle of a text box, comb or plain,
resizes it and never moves it, including a box near the page edge. There is a way back from a comb
element to a plain text box that a person can find on a phone.
