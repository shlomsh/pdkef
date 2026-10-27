---
id: "ARCH-103"
title: "The Redact, Sign, Scan and Compress islands are no longer 850 to 1,200 line functions"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# ARCH-103 · The Redact, Sign, Scan and Compress islands are no longer 850 to 1,200 line functions

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S1.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `PdfRedactTool.tsx:115` is one 1,204-line function with 54 hook calls; Sign (955), Scan (871) and Compress (853) have the same shape. Merge is down to 452.
- Effect clusters sit inline, so a change to draft, export or selection handling touches the whole function.

## Outcome

- Effect clusters (draft, export, selection) extracted into hooks and pure modules.
- The size ratchet record lowered as each island lands.

## Acceptance

- [ ] Each of the four islands is below its recorded length in `scripts/ratchet-limits.json`, and the record is lowered.
- [ ] No new file or function crosses the ratchet thresholds.
