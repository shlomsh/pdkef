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

## Linked copies (added 2026-09-27, before RED-03 shipped)

Copies stay linked: moving, resizing, recolouring or re-striking any one updates every copy, one
undo step. The toolbar shows "On N pages" with "Unlink this page" and "Remove from every page".
Deleting one copy removes only that page's box. Duplicating a linked box duplicates the whole set
into a new set of its own. `src/tools/redact/repeatGroup.ts` owns the rules: a box's group is its
`repeatGroupId`, or its own id, so repeating never changes the source and old drafts stay valid.

## Acceptance

- On a 10-page PDF, "Every page" adds 9 boxes in one undo step, and the export blurs or blacks out
  that spot on every page.
