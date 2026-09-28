# RED-18: calibrating the four checks on RED-01's known outputs

`spikes/red-18/checks.mjs` was run over `spikes/red-01/out/ours` and `spikes/red-01/out/pdfium`
against `spikes/red-01/corpus/corpus.json` (the calibration this spike asked for), and separately
over the new watermark corpus (`spikes/red-18/corpus/`) with the *original* file passed as its own
"output" (a no-op run, useful only to confirm the checker reports the correct pre-redaction baseline
per page - see "Baseline self-check" below).

**Bottom line, plainly:** the checks reproduce every failure `results-summary.md` names, wherever
that failure lives in the two dimensions RED-01's own checker could see (position-aware text
extraction, annotation `/Contents`). They also reproduce two of RED-01's own already-documented
*caveats* almost exactly (`mid-run-tj-kerned.pdf`, `mid-run-hebrew.pdf`, both below). On top of that,
the bytes check (a dimension RED-01 never had) turns up real, independently-verified leaks on files
RED-01 marked PASS, and the text check (exhaustive word multiset vs. one spot-checked string) turns
up real collateral deletions RED-01's narrower check couldn't see. One check (pixels) could not be
run at all: no `canvas` package is installed in this checkout, matching RED-01's own note in
`results-summary.md` that it hit the same wall. Every "doesn't match RED-01" case below was traced to
ground truth (the actual bytes/text in the actual output file), not asserted from the table alone.

## What's measured vs. what's inferred

- **Measured:** every PASS/FAIL cell in the two calibration tables below, and every "new finding" -
  each one was re-verified by directly reading the output PDF's decoded text/bytes (shown inline),
  not just trusted from the checker's own verdict.
- **Inferred:** the *root cause* inside each engine (e.g. "ours" deletes by object, not by exact
  glyph range) is inferred from the pattern of results, the way RED-01's own results-summary.md does
  it - this spike doesn't have the engines' source open.
- **Not measured at all:** pixels (check 1). No `canvas` package is installed; see below.

## Design decisions this calibration forced

**Check 1 (pixels) is skipped, with a message, not a new dependency.** `spikes/red-01`'s own two
checkers (`check-extractable.mjs`, `check-images.mjs`) never rasterize a page either - both work from
`pdfjs-dist`'s text/operator-list APIs, and `results-summary.md`'s own closing note says exactly why:
"this checkout's `node_modules` has no `canvas` package, and pdfjs-dist's legacy Node build needs one
to rasterize." `node_modules` in this worktree still has no `canvas` package. `checks.mjs` tries
`import('canvas')` once, and if that fails it prints the reason and marks every pixel-check cell
`SKIP` rather than adding the dependency. The rendering code (`NodeCanvasFactory`, `page.render()`,
paint-boxes-black, outside-box diff) is written and would run if `canvas` were ever added - it just
never executes in this checkout.

