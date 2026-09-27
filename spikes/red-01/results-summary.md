# RED-01: closing the mid-run-Tj gap, ours vs. PDFium side by side

## The gap this fills

Every existing corpus fixture that puts a secret "in the middle of a line" (`partial-overlap-word.pdf`)
does it with **three separate `Tj` operators** (pdf-lib's `drawText` called three times for
prefix/secret/suffix). pdf.js reports each as its own text item, so locating and redacting "just the
middle one" never has to split a single text-showing operator at the glyph level.

PDFium's engine (`spikes/red-01/pdfium/engine-pdfium.mjs`) has code for exactly that split - group
characters by owning text object, mark which are inside the box, and rebuild the surviving runs
(`redactTextObjects`'s partial branch) - but no corpus fixture ever exercised it: every corpus PDF that
partially overlapped a text object also happened to have the secret already isolated in its own `Tj`.

Five new fixtures put the secret **inside one single Tj/TJ operator**, so PDFium's partial-object
rebuild finally runs (confirmed below: `textRebuilt=1` for all five, where it was previously always
`textRemoved` or untouched for existing single-secret-per-run fixtures):

- `mid-run-helvetica.pdf` - one `Tj`, standard font
- `mid-run-tj-kerned.pdf` - one `TJ` array with interleaved kerning numbers (same technique as
  `tj-array-kerning.pdf`, but for the whole line, not just the secret)
- `mid-run-embedded.pdf` - one `Tj`, embedded subset TrueType (Identity-H hex string)
- `mid-run-hebrew.pdf` - one `Tj`, embedded Hebrew font, RTL visual-order trick, three "words" with the
  secret in the middle
- `two-boxes-one-line.pdf` - one `Tj` holding **two** independent secrets, two rects (`corpus.json`'s new
  `rects`/`secrets` array fields) - the embedpdf #801 class of bug: does redacting the first target
  corrupt the reads needed for the second, inside the same text object?

All five verify true on the unredacted corpus: `secretUnderBox: true`, `keepTextIntact: true`.

`check-extractable.mjs` gained minimal `rects`/`secrets` (array) support: `secretUnderBox` is now `true`
if **any** of an entry's boxes still leaks its own secret, so a redaction that only clears one of two
targets still reports as a miss. `engine-ours.mjs` and `engine-pdfium.mjs` got the matching minimal
support (map over `entry.rects || [entry.rect]`, "any box intersects/contains" instead of one).

## What changed in the checker

Two gaps made the PASS column below untrustworthy, both closed in `check-extractable.mjs` without
touching the engines:

1. **Same-line collateral.** `keepText` often sits on a *different* line from the redaction box (every
   `mid-run-*`/`two-boxes-one-line` fixture, and all three real-world entries), so an engine that deletes
   the *whole* text-showing run - taking the words beside the secret with it - still passed, because the
   thing actually being checked for survival was never near the box. `corpus.json` gained a
   `keepSameLine: string[]` field on those entries: the word(s) immediately left and right of the box on
   the *same* line ("Name: Jane" / "Example" for the `mid-run-*` fixtures; "SSN:" / "DL:" for
   `two-boxes-one-line.pdf`; the two outer visual-order words for `mid-run-hebrew.pdf`). The checker's new
   `sameLineIntact` is `true` when every one of those strings is still extractable anywhere on the page
   (position-agnostic, same rule as `keepTextIntact`); the three real-world entries got `keepSameLine: []`
   because each secret is alone on its own text-content line (verified directly from pdf.js item rects -
   see `feature` field). PASS now requires `sameLineIntact`.
2. **Annotations.** The existing position-aware `secretUnderBox` check only ever looked at
   `getTextContent()`, so it was structurally blind to a secret living in an annotation (FreeText
   `/Contents`, a form field's `/V`) - both engines "passed" `freetext-annotation.pdf` while neither one
   touches annotations at all. The checker now also pulls each annotation's own rect (through the same
   viewport transform as text items) and text, and computes `secretInAnnotationUnderBox`: true if any
   annotation whose rect intersects one of the entry's redaction boxes still contains that box's secret in
   its own text. PASS now requires this to be `false`.

New PASS definition: `secretUnderBox` false, `keepTextIntact` true, `sameLineIntact` true,
`secretInAnnotationUnderBox` false (for the two raster-image entries, also: secret-color pixels
remaining = 0 and, where a keep region is meant to survive, keep-color pixels remaining > 0, from
`check-images.mjs`, unaffected by this change).

**One caveat surfaced by re-running the checker over the untouched corpus as a sanity check:**
`mid-run-tj-kerned.pdf`'s own baseline PDF fails `sameLineIntact` (offending text ends `"...Exampl"`,
missing the final "e"). This isn't a redaction artifact - it's pdf.js's own `getTextContent()` dropping
the last character of the interleaved-kerning `TJ` array that `make-corpus.mjs` hand-builds for that
fixture (the array's last per-glyph kerning number apparently confuses pdf.js's width accounting). It
doesn't affect this exercise's conclusions: `ours` fails `sameLineIntact` on this entry regardless, for
the unrelated and more serious reason that it deletes the whole line outright, and `pdfium`'s rebuilt
output reads back *cleaner* than the original (a full, correctly-spelled `"Example"`), so its PASS is
genuine. Flagging it here rather than quietly special-casing it out of the corpus.

