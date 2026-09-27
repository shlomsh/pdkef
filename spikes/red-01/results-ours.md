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
| freetext-annotation.pdf | FreeText annotation whose /Contents is the secret (outside the content stream) | 0 | false | true | no objects intersected the rect |
| paragraph-line2-only.pdf | 3-line paragraph, box covers line 2 only; lines 1 and 3 must survive | 1 (text) | false | true | - |
| real-world-irs-1040-2024.pdf | real-world form PDF (IRS 1040 2024), page 1 | 2 (text) | false | false | whole BT..ET run removed (more than the secret alone) |
| real-world-uscis-i9-2025.pdf | real-world form PDF (USCIS I-9 2025), page 1 | 1 (text) | false | true | secret text recurs 3x on the page; only the targeted occurrence was removed |
| real-world-health-declaration-2021.pdf | real-world form PDF (health declaration 2021), page 1 | 1 (text) | false | true | secret text recurs 3x on the page; only the targeted occurrence was removed |
| mid-run-helvetica.pdf | secret is the middle substring of ONE Tj (not a separate run); exercises per-glyph split of a single text object | 1 (text) | false | true | whole BT..ET run removed (more than the secret alone) |
| mid-run-tj-kerned.pdf | one TJ array with per-glyph kerning holds the whole line; secret is the middle run of that single array | 1 (text) | false | true | whole BT..ET run removed (more than the secret alone) |
| mid-run-embedded.pdf | embedded subset TrueType (Identity-H hex Tj); secret is the middle substring of ONE Tj | 1 (text) | false | true | whole BT..ET run removed (more than the secret alone) |
| mid-run-hebrew.pdf | embedded Hebrew font, ONE Tj holds three RTL-visual-order words; box covers only the middle (secret) word | 1 (text) | false | false | whole BT..ET run removed (more than the secret alone) |
| two-boxes-one-line.pdf | ONE Tj holds two distinct secrets; two rects target each independently (embedpdf #801 class: does clearing the first corrupt the second read?) | 1 (text) | false | true | whole BT..ET run removed (more than the secret alone) |

77-page stress doc (20 text lines + 1 box per page): **76.0ms** total for extract+delete across 77 pages, one object removed per page.

Raw checker output:
```
file                                    secretUnderBox  secretAnywhere  keepTextIntact
--------------------------------------  --------------  --------------  --------------
plain-helvetica-line.pdf                false           false           true          
partial-overlap-word.pdf                false           false           true          
tj-array-kerning.pdf                    false           false           true          
embedded-subset-truetype-latin.pdf      false           false           true          
hebrew-rtl-line.pdf                     false           false           true          
form-xobject-text.pdf                   true            true            true          
    offending: ["XOBJECT-SECRET-77"]
rotated-ctm-text.pdf                    false           false           true          
page-rotate-90.pdf                      false           false           true          
raster-image-partial.pdf                false           false           true          
raster-image-full.pdf                   false           false           true          
vector-path-highlight.pdf               false           false           true          
freetext-annotation.pdf                 false           true            true          
paragraph-line2-only.pdf                false           false           true          
real-world-irs-1040-2024.pdf            false           false           false         
real-world-uscis-i9-2025.pdf            false           true            true          
real-world-health-declaration-2021.pdf  false           true            true          
mid-run-helvetica.pdf                   false           false           true          
mid-run-tj-kerned.pdf                   false           false           true          
mid-run-embedded.pdf                    false           false           true          
mid-run-hebrew.pdf                      false           false           false         
two-boxes-one-line.pdf                  false           false           true          

20 of 21 entries did NOT match the expected baseline (secret under box + keepText intact):
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
 - freetext-annotation.pdf
 - paragraph-line2-only.pdf
 - real-world-irs-1040-2024.pdf
 - real-world-uscis-i9-2025.pdf
 - real-world-health-declaration-2021.pdf
 - mid-run-helvetica.pdf
 - mid-run-tj-kerned.pdf
 - mid-run-embedded.pdf
 - mid-run-hebrew.pdf
 - two-boxes-one-line.pdf
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
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.

(checker exited 1)
```
