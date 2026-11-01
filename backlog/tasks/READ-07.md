---
id: "READ-07"
title: "Highlight PDF: long-press and drag to highlight on a phone"
status: "open"
priority: "P3"
epic: "highlight-pdf"
horizon: "later"
depends_on: ["READ-03"]
needs: "An iPhone check"
---

# READ-07 · Long-press and drag on a phone

*Filed 2026-11-01, narrowed the same day.* The desktop half is decided: Highlight PDF opens with a marker in
the hand and a drag highlights (READ-01, R1), so this tool's marker stays armed and the one-shot rule in
CLAUDE.md is scoped to it in READ-03. What is left is the phone. Design record:
[docs/highlight-pdf.md](../../docs/highlight-pdf.md), Open call 3.

## Outcome

On a phone, a one-finger swipe still scrolls and a long-press then drag highlights, the gesture phones
already teach for selecting text, with no Stop chip. Sign is unchanged.

## Acceptance

- [ ] On a real iPhone, long-press then drag on a digital PDF does not open the browser's text selection.
- [ ] On a scanned page the same gesture lays a band in its column (READ-01, R31).
