# RED-01: Delete parser as a whole-object redaction engine

Measures `extractPageObjects` + `deleteObjectsFromPdf` (the Delete tool's content-stream
parser) used as a redaction engine: every object whose bbox intersects the corpus rect is
deleted, whole-object (no glyph-level or partial-run removal).

| file | feature | objects removed | secret still extractable | keepText still extractable | notes |
| --- | --- | --- | --- | --- | --- |
| plain-helvetica-line.pdf | plain Helvetica line, single Tj | 1 (text) | false | true | - |
| partial-overlap-word.pdf | secret is the middle run of one visual line (partial overlap); prefix/suffix must survive | 3 (text) | false | true | - |
| tj-array-kerning.pdf | single TJ operator with per-glyph kerning numbers | 1 (text) | false | true | - |
| embedded-subset-truetype-latin.pdf | embedded subset TrueType font (Latin, Arimo) | 1 (text) | false | true | - |
| hebrew-rtl-line.pdf | embedded Hebrew font, RTL secret (visual order, no shaping) | 1 (text) | false | true | - |
| form-xobject-text.pdf | text drawn inside a Form XObject invoked via Do | 0 | true | true | no objects intersected the rect |
| rotated-ctm-text.pdf | text drawn with a 30deg rotated CTM | 1 (text) | false | true | - |
| page-rotate-90.pdf | page dictionary /Rotate 90; text unrotated in PDF space | 1 (text) | false | true | - |
| raster-image-partial.pdf | raster PNG partly covered by the box | 2 (image, text) | false | true | - |
| raster-image-full.pdf | raster PNG fully covered by the box | 2 (image, text) | false | true | - |
| vector-path-highlight.pdf | filled vector-path rectangle (highlight) drawn behind real text | 1 (text) | false | true | - |
| freetext-annotation.pdf | FreeText annotation whose /Contents is the secret (outside the content stream) | 0 | true | true | no objects intersected the rect |
| paragraph-line2-only.pdf | 3-line paragraph, box covers line 2 only; lines 1 and 3 must survive | 1 (text) | false | true | - |
| real-world-irs-1040-2024.pdf | real-world form PDF (IRS 1040 2024), page 1 | 2 (text) | false | false | whole BT..ET run removed (more than the secret alone) |
| real-world-uscis-i9-2025.pdf | real-world form PDF (USCIS I-9 2025), page 1 | 1 (text) | true | true | secret text recurs 3x on the page; only the targeted occurrence was removed |
| real-world-health-declaration-2021.pdf | real-world form PDF (health declaration 2021), page 1 | 1 (text) | true | true | secret text recurs 3x on the page; only the targeted occurrence was removed |

77-page stress doc (20 text lines + 1 box per page): **97.5ms** total for extract+delete across 77 pages, one object removed per page.

Raw checker output:
```
file                                    secretExtractable  secretInAnnotations  keepTextExtractable
--------------------------------------  -----------------  -------------------  -------------------
plain-helvetica-line.pdf                false              false                true               
partial-overlap-word.pdf                false              false                true               
tj-array-kerning.pdf                    false              false                true               
embedded-subset-truetype-latin.pdf      false              false                true               
hebrew-rtl-line.pdf                     false              false                true               
form-xobject-text.pdf                   true               false                true               
rotated-ctm-text.pdf                    false              false                true               
page-rotate-90.pdf                      false              false                true               
raster-image-partial.pdf                false              false                true               
raster-image-full.pdf                   false              false                true               
vector-path-highlight.pdf               false              false                true               
freetext-annotation.pdf                 true               true                 true               
paragraph-line2-only.pdf                false              false                true               
real-world-irs-1040-2024.pdf            false              false                false              
real-world-uscis-i9-2025.pdf            true               false                true               
real-world-health-declaration-2021.pdf  true               false                true               

12 of 16 entries did NOT match the expected baseline (secret + keepText both present):
 - plain-helvetica-line.pdf
 - partial-overlap-word.pdf
 - tj-array-kerning.pdf
 - embedded-subset-truetype-latin.pdf
 - hebrew-rtl-line.pdf
 - rotated-ctm-text.pdf
 - page-rotate-90.pdf
 - raster-image-partial.pdf
 - raster-image-full.pdf
 - vector-path-highlight.pdf
 - paragraph-line2-only.pdf
 - real-world-irs-1040-2024.pdf
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: Skipping command Tf: expected 2 args, but received 1 args.
Warning: FreeTextAnnotation: OffscreenCanvas is not supported, annotation may not render correctly.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: ensureStateFont: "FormatError: Missing setFont (Tf) operator before text rendering operator.".
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: TT: undefined function: 32
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

(checker exited 1)
```
