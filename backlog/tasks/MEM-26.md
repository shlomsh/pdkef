---
id: "MEM-26"
title: "A CSS Module edit renames its own CSS chunk, not 25 JavaScript chunks"
status: "in_progress"
priority: "P1"
horizon: "now"
epic: "robustness"
depends_on: []
---

# MEM-26 · A CSS Module edit renames its own CSS chunk, not 25 JavaScript chunks

*Filed 2026-10-28* from the update-cost nightly going red on ordinary deploys (MEM-21).

## Why

- 42923db to 1b72a77 changed only `src/shell/PdfTool.module.css` (12 lines). Built at one path with the
  MEM-21 CSP pruning on both sides, the update cost is 1,343,675 bytes (brotli q5): 25 new hashed chunks,
  led by `/_astro/sign.*.js` at 301,156 bytes, plus `PdfSignTool.js` and `PdfRedactTool.js`.
- Five of the last eight output-changing deploys on main read 1.34 to 1.35 MB the same way
  (423116c..b1a2ae4, 85cdfbc..42923db, 42923db..1b72a77, 686e27e..25b2fe4; b1a2ae4..4d72498 at 568 KB).
  MEM-25 made a shared JS module rename only its own chunk; a CSS Module change still cascades.
- The update-cost job is report-only until this lands (`continue-on-error` in `ci.yml`, pinned by
  `scripts/ci-update-cost.test.mjs`).

## Outcome

- Editing one CSS Module renames the CSS chunk that holds it and at most the one JS chunk that imports
  it, not their importers.

## Acceptance

- [ ] A unit or build test that edits one CSS Module between two builds and counts the renamed chunks.
- [ ] 42923db to 1b72a77 rebuilt with the fix reads under 500,000 bytes, or the remainder is named.
- [ ] `continue-on-error` and its pin test come out of the update-cost job, and the next nightly is green.
