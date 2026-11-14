---
id: "SCAN-73"
title: "A thumb holding the page down is cleaned out of the result"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "later"
depends_on: ["SCAN-71"]
---

# SCAN-73 · No thumbs in the scan

*Opened 2026-11-14.* Holding a book open puts a thumb on the page. In a live-camera check, 3 of 5 open-book pages
kept the thumb as a dark blob at the bottom edge; in the private 22-photo book benchmark, 5 pages kept one.

## Outcome

- A thumb or finger at the page edge, over margin only, comes out as paper.
- A finger over text is left alone: the person sees it and can retake.

## Acceptance

- [ ] A failing case first, then the change; the clean-page rule holds (a page with no thumb comes through
      unchanged).
- [ ] The book benchmark's thumb count goes down from 5.
