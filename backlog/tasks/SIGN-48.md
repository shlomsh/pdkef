---
id: "SIGN-48"
title: "The Symbols tool is called Mark, and its icon shows the mark it will place"
status: "done"
priority: "P3"
epic: "polish"
depends_on: []
---

# SIGN-48 · The Symbols tool is called Mark, and its icon shows the mark it will place

*Filed 2026-11-12, from the Sign toolbar redesign (design canvas
https://claude.ai/artifact/7Uz5w2QLpjcThjREyfYbk8, "Naming the mark tool").* The tool places one
mark that switches between check, X and dot in place from its own bar, so a wrong mark is changed,
never deleted and redrawn. "Symbols" covers the three but reads like a picker of special characters,
and no fill-and-sign tool we checked uses it; "Check mark" names only one of the three. Shlomi chose
**Mark** (Hebrew **סימון**, the same word), 2026-11-12.

The next placement already starts as the last mark chosen (`style.symbolMark`, carried per document
and app-wide, SIGN-32..35), but the toolbar button always draws a check. With a family name the icon
is what says which mark comes next.

## Acceptance

- The toolbar button reads "Mark" (`/sign/`) and "סימון" (`/he/sign/`); the tool's action sentences
  and announcements say "mark", the hero demo chip and the Sign page copy match. The internal
  `symbol` type, ids and draft data are unchanged.
- The button's icon is the remembered mark (check, X or dot), drawn by the same component as the
  placed mark's own switch, and it follows a switch made on any placed mark.
- Specs and the label-order unit test use the new name; `editor.md`'s toolbar order says Mark.

## Not in scope

The E toolbar layout (More menu, five form tools) is SIGN-49.

## Outcome

Done 2026-11-12. The button reads Mark / סימון, and the action sentences, announcements, hero demo
chip and Sign page copy say "mark" (the Hebrew page's `sourceHash` moved with its two word changes,
pending Shlomi's read-through). `MarkIcon` draws the three glyphs for both the placed mark's switch and
the toolbar button, which reads `documentStyleOf(state).symbolMark` (a pure selector beside
`useDocumentStyle`), so it shows what the next placement draws. Guards: `SignToolbar.test.tsx` drives
`SET_CARRIED` through check, X and dot (red against a hardcoded check);
`per-document-style.spec.js` asserts the button draws X after a placed mark is switched.
