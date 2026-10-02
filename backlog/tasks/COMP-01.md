---
id: "COMP-01"
title: "Compress keeps the page and shrinks only its images, and says plainly when there is nothing to gain"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 1
depends_on: []
---

# COMP-01 · Compress keeps the page, shrinks only its images, and is honest when it can't help

*Filed 2026-10-02.* Shlomi ran an 11 KB signed form through https://pdkef.com/compress/ and got a
bigger, blurrier file at every level, under a "PDF Successfully Compressed!" title.

## What happened (measured on the live site, 2026-10-02)

`compressPdf` in `src/tools/compress/compress.js` has one code path: render every page to a canvas,
save it as a JPEG, build a new PDF from those pictures. Every level and Target Size do this.

| | Page | Contents | Bytes |
| --- | --- | --- | --- |
| Original | 400×420 pt | vector text, a 3 KB handwriting font subset, form XObjects, no images | 11,050 |
| Extreme | 400×420 pt | one 400×420 JPEG, 72 DPI, q 0.4 | 13,797 |
| Recommended | 400×420 pt | one 600×630 JPEG, 108 DPI, q 0.6 | 30,390 |
| High Quality | 400×420 pt | one 800×840 JPEG, 144 DPI, q 0.8 | 54,698 |

A PDF's size is nearly always its images. Text, vectors and fonts are small and already Flate
compressed. Rasterising replaces the small, sharp part with the large, lossy kind, so a text PDF comes
out bigger or blurry, usually both; a mixed document pays with blurry text to shrink its images; only a
scan, which already is a picture, gets smaller without losing anything it had. On top of that nothing
compared the output with the input: the card fell back to "No size reduction", kept the success title,
and offered the bigger file as "Download Compressed PDF". The level cards promise "60-80% reduction"
and "150 DPI" as fixed text; the code uses 144 DPI and the ranges are not measured against anything.

A minimum-gain threshold was weighed and rejected: it only picks an arbitrary point at which to hand
someone a blurry, text-less file and still call it "Recommended".

## Decision

Compress keeps the page as it is and recompresses only the embedded images, in place. Text stays
sharp and selectable, links survive. Rasterising stays as one explicitly labelled option, never the
default. The tool says plainly, before the button is pressed, when a file has nothing to gain.

## What to build, in order

### 0. Stop handing out a bigger file (lands first, from this worktree)

`compressPdf` and `compressPdfToTarget` return the input `File` itself when the rasterised copy is
not smaller. The result card then reads "Already as small as it gets" with a plain sentence, the
button says "Download PDF" with the original filename, and the rasterize notice and compare slider
are gone. Unit tests: `compress.test.js` (library) and `PdfCompressTool.test.tsx` (card). Done in
this worktree, 2026-10-02.

### 1. A pure analysis of what the file is made of

`src/tools/compress/analyzePdf.js`: `analyzePdf(pdfDoc, { totalBytes }) → { pageCount, totalBytes, images: [{ ref, width, height,
bitsPerComponent, colorSpace, filters, bytes, hasSMask, isMask }], imageBytes, imageShare, hasText }`. Walks the pdf-lib context's
indirect objects, no rendering. Pure, unit-tested on the corpus below, never re-derived by the UX
(the same bar as form detection: `test:detection-purity` style, swappable, KPI-guarded).

### 2. Honest messaging, driven by the analysis

Once a file is added, before any level is picked:

- No images: "This PDF is text and drawings, with no images in it. There is nothing here to make
  smaller without turning the pages into pictures." The cards stay (they also set the flatten
  switch's resolution); the switch is right below them with its cost stated. *As built: Shlomi saw
  and kept this layout, with the note in the dropzone's colours (2026-10-02).*
- Images carry under ~20% of the bytes: "Most of this file is text and drawings; the images are
  {share}. Shrinking them can save at most about {ceiling}." Shown as the ceiling, not as a promise.
- Otherwise the cards, with the image share named.

