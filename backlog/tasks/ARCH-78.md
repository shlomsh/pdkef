---
id: "ARCH-78"
title: "Island tests mock only the storage and network edge, through one harness"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 15
depends_on: []
---

# ARCH-78 · Island tests mock only the storage and network edge, through one harness

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- The seven island tests mock 5 to 10 internal modules each (`PdfRedactTool.test.tsx`: 3,775 lines, 453 expects, 10 mocks; Merge 1,947 lines; Compress 1,687) and assert on spies (7 to 70 call-style assertions per file). `draftStore` is mocked 16 times.
- An internal refactor of `draftStore`, `thumbnails` or analytics breaks seven large files at once.

## Outcome

- `src/test/support/toolHarness` fakes IndexedDB (`fake-indexeddb` is already a dev dependency) and the network edge; island tests drop per-file module mocks.

## Acceptance

- [ ] Module mocks in island tests fall from 51 to under 15; the suites pass.

## Progress (2026-10-27)

src/test/harness/toolHarness.ts (fake IndexedDB, recorded beacons, created blobs, real draftStore reads) is the one harness; every island test now mocks only edges jsdom cannot run (pdf.js worker and rendering, canvas pixels and codecs). Module mocks across the audit's seven islands fell from 51 to 21: Redact 2, Merge 2, Split 3, Security 2, Edit Pages 2, PDF to Image 3, Compress 7. A reviewer's weakened assertions were restored, with call-through spies where only call identity proves the fact. Open: under 15 needs Compress's main test to drop its hand-built engine results (three canvas-bound engines, analyzePdf, pdfLib) for generated fixtures and codec stubs, or the pdf.js edge mocks to move into one shared setup.
