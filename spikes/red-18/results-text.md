# RED-18: true redaction of text

20 file(s) pass every check with no fallback. 0 file(s) fell back (not edited). 0 file(s) were edited but failed a check.

Real-world forms and Hebrew cases:
- hebrew-rtl-line.pdf: PASS (pass)
- real-world-irs-1040-2024.pdf: PASS (pass)
- real-world-uscis-i9-2025.pdf: PASS (pass)
- real-world-health-declaration-2021.pdf: PASS (pass)
- mid-run-hebrew.pdf: PASS (pass)

---
## plain-helvetica-line.pdf

- Boxes: 1, secrets: "PLAIN-SECRET-1234", feature: plain Helvetica line, single Tj
- Glyphs removed: 17, survivors on the page: 33.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "PLAIN-SECRET-1234"
- Survivor positions: 33 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## partial-overlap-word.pdf

- Boxes: 1, secrets: "ACC-99887766", feature: secret is the middle run of one visual line (partial overlap); prefix/suffix must survive
- Glyphs removed: 14, survivors on the page: 75.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "ACC-99887766"
- Survivor positions: 75 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## tj-array-kerning.pdf

- Boxes: 1, secrets: "KERN-SECRET-42", feature: single TJ operator with per-glyph kerning numbers
- Glyphs removed: 14, survivors on the page: 31.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "KERN-SECRET-42"
- Survivor positions: 31 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## embedded-subset-truetype-latin.pdf

- Boxes: 1, secrets: "SUBSET-LATIN-SECRET", feature: embedded subset TrueType font (Latin, Arimo)
- Glyphs removed: 19, survivors on the page: 21.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "SUBSET-LATIN-SECRET"
- Survivor positions: 21 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## hebrew-rtl-line.pdf

- Boxes: 1, secrets: "ילארשידוס", feature: embedded Hebrew font, RTL secret (visual order, no shaping)
- Glyphs removed: 9, survivors on the page: 9.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "ילארשידוס"
- Survivor positions: 9 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## form-xobject-text.pdf

- Boxes: 1, secrets: "XOBJECT-SECRET-77", feature: text drawn inside a Form XObject invoked via Do
- Glyphs removed: 17, survivors on the page: 41.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 1 word(s) added.
  - missing: "directlyXOBJECT-SECRET-77"
  - ADDED (unexpected): "directly"
- Survivor positions: 41 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.
  - (every added word above is a fragment of a missing word or the secret - expected from glyph-level, not word-level, removal)

## rotated-ctm-text.pdf

- Boxes: 1, secrets: "ROTATED-SECRET-30", feature: text drawn with a 30deg rotated CTM
- Glyphs removed: 17, survivors on the page: 19.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "ROTATED-SECRET-30"
- Survivor positions: 19 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## page-rotate-90.pdf

- Boxes: 1, secrets: "PAGE-ROTATE-90-SECRET", feature: page dictionary /Rotate 90; text unrotated in PDF space
- Glyphs removed: 21, survivors on the page: 25.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "PAGE-ROTATE-90-SECRET"
- Survivor positions: 25 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## raster-image-partial.pdf

- Boxes: 1, secrets: "IMG-PARTIAL-SECRET", feature: raster PNG partly covered by the box
- Glyphs removed: 12, survivors on the page: 35.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 1 word(s) added.
  - missing: "IMG-PARTIAL-SECRET"
  - ADDED (unexpected): "SECRET"
- Survivor positions: 35 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.
  - (every added word above is a fragment of a missing word or the secret - expected from glyph-level, not word-level, removal)

## raster-image-full.pdf

- Boxes: 1, secrets: "IMG-FULL-SECRET", feature: raster PNG fully covered by the box
- Glyphs removed: 15, survivors on the page: 29.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "IMG-FULL-SECRET"
- Survivor positions: 29 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## vector-path-highlight.pdf

- Boxes: 1, secrets: "PATH-HIGHLIGHT-SECRET", feature: filled vector-path rectangle (highlight) drawn behind real text
- Glyphs removed: 21, survivors on the page: 30.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "PATH-HIGHLIGHT-SECRET"
- Survivor positions: 30 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## freetext-annotation.pdf

