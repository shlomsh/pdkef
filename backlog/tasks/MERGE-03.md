---
id: "MERGE-03"
title: "Download replaces Merge in place, named after the first file, with pages and size"
status: "done"
priority: "P1"
epic: "merge-tool"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MERGE-03 · Download replaces Merge in place, named after the first file, with pages and size

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

Three things about the done state, all visible on the deployed page after any merge:

1. **A dead button stays on screen.** After Merge completes, the `Merge 4 PDFs` button remains, greyed
   (`is-done`), and a second full-width `Download PDF` appears under it. Two stacked primaries, one of
   them disabled. Compress solved this on 2026-09-12 (SEO-25, "the button is the anchor"): the action
   button becomes the Download link in place, with the result on a second, smaller line, so nothing
   above it moves. Merge adopts the same `DownloadButton` `detail` prop.
2. **The output is always `merged.pdf`.** The second merge of the day lands as `merged (1).pdf`. Name
   the output after the first file in the final order: `Invoice 2024-03-01 + 3 more.pdf` (the exact
   pattern is a localized string in `toolMessages.ts`, so the Hebrew edition can phrase it its own
   way). Set the PDF `Title` to the same name in `mergePdfs`.
3. **Pages appear nowhere.** The identity row says `4 PDFs · 22 KB`. The Download detail line says
   `18 pages · 2.1 MB`, and the identity row gains the total page count once MERGE-07 supplies it.

**Acceptance.**

- After a merge there is exactly one primary control, and it is the Download link; its second line is
  the real page count and size of the produced blob. Share stays the secondary control where
  `navigator.share` supports files.
- Output filename and PDF Title follow the first file; a second merge does not collide.
- `e2e/merge/merge-layout.spec.js` asserts the single-button done state; unit tests cover the naming.
- `npm run build && npm run preview` checked once for CSP, as with every button change.

## Updates

- 2026-09-13: Download is the only primary control and becomes the link in place, with the real
  page count and size of the produced blob on its second line (`DownloadButton`'s `detail`); Share
  stays beside it where `navigator.share` supports files. Output is `<first file base name> + N
  more.pdf` from the `outputName` template in `toolMessages.ts`, and the PDF Title matches
  (`mergedTitle`, `merged.setTitle`). The identity row reads `4 PDFs · 18 pages · 22 KB`. Naming is
  unit-tested in `mergePlan.test.ts` and `merge.test.js`; the single-button done state is guarded in
  `e2e/merge/merge-layout.spec.js`; build and preview checked for CSP. Done.
- 2026-09-13, later: the output is `merged_<first file name>.pdf` (Title `merged_<first base
  name>`), on Shlomi's review of the dev build: every other tool marks its output with the tool's
  name on the source file's name (`signed_`, `redacted_`, `-compressed`), and `<first> + N more`
  broke that shape. The `outputName` template stays localized, with `{count}` available to a locale
  that wants it; the Hebrew edition keeps the Latin `merged_` as Sign keeps `signed_`.
- Direction A (2026-09-13): Download is one element in four states at the same size and place: one file ("Add one more PDF to merge" with a real Choose files, never a disabled button), preparing ("Preparing 18 pages…" with render progress and aria-busy; a tap queues the download), ready (full-white "18 pages · 8.8 KB", the check drawn once on the first ready, never replayed), saved (success tint, "download again", the install line once). The same DOM node across states; a Playwright guard asserts it.
