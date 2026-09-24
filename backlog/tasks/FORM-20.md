---
id: "FORM-20"
title: "A checkbox printed as a symbol-font glyph"
status: "open"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-16"]
---

# FORM-20 · A checkbox printed as a symbol-font glyph

## Why

สปส.1-10 prints its four checkboxes as Wingdings glyphs, so there is no ink square for
`findCheckboxes` to read and all four are missed (`corpus/scoring/baselines.json`, FORM-16).
`formCells.js` already recognises such glyphs as noise (`GLYPH_NOISE_RE`, "checkbox glyphs rendered
as text") and drops the cell; it never turns them into targets. Which glyph codes mean an empty box
depends on the font, so this needs the font name as well as the character.

## Acceptance

- สปส.1-10 checkbox recall up, no scored form drops, gains re-recorded.
- A unit test pins a symbol-font box glyph as a checkbox and a symbol-font bullet as nothing.
