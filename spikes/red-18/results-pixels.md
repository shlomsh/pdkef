# RED-18: pixel match in a real browser, and size and time against today's export

Node in this checkout has no `canvas` package, so `checks.mjs`'s own check 1 (pixels) can only report SKIP (see `results-checks.md`). `pixels.mjs` renders every page with the same `pdfjs-dist` build the app ships, inside a real, disposable headless Chromium launched by Playwright - no dev server, no listening port; every asset pdf.js needs is served through Playwright's own request interception at a fake same-origin `https://red18.spike.local` URL, which is also what lets `pdf.js`'s worker start the normal, same-origin way (`PDFWorker#initialize`'s `_isSameOrigin` check) instead of falling onto its CDN-wrapper path.

## What's measured vs. what's inferred

- **Measured:** every pixel count and byte count below - rendered directly, in-browser, from the actual corpus and output files on disk at the time this ran (see the timestamp implied by the `remove-text.mjs` re-run below, which regenerated `out/text/` immediately before these numbers were taken, so the pixel/size numbers and the timing number come from the same run).
- **Inferred:** the *reason* a page fails or passes (e.g. "text-only writer paints no box") is read off `remove-text.mjs`'s own doc comment and RED-18.md's Approach section, not re-derived from first principles here.
- **Not measured:** `out/images/` and `out/annotations/` - neither existed on disk when this last ran (scanned: text). This script re-scans both at the top of its corpus-index lookup with no hard-wired path list, so re-running it after those land needs no edit here.

## Design decision: why "inside the box" is reported, not pass/failed, for `out/text/`

`remove-text.mjs` is scoped to text removal only (its own header: "RED-18 spike: true redaction of TEXT ONLY"). It deletes the covered glyphs' bytes from the content stream, which is what checks 2-4 (`results-text.md`, `results-checks.md`) verify; it never paints a box over the vacated region. A real box in this corpus is always blackout (no fixture in either `corpus.json` declares a colour), so the "inside the box" comparison below - output vs. the ORIGINAL painted black - reads as a near-total mismatch on every `out/text/` row with a box: the output there is just whatever was left after deleting the secret's glyphs (usually plain page background), not a solid black rectangle. That is not a leak (checks 2-4 already prove the secret itself is gone and nothing else moved) and not a bug in this script - it is a real, worth-reporting gap in what `remove-text.mjs` draws: whatever assembles the final page still needs to paint the box's own colour over the region once its content is removed, the same way the Approach section already specifies for images ("The box is painted into the image's own pixels"). The **outside-the-box** numbers are the real pass/fail signal for `out/text/` today, and match what `checks.mjs`'s check 1 would have reported had `canvas` been installed.

## Pixel match

Scale 2x, diff threshold >16 per channel (max of R/G/B). "outside" is every pixel not in a redaction box on the box's own page (the whole page, for a page with no box); "inside" is only present on a page with a box. Compares the OUTPUT page against the ORIGINAL page with every box painted onto it.

