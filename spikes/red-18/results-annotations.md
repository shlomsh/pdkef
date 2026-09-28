# RED-18/RED-21: removing annotations, form-field values, and a shared form XObject under a box

5 of 5 case(s) pass.

- FreeText annotation (freetext-annotation.pdf): PASS
- Watermark annotation (watermark-annotation.pdf): PASS
- Form fields fixture (mixed-fields.pdf): PASS
- Real-world USCIS I-9: widget + link removal on a 55-annotation page: PASS
- Shared Form XObject watermark (text-watermark-form.pdf): PASS

Measured vs inferred:
- Measured, independently of the writer, for every case: pdf.js re-opens the SAVED output fresh
  (getAnnotations, not the in-memory pdf-lib state) and confirms nothing under a box remains; a
  marker's occurrence count (raw stream bytes, decoded Tj/TJ string operands, and pdf-lib dict
  strings, each counted separately - see the "Verification" section in the source) is compared
  before vs after the edit, strictly dropping wherever the marker was present, never checked for
  bare absence (RED-18's own text spike found real, unrelated recurrences elsewhere in a
  real-world file that a bare-absence check would misreport as a leak).
- Inferred, not proven by this corpus: that "delete only if nothing else in the live document
  references it" (this file's deleteUnreferenced) is correct in general, beyond the one case that
  actually exercised it (the I-9 form's Link annotation, kept because a StructTree element and a
  ParentTree array both still reference it - confirmed by a direct scan, not assumed). No fixture
  here has TWO annotations legitimately sharing one appearance-stream object, so that path is
  exercised by the general algorithm but not by a dedicated case.
- Inferred: the untouched SharedField widget's own appearance stream still visually renders the
  now-deleted value (documented, not fixed - matches the brief's "remove it anyway, saying so").
  A real Redact UX would need to decide whether to also blank every OTHER widget's appearance when
  a shared field's value is removed; this spike only reports the gap.
- Not exercised: a radio-button group (multiple widgets, one field, each with its own /AS naming a
  DIFFERENT export value) - the field-value-removal logic doesn't special-case it, but no fixture
  here has one to confirm against.

---
## FreeText annotation (freetext-annotation.pdf)

- Non-Widget annotations removed: 1 (/FreeText).
  - /FreeText at [30,40,220,60]: object deleted.
- Widget fields touched: 0.
- Independent re-open: 0 annotation(s) still intersect the box (expect 0).
- Marker "FREETEXT-ANNOTATION-SECRET": before 2, after 0 (dropped).
- Body text "ordinary page text, not an annotation" still present: true.

## Watermark annotation (watermark-annotation.pdf) - page 1 only, pages 2-5 independent

- Non-Widget annotations removed: 1 (/Watermark).
  - /Watermark at [50,340,250,370]: object deleted.
- Widget fields touched: 0.
- Independent re-open, page 1: 0 annotation(s) still intersect the box (expect 0).
- Page 1's own annotation set no longer carries "WATERMARK-ANNOTATION-SECRET": true.
- Page 2: 1 annotation(s) remain (its own, independent Watermark object), still carries "WATERMARK-ANNOTATION-SECRET": true - OK.
- Page 3: 1 annotation(s) remain (its own, independent Watermark object), still carries "WATERMARK-ANNOTATION-SECRET": true - OK.
- Page 4: 1 annotation(s) remain (its own, independent Watermark object), still carries "WATERMARK-ANNOTATION-SECRET": true - OK.
- Page 5: 1 annotation(s) remain (its own, independent Watermark object), still carries "WATERMARK-ANNOTATION-SECRET": true - OK.

## Form fields fixture (mixed-fields.pdf)

- Non-Widget annotations removed: 2 (/Text, /Link).
  - /Text at [40,195,60,215]: object deleted.
  - /Link at [70,195,190,215]: object deleted.
- Widget fields touched: 2.
  - "SoleTextField": had a value: true, DV removed: true, widgets stripped here: 1.
  - "SharedField": had a value: true, DV removed: false, widgets stripped here: 1, SHARED - 1 other widget(s) of this field are not under a box; their value is gone too.
- Widget appearance-stream objects deleted: 2.
- Independent re-open: 0 non-widget annotation(s) still intersect the box (expect 0).
- Independent re-open: 2 widget(s) remain under the box (expected - the widget itself stays), 0 of them still report a field value (expect 0).
- Marker "SOLE-VALUE" (single-widget field, fully removed): before 4, after 1 (dropped).
- Marker "SHARED-VALUE" (shared field, one widget under the box): before 5, after 3 (dropped, but not to 0 - the OTHER widget's own appearance stream still shows it, though the field's /V is gone everywhere).
- The other SharedField widget (not under a box): fieldValue = "" (expected empty - /V is field-wide, gone for both widgets); its own appearance stream still visually shows "SHARED-VALUE" though (see the marker count above) - the documented, un-cleaned-up side effect of a shared value.
- Untouched link annotation remains: yes.
- Untouched checkbox ("AgreeCheckbox", not under any box) value: "Yes" (expected "Yes").

## Real-world USCIS I-9 form (real-world-uscis-i9-2025.pdf) - unfilled, 125 AcroForm fields, 55 annotations on page 1

- Non-Widget annotations removed: 1 (/Link).
  - /Link at [403.6,700.09,357.82,690]: object kept (still referenced elsewhere (e.g. a tag tree) - detached from Annots but object kept).
- Widget fields touched: 1.
  - "Last Name (Family Name)": had a value: false, DV removed: false, widgets stripped here: 1.
- Widget appearance-stream objects deleted: 1.
- Independent re-open: 0 non-widget annotation(s) still intersect a box (expect 0).
- Independent re-open: 1 widget(s) remain under a box (expected - kept), all unfilled so had no value to lose: true.
- Total annotations on page 1: 55 originally, 1 removed, 54 remain.

## Shared Form XObject watermark (text-watermark-form.pdf)

- Glyphs removed from the form on page 1: 12.
  - form 0: copied (page 1 now points at a new stream object).
- Page 1 text no longer contains "CONFIDENTIAL".
- Page 2 still draws "CONFIDENTIAL": true (originally: true).
- Page 3 still draws "CONFIDENTIAL": true (originally: true).
- Page 4 still draws "CONFIDENTIAL": true (originally: true).
- Page 5 still draws "CONFIDENTIAL": true (originally: true).
- XObject ref: original page 1 = 6 0 R, output page 1 = 19 0 R (different - a copy was made).
- XObject ref: output page 2 = 6 0 R, original page 2 = 6 0 R (unchanged).

