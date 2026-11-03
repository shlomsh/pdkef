---
id: "QUAL-47"
title: "Output paths that only mocks reach are tested on real bytes"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 2
depends_on: []
---

# QUAL-47 · Output paths that only mocks reach are tested on real bytes

*Filed 2026-11-03* from the unit-test audit recorded in QUAL-45.

## Why

Each of these decides what lands in an exported file, and its unit coverage is a mock echoing itself or
absent:

- `src/tools/redact/lib/check/runCheck.test.ts` mocks all eleven of the module's collaborators. Its test "reads
  glyphs for boxed pages even over the budget" never goes over `GLYPH_BUDGET` (400,000), so the
  `|| boxes.some(...)` branch at `runCheck.ts:86` is untested; and no test checks which saved page or which
  boxes reach `checkBoxesOnPage` (`runCheck.ts:104`), so a Blackout that failed to flatten could be reported
  as solid.
- `src/tools/scan/lib/scanPipeline.ts` (inset crop, warp, JPEG budget, EXIF-aligned load) has no unit test, and
  `PdfScanTool.test.tsx` mocks it whole.
- `src/tools/highlight/lib/export/highlightedPdf.test.ts` covers plain and underline marks only; pencil, sketch
  and comments are never exported in a unit test.
- `src/editor/registry/signature.ts` (`serialize`): no test asserts the drawn image's rectangle or its colour
  tint, so a wrong y-flip or width unit passes.
- `src/editor/geometry/coords.ts` `visiblePageBox`: no case with a CropBox reaching past the MediaBox, or the
  degenerate fallback.

## Outcome

- Each path above is tested by building a small real PDF (pdf-lib), running the real code, and reading the result
  back independently (pdf.js or pdf-lib), with only true edges (canvas, workers) faked.
- `runCheck.test.ts` is rewritten that way rather than given more mocks.

## Acceptance

- [ ] Each new test is seen failing against a planted fault in the path it covers.
- [ ] `runCheck.test.ts` mocks nothing the module itself owns.
- [ ] `npm run check:fast` and `npm run check:push` pass.