After a run: the exact bytes before and after. When nothing was gained the original is handed back
and the card says so; "PDF Successfully Compressed!" never appears unless the file is smaller, and
there is no Download or Share at all when the output is the input (Shlomi, 2026-10-02: "there is
nothing to download so you shouldn't state or allow that").

### 3. The structural compressor

`compressPdfImages(file, { maxLongSidePx, quality, onProgress })` in `compressImages.js` (its own
module, so the rasterising engine in `compress.js` stays untouched behind the switch):

- For each image XObject from step 1, `planImageRewrite(image)` decides `'jpeg'` (DCTDecode, or
  FlateDecode 8-bit DeviceRGB/DeviceGray), `'keep'` (SMask, JPX, CCITT, indexed, CMYK JPEG, anything
  it cannot decode on canvas). Pure, unit-tested.
- Decode on canvas (a DCT image via `createImageBitmap(new Blob([bytes]))`, raw via `ImageData`),
  downsample so the long side is at most `maxLongSidePx`, re-encode `image/jpeg` at `quality`,
  through the existing `canvasToBlob`.
- Replace the stream in place with pdf-lib (`PDFRawStream`, `/Filter /DCTDecode`, new `/Width`,
  `/Height`, `/ColorSpace /DeviceRGB`, `/DecodeParms` removed), only when the new bytes are fewer
  than the old. Save with `useObjectStreams: true`.
- Returns the input when nothing got smaller (same reference rule as step 0).

### 4. Levels and Target Size become image targets

| Level | long side | quality |
| --- | --- | --- |
| Smallest | 1000 px | 0.4 |
| Recommended | 1600 px | 0.6 |
| High Quality | 2400 px | 0.8 |

*As built:* Target Size walks `TARGET_IMAGE_LADDER` (five long-side/quality rungs, best first) through
`compressPdfImagesToTarget` and returns the first rung under target, else the smallest, else the
original. Simpler than reusing `targetSizeSearch.js`, whose handle is a rendered page; the FAQ's
wording is revisited in step 6.

### 5. Flatten pages to images, explicit and last

The current `compressPdf` stays as "Flatten pages to images", a separate switch below the cards,
labelled with what it costs (selectable text, links, sharpness). It is the only route for a file
with no images, and never the default.

### 6. Copy from measured numbers

The cards, the subhead and the FAQ in `src/data/tools.js` are rewritten from the corpus numbers
below. No range claim that the KPI test does not hold. Hebrew follows in `toolMessages.ts` and the
`/he/` content page.

### 7. Corpus and KPI

`src/tools/compress/__fixtures__/`, built by `scripts/generate-compress-fixtures.mjs`: `text-only.pdf` (a fictional form), `scan.pdf` (one
JPEG page), `mixed.pdf` (text plus two photos), `vector-drawing.pdf`. *As built:* the floors need the
real canvas encoder, so they live in a Playwright spec, `src/tools/compress/e2e/compress-kpi.spec.js`,
not a unit test. It holds: scan at Recommended at least 40% smaller; mixed at
least 25% smaller with text bytes unchanged; text-only and vector-drawing returned untouched and
reported as such. A number the copy quotes is one this test asserts.

## Acceptance

- [x] Step 0: a file that would grow is handed back unchanged, and the card says so with both sizes ("As images" against the original).
- [x] `analyzePdf` is pure, unit-tested on the four fixtures, and the island only reads its result (loaded with `import()`).
- [x] A text-only PDF is told, before any level is picked, that there is nothing to shrink without flattening (checked on the reporter's own file in a real browser, 2026-10-02).
- [x] A compressed PDF keeps its text and its links: `compressImages.test.js` re-analyses the output of `mixed.pdf` (text present, one URI annotation).
- [x] Levels and Target Size act on images only; flatten is a separate, labelled switch ("Turn pages into pictures", off by default).
- [ ] The compare slider renders both sides at the same scale and labels what changed.
- [ ] The KPI test holds the floors above and the copy quotes nothing beyond them.
- [ ] `check:push` green; the compress e2e specs updated for the new flow.

## Progress notes

**2026-10-02, real-browser run of `compressPdfImages`** (Chromium, the canvas encoder, not a fake):

| Fixture | Smallest (1000 px, q 0.4) | Recommended (1600 px, q 0.6) | High (2400 px, q 0.8) |
| --- | --- | --- | --- |
| `mixed.pdf` 1,213,742 B | 23,674 B (98%) | 42,460 B (97%) | 125,467 B (90%) |
| `scan.pdf` 599,924 B | 131,132 B (78%) | 246,930 B (59%) | 374,403 B (38%) |
| `text-only.pdf`, reporter's file | untouched, `no-images` | untouched | untouched |

Text, the link and the transparent image survived, and the rendered pages were identical by eye. Under
80 ms each. The synthetic photos compress far better than real ones (smooth gradients), so these are
not numbers for the copy; step 6 needs real-world images in the corpus before any range is quoted.

**2026-10-02, 322 real PDFs** (Shlomi's Downloads, measured locally in Chromium with the real canvas
encoder, never committed; files referred to by index only). No load errors, no crashes, about 1 s at
most per file. Savings where the result was smaller, median (p25 to p75):

| Kind (count) | Smallest | Recommended | High Quality | Gained nothing at Recommended |
| --- | --- | --- | --- | --- |
| Scan-like, images >= 80%, no text (67) | 81% (72-87) | 55% (37-69) | 36% (31-57) | 35, plus 10 protected |
| Mixed (128) | 36% (16-58) | 23% (13-38) | 13% (5-22) | 72 |
| Text-heavy, images < 20% (63) | 20% (16-26) | 19% (14-26) | 24% (10-25) | 50 |
| No images (64) | untouched | untouched | untouched | all |

Why so many gained nothing: the keep rules skipped the two biggest real-world image kinds, ICCBased
colour spaces (the largest scans, up to 37.5 MB, gained 0%) and images with an /SMask (about 570
images in 130 files). Support for both is the next change; 15 files are protected against editing
(owner password), handled separately.

**Correctness check, with a stop rule** (Shlomi, 2026-10-02: "a stop criteria must be available").
Defects depend on the kind of image rewritten, not on file count, so the check samples by kind: at most
3 files per combination of rewritten kinds, 24 at most, stop at 3 defects. 19 files over 7 kinds, page
1-2 rendered before and after at 40 dpi: no defect (worst 4x4 tile mean difference 7.5 of 255, flag at
25). The same rule applies to every later re-check: only files a change can affect, 3 per new kind.

Found in review and fixed: pdf-lib's Flate decoder ignores `/DecodeParms`, so a PNG-predicted image
would have decoded sheared, and a `/Decode` array would have been dropped un-applied (an inverted
image). `analyzePdf` reports `predictor` and `hasDecode`; `planImageRewrite` keeps both kinds.

## Not in scope

Font subsetting, content-stream rewriting, and recompressing non-image streams: each is a separate
piece of work with its own gains to measure first.

## Pointers

`src/tools/compress/compress.js`, `PdfCompressTool.tsx`, `targetSizeSearch.js`, `src/i18n/toolMessages.ts`
(`alreadySmall*` keys), `src/data/tools.js` (compress FAQ), `src/lib/pdfLib.js` (lazy pdf-lib).