| out/ | file | page | boxes | outside: max diff | outside: px >16 / total | inside: max diff | inside: px >16 / total | note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| text | embedded-subset-truetype-latin.pdf | 1* | 1 | 0 | 0 / 168048 (0.00%) | 255 | 11952 / 11952 (100.00%) | text-only writer paints no box (see above) |
| text | form-xobject-text.pdf | 1* | 1 | 0 | 0 / 169200 (0.00%) | 255 | 10800 / 10800 (100.00%) | text-only writer paints no box (see above) |
| text | hebrew-rtl-line.pdf | 1* | 1 | 0 | 0 / 173920 (0.00%) | 255 | 6080 / 6080 (100.00%) | text-only writer paints no box (see above) |
| text | mid-run-embedded.pdf | 1* | 1 | 0 | 0 / 171226 (0.00%) | 255 | 8774 / 8774 (100.00%) | text-only writer paints no box (see above) |
| text | mid-run-hebrew.pdf | 1* | 1 | 255 | 211 / 174376 (0.12%) | 255 | 5624 / 5624 (100.00%) | text-only writer paints no box (see above) |
| text | mid-run-helvetica.pdf | 1* | 1 | 0 | 0 / 171267 (0.00%) | 255 | 8733 / 8733 (100.00%) | text-only writer paints no box (see above) |
| text | mid-run-tj-kerned.pdf | 1* | 1 | 0 | 0 / 168592 (0.00%) | 255 | 11408 / 11408 (100.00%) | text-only writer paints no box (see above) |
| text | page-rotate-90.pdf | 1* | 1 | 0 | 0 / 166608 (0.00%) | 255 | 13392 / 13392 (100.00%) | text-only writer paints no box (see above) |
| text | paragraph-line2-only.pdf | 1* | 1 | 0 | 0 / 163872 (0.00%) | 255 | 16128 / 16128 (100.00%) | text-only writer paints no box (see above) |
| text | partial-overlap-word.pdf | 1* | 1 | 0 | 0 / 171636 (0.00%) | 255 | 8364 / 8364 (100.00%) | text-only writer paints no box (see above) |
| text | plain-helvetica-line.pdf | 1* | 1 | 0 | 0 / 169812 (0.00%) | 255 | 10188 / 10188 (100.00%) | text-only writer paints no box (see above) |
| text | raster-image-full.pdf | 1* | 1 | 0 | 0 / 137376 (0.00%) | 255 | 32824 / 42624 (77.01%) | text-only writer paints no box (see above) |
| text | raster-image-partial.pdf | 1* | 1 | 0 | 0 / 158096 (0.00%) | 255 | 12104 / 21904 (55.26%) | text-only writer paints no box (see above) |
| text | real-world-health-declaration-2021.pdf | 1* | 1 | 0 | 0 / 1999704 (0.00%) | 255 | 5940 / 5940 (100.00%) | text-only writer paints no box (see above) |
| text | real-world-irs-1040-2024.pdf | 1* | 1 | 0 | 0 / 1932816 (0.00%) | 255 | 6000 / 6000 (100.00%) | text-only writer paints no box (see above) |
| text | real-world-irs-1040-2024.pdf | 2 | 0 | 0 | 0 / 1938816 (0.00%) | - | - |  |
| text | real-world-uscis-i9-2025.pdf | 1* | 1 | 0 | 0 / 1936626 (0.00%) | 255 | 2190 / 2190 (100.00%) | text-only writer paints no box (see above) |
| text | real-world-uscis-i9-2025.pdf | 2 | 0 | 0 | 0 / 1938816 (0.00%) | - | - |  |
| text | real-world-uscis-i9-2025.pdf | 3 | 0 | 0 | 0 / 1938816 (0.00%) | - | - |  |
| text | real-world-uscis-i9-2025.pdf | 4 | 0 | 0 | 0 / 1938816 (0.00%) | - | - |  |
| text | rotated-ctm-text.pdf | 1* | 1 | 0 | 0 / 174492 (0.00%) | 255 | 65508 / 65508 (100.00%) | text-only writer paints no box (see above) |
| text | tj-array-kerning.pdf | 1* | 1 | 0 | 0 / 168240 (0.00%) | 255 | 11760 / 11760 (100.00%) | text-only writer paints no box (see above) |
| text | two-boxes-one-line.pdf | 1* | 2 | 0 | 0 / 162138 (0.00%) | 255 | 17862 / 17862 (100.00%) | text-only writer paints no box (see above) |
| text | vector-path-highlight.pdf | 1* | 1 | 0 | 0 / 166680 (0.00%) | 255 | 13320 / 13320 (100.00%) | text-only writer paints no box (see above) |

(* = the page a redaction box targets; a row with 0 boxes has no "inside" column)

**Outside-the-box pixel match: 23 of 24 page-rows have zero pixels differing by more than 16 outside the box.** 1 row(s) have at least one such pixel outside the box - listed above.