**Check 2 (text) uses the corpus's own `secret`/`secrets` field to decide "words under the box,"
not box geometry.** The brief's wording ("words under a box") suggested computing that set
geometrically, the way `spikes/red-01/check-extractable.mjs` does for its own, narrower checks. A
first version of `checks.mjs` did exactly that: it took every original pdf.js text item whose bbox
touched the box, then prorated each word's position within that item **by character count** (pdf.js's
`getTextContent()` gives one bbox per item, not per character) to decide which specific words fell
inside vs. outside. That approximation was wrong often enough to matter: proportional fonts don't
have equal-width characters, so a box built from true glyph metrics (`font.widthOfTextAtSize`, as both
corpora's generators use) can land a few percent off from a character-count estimate right at a word
boundary. It both invented false "leaks" and flagged correct survivors as unexpected "extras" on
exactly the family of fixtures (`mid-run-*`, `partial-overlap-word.pdf`, `two-boxes-one-line.pdf`)
that exist specifically to exercise sub-Tj precision - i.e. it was re-deriving, approximately, the
exact hard problem `src/editor/adapters/pdf/pageGlyphs.ts` exists to solve correctly. Since every
corpus entry already declares its own box's exact secret, `checks.mjs` instead tokenizes
`secret`/`secrets` directly as the "removed" set. This is corpus ground truth, not box geometry, and
it's why check 2 can disagree with `results-summary.md` in *either* direction - see "New findings"
below, several of which are places the exhaustive word check catches something RED-01's own
single-`keepText`-string check couldn't.

**Check 3 (bytes) needed two structural fixes to stop reporting false leaks.** Both fixes are already
in `checks.mjs`, with comments at the point they matter:
- pdf-lib's loader keeps a document's `/ObjStm` (compressed object-stream container) and `/XRef`
  stream as their own raw indirect objects even though it also decomposes their contents into
  separate, individually-tracked objects. Neither is ever pointed to by a normal object reference
  (only by the file's byte-offset xref table), so both always look "unreachable from the trailer" by
  plain ref-graph traversal - and an `/ObjStm`'s raw (still-compressed-together) bytes legitimately
  contain whatever secret text its member objects hold, producing a false "orphan leak" the moment any
  entry's secret happens to live inside one. `checks.mjs` now skips any raw stream whose own `/Type`
  is `/ObjStm` or `/XRef` in the byte scan (their member objects are already covered individually).
- **A real pdf.js gotcha, not a pdf-lib one:** an image XObject painted from the *same* underlying
  object on more than one page (the whole point of `shared-header-image-*.pdf`) gets a `"g_"`-prefixed
  id from pdf.js and is decoded into the document-wide `page.commonObjs` cache, not the page-local
  `page.objs` used for a locally-painted image. Asking `page.objs` for a `"g_"` id never errors and
  never calls back - the `Promise` just hangs forever, and Node exits normally once nothing else is
  pending (a bare pending `Promise` doesn't keep the event loop alive), so `checks.mjs` silently
  produced no output at all until this was traced down. Fixed by branching on the `"g_"` prefix.

## Calibration: `spikes/red-01/out/ours` (whole-object delete)

| file | `results-summary.md` verdict | checks.mjs (text / bytes / annotations) | agreement |
| --- | --- | --- | --- |
| plain-helvetica-line.pdf | PASS | PASS / **FAIL** / PASS | text matches; bytes is a new finding (below) |
| partial-overlap-word.pdf | PASS | **FAIL** / **FAIL** / PASS | text is a new finding (below); bytes new finding |
| tj-array-kerning.pdf | PASS | PASS / PASS / PASS | matches |
| embedded-subset-truetype-latin.pdf | PASS | PASS / PASS / PASS | matches |
| hebrew-rtl-line.pdf | PASS | PASS / PASS / PASS | matches |
| form-xobject-text.pdf | FAIL (secret still extractable) | **FAIL** / **FAIL** / PASS | matches |
| rotated-ctm-text.pdf | PASS | PASS / **FAIL** / PASS | text matches; bytes new finding |
| page-rotate-90.pdf | PASS | PASS / **FAIL** / PASS | text matches; bytes new finding |
| raster-image-partial.pdf | FAIL (pixels, not text) | PASS / **FAIL** / PASS | text matches (RED-01's own FAIL reason was pixel-only for `ours`); bytes new finding; pixels unmeasured |
| raster-image-full.pdf | PASS | PASS / **FAIL** / PASS | text matches; bytes new finding |
| vector-path-highlight.pdf | PASS | PASS / **FAIL** / PASS | text matches; bytes new finding |
| freetext-annotation.pdf | FAIL (secret in annotation) | PASS / PASS / **FAIL** | matches (same failure, correct check now flags it) |
| paragraph-line2-only.pdf | PASS | PASS / **FAIL** / PASS | text matches; bytes new finding |
| real-world-irs-1040-2024.pdf | FAIL (keepText removed too) | **FAIL** / PASS / PASS | matches |
| real-world-uscis-i9-2025.pdf | PASS | **FAIL** / **FAIL** / PASS | text is a new finding (below); bytes new finding |
| real-world-health-declaration-2021.pdf | PASS | PASS / PASS / PASS | matches |
| mid-run-helvetica.pdf | FAIL (whole Tj deleted) | **FAIL** / **FAIL** / PASS | matches; bytes adds a new finding |
| mid-run-tj-kerned.pdf | FAIL (same) | **FAIL** / PASS / PASS | matches |
| mid-run-embedded.pdf | FAIL (same) | **FAIL** / PASS / PASS | matches |
| mid-run-hebrew.pdf | FAIL (whole Tj deleted) | **FAIL** / PASS / PASS | matches |
| two-boxes-one-line.pdf | FAIL (whole Tj deleted) | **FAIL** / **FAIL** / PASS | matches; bytes adds a new finding |

8 of 25 page-rows (`ours` has one 2-page and one 4-page real-world entry) pass every applicable check.
Every **FAIL** that `results-summary.md` lists is reproduced. Nothing `results-summary.md` calls a
plain PASS is contradicted at the *same* check dimension RED-01 measured - the extra FAILs above are
all on a dimension (bytes) or a scope (whole-page word coverage vs. one string) RED-01's own checker
didn't cover, not disagreements about the same measurement.

## Calibration: `spikes/red-01/out/pdfium` (glyph-level rebuild)

| file | `results-summary.md` verdict | checks.mjs (text / bytes / annotations) | agreement |
| --- | --- | --- | --- |
| plain-helvetica-line.pdf | PASS | PASS / PASS / PASS | matches |
| partial-overlap-word.pdf | PASS | PASS / PASS / PASS | matches |
| tj-array-kerning.pdf | PASS | PASS / PASS / PASS | matches |
| embedded-subset-truetype-latin.pdf | PASS | PASS / PASS / PASS | matches |
| hebrew-rtl-line.pdf | PASS | PASS / PASS / PASS | matches |
| form-xobject-text.pdf | FAIL | **FAIL** / **FAIL** / PASS | matches |
| rotated-ctm-text.pdf | PASS | PASS / PASS / PASS | matches |
| page-rotate-90.pdf | PASS | PASS / PASS / PASS | matches |
| raster-image-partial.pdf | FAIL (caption leaks "SECRET") | **FAIL** ("text extras: SECRET") / **FAIL** / PASS | matches exactly, including the specific leaked fragment |
| raster-image-full.pdf | PASS | PASS / PASS / PASS | matches - and see "ours vs pdfium" note below |
| vector-path-highlight.pdf | PASS | PASS / PASS / PASS | matches |
| freetext-annotation.pdf | FAIL | PASS / PASS / **FAIL** | matches |
| paragraph-line2-only.pdf | PASS | PASS / PASS / PASS | matches |
| real-world-irs-1040-2024.pdf | PASS | PASS / PASS / PASS | matches |
| real-world-uscis-i9-2025.pdf | PASS | **FAIL** / **FAIL** / PASS | text is a new finding (below) |
| real-world-health-declaration-2021.pdf | PASS | PASS / PASS / PASS | matches |
| mid-run-helvetica.pdf | PASS | PASS / PASS / PASS | matches |
| mid-run-tj-kerned.pdf | PASS (with a documented caveat) | **FAIL** ("missing: Exampl", "extras: Example") / PASS / PASS | matches the caveat exactly (below) |
| mid-run-embedded.pdf | PASS | PASS / PASS / PASS | matches |
| mid-run-hebrew.pdf | FAIL (documented Hebrew reordering) | **FAIL** (same two garbled words) / PASS / PASS | matches exactly (below) |
| two-boxes-one-line.pdf | PASS | **FAIL** ("extras: 0") / PASS / PASS | minor artifact, not the embedpdf #801 class RED-01 tested for - see below |

18 of 25 page-rows pass every applicable check. Every FAIL `results-summary.md` lists is reproduced,
including the exact leaked fragment on `raster-image-partial.pdf` and the exact garbled words on
`mid-run-hebrew.pdf`.

## New findings (bytes and text catch things RED-01's checker structurally could not)

**"ours" leaves the pre-redaction content stream sitting in the file, unreferenced.**
`plain-helvetica-line.pdf`'s output has two content-stream objects: `6 0 R` (the page's `/Contents`
before this spike ever touched it - still has the full hex-encoded `PLAIN-SECRET-1234`) and `9 0 R`
(the actual current `/Contents`, redacted). `6 0 R` is reachable from nothing - not the page tree, not
any resource dict. Decompressing every stream and checking reachability is exactly what RED-01's own
checker never did (it only ever asked pdf.js what the *current* page renders/extracts), so this never
showed up in `results-summary.md`. Same pattern on `rotated-ctm-text.pdf`, `page-rotate-90.pdf`,
`raster-image-full.pdf`, `raster-image-partial.pdf`, `vector-path-highlight.pdf`,
`paragraph-line2-only.pdf`, `mid-run-helvetica.pdf`, `two-boxes-one-line.pdf`, and (two orphaned
objects) `real-world-uscis-i9-2025.pdf`.

**"ours" leaves the full, un-redacted image reachable from the redacted page's own Resources dict.**
`raster-image-full.pdf` was RED-01's own example of a clean image redaction ("whole image object
removed"). Reading the actual output: the `/Do` call painting the image is gone from the content
stream, but the page's `/Resources /XObject` dictionary still has an entry (`/Image-9742682568` →
`7 0 R`), and `7 0 R` still holds the complete original pixel data (the red "secret" and blue "keep"
checker pattern, unredacted). Nothing paints it, so pdf.js's rendered/text output looks clean - but a
tool that lists a page's own resources (not just what's painted) recovers the original image in full.
This is not an orphan (it's reachable from the very page that was redacted), so it's a stronger finding
than the orphan cases above: the leak is one API call away, not buried in an unreferenced object.
Notably, pdfium's own `raster-image-full.pdf` output has **no** bytes-check failure at all - its
image-object handling doesn't leave this leftover, a real difference between the two engines that
`results-summary.md` couldn't show because both engines got the same PASS from a checker that only
looks at what's painted.

**"ours" deletes collateral content beyond the box in two different, verified ways.**
`partial-overlap-word.pdf`'s three separate `drawText` calls ("Account: ", "ACC-99887766", "
(checking)") get merged by pdf.js's own `getTextContent()` into one item, "Account: ACC-99887766
(checking)" - confirmed by reading the corpus file directly. `ours`'s output for this page is just
`["[keep-marker] the prefix/suffix on this line must survive"]`: the whole merged item, prefix and
suffix included, is gone. RED-01's own checker never caught this because its `keepText` for this entry
is a *different* line - it never checked "Account:"/"(checking)" survival at all.
`real-world-uscis-i9-2025.pdf` shows the same class of bug on a real form: the standalone "USCIS" item
(the actual target) is gone as expected, but the adjacent, separate item "Form I-9" is also gone,
confirmed by diffing the original and output text content directly.

**pdfium may also delete unrelated content elsewhere on a dense real-world page.**
`real-world-uscis-i9-2025.pdf`'s output is missing an entire sentence that has nothing to do with the
"USCIS" box: "Treating employees differently based on their citizenship, immigration status, or
national origin may be illegal." is present, verbatim, in the original page 1, and is not present
anywhere in pdfium's output page 1 (confirmed by reading both directly - the same paragraph's spot in
the output has a *different*, shorter sentence: "For reverification or rehire, complete Supplement B,
Reverification and Rehire on Page 4."). The word-count deltas between original and output concentrate
almost entirely in that missing sentence's vocabulary (`and` -1, `or` -1, `on` -1, `be` -1, plus every
content word from the sentence at exactly -1), which is why this reads as one deleted sentence rather
than scattered noise. This spike doesn't have pdfium's engine source open, so *why* is not established
here - only that the sentence is gone and RED-01's own single-`keepText`-string check (a different,
unaffected sentence on the same page) had no way to see it.

