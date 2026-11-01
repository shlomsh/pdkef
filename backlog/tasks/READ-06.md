---
id: "READ-06"
title: "Highlight PDF: Print with my notes, comments in the margin beside their passages"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "now"
order: 5
depends_on: ["READ-03"]
---

# READ-06 · Print with my notes

*Filed 2026-11-01.* Shlomi: a student carrying paper into an exam needs to see their comments. The export
carries comments as popups, and Chrome, Preview and most printers do not print popups. Built in Highlight
PDF only, never in Sign. Design record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md). This replaces
SIGN-44's "Print my comments" item.

## Outcome

A Print action, separate from Download, offers Print (pages with their highlights) and Print with my notes
(each page a little smaller, its comments in the right margin beside their passages, as the rail lays them
out). Neither is saved into the PDF.

## Acceptance

- [ ] The margin layout is a pure function from page size and comment anchors to card positions, shared
  with the rail, with unit tests.
- [ ] Printed from Chrome and Safari on desktop and from iPad, Hebrew and English, checked on paper or a
  print-to-PDF.
- [ ] A long comment and a crowded page stay readable: cards stack without overlap and nothing is clipped.
