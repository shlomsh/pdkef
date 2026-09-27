# RED-01: PDFium (WebAssembly) as a glyph-level redaction engine

Package: `@embedpdf/pdfium` (chosen over `@hyzyla/pdfium` — not needed, `@embedpdf/pdfium`
runs fine directly in Node; see "Package" below).

## Package

- `@embedpdf/pdfium` **1.5.0** (a version bump landed on npm mid-spike; `package.json` pins `^1.3.2`,
  installed `1.5.0`).
- Wrapper license: **MIT** (`node_modules/@embedpdf/pdfium/LICENSE`).
- Bundled PDFium binary license: **Apache-2.0** (`node_modules/@embedpdf/pdfium/LICENSE.pdfium` —
  the file carries PDFium's original BSD-style copyright header followed by the full Apache-2.0 text;
  the README's own license section says Apache-2.0 and that's the operative grant).
- `dist/pdfium.wasm` on disk: **7,694,264 bytes** (7.34 MiB).
- gzip -9 of that file: **2,891,535 bytes** (2.76 MiB).
- Runs directly in Node with no shims: `init({ wasmBinary })` from a `readFileSync`'d buffer works
  as-is (`@hyzyla/pdfium` was not needed).

## API used (all low-level `FPDF_*`/`FPDFPage_*`/`FPDFText_*`/`FPDFImageObj_*` C API, no high-level wrapper)

- Load/save: `FPDF_LoadMemDocument64`, `FPDF_LoadPage`, `FPDF_GetPageWidth/Height` (rotated/displayed
  size), `FPDFPage_GetRotation`, `FPDF_GetPageBoundingBox` (raw mediabox), `FPDFPage_GenerateContent`,
  `PDFiumExt_OpenFileWriter` / `PDFiumExt_SaveAsCopy` / `PDFiumExt_GetFileWriterSize` /
  `PDFiumExt_GetFileWriterData` / `PDFiumExt_CloseFileWriter` — this package's own in-memory-writer
  extension around `FPDF_SaveAsCopy`, which avoids hand-rolling an `FPDF_FILEWRITE` callback via
  `addFunction`.
- Object walk: `FPDFPage_CountObjects`, `FPDFPage_GetObject`, `FPDFPageObj_GetType`,
  `FPDFPageObj_GetBounds`, `FPDFPage_RemoveObject`, `FPDFPage_InsertObject`.
- Text, per character: `FPDFText_LoadPage`, `FPDFText_CountChars`, `FPDFText_GetCharBox`,
  `FPDFText_GetCharOrigin`, `FPDFText_GetUnicode`, `FPDFText_GetTextObject` (maps a page-level char
  index back to its owning text object — the key primitive that makes per-object partial/full
  classification possible).
- Text rebuild (partial runs): `FPDFPageObj_GetMatrix` / `FPDFPageObj_SetMatrix`,
  `FPDFTextObj_GetFont`, `FPDFTextObj_GetFontSize`, `FPDFPageObj_CreateTextObj`, `FPDFText_SetText`
  (worked; `FPDFText_SetCharcodes` was not needed).
- Images: `FPDFImageObj_GetBitmap`, `FPDFBitmap_GetWidth/Height/Stride/Buffer/GetFormat`,
  `FPDFImageObj_SetBitmap`.
- Form XObjects: `FPDFFormObj_CountObjects`, `FPDFFormObj_GetObject`.

### The embedpdf #801 note

Followed as specified: every character's box/origin/owning-object is read for the **whole page in one
pass** (`readAllChars` in `engine-pdfium.mjs`) before any object is mutated. Matrices and origins for a
surviving run are captured once, then used to build the replacement object in a second pass. No
interleaved read/mutate loop was used.

## Rect conversion: the one real gap in the public API