## Known RED-01 caveats, reproduced rather than contradicted

- **`mid-run-tj-kerned.pdf`:** `results-summary.md` already documents that pdf.js's own
  `getTextContent()` drops the trailing "e" of "Example" when reading the *original*, hand-built
  interleaved-kerning `TJ` array (a pdf.js quirk, not a redaction artifact), and separately notes that
  pdfium's rebuilt output reads back "cleaner than the original" (a full, correctly-spelled
  "Example"). `checks.mjs`'s exact multiset check reports this literally: `missing: Exampl` (the
  corpus-ground-truth expectation inherits the original's own truncated extraction) and
  `extras: Example` (the output is, if anything, more correct). Same underlying fact, stricter
  reporting.
- **`mid-run-hebrew.pdf`:** `results-summary.md` documents pdfium's surviving RTL runs coming back
  "logically (unreversed)" and missing 1-2 boundary characters, with the specific example
  `"טסקטדוע"`/`"טקסטשנש"` in place of the expected `"טסקטדוע"`/`"ראשנשטסקט"`. `checks.mjs` reports the
  identical missing/extra pair independently.

## Not a match: things that needed tracing, and what they turned out to be

- **`two-boxes-one-line.pdf` / pdfium: "text extras: 0".** A single stray `"0"` token appears in
  pdfium's output that isn't in the expected set. `SSN:`, `DL:`, both secrets removed, and the
  separate keepText line all check out - this is a one-character rendering/tokenization artifact in
  pdfium's rebuilt `TJ` array, not the embedpdf #801-class corruption RED-01 was testing for
  (clearing one secret corrupting the read of the other). Flagged here rather than filtered out of the
  report.
