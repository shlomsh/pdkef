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
