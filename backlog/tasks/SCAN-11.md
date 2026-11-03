---
id: "SCAN-11"
title: "Scan next: the page copy and the scanning guide follow the new flow"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
order: 3
depends_on: ["SCAN-06", "SCAN-08"]
---

# SCAN-11 · The words follow the flow

*Opened 2026-11-03.* Shlomi: the workflow should be documented where people read it. Today's copy teaches the
old flow: the how-it-works steps say "Drag the four corners to the edges of each page", and the subhead leads
with dragging corners.

## Outcome

- `src/data/toolEntries/scanToPdf.js`: the subhead, how-it-works and FAQ describe the new flow (point, hold,
  turn the page; the table; size before Share; fix a page by tapping it), checked against the shipped code.
  FAQ JSON-LD matches the page. Primary keyword stays in title, H1 and description.
- `src/content/content-pages/how-to-scan-a-document-to-pdf.yaml`: the "when PDkef helps" part shows the
  camera-to-WhatsApp path step by step.
- The Markdown twin (`Accept: text/markdown`) follows.
- Voice per `.claude/rules/content-and-copy.md`: plain, warm, no em dashes, no claim the code does not back.

## Acceptance

- [ ] Every step in the copy can be done on the shipped tool as written.
- [ ] `test:seo` passes; the FAQ JSON-LD matches the page.
