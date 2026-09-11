---
id: "MOBI-02"
title: "A form filled in PDkef still ships with its live, empty fields"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MOBI-02 · A form filled in PDkef still ships with its live, empty fields

## Scope and acceptance

**`signPdf` never touches the AcroForm.** `src/editor/adapters/pdf/sign.js` loads the document,
draws each element through its registry owner onto the page content stream, and saves. A source PDF
that carries form fields therefore exports with every one of those widget annotations intact and
still empty, sitting on top of the answers PDkef just drew. Widget annotations paint above page
content in most viewers, so the recipient can open the returned form and see an empty white field box
covering the text the sender typed. The sender has no way to know: PDkef's own canvas shows the
drawn text, because pdf.js under its default `annotationMode` of `ENABLE` paints the widget
appearance streams as ordinary page content and everything looks right.

Note the scope this does *not* have. Neither Israeli government form used as evidence in this epic
carries an AcroForm at all (see MOBI-03), so this is not the blocker for the flagship use case. It is
a correctness defect that produces a silently wrong document for the subset of forms that do have
fields, which is why it is worth fixing and why it is not P1.

Decide the export policy explicitly rather than reaching for the first option:

1. **Flatten the form on export.** `form.flatten()` bakes each widget's current appearance into page
   content and removes the fields. Almost always what a recipient wants from a returned form, but it
   regenerates appearances and needs a font, it throws on some documents, and it silently ends the
   document's life as a fillable form.
2. **Leave the form alone and draw over it.** What happens today. Preserves fillability and produces
   the defect above.
3. **Flatten only when PDkef drew something that overlaps a widget rect.** Narrowest fix, most
   behaviour to explain.

Two complications to handle rather than skip. `getForm()` in `@cantoo/pdf-lib` strips XFA data unless
the document was loaded with `preserveXFA`, so a hybrid XFA/AcroForm document must not be quietly
degraded by merely asking whether a form exists. And flattening must not run on documents with no
form, which is the common case here, so the check has to be cheap.

