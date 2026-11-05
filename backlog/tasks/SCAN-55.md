---
id: "SCAN-55"
title: "Auto-detect goes back to a PDF sheet's own corners"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-55 · Auto-detect on a PDF sheet

*Opened 2026-11-05* from Shlomi on the Adobe Scan book: "the auto detect became a lot worse". Measurements only here.

## What is wrong

Auto-detect runs the photo's edge guess, which looks for paper on a table. A PDF sheet has no paper edge (PE-11), and the
toned border PE-11 added gives the guess something to find. On the book's 25 sheets it went wrong on 2 without the border
and on 8 with it: 5 selected the next page's strip, 3 a piece of the page. It got none right.

## What changes

A PDF sheet remembers the corners it opened with, and Auto-detect goes back to them. The edge guess never runs on a sheet.
A scan saved before this has no such corners, so Auto-detect says it found nothing and leaves the corners where they are.

## Done when

- On a PDF sheet, Auto-detect restores the opening corners after a person moved them, and never selects a strip.
- A remembered scan keeps those corners.
- Photos behave as before.
