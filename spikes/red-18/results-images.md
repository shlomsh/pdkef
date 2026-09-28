# RED-18/RED-20: true redaction of images and drawn shapes

7 file(s) edited and written to spikes/red-18/out/images/. 0 file(s) edited but failed independent verification. 0 file(s) had a fallback and nothing else to edit. 19 file(s) had no image/path touched by a box (left unedited, nothing written).

DCT decoder finding: sharp is PRESENT in node_modules (a transitive dependency already installed, not added by this spike) and was wired up to decode DCTDecode images via its raw-pixel API. jpeg-js is NOT present. No corpus file uses DCTDecode (every image here is FlateDecode /DeviceRGB), so this path is implemented but unexercised by this corpus - reported, not measured.

Box colour: black (0,0,0 / gray 0), matching checks.mjs's own paintBoxesBlack convention. No corpus entry names a colour for the painted area.

"Everywhere" (RED-20): no corpus entry requests it (both shared-header-image fixtures expect the untouched pages to keep the ORIGINAL image object), so every partial-cover edit on a shared image took the "copy" path, confirmed below. The everywhere branch is wired (`entry.everywhere === true`) but unexercised.

Reading the checks.mjs table below: every FAIL in it is explained, none is an image/path bug -
  - text/bytes FAIL on raster-image-partial.pdf, raster-image-full.pdf, vector-path-highlight.pdf and
    real-world-irs-1040-2024.pdf: each of those fixtures ALSO draws a plain-text caption/label under the same box
    (e.g. "IMG-PARTIAL-SECRET" as its own Tj, right next to the image) - this spike only touches images and drawn
    shapes, so that caption survives untouched, exactly as remove-text.mjs would leave the image untouched. The
    two spikes are complementary halves of one corpus; combined removal is future work, not this one's job.
  - bytes FAIL on shared-header-image-half.pdf ("18 0 R"): checks.mjs's own colorRunPattern search is BYTE-offset,
    not pixel-aligned, and its 18-byte "6 red pixels in a row" needle is periodic with the same period (3 bytes)
    as a run of BLUE (0,0,255) pixels read from an offset of +2 - so a long run of blue "keep" pixels can alias
    into a false match for the red "secret" pattern. Measured directly: the SAME false match already exists in
    the untouched ORIGINAL corpus file (spikes/red-18/corpus/shared-header-image-half.pdf), before this spike
    edits anything - and the actual pixel content (checks.mjs's own supplementary per-page colour-pixel count,
    and this file's own pixel-aligned re-decode above) shows zero red pixels anywhere in the saved image.

---
## plain-helvetica-line.pdf

- feature: plain Helvetica line, single Tj
- No image or drawn-shape path on this page touched a box; left unedited.

## partial-overlap-word.pdf

- feature: secret is the middle run of one visual line (partial overlap); prefix/suffix must survive
- No image or drawn-shape path on this page touched a box; left unedited.

## tj-array-kerning.pdf

- feature: single TJ operator with per-glyph kerning numbers
- No image or drawn-shape path on this page touched a box; left unedited.

## embedded-subset-truetype-latin.pdf

- feature: embedded subset TrueType font (Latin, Arimo)
- No image or drawn-shape path on this page touched a box; left unedited.

## hebrew-rtl-line.pdf

- feature: embedded Hebrew font, RTL secret (visual order, no shaping)
- No image or drawn-shape path on this page touched a box; left unedited.

## form-xobject-text.pdf

- feature: text drawn inside a Form XObject invoked via Do
- No image or drawn-shape path on this page touched a box; left unedited.

## rotated-ctm-text.pdf

- feature: text drawn with a 30deg rotated CTM
- No image or drawn-shape path on this page touched a box; left unedited.

## page-rotate-90.pdf

- feature: page dictionary /Rotate 90; text unrotated in PDF space
- No image or drawn-shape path on this page touched a box; left unedited.

## raster-image-partial.pdf

- feature: raster PNG partly covered by the box
- Images: 0 deleted (fully covered), 1 partly covered and repainted (10300 px painted total), of which 1 edited in place and 0 copied (shared with other pages). 0 image(s) on the page untouched by any box.
- Drawn shapes: 0 deleted (fully covered), 0 clipped exactly (partial, rectangle/rectilinear), 0 untouched.
- Verification (independent re-decode/re-walk of the saved file):
  - page 1: partial-cover image re-decoded: 10300 px under the box are the box colour (0 are not), 9700 px outside are unchanged (0 changed unexpectedly).
  - path points strictly inside a box on the output: 0.
- Verification verdict: PASS

## raster-image-full.pdf

- feature: raster PNG fully covered by the box
- Images: 1 deleted (fully covered), 0 partly covered and repainted (0 px painted total), of which 0 edited in place and 0 copied (shared with other pages). 0 image(s) on the page untouched by any box.
- Drawn shapes: 0 deleted (fully covered), 0 clipped exactly (partial, rectangle/rectilinear), 0 untouched.
- Verification (independent re-decode/re-walk of the saved file):
  - image was this page's only user (1): original pixel bytes confirmed gone from the saved file.
  - page 1: image fully covered by a box -> Do removed (confirmed gone).
  - path points strictly inside a box on the output: 0.
- Verification verdict: PASS

## vector-path-highlight.pdf

- feature: filled vector-path rectangle (highlight) drawn behind real text
- Images: 0 deleted (fully covered), 0 partly covered and repainted (0 px painted total), of which 0 edited in place and 0 copied (shared with other pages). 0 image(s) on the page untouched by any box.
- Drawn shapes: 0 deleted (fully covered), 1 clipped exactly (partial, rectangle/rectilinear), 0 untouched.
- Verification (independent re-decode/re-walk of the saved file):
  - path points strictly inside a box on the output: 0.
- Verification verdict: PASS

## freetext-annotation.pdf

- feature: FreeText annotation whose /Contents is the secret (outside the content stream)
- No image or drawn-shape path on this page touched a box; left unedited.

## paragraph-line2-only.pdf

- feature: 3-line paragraph, box covers line 2 only; lines 1 and 3 must survive
- No image or drawn-shape path on this page touched a box; left unedited.

## real-world-irs-1040-2024.pdf

- feature: real-world form PDF (IRS 1040 2024), page 1 (secret is alone on its own line, no same-line neighbour to check)
- Images: 0 deleted (fully covered), 0 partly covered and repainted (0 px painted total), of which 0 edited in place and 0 copied (shared with other pages). 0 image(s) on the page untouched by any box.
- Drawn shapes: 0 deleted (fully covered), 1 clipped exactly (partial, rectangle/rectilinear), 370 untouched.
- Verification (independent re-decode/re-walk of the saved file):
  - path points strictly inside a box on the output: 0.
- Verification verdict: PASS

## real-world-uscis-i9-2025.pdf

- feature: real-world form PDF (USCIS I-9 2025), page 1 (secret is alone on its own line, no same-line neighbour to check)
- No image or drawn-shape path on this page touched a box; left unedited.

## real-world-health-declaration-2021.pdf

- feature: real-world form PDF (health declaration 2021), page 1 (secret is alone on its own line, no same-line neighbour to check)
- No image or drawn-shape path on this page touched a box; left unedited.

## mid-run-helvetica.pdf

- feature: secret is the middle substring of ONE Tj (not a separate run); exercises per-glyph split of a single text object
- No image or drawn-shape path on this page touched a box; left unedited.

## mid-run-tj-kerned.pdf

- feature: one TJ array with per-glyph kerning holds the whole line; secret is the middle run of that single array
- No image or drawn-shape path on this page touched a box; left unedited.

## mid-run-embedded.pdf

- feature: embedded subset TrueType (Identity-H hex Tj); secret is the middle substring of ONE Tj
- No image or drawn-shape path on this page touched a box; left unedited.

## mid-run-hebrew.pdf

- feature: embedded Hebrew font, ONE Tj holds three RTL-visual-order words; box covers only the middle (secret) word
- No image or drawn-shape path on this page touched a box; left unedited.

## two-boxes-one-line.pdf

- feature: ONE Tj holds two distinct secrets; two rects target each independently (embedpdf #801 class: does clearing the first corrupt the second read?)
- No image or drawn-shape path on this page touched a box; left unedited.

## shared-header-image-full.pdf

- feature: one image XObject (logo) drawn at the top of every page from the same object; box on page 1 fully covers it
- Images: 1 deleted (fully covered), 0 partly covered and repainted (0 px painted total), of which 0 edited in place and 0 copied (shared with other pages). 0 image(s) on the page untouched by any box.
- Drawn shapes: 0 deleted (fully covered), 0 clipped exactly (partial, rectangle/rectilinear), 0 untouched.
- Verification (independent re-decode/re-walk of the saved file):
  - image is shared by 5 pages: original pixel bytes are expected to remain (other pages still use it; checked below).
  - page 1: image fully covered by a box -> Do removed (confirmed gone).
  - page 2: untouched, expected to keep the original shared image object: confirmed.
  - page 3: untouched, expected to keep the original shared image object: confirmed.
  - page 4: untouched, expected to keep the original shared image object: confirmed.
  - page 5: untouched, expected to keep the original shared image object: confirmed.
  - path points strictly inside a box on the output: 0.
- Verification verdict: PASS

## shared-header-image-half.pdf

- feature: one image XObject (logo) drawn at the top of every page from the same object; box on page 1 covers only half of it
- Images: 0 deleted (fully covered), 1 partly covered and repainted (2400 px painted total), of which 0 edited in place and 1 copied (shared with other pages). 0 image(s) on the page untouched by any box.
- Drawn shapes: 0 deleted (fully covered), 0 clipped exactly (partial, rectangle/rectilinear), 0 untouched.
- Verification (independent re-decode/re-walk of the saved file):
  - page 1: partial-cover image re-decoded: 2400 px under the box are the box colour (0 are not), 2400 px outside are unchanged (0 changed unexpectedly).
  - page 2: untouched, expected to keep the original shared image object: confirmed.
  - page 3: untouched, expected to keep the original shared image object: confirmed.
  - page 4: untouched, expected to keep the original shared image object: confirmed.
  - page 5: untouched, expected to keep the original shared image object: confirmed.
  - path points strictly inside a box on the output: 0.
- Verification verdict: PASS

## text-watermark-form.pdf

- feature: "CONFIDENTIAL" drawn at the top of every page from one shared Form XObject; box on page 1 only
- No image or drawn-shape path on this page touched a box; left unedited.

## watermark-annotation.pdf

- feature: /Watermark annotation with text on each page (independent objects, same text); box on page 1 over its annotation
- No image or drawn-shape path on this page touched a box; left unedited.

## diagonal-behind-text.pdf

- feature: semi-transparent diagonal "DRAFT" image drawn behind body text; removed by Delete, not a box
- removalMethod: delete (diagonal DRAFT watermark image (semi-transparent, drawn behind body text)). Images removed from page 1: 1.


## checks.mjs verdicts on the images output

$ node spikes/red-18/checks.mjs spikes/red-01/corpus spikes/red-18/out/images spikes/red-01/corpus/corpus.json
Check 1 (pixels): no `canvas` package installed in this checkout, so pdfjs-dist cannot rasterize a page in Node. Skipping the pixel check rather than adding a dependency (spikes/red-01 hit the same wall - see its results-summary.md).

file                          page  pixels  text  bytes  annotations
----------------------------  ----  ------  ----  -----  -----------
raster-image-partial.pdf      1*    SKIP    FAIL  FAIL   PASS       
    text extras: IMG-PARTIAL-SECRET
    bytes still reachable from box page in: 6 0 R, 7 0 R
raster-image-full.pdf         1*    SKIP    FAIL  FAIL   PASS       
    text extras: IMG-FULL-SECRET
    bytes still reachable from box page in: 10 0 R
vector-path-highlight.pdf     1*    SKIP    FAIL  FAIL   PASS       
    text extras: PATH-HIGHLIGHT-SECRET
    bytes still reachable from box page in: 9 0 R
real-world-irs-1040-2024.pdf  1*    SKIP    FAIL  PASS   PASS       
    text extras: Department, of, the, Treasury—Internal, Revenue, Service
real-world-irs-1040-2024.pdf  2     SKIP    PASS  -      N/A        
(* = the page a redaction box targets; "-" = not applicable to that page)

1 of 5 page-rows pass all applicable checks.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

$ node spikes/red-18/checks.mjs spikes/red-18/corpus spikes/red-18/out/images spikes/red-18/corpus/corpus.json
Check 1 (pixels): no `canvas` package installed in this checkout, so pdfjs-dist cannot rasterize a page in Node. Skipping the pixel check rather than adding a dependency (spikes/red-01 hit the same wall - see its results-summary.md).

file                          page  pixels  text  bytes  annotations
----------------------------  ----  ------  ----  -----  -----------
shared-header-image-full.pdf  1*    SKIP    PASS  PASS   PASS       
shared-header-image-full.pdf  2     SKIP    PASS  -      N/A        
shared-header-image-full.pdf  3     SKIP    PASS  -      N/A        
shared-header-image-full.pdf  4     SKIP    PASS  -      N/A        
shared-header-image-full.pdf  5     SKIP    PASS  -      N/A        
shared-header-image-half.pdf  1*    SKIP    PASS  FAIL   PASS       
    bytes still reachable from box page in: 18 0 R
shared-header-image-half.pdf  2     SKIP    PASS  -      N/A        
shared-header-image-half.pdf  3     SKIP    PASS  -      N/A        
shared-header-image-half.pdf  4     SKIP    PASS  -      N/A        
shared-header-image-half.pdf  5     SKIP    PASS  -      N/A        
diagonal-behind-text.pdf      1*    SKIP    PASS  PASS   N/A        
(* = the page a redaction box targets; "-" = not applicable to that page)

Supplementary: per-page image color-pixel counts (not one of the 4 required checks)
  shared-header-image-full.pdf page 1: OK (counts=[0,0], expected secretColorRemaining=0, keepColorRemaining=0)
  shared-header-image-full.pdf page 2: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-full.pdf page 3: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-full.pdf page 4: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-full.pdf page 5: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-half.pdf page 1: OK (counts=[0,2400], expected secretColorRemaining=0, keepColorRemaining=>0)
  shared-header-image-half.pdf page 2: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-half.pdf page 3: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-half.pdf page 4: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  shared-header-image-half.pdf page 5: OK (counts=[1200,2400], expected secretColorRemaining=>0, keepColorRemaining=>0)
  diagonal-behind-text.pdf page 1: OK (counts=[0], expected secretColorRemaining=0)

10 of 11 page-rows pass all applicable checks.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