`FPDF_DeviceToPage`/`FPDF_PageToDevice` looked like the natural way to turn the corpus's `%`
device-space rect (top-left origin, matching `src/editor/geometry/coords.ts`, same convention pdf.js's
`getViewport({rotation: page.rotate})` produces) into the raw mediabox coordinates
`FPDFPageObj_GetBounds`/`FPDFText_GetCharBox` report in. **It does not work for that**: round-tripping a
known glyph's raw box through `FPDF_PageToDevice` with `rotate` set to the page's `/Rotate` produced a
device rect with the wrong aspect ratio outright (not just an offset) — its "page" coordinate is
evidently not the same frame `GetBounds`/`GetCharBox` use. The engine instead implements the classical
four-case `/Rotate` transform by hand (`corpusRectToPdfSpace` in `engine-pdfium.mjs`), verified against
`page-rotate-90.pdf`'s own glyph boxes (the derived target rect lines up with where
`FPDFText_GetCharBox` actually reports the secret and kept-text runs).

## Results

Checked with the repo's `check-extractable.mjs` (now position-aware: `secretUnderBox` intersects the
redaction rect specifically, `secretAnywhere`/`keepTextIntact` are page-wide). Column semantics: want
`secretUnderBox=false` and `keepTextIntact=true`.

| file | secretUnderBox | keepTextIntact | primitive that handled it | notes |
|---|---|---|---|---|
| plain-helvetica-line.pdf | false | true | full-object `FPDFPage_RemoveObject` | |
| partial-overlap-word.pdf | false | true | full-object remove | pdf-lib emits prefix/secret/suffix as **3 separate text objects** (one `BT..Tj..ET` each), so this "partial overlap" fixture never exercises the per-char split path — full-object removal was sufficient |
| tj-array-kerning.pdf | false | true | full-object remove | single `TJ` w/ per-glyph kerning numbers; char-level `FPDFText_GetCharBox` handled it transparently |
| embedded-subset-truetype-latin.pdf | false | true | full-object remove | |
| hebrew-rtl-line.pdf | false | true | full-object remove | kept text still extracts correctly (checked with `.includes()`, order preserved — see below) |
| form-xobject-text.pdf | **true (FAIL)** | true | none | see "Form XObjects" below |
| rotated-ctm-text.pdf | false | true | full-object remove; matrix untouched | |
| page-rotate-90.pdf | false | true | full-object remove | needed the hand-rolled rect conversion above |
| raster-image-partial.pdf | **true (FAIL, boundary artifact)** | true | text: full-object remove of most of the caption run + rebuild of a tail run; image: `FPDFImageObj_SetBitmap` painted the covered pixels black | see "Boundary straddling" below |
| raster-image-full.pdf | false | true | image `FPDFPage_RemoveObject` (fully covered) | |
| vector-path-highlight.pdf | false | true | text full-object remove (the path underneath was reported partial only, but carries no text) | |
| freetext-annotation.pdf | false (`secretAnywhere=true`) | true | none — **not implemented** | FreeText's `/Contents` lives outside the content stream; this spike's object walk never touches annotations. Real coverage would need `FPDFAnnot_*` |
| paragraph-line2-only.pdf | false | true | full-object remove of line 2 only | lines 1 and 3 are separate objects, untouched |
| real-world-irs-1040-2024.pdf | false | true | full-object remove | |
| real-world-uscis-i9-2025.pdf | false | true | full-object remove | `secretAnywhere=true` only because the picked word legitimately recurs elsewhere on the form — not a redaction miss |
| real-world-health-declaration-2021.pdf | false | true | full-object remove | same as above |

**12 of 16 fully pass** the position-aware check (`secretUnderBox=false`, `keepTextIntact=true`); 2 are
known, explained gaps (Form XObjects, FreeText annotations — see below); 1 is a sub-pixel boundary
artifact (raster-image-partial.pdf).

### Hebrew reading order