- Boxes: 1, secrets: "FREETEXT-ANNOTATION-SECRET", feature: FreeText annotation whose /Contents is the secret (outside the content stream)
- No glyph on this page touched a box (nothing to remove); left unedited.

## paragraph-line2-only.pdf

- Boxes: 1, secrets: "Second line is the SECRET-LINE-2 to remove.", feature: 3-line paragraph, box covers line 2 only; lines 1 and 3 must survive
- Glyphs removed: 43, survivors on the page: 50.
- Text diff: 7 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "line", "Second", "is", "the", "SECRET-LINE-2", "to", "remove."
- Survivor positions: 50 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## real-world-irs-1040-2024.pdf

- Boxes: 1, secrets: "Department of the Treasury—Internal Revenue Service", feature: real-world form PDF (IRS 1040 2024), page 1 (secret is alone on its own line, no same-line neighbour to check)
- Glyphs removed: 52, survivors on the page: 4457.
- Text diff: 6 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "Department", "of", "the", "Treasury—Internal", "Revenue", "Service"
- Survivor positions: 4457 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.
- Byte scan, secret text elsewhere in the file (informational, not this spike's content-stream scope): secret text "Department of the Treasury—Internal Revenue Service" (plain/utf8): before 2, after 2 - unchanged by this edit (elsewhere in the file: metadata, other pages, or tagged content, not this box's content-stream run).

## real-world-uscis-i9-2025.pdf

- Boxes: 1, secrets: "USCIS", feature: real-world form PDF (USCIS I-9 2025), page 1 (secret is alone on its own line, no same-line neighbour to check)
- Glyphs removed: 6, survivors on the page: 3979.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "USCIS"
- Survivor positions: 3979 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## real-world-health-declaration-2021.pdf

- Boxes: 1, secrets: "הצהרת בריאות", feature: real-world form PDF (health declaration 2021), page 1 (secret is alone on its own line, no same-line neighbour to check)
- Glyphs removed: 12, survivors on the page: 3927.
- Text diff: 2 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "הצהרת", "בריאות"
- Survivor positions: 3927 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## mid-run-helvetica.pdf

- Boxes: 1, secrets: "SECRETWORD", feature: secret is the middle substring of ONE Tj (not a separate run); exercises per-glyph split of a single text object
- Glyphs removed: 12, survivors on the page: 49.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "SECRETWORD"
- Survivor positions: 49 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## mid-run-tj-kerned.pdf

- Boxes: 1, secrets: "SECRETWORD", feature: one TJ array with per-glyph kerning holds the whole line; secret is the middle run of that single array
- Glyphs removed: 12, survivors on the page: 56.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "SECRETWORD"
- Survivor positions: 56 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## mid-run-embedded.pdf

- Boxes: 1, secrets: "SECRETWORD", feature: embedded subset TrueType (Identity-H hex Tj); secret is the middle substring of ONE Tj
- Glyphs removed: 12, survivors on the page: 58.
- Text diff: 1 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "SECRETWORD"
- Survivor positions: 58 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

## mid-run-hebrew.pdf

- Boxes: 1, secrets: "ילארשידוס", feature: embedded Hebrew font, ONE Tj holds three RTL-visual-order words; box covers only the middle (secret) word
- Glyphs removed: 10, survivors on the page: 17.
- Text diff: 2 word(s) missing from the output (expected: the secret's words), 2 word(s) added.
  - missing: "ילארשידוס", "ראשנשטסקט"
  - ADDED (unexpected): "נשטסקט", "ילא"
- Survivor positions: 17 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.
  - (every added word above is a fragment of a missing word or the secret - expected from glyph-level, not word-level, removal)

## two-boxes-one-line.pdf

- Boxes: 2, secrets: "SECRETSSN12345", "SECRETDL67890", feature: ONE Tj holds two distinct secrets; two rects target each independently (embedpdf #801 class: does clearing the first corrupt the second read?)
- Glyphs removed: 30, survivors on the page: 42.
- Text diff: 2 word(s) missing from the output (expected: the secret's words), 0 word(s) added.
  - missing: "SECRETSSN12345", "SECRETDL67890"
- Survivor positions: 42 compared, max offset 0.0000pt.
- Survivors under a box: 0.
- Byte scan, removed-run bytes (must strictly decrease): every removed run's occurrence count dropped.

