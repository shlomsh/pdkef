---
id: "RED-16"
title: "One text reader: Delete's previews read their text from the glyph read, and the second decoder goes"
status: "done"
priority: "P3"
epic: "redact"
depends_on: []
---

# RED-16 · One text reader: Delete's previews read their text from the glyph read, and the second decoder goes

*Split from RED-12 on 2026-09-28, where it was the last bullet ("One text reader afterwards").*

Delete's previews come from our own content-stream parser, with its own partial ToUnicode decoding and
reading-order fix (`src/editor/adapters/pdf/visualOrder.js`). RED-12 now reads every glyph's Unicode
value and exact place through pdf.js (`src/editor/adapters/pdf/pageGlyphs.ts`), including Hebrew in the
page's own glyph order. Take Delete's preview text from that read and retire the second decoder.

## Acceptance

- Delete's previews read the same text pdf.js reads, Hebrew in order, with RED-13's guards still green.
- `visualOrder.js` and the parser's own ToUnicode decoding are gone, or what remains says why.

## 2026-10-01 board cleanup

- Dropped RED-12 from depends_on: RED-12 is retired (its text layer was reverted on 2026-09-28; `pageGlyphs.ts` is still the glyph read this ticket builds on).
- Priority P2 -> P3: it is a pure refactor.

## Result

Done 2026-10-01 on `red16-one-reader`.

- **Removed:** `visualOrder.js` and its test; in `pdfObjects.js` the preview accumulation and the `visualToLogical` call, so a text object now carries no `preview` from the parser. **Stayed, and why:** `parseToUnicode` / `font.toUnicode`, still needed by `isCheckboxGlyph` (Sign's checkbox detection recognises a ☐ by its ToUnicode value); its comment says so.
- **New:** `editor/adapters/pdf/deletePreviews.ts` `previewTexts(objects, glyphs, geometry)`: a glyph belongs to a text object when its centre lies in the object's `bbox` (PDF user space, the glyphs' own space, so no page-size inversion); a glyph no box holds goes to the nearest box within a short reach, because the parser sizes a run from `/Widths` or half an em a glyph and an unembedded standard font's box ends a few letters short (found by `deleteObjects.test.js`, "KEEP M"). The words are put in order by `textInReadingOrder`, new in `textLayer.ts` and now the shared core of `wordsUnderBoxes` (the saved-file check's rule): no third ordering. No glyph in the box: no preview.
- **Wiring:** `useObjectPreviews.ts` wraps `useDeletableObjects` inside `useDeleteTool`; it reads each text page's glyphs through pdf.js (`readGlyphs`, 400k-glyph `GLYPH_BUDGET` shared with Find, later pages keep no preview) and returns the objects with `preview` filled in as pages finish. So the hover label, `markObjects`' stored `preview` and `deletedTerms` need no change. Chosen over looking up at mark time: one place, and the label needs the text before any mark exists.
- **Tests:** `deletePreviews.test.ts` (Latin, Hebrew visual and logical storage, number in Hebrew, outside glyph, no glyphs, run-end), `check/deletePreviews.corpus.test.js` (mid-run-hebrew and hebrew-rtl-line equal pdf.js's text in Find's order; the real Hebrew form's words are in pdf.js's order), `useObjectPreviews.test.tsx`; the editor delete tests that found a run by `preview` now go through `objectPreviews.test-helper.js`.
- **Known edge:** a number with punctuation in a Hebrew line ("1.") reads ".1" by position, as in the saved-file check; pdf.js's bidi puts the dot after. Letters are right either way.
- **Follow-up (island, not touched here):** pass `readPreviews: activeStyle === 'delete'` to `useDeleteTool` in `PdfRedactTool.tsx` so the text is read only once Delete is in use. Until then it is read when a file opens.

Lead's check, 2026-10-01: against the old decoder, previews on the three real forms are the same or better (health declaration 438/844 both, the 406 blanks were blank before; IRS 1040 208/208 both; I-9 119 -> 123), and the two Hebrew fixtures read identically. The read starts when a file opens, not when Delete is armed: a delete box stores its preview at the click, and the saved-file check searches for it, so a late read would leave a quick first deletion unchecked. A finished read is reused when Delete is armed again.
