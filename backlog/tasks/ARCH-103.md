---
id: "ARCH-103"
title: "No tool island function is over 300 lines"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
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

- [x] Every tool island function is under 300 lines.
- [x] The size ratchet passes with those records lowered, not raised. Since ARCH-105 records every function over 150 lines, an island between 150 and 300 stays recorded; that is fine (reworded 2026-10-27).

## Closed 2026-10-28

Every tool island function is under 300 lines (size ratchet records): Redact 902 -> under 150, Sign 934 -> 287, Scan 646 -> under 150, Merge 449 -> 231, Image to PDF 346 -> 296, Security 319 -> 290, Split 317 -> 297; Compress 287, Edit Pages 263 and PDF to Image 282 were already under. Effect clusters moved into hooks called at the cluster's old position, pure logic into tested `lib/` modules, JSX into presentational components with no effects. `src/shell/BasePdfTool.tsx` (411) is the shared shell the islands render, not a tool island, and stays recorded by ARCH-105's tier.
