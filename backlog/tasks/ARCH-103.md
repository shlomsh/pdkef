---
id: "ARCH-103"
title: "No tool island function is over 300 lines"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: ["ARCH-106", "ARCH-108", "ARCH-109"]
---

# ARCH-103 · No tool island function is over 300 lines

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S1.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `PdfRedactTool.tsx:115` is one 1,204-line function with 54 hook calls; Sign (955), Scan (871) and Compress (853) have the same shape. Merge is down to 452.
- Effect clusters sit inline, so a change to draft, export or selection handling touches the whole function.

## Outcome

- Effect clusters (draft, export, selection) extracted into hooks and pure modules.
- The size ratchet record lowered as each island lands.

The per-tool steps are ARCH-109 (Redact), ARCH-108 (Sign) and ARCH-106 (Scan); Compress is done here.

## Acceptance

- [ ] Every tool island function is under 300 lines, so `scripts/ratchet-limits.json` records none of them.
- [ ] The size ratchet passes with those records removed, not raised.
