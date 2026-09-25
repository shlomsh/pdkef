---
id: "FORM-23"
title: "One typed vocabulary for field kinds and candidates"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["ARCH-24", "FORM-24"]
---

# FORM-23 · One typed vocabulary for field kinds and candidates

## Why

The kind vocabulary is kept three times (`formCells.js`'s output kinds, `corpus/scoring/candidates.js`'s
`KINDS`, `match.js`'s `KIND_GROUPS`) and the region shape is described in JSDoc typedefs repeated
per file. A replacement strategy has no single type to implement, and a kind added in one list is
silently unknown to the others.

## Acceptance

- [ ] One `.ts` module exporting the field-kind union and the candidate/region interface; every
      detector, the entry point and the scoring harness import it instead of re-declaring.
- [ ] The three kind lists become one, or are derived from it.
- [ ] No behaviour change: `score-form.mjs --all` identical, both corpora green, `npm run typecheck`
      clean.
