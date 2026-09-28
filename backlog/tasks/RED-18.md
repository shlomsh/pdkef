---
id: "RED-18"
title: "Spike: true redaction, removing only what is under each box and keeping the rest as the original"
status: "done"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-18 · Spike: true redaction, removing only what is under each box and keeping the rest as the original

*Planned with Shlomi 2026-09-28. Plan: [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

The goal: a saved, redacted file behaves like the original everywhere nobody drew a box. Reopened in
Redact, its other text can be searched, deleted and written over, and nothing is left under a box.
Today every covered page is a picture (with RED-12's invisible text); this replaces that.

## Approach to prove

Our own content-stream editor on pdf-lib (already shipped), with positions from
`src/editor/adapters/pdf/pageGlyphs.ts`. No new engine or download. RED-01's own parser failed because it
didn't know where each glyph sat and deleted whole lines; the glyph reader is that missing piece.

- **Text.** Line up pdf.js's show-text operations with the raw content stream, checking the char codes
  match; any mismatch sends that page to the fallback. Glyphs a box covers (by the glyph-core rule
  RED-12 uses, so a box grazing a neighbour leaves it) are deleted, including invisible OCR text. The
  surviving glyphs keep their **original codes and order**, with a TJ adjustment so they stay in place.
  That is where PDFium failed on Hebrew in RED-01. A glyph cut by a box edge is deleted and its visible
  part kept as a tiny picture.
- **Images.** The box is painted into the image's own pixels. An image shown on several pages (a
  watermark) is handled once; an image fully covered is deleted.
- **Drawn shapes.** Straight lines and rectangles (form borders) are cut exactly; a curve crossing a box
  (a vector signature, a logo) becomes a picture of that shape.
- **Shared content.** A form XObject used by other pages is copied before it is edited.
- **Annotations.** Form field values, comments and Watermark annotations under a box are removed.
- **Leftovers.** The replaced content streams and images must not survive as unreferenced objects in the
  saved file (pdf-lib keeps them unless deleted).

## Corpus

RED-01's 21 files, the IRS 1040, USCIS I-9 and Israeli health declaration, the Hebrew cases, and new
watermark cases: one header image shared by every page (covered fully, and partly), a text watermark, a
Watermark annotation, and a diagonal watermark behind body text (removed with Delete, not a box).

## Checks (each independent of the removal)

1. Pixel match: the saved page drawn matches the original with the boxes painted, everywhere.
2. Text: pdf.js's own text extraction of the saved page equals the original minus exactly the removed words.
3. Bytes: no removed text operand or replaced image stream remains anywhere in the saved file.
4. Annotations: none left under a box.
5. Save, reopen in Redact, keep working: Find finds untouched words, Delete removes an untouched element,
   a new box works.

## Bar (Shlomi, 2026-09-28)

Zero leaks on every file, and the three real forms plus the Hebrew cases pass with no page falling back
to a picture. The built-to-break files may fall back; report the rate. Also report time per page and
file size against today's export. The results go in `spikes/red-18/` and the decision in the plan doc.

## Decision (2026-09-28, later): stop, single-image flattening

The spike met its bar, and the build was planned. Shlomi then weighed it as over-complex for its
value and chose single-image flattening for covered pages, with no invisible text layer: a picture
holds nothing under a box by construction. RED-19 to RED-23 are retired. The results below stay as the
record, and as the starting point if editing a covered page is ever asked for again.

## Result (2026-09-28): the spike met the bar, with six rules a build would add

Each piece was measured on its own, in `spikes/red-18/` (results-*.md):

| Piece | Result |
| --- | --- |
| Lining up pdf.js's text with the raw bytes (`results-align.md`) | 21 of 21 files, 25 of 25 pages, sabotage-tested |
| Text removal (`results-text.md`) | 20 of 20 files pass text, position (max 0.0000pt) and byte checks, no fallback; the 1040, I-9, health declaration and every Hebrew case included |
| Images and straight paths (`results-images.md`) | 7 of 7 touched files pass; a shared watermark image copied for its one page; an exact cut on the real 1040 |
| Annotations, fields, shared forms (`results-annotations.md`) | 5 of 5 cases, with two gaps (rules 3 and 4 below) |
| Hard cases (`results-fallbacks.md`) | embedded CMaps, inline images without a known length, text in patterns, unsafe Type3: each a reported fallback, never a crash or a silent pass |
| Pixels in a real browser (`results-pixels.md`) | 23 of 24 pages match outside the boxes; the one miss is rule 1 |
| Cost | a few bytes to a few KB per file, against a 7 to 740 KB JPEG per covered page today; about 145 ms per file in Node |

Against the bar: no secret survived in any output, and the real forms and Hebrew needed no fallback. The
gaps below are places where the spike stopped short, each with a known fix; none needs a new engine.

1. **A cut letter keeps its visible part as a small picture.** A letter a box partly covers is deleted,
   so its uncovered part vanished (the Hebrew mid-run case, about 5pt of a letter). Needs a canvas, so
   it runs in the browser: render the letter's area from the original with the box painted, place it.
2. **A curve crossing a box becomes a small picture of that shape**, the same way.
3. **A field value is removed everywhere the field is shown**, with every widget's appearance cleared,
   and the person told where else it was cleared. The spike left a second widget still drawing the value.
4. **An object that can't be deleted is emptied.** A link under a box on the I-9 stayed in the file
   because the structure tree points at it; strip its /URI, /A, /Contents and /AP.
5. **Any `fallback:` note sends the page to a picture**, even when its text lines up (text in a pattern
   lines up vacuously).
6. **The box is painted**, in its own colour (the spike painted only black, and the text step none),
   solids after blurs as RED-20 says; a JPEG image is decoded by the browser, not Node's `sharp`.

Not exercised: DCT images, shared appearance streams, radio groups, a shared form edited "everywhere",
and the save, reopen, keep working flow; each goes into the build's corpus.