**Acceptance.** A source PDF carrying at least one AcroForm text field, filled and exported through
PDkef, opens in at least two independent viewers (Chrome's built-in viewer and macOS Preview) showing
the drawn answers with no live editable field covering them. Both viewers are named in the result with
what each showed before and after. The chosen policy above is recorded in this ticket with its
reasoning. A document with no AcroForm exports byte-comparably to today, proving the new path is inert
on the common case. A document PDkef refuses to flatten fails loudly rather than silently returning
option 2's output.

## Implementation 2026-09-11

**Policy chosen: option 1, flatten the form on export, whenever the document has an AcroForm with at
least one field.** Verified rather than assumed, by reading pdf-lib's actual `PDFForm.flatten()`
source (`node_modules/@cantoo/pdf-lib/cjs/api/form/PDFForm.js`) and probing it directly against a
built PDF before writing any product code:

- `flatten()` defaults `updateFieldAppearances: true`, which only regenerates an appearance stream for
  a field that is dirty or has none (`field.needsAppearancesUpdate()`). PDkef never calls
  `field.setText()` or otherwise touches a form field's value, so every field reaching flatten here is
  untouched from the source PDF: its existing appearance stream (usually just an empty box, sometimes
  no border at all) is reused as-is. The "needs a font, and the default is a WinAnsi-only Helvetica"
  risk the ticket names is real for a field pdf-lib itself has to draw new text into, but does not fire
  on PDkef's own path, since we never make a field dirty. It would only trigger on a source PDF that
  itself carries a field with no appearance stream at all - an unusual, malformed producer output - and
  in that case a genuine `flatten()` throw is exactly what the loud-failure path below is for.
- `flatten()` bakes each widget's appearance by **appending** content-stream operators to its page,
  through the same `page.pushOperators` this file already uses for its own elements
  (`flattenWidgetOntoPage` in `PDFForm.js`). Confirmed by reading that method directly, not inferred.
  This is why flattening runs **before** the per-element draw loop in `signPdf`, not after: PDF content
  streams paint later operations on top, so drawing PDkef's own elements second is what keeps them
  visually above the flattened (and typically empty) field box, rather than reproducing the exact "form
  field paints over the answer" defect this ticket exists to fix.
- Rejected option 2 (leave the form alone): this is what shipped today and is the defect.
- Rejected option 3 (flatten only on overlap): narrower, but adds a second geometry-intersection code
  path to maintain (element rect vs. widget `/Rect`, in PDF space, across rotation/crop/UserUnit) for a
  case - a source PDF with an untouched AcroForm - that is already rare among this project's evidence
  (see MOBI-03: neither Israeli government fixture has one at all). A returned "form" whose fields
  PDkef did not touch has no remaining reason to stay fillable either, since nothing in it can still be
  filled in a way the recipient would want; flattening the whole thing is simpler and not meaningfully
  more destructive than flattening only the overlapping fields.

**Complications, handled:**

- **XFA.** `hasFillableAcroForm(pdfDoc)` (new, in `src/editor/adapters/pdf/pdfObjects.js`) answers "does
  this document have a form to flatten" via `pdfDoc.catalog.getAcroForm()` - pdf-lib's own low-level,
  side-effect-free dict lookup - never via `pdfDoc.getForm()`, which strips XFA data as a documented
  side effect unless the document was loaded with `preserveXFA`. This keeps the mere *check* inert on a
  hybrid XFA/AcroForm document. `pdfDoc.getForm()` is only called once `hasFillableAcroForm` has already
  confirmed a form exists, and at that point stripping XFA is an accepted consequence of the chosen
  policy: PDkef does not render or fill XFA today, and a flattened document has no further use for the
  duplicate XFA data regardless of whether we touched it or not.
- **Cheap and inert on the common case.** `hasFillableAcroForm` does one dict lookup and one array
  length check; it does not construct a `PDFForm`, resolve any widget, or touch any page. Verified this
  is actually exercised, not just plausible, with a test that spies on `PDFDocument.prototype.getForm`
  across a full `signPdf` run on `src/lib/__fixtures__/num-1.pdf` (no AcroForm) and asserts the spy is
  never called.

**What shipped:**

- `src/editor/adapters/pdf/pdfObjects.js`: `hasFillableAcroForm(pdfDoc)`.
- `src/editor/adapters/pdf/sign.js`: the flatten step (guarded by `hasFillableAcroForm`, placed after
  the existing coverage pre-pass and before the draw loop) and a new `FormFlattenError` class,
  following `UnrepresentableTextError`/`FontUnavailableError`'s existing shape (`name`, and here a
  `cause` carrying pdf-lib's original thrown error) - thrown instead of letting a `flatten()` exception
  propagate raw, or worse, being caught and silently falling back to drawing over the unflattened form.
- `src/editor/adapters/pdf/sign.test.js`: four new tests under "MOBI-02: flattens a source AcroForm on
  export" -
  1. builds a PDF with one unfilled AcroForm text field via pdf-lib, runs it through `signPdf` with a
     text element placed over the field, reloads the output and asserts `hasFillableAcroForm` is now
     false, `getForm().getFields()` is empty, the page's `/Annots` is empty or absent, and the drawn
     text ("Jane Doe") is still present and still real text (via pdf.js `getTextContent()`, not a
     rasterized page).
  2. inertness: runs `signPdf` on the existing no-AcroForm fixture with `PDFDocument.prototype.getForm`
     spied on, and asserts the spy is never called - proving the new code path does nothing on the
     common case rather than merely returning the same bytes by coincidence.
  3. a direct unit check that `hasFillableAcroForm` itself returns `false` for the plain fixture and
     `true` once a field is added, independent of the full `signPdf` path.
  4. loud failure: stubs the real form's `flatten` method (obtained via a spied `getForm()`, so the
     rest of pdf-lib's real behavior is untouched) to throw, and asserts `signPdf` rejects with a
     `FormFlattenError` whose `cause` is the original error - never a partially-written or
     silently-unflattened output.

  Test count: 30 -> 34 in this file; 2239 total in `npm test`, all green (was 2235 before this change).
  `npm run typecheck` is clean (0 errors/warnings/hints across 452 files).
  `npm run test:editor-dependency-directions` passes unchanged (the new import is `sign.js` ->
  `pdfObjects.js`, already the same directory and an existing dependency edge).

**Pending: the acceptance's own two-viewer check has not been done.** I cannot open a viewer myself. A
sample output PDF is at `tmp/mobi-02-flattened.pdf` in this worktree (untracked, not committed;
generated by a throwaway script run once and deleted) - a 400x300pt page with an AcroForm text field
`applicant.name` addToPage at (40, 190, 220x28), left unfilled, and a PDkef text element "Jane Doe"
drawn over it. Needs opening in Chrome's built-in viewer and macOS Preview to confirm no live/empty
field box is visible over "Jane Doe" in either. Front matter `status` stays `"open"` until that check
is done and reported back; the code itself is complete and tested.