- **Dense real-world pages make raw word-count deltas noisy to read at a glance** (see
  `real-world-uscis-i9-2025.pdf`'s pdfium diff above, which needed a side-by-side item dump to
  distinguish "a whole sentence moved/changed" from "scattered off-by-one noise"). The checker's
  `missing`/`extras` output is exact and correct; interpreting *why* a large real-world page's counts
  moved took the extra step of reading the actual items, which is reflected in this document rather
  than asserted from the table.

## Baseline self-check (RED-18's own watermark corpus, unredacted)

`checks.mjs` was also run with each new corpus file as both "original" and "output" (i.e. nothing
redacted) to confirm the checker reports the expected *pre-redaction* shape before it's ever pointed
at a real engine: `16 of 21` page-rows pass. The 5 that fail are exactly the 5 box-page rows (one per
file - `shared-header-image-full.pdf`, `shared-header-image-half.pdf`, `text-watermark-form.pdf`,
`watermark-annotation.pdf`, `diagonal-behind-text.pdf`, each page 1), each correctly failing text
and/or bytes and/or annotations because nothing has actually been redacted yet, while every other page
of each 5-page fixture (2-5, sharing the same object untouched) correctly passes. Full command:

```
node spikes/red-18/checks.mjs spikes/red-18/corpus spikes/red-18/corpus spikes/red-18/corpus/corpus.json
```

The supplementary per-page image-color-pixel counts (not one of the 4 required checks; see
`checks.mjs`'s `checkImageAssertions`) confirm the corpus's own construction: `shared-header-image-
full.pdf` page 1 has both colors fully present pre-redaction (1200 secret-color px, 2400 keep-color
px) with `shared-header-image-half.pdf` identical (same file, different box), and both files' pages
2-5 (the untouched, shared copies of the same image object) match. `diagonal-behind-text.pdf` page 1
has 9600 secret-color pixels pre-removal.

## Reproducing this calibration

```
node spikes/red-18/checks.mjs spikes/red-01/corpus spikes/red-01/out/ours   spikes/red-01/corpus/corpus.json
node spikes/red-18/checks.mjs spikes/red-01/corpus spikes/red-01/out/pdfium spikes/red-01/corpus/corpus.json
```
