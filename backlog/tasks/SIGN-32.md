---
id: "SIGN-32"
title: "One font size per document: it carries from field to field, and each field only shrinks it to fit"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
---

# SIGN-32 · One font size per document: it carries from field to field, and each field only shrinks it to fit

*Filed 2026-09-25* from Shlomi's report on the practice form (SNG-10): the ID number comb's digits came out
about half the size of the Full name text above them.

## Why it happened

The size of a new element on a detected field is decided in three places, by three rules:
- A text box on a cell grows toward 65% of the field's height, ignoring the remembered size. This is
  `cellFontSize`, changed in fb59ed27.
- A comb takes the remembered size and only shrinks it (`combFontSize`).
- Free text takes the remembered size.

The remembered size (`lastFontSize`) is a browser-wide preference, written only on A- or A+. A size
picked months ago on another document still drives today's comb. Nothing keeps one form consistent.
The chain is three bugs in one seam on one day: the comb hint (36f525d4), the Full name size (fb59ed27)
and this one.

## The rule (Shlomi, 2026-09-25)

"If the previous field chose the font size, it should have been saved to serve the next fields in line."

- A document has one **carried font size**. It belongs to the document (its draft), not to the browser.
- When a document has none yet, the first field it is needed for sets it from that field's own height.
  Free text on a document with none uses the default.
- A- or A+ on an element changes the carried size for everything placed after it.
- Each field **fits** the carried size: it shrinks the size only where the text would not fit the
  printed cell. The shrink applies to that element only and never changes the carried size.
- Combs, text cells, dates and free text all read **one function**. `cellFontSize`'s grow-to-fill special
  case goes.

## Acceptance

- [ ] One sizing function, used by every placement path.
- [ ] The carried size persists with the document's draft and survives a reload. A new document does not
  inherit another document's size.
- [ ] A product-path test fills the practice form top to bottom (Full name, the ID comb, the dates, the
  postal comb, a free text box) and asserts that every element shares the carried size wherever the
  field fits it.
- [ ] Unit tests cover the rule's edges: a first field sets the size, A+ carries forward, a narrow comb
  shrinks without changing the carried size, and a reload keeps the size.
- [ ] Checked in a real browser, desktop and phone width.
