---
id: "RED-12"
title: "Covered pages keep their text: the picture plus an invisible text layer without the boxed words"
status: "in_progress"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-12 · Covered pages keep their text: the picture plus an invisible text layer without the boxed words

*Filed 2026-09-27 from Shlomi's review of the Redact epic. It replaces RED-04 to RED-08; the reasoning is
in [docs/redact-content-removal.md](../../docs/redact-content-removal.md), "Revised plan".*

Today every page with a Blur, Blackout or Whiteout box is saved as one picture. The secret is gone for
certain, but so is the rest of that page's text: it can't be selected, searched or read aloud. Scanned
PDFs solve the same problem with an invisible text layer over the picture. Do the same, leaving out
every word a box touches.

- **The picture stays as it is.** Same raster, same export path, same guarantee: nothing under a box
  survives in what you see.
- **Over it, invisible text** (text render mode 3) for every word on the page that no box touches, at
  its original position, size and angle, stretched (`Tz`) to its original width so selection lines
  up with the picture. The words come from the same text read Find uses (`src/lib/pdfTextItems.ts`,
  then `buildPageText`), so the two agree on what a word is.
- **Leave out a word, not letters.** A word whose measured extent, padded as `matchBoxes` pads a cut
  edge, touches any box is dropped whole. A secret half under a box goes with its word; erring toward
  dropping is the safe side. The boxed words are never written anywhere in the file.
- **Any script.** The text is invisible, so its font only has to encode the characters and map them
  back (ToUnicode). Resolve the family through `src/editor/text/fonts.js` per script, subset, and
  embed once per document.
- **Hebrew and Arabic read back in the right order.** Extractors order text from glyph positions, so
  a right-to-left line is written so that copy and search return it in logical order, in pdf.js and
  in the browsers' own PDF viewers.
- **No choice, no download, nothing new offline.** It's how covered pages are saved from now on.
  Pages with no box are untouched, as today.
- **Audit what the picture export still carries over.** Form field values, annotations, metadata,
  bookmarks or attachments that could hold what a box hides. Anything real is fixed here or split
  into its own ticket the same day.

- **One text reader afterwards.** Delete's previews come from our own content-stream parser, with its
  own partial ToUnicode decoding and reading-order fix (`visualOrder.js`). Once this ticket reads word
  positions through pdf.js, take Delete's preview text from that same read and retire the second decoder.

## Start with a spike

On the real forms in `spikes/red-01/` (IRS 1040, USCIS I-9, the Israeli health declaration) plus a
Hebrew line with its middle word boxed: export with the layer, then check copy, search and selection in
pdf.js, Chrome's viewer and macOS Preview, and measure how much the layer adds to the file. The spike
decides the right-to-left write order before any production code.

## Acceptance

- No text under any box can be extracted from the saved file (pdf.js text content, and a search of the
  raw uncompressed content streams).
- Every word no box touches can be found by search on the saved page, in page order.
- A Hebrew line with its middle word boxed: the words on either side come back whole and in order.
- Selecting a line on the saved page highlights close to the words in the picture.
- The file grows by a measured, small amount per page, recorded here.
- Opening Redact downloads nothing new; `test:weight` stays within budget.

## Result (2026-09-28)

Shipped as the revised plan, with the spike's one change: words come from **exact glyph positions**
(`src/editor/adapters/pdf/pageGlyphs.ts`, a replay of pdf.js's text state over the operator list), not
from Find's text items. Splitting a text item by a measurement put a word's edge a median 0.12 em from
its real glyphs and 0.35 em at p90 on the real forms, too loose to decide what a box covers. The full
record is in [docs/redact-content-removal.md](../../docs/redact-content-removal.md), "What shipped".

- **Write order for Hebrew and Arabic**: the page's own glyph order at the page's own places, so no
  reordering at all; every extractor reads the layer the way it reads the original.
- **Font**: one glyphless Type0 font for every script (not a fonts.js family): the text is never drawn.
  `.claude/rules/fonts-and-text.md` records the exception.
- **Leave out a word**: any word whose glyph core a box reaches, whole.

Acceptance, measured with `spikes/red-12/run.mts` on the IRS 1040, USCIS I-9, the Israeli health
declaration and a Hebrew line, read back by pdf.js, PDFium (Chrome) and PDFKit (Preview):

- No text under any box is extractable: never, in any engine, nor in the inflated streams.
- Words no box touches: all found, 100% in the original's order on the Latin forms (pdf.js, PDFium).
- Hebrew line, middle word boxed tightly: both neighbours whole and in order in pdf.js and PDFium.
  PDFKit splits that line the same way on the original. Boxed from Find instead, the neighbour drops,
  because Find's box paints over part of it: RED-15.
- Selection: PDFium's character boxes sit a median 0.5 to 0.8 pt from the original's, p99 about 3 pt.
- Size: 6 to 9 KB per covered page, about 1% of the picture.
- Nothing new downloads: the layer's font is 632 bytes inside the export module.
- Audit of what the picture export carries over: nothing. A covered page is a new page holding only the
  picture and the layer; the new document takes no metadata, outline, attachments or form.

Also fixed on the way: a rotated covered page is sized from its visible, rotated box instead of being
squeezed into its unrotated size. The "one text reader" bullet moved to RED-16.
