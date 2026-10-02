---
id: "ENC-12"
title: "One hand-off row, not four copies"
status: "open"
priority: "P3"
epic: "polish"
horizon: "later"
order: 1
depends_on: ["ENC-04"]
---

# ENC-12 · One hand-off row, not four copies

*CLAUDE.md: quiet duplication is a ticket.* Merge, Redact, Split and, after ENC-04, Unlock each carry their own "next tool" row (button, icon, `useNavigatingAway` busy flag, failure line), because tools may not import each other.

## Brief
- One component in `src/shell` (four consumers), one set of strings, one place that disables the buttons for the navigation; each tool passes its list of verbs. Behaviour and look do not change.

## Acceptance
- The four rows render identically to today (the existing handoff e2e and `test:navigating-away` pass); the copies are deleted.
