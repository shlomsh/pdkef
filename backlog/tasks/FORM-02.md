---
id: "FORM-02"
title: "Canonical field types, so a detected box can become a question"
status: "open"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-02 · Canonical field types, so a detected box can become a question

## Why

The detector finds *where* and reads *what is printed beside it*. Nothing yet turns
`label: "מספר זהות"` into `{ type: 'id_number' }`, and without that there is no question to ask,
nothing to reuse between forms, and no way to check an answer against the space it has to fit in.
This is the missing link between a field map and the product goal, and it is the one piece of that
goal needing no model, no new dependency and no page weight.

## Scope and acceptance

Three signals, all already in hand:

1. **The label**, at 80.7-96.9% association. A per-locale lexicon of printed labels mapped to
   canonical types, matched with normalization and fuzzy tolerance, never an exact string compare:
   Hebrew construct state alone turns `חתימה` into `חתימת` (the `HEBREW_SIGNATURE` constant in
   `formCells.js` already carries that lesson as a 4-letter root).
2. **Comb cell count, which is nearly a type on its own.** MOBI-10 measured form 101's passport
   fields as 13-cell runs and its identity field as 9 cells; an Israeli identity number is 9
   digits and a date is 2/2/4. `CombRegion` already carries `cells`. This is free and it is
   strong; a count that contradicts the label is worth surfacing, not silently trusting.
3. **The detected kind** (`comb`, `checkbox`, `date`, `signature`, `text`), which constrains what
   a type can be.

- [ ] A canonical type vocabulary, defined once, as data. Start from what the two evidence forms
  actually ask for (identity number, passport number, name, address, phone, email, date of birth,
  dates, signature, yes/no) rather than an invented taxonomy.
- [ ] A pure module under `src/editor/`, no Preact and no DOM, taking labelled candidates and
  returning a type and a confidence per field. Unit-tested against both forms' labels.
- [ ] **A type is a proposal, not a fact.** Below the gate nothing is asked or filled
  automatically (MOBI-10's rule); an uncertain type must be visibly uncertain, and a field with no
  type is normal, not an error.
- [ ] Per-locale from the start. The lexicon is Hebrew and English here; the module must not
  assume either, and the form decides its own language, not the UI locale (`pageDirections` in
  `useFormFieldRegions.ts` already works this way).

Explicitly **not** in scope: any on-device language model. MOBI-10 measured a vision model naming
fields well and placing them badly, and a WebLLM-class model is hundreds of megabytes against page
budgets that only ratchet down. If the lexicon is not enough, that is a finding to record here,
not a licence to ship weights.
