---
id: "READ-22"
title: "A note's menu takes focus when it opens"
status: "done"
priority: "P2"
epic: "highlight-pdf"
depends_on: []
---

# READ-22 · A note's menu works from the keyboard

*Found 2026-11-05 while fixing [READ-21](READ-21.md).*

The menu opened with `visibility: hidden` until Floating UI placed it, and a browser does not focus a hidden
element, so Edit never took focus. Focus stayed on the ... button, where Escape and the arrow keys do nothing.
jsdom has no top layer, so the unit test for this passed.

## Outcome

In a real browser, opening the menu focuses Edit without scrolling the page, the arrow keys move between
items, and Escape closes only the menu and returns focus to the ... button.
