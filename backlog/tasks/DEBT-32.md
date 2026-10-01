---
id: "DEBT-32"
title: "errors:resolve named the wrong build when a vendor chunk kept its hash"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: ["DEBT-27"]
---

# DEBT-32 · errors:resolve named the wrong build when a vendor chunk kept its hash

*Filed and closed 2026-10-01*, from the first run of the daily error read.

`errors:resolve` stopped at the newest build whose output contained the report's **first** frame's
chunk. A vendor chunk (Sortable, Preact) keeps its content hash across builds, so for the Merge crash
it named `81cdd1e2`, which already contains DEBT-30's fix, while the report's own Merge chunk
(`PdfMergeTool.C4ILDZF-.js`) was not in that build. The source lines came out right only because
Merge's code had not changed in between; after any change to the app's own code it would have mapped
frames onto the wrong source.

## Fix

A build is the report's build only if it emitted **every** frame's chunk (`matchChunks`, with unit
tests including the shared-vendor-chunk case). A build with some of them is logged as `partial`, and
if none has all, the failure message names the nearest build and the chunks it lacks.

## Evidence

The real Merge crash, rerun: `81cdd1e2`, `6a9e8bc6`, `10b3cf24` and `3173680e` come out `partial`
(Merge's chunk is missing), and `6ea78cf2`, the commit before the fix, is the hit; line
`PdfMergeTool.tsx:489` reads `sortableRef.current?.destroy();`, the pre-fix code. That settles that
the crash came from a tab still running the old build, which the daily read could only guess. The
walk reports the newest build with identical output, so any older commit with the same chunks is
equally the report's build.

## Acceptance

- [x] A build matches only when every frame's chunk exists in it, with a test for the shared-chunk case.
- [x] The failure message says which chunks were missing and the nearest build.
- [x] The 2026-10-01 Merge crash resolves to the pre-fix build.