## Result table

| entry | ours (whole-object delete) | pdfium (glyph-level) |
| --- | --- | --- |
| plain-helvetica-line.pdf | PASS | PASS |
| partial-overlap-word.pdf | PASS | PASS |
| tj-array-kerning.pdf | PASS | PASS |
| embedded-subset-truetype-latin.pdf | PASS | PASS |
| hebrew-rtl-line.pdf | PASS | PASS |
| form-xobject-text.pdf | FAIL (secret still extractable; whole-object matcher never descends into the Form XObject's own content stream) | FAIL (secret still extractable; the Form XObject is only inspected/reported, never redacted) |
| rotated-ctm-text.pdf | PASS | PASS |
| page-rotate-90.pdf | PASS | PASS |
| raster-image-partial.pdf | FAIL (whole image object removed; the intended-to-survive keep-color half is lost too - no partial pixel redaction) | FAIL (pixels are correct - secret-color 0, keep-color 9700 survive - but the invisible caption text still leaks the fragment `"SECRET"` under the box after a partial-object text rebuild) |
| raster-image-full.pdf | PASS | PASS |
| vector-path-highlight.pdf | PASS | PASS |
| freetext-annotation.pdf | **FAIL** (`secretInAnnotationUnderBox`: the FreeText annotation's `/Contents` still *is* the secret, untouched - the previous checker never looked at annotation text at all) | **FAIL** (same: `secretInAnnotationUnderBox` true; neither engine edits annotations) |
| paragraph-line2-only.pdf | PASS | PASS |
| real-world-irs-1040-2024.pdf | FAIL (keepText removed along with the secret; whole-object delete took more than the targeted run) | PASS |
| real-world-uscis-i9-2025.pdf | PASS | PASS |
| real-world-health-declaration-2021.pdf | PASS | PASS |
| **mid-run-helvetica.pdf** | **FAIL** (`sameLineIntact` false: whole-object delete also removes "Name: Jane" and "Example", which live in the same `Tj` as the secret) | PASS |
| **mid-run-tj-kerned.pdf** | **FAIL** (same reason: whole `TJ` array deleted, "Name: Jane" / "Example" gone with it) | PASS |
| **mid-run-embedded.pdf** | **FAIL** (same reason) | PASS |
| **mid-run-hebrew.pdf** | FAIL (whole Tj line deleted - both flanking "keep" words live in the *same* text object as the secret, so keepText and keepSameLine both go with it) | FAIL (glyph-level split runs, but the survivors come back logically-reordered and missing their innermost 1-2 characters - see note below) |
| **two-boxes-one-line.pdf** | **FAIL** (`sameLineIntact` false: "SSN:" and "DL:" live in the same whole-object-deleted `Tj` as both secrets) | PASS (both secrets gone, `SSN:`/`DL:` prefixes and the separate keepText line all survive - no embedpdf #801 corruption observed) |

Rows in **bold** are this change's five gap-fill fixtures; entries marked **FAIL** in bold text are new
failures this checker update uncovered that the previous two-column checker reported as PASS.

## Notes

- **The gap is closed for PDFium, and now verified against same-line collateral too.** All four
  single-secret mid-run fixtures now drive `redactTextObjects`'s partial-rebuild branch (`textRebuilt=1`,
  confirmed via `node spikes/red-01/pdfium/engine-pdfium.mjs`'s own per-file log), where every previous
  corpus fixture either removed a whole object or left the object untouched. With `keepSameLine` added,
  `mid-run-helvetica.pdf`/`mid-run-tj-kerned.pdf`/`mid-run-embedded.pdf` still PASS - PDFium's rebuild
  keeps `"Name: Jane"` and `"Example"` intact, not just the separately-checked `keepText` line below.
  `ours` fails all three now that a same-line check exists: whole-object delete takes those words with
  the secret.
- **two-boxes-one-line.pdf is the interesting positive result, and now a clean one.** This is the shape
  of the real embedpdf #801 bug (two redaction targets sharing one text object, where clearing the first
  could corrupt the matrix/origin reads needed for the second). PDFium's "read everything up front,
  mutate in a second pass" design (documented at the top of `engine-pdfium.mjs`) held up: both secrets
  are gone and both surviving fragments (`SSN:`, `DL:`, and the separate keepText line) came back intact,
  now confirmed by `sameLineIntact` rather than assumed. `ours` no longer gets credit for this one: with
  `keepSameLine` in place, its whole-`Tj` delete is correctly caught taking `"SSN:"`/`"DL:"` down with the
  secrets, even though the separate keepText line survives untouched.
- **mid-run-hebrew.pdf is a genuine, new PDFium finding, not a fixture artifact.** Its box was
  re-measured with a tighter 1pt pad (vs. every other fixture's 3pt) to rule out padding eating into the
  neighbouring words' innermost glyphs; the result didn't change. `FPDFText_GetUnicode`'s per-character
  values for the surviving runs come back in **logical** (unreversed) Hebrew reading order, while the
  characters keeping their spike-authored **visual**-order glyph indices, and 1-2 boundary characters
  next to the removed region are dropped from each surviving run. Concretely: expected survivors
  `"טסקטדוע"` and `"ראשנשטסקט"` (the two outer words, visual order) came back as `"ודטקסט"` and
  `"טקסטשנש"` - garbled and short. This only surfaces for a partial (glyph-level) rebuild of RTL text;
  the existing `hebrew-rtl-line.pdf` fixture never rebuilds a Hebrew object (it's always removed whole),
  so this is new information from this change, not a re-run of a known issue.
- **raster-image-partial.pdf's PDFium caption leak is unrelated to the pixel work** the fixture's
  comment already documents (the caption is white/invisible text drawn over the image purely so
  `check-extractable.mjs` has a text-based secret to probe; the real measurement for this fixture is
  pixel-based). The pixel result is a clean PASS; the caption text partial-rebuild leaking a `"SECRET"`
  fragment is a separate, smaller finding about PDFium's partial-text-rebuild fidelity, consistent with
  the same "surviving run doesn't exactly match the original text" pattern seen in `mid-run-hebrew.pdf`.
- Page-3 PNG rendering of the PDFium mid-run outputs (step 3 of the brief) was skipped: this checkout's
  `node_modules` has no `canvas` package, and pdfjs-dist's legacy Node build needs one to rasterize; the
  pdf.js `getTextContent()` position data used throughout this file (and by `check-extractable.mjs`)
  already confirms the kept words' rects are unchanged from their pre-redaction positions, which was the
  purpose that render would have served.