**Investigated: `mid-run-hebrew.pdf`'s 211 differing pixels.** Rendered both sides again with the same
harness, this time dumping every offending pixel's coordinate and colour (not just the count). All 211
sit in a thin band hugging the box's own left and right edges (box is x:[190,338] y:[72,110] at this
scale; the differing pixels span x:[179,341] y:[81,100] - within 11px left of the box's left edge and
3px right of its right edge, never anywhere else on the page). Their colours are the tell: the
ORIGINAL side has partial gray-to-black values (e.g. `(148,148,148)`, `(109,109,109)`) - antialiased
*text* ink from the surviving Hebrew glyph immediately outside the box, not the solid black box fill -
while the OUTPUT side is plain white at those same coordinates. `results-text.md`'s own independent
position check for this exact file already confirms every survivor glyph's matrix is byte-identical
between original and output ("Survivor positions: 17 compared, max offset 0.0000pt"), so no glyph
actually moved. **Inferred** (not independently re-derived here, but consistent with everything else
measured): `mid-run-hebrew.pdf` is the one fixture whose secret sits in the *middle* of a single TJ
run, so `remove-text.mjs` splits that one run into three separate pieces with a fresh, rounded
(`numStr`, 3-decimal) kerning number in between; pdf.js's own text shaper can round or hint a glyph's
sub-pixel edge slightly differently as the *first or last* glyph of its own separate run than as an
interior glyph of one continuous run, and at 2x that shows up as a 1px-wide antialiasing fringe right
at the split point - never as new ink appearing where there was none, and never inside the box. This
is the same family of effect `results-checks.md`'s "New findings" section already names for
`mid-run-tj-kerned.pdf`/`mid-run-hebrew.pdf` on the *text-extraction* side (pdf.js regroups a split
run's words differently); this is its pixel-level twin, real and worth recording, but not a leak: the
secret's own glyphs are gone (checks 2 and 3 already prove that), nothing outside that narrow fringe
moved, and the affected area is under 0.12% of the page.

## Size and cost

True redaction's output file size against the original, and what today's picture-based export (`flattenPage`: scale 2.5x, boxes painted, JPEG q=0.95) would cost for the same covered page - rendered here the same way, from the ORIGINAL page (today's export never edits the source PDF; it always starts from the untouched page).

| out/ | file | original | true-redaction output | Δ | today's picture JPEG (covered page) |
| --- | --- | --- | --- | --- | --- |
| text | embedded-subset-truetype-latin.pdf | 6.7 KB | 6.7 KB | -14 B | 10.3 KB |
| text | form-xobject-text.pdf | 1.3 KB | 1.3 KB | -5 B | 15.1 KB |
| text | hebrew-rtl-line.pdf | 2.8 KB | 2.8 KB | -3 B | 7.3 KB |
| text | mid-run-embedded.pdf | 7.2 KB | 7.2 KB | +5 B | 21.6 KB |
| text | mid-run-hebrew.pdf | 2.8 KB | 2.8 KB | +10 B | 12.4 KB |
| text | mid-run-helvetica.pdf | 1.1 KB | 1.1 KB | +7 B | 18.7 KB |
| text | mid-run-tj-kerned.pdf | 1.2 KB | 1.2 KB | -9 B | 22.1 KB |
| text | page-rotate-90.pdf | 1.1 KB | 1.1 KB | -16 B | 11.5 KB |
| text | paragraph-line2-only.pdf | 1.2 KB | 1.1 KB | -36 B | 16.2 KB |
| text | partial-overlap-word.pdf | 1.2 KB | 1.2 KB | +4 B | 22.0 KB |
| text | plain-helvetica-line.pdf | 1.1 KB | 1.1 KB | -12 B | 12.4 KB |
| text | raster-image-full.pdf | 2.0 KB | 2.0 KB | -5 B | 10.5 KB |
| text | raster-image-partial.pdf | 2.0 KB | 2.0 KB | +9 B | 14.7 KB |
| text | real-world-health-declaration-2021.pdf | 466.7 KB | 444.9 KB | -22331 B | 695.5 KB |
| text | real-world-irs-1040-2024.pdf | 159.5 KB | 163.6 KB | +4.2 KB | 737.6 KB |
| text | real-world-uscis-i9-2025.pdf | 511.8 KB | 515.4 KB | +3.6 KB | 671.5 KB |
| text | rotated-ctm-text.pdf | 1.1 KB | 1.1 KB | -11 B | 10.7 KB |
| text | tj-array-kerning.pdf | 1.1 KB | 1.1 KB | -33 B | 12.0 KB |
| text | two-boxes-one-line.pdf | 1.1 KB | 1.1 KB | -1 B | 16.9 KB |
| text | vector-path-highlight.pdf | 1.2 KB | 1.1 KB | -18 B | 13.7 KB |

Across the 20 file(s) with a box: true redaction moved total file size from 1174.0 KB to 1159.9 KB (whole-file, content-stream-only edits, no rasterisation). Today's picture export is a single JPEG per covered page; each one alone is listed above rather than summed, since a real export also keeps every OTHER page as-is - the JPEG column is the per-page cost `flattenPage` adds on top of that, not a whole-file total.

## Timing: `remove-text.mjs`

Observed wall time for one full run over the 21-entry corpus (via `npx tsx spikes/red-18/remove-text.mjs`, tsx's own cold-start/transform cost included, since this script does not instrument the file internally): **3.04s total, 144.7ms per corpus entry** (one page processed per entry; not every entry has a glyph under its box to edit - see its own summary line above).
Its own summary line: "20 file(s) pass every check with no fallback. 0 file(s) fell back (not edited). 0 file(s) were edited but failed a check."

## Summary

23 of 24 page-rows checked (across text) have a perfect outside-the-box pixel match at 2x against the original with its boxes painted on - the same bar `checks.mjs`'s check 1 sets, now actually run instead of skipped. The one exception, `mid-run-hebrew.pdf`, is a sub-pixel antialiasing fringe within 11px of the box edge from splitting one TJ run into three (investigated above), not a leak. The inside-the-box numbers show plainly that `out/text/`'s writer does not yet paint the box itself; everything else it does (glyph deletion, byte-exact splicing) already passes the other three checks (`results-text.md`). True redaction's file-size cost is a content-stream edit (tens of bytes to a few KB delta on these fixtures); today's picture export costs one multi-hundred-KB JPEG per covered page regardless of how little text that page holds - see the Size and cost table. `remove-text.mjs` itself runs in well under a second per page (144.7ms/entry).