`hebrew-rtl-line.pdf`'s `keepText` (`טקסטשנשאר`, stored/drawn in already-reversed visual order per
`make-corpus.mjs`) is still found via plain substring match after redaction — the surviving text
object was never touched (it's a separate object from the removed secret line), so its internal
glyph order is exactly what PDFium wrote originally. This spike's partial-run rebuild path was never
exercised on RTL text (no fixture needs it), so nothing here validates that
`FPDFText_SetText`-rebuilt Hebrew runs preserve reading order — only that untouched Hebrew objects do.

### Form XObjects: read yes, edit no

`FPDFFormObj_CountObjects`/`FPDFFormObj_GetObject` **do** expose the inner text object
(`form-xobject-text.pdf`: outer object count 2, one `TEXT` + one `FORM`; the form's inner count is 1,
type `TEXT`). But **edits inside do not persist**: calling `FPDFPage_RemoveObject(page, innerObj)`
directly on the form's inner object returns `false` (rejected) — confirmed with a standalone repro.
PDFium exposes no analogous "remove/replace an object inside this form" primitive; the only way to
redact text inside a Form XObject with this API would be to rebuild the XObject's own content stream
from scratch (out of scope for this spike). This is the one fixture where the secret is still fully
extractable in the output.

### Boundary straddling (raster-image-partial.pdf)

The per-character classification uses strict "fully inside the rect" containment, which is the
conservative/correct choice (a character only partially covered by the box should not be silently
destroyed). In this fixture the redaction rect's right edge falls mid-word: the glyph exactly at that
edge (`S` of the trailing `SECRET`) has a raw char box (`101.72`–`107.43`pt) that pokes ~5pt past the
rect's right edge (`102`pt), so it and the five characters after it are correctly kept, uncut — but the
rebuilt survivor run's own bounding box then just barely overlaps the checker's (shrunk-by-0.2%) probe
rect, so the position-aware checker still flags it as "under the box". This is a real edge case for any
engine using hard char-box containment (not specific to PDFium) — production code would need to either
(a) grow the redaction rect slightly past any straddled glyph's full box before classifying, or (b)
accept that a character dead-center on the boundary is a genuine judgment call. Not fixed in this spike
given the scope; flagged here rather than silently working around it by padding the test.

### Paths (vector-path-highlight.pdf, real-world forms)

Fully-inside paths are removed with `FPDFPage_RemoveObject`, same as text/images. Partially-overlapping
paths are only *reported*, never trimmed: PDFium has no "clip this path's point list to a rect"
primitive analogous to the text/image handling above — doing this for real would mean re-authoring the
path's point list by hand (intersecting each subpath against the rect), which this spike does not
attempt. The corpus's real-world forms surface many `untouched` (non-intersecting) paths and exactly
one `partial-reported-only` path per form (form-field borders/lines crossing the redaction rect); none
of the corpus's path fixtures are "fully inside", so `FPDFPage_RemoveObject` on a path was never
actually exercised by this run (only the classification logic was).

## Performance: 77 pages x 20 lines, one box per page

Generated via `make-77page.mjs` (`@cantoo/pdf-lib`, from the repo root's `node_modules` — not added to
this spike's own `package.json`) and timed in `perf-77page.mjs` (load → per-page char-box classify +
remove → `FPDF_GenerateContent` → `PDFiumExt_SaveAsCopy`; wasm module init excluded from the timer):

```
77 pages x 20 lines, 1 box/page: 119.3ms total, 1.55ms/page, output 47696 bytes
```

Verified afterward with pdf.js (`getTextContent`) that all 77 `SECRET-P*-L*-XYZ` lines are gone and
every other line on every page (checked pages 1, 40, 77) survives intact.

## Files

- `package.json` / `package-lock.json` — the spike's own `@embedpdf/pdfium` dependency.
- `engine-pdfium.mjs` — the engine (`redactPdf`/`redactFile` exports + a CLI that runs the whole
  corpus into `../out/pdfium/`).
- `make-77page.mjs` / `perf-77page.mjs` / `perf-77page-entries.json` / `perf-77page.pdf` /
  `perf-77page-out.pdf` — the performance fixture, timing harness, and its output.
- `reports.json` — the last full-corpus run's per-entry object-classification counts (produced by
  `engine-pdfium.mjs`'s CLI).
