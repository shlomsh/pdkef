---
id: "RED-44"
title: "The saved-file check's buttons are 44px touch targets"
status: "done"
priority: "P3"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-44 · The saved-file check's buttons are 44px touch targets

The saved-file check's buttons render at 36px, under the 44px minimum every other Redact control meets (RED-35).

## Acceptance
- Every button in the check is at least 44px tall on coarse pointers; the layout at 375px does not wrap awkwardly.

## Result

`SavedFileCheck.module.css`: `.cover, .submit, .input` get `min-height: 2.75rem` on coarse pointers, as FindBar does. The 36px was the component's own rule. (06492868)
