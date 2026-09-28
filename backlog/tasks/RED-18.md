---
id: "RED-18"
title: "Spike: true redaction, removing only what is under each box and keeping the rest as the original"
status: "open"
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
