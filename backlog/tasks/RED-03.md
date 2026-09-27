---
id: "RED-03"
title: "Repeat a box on every page"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-03 · Repeat a box on every page

*Filed 2026-09-27 from SITE-41's follow-ups.*

A selected redaction box offers "Every page": the same box, at the same position, on all pages (or
a chosen range), for letterheads, footers with an account number, or stamps.

- One action, one undo step. Each copy is an ordinary box afterwards (move, resize, delete alone).
- Pages of different sizes place the box by the same relative position.

## Acceptance

- On a 10-page PDF, "Every page" adds 9 boxes in one undo step, and the export blurs or blacks out
  that spot on every page.
