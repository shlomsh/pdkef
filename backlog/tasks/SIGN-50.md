---
id: "SIGN-50"
title: "Sign's code calls the Mark tool a mark; the stored names stay 'symbol'"
status: "done"
priority: "P3"
epic: "polish"
depends_on: ["SIGN-48"]
---

# SIGN-50 · Sign's code calls the Mark tool a mark; the stored names stay 'symbol'

*Filed 2026-11-12.* SIGN-48 renamed the tool to Mark on screen and left the code saying "symbol".
Shlomi asked for the code to follow the new name. Files, components, types, constants, message keys,
CSS classes and data attributes become `mark` (`MarkNode`, `MarkElement`, `MarkGlyph`,
`registry/mark.ts`, `registry/markGlyphs.ts`, `markButton`, `data-editor-mark`, `.mark`).

What a device stores keeps its name: the element and tool discriminator `'symbol'`, the
`DocumentStyle` keys `symbolMark` and `symbolWidth`, and the history string `'ADD_SYMBOL'`. The
service worker only swaps versions when every tab is idle (MEM-10), so an older tab can read a draft a
newer tab wrote, and draft validation drops an element whose type it does not know. Renaming the
stored type would lose marks in that window. A comment at each stored name says why it stays.

## Acceptance

- `grep -rni symbol src` finds only the stored names above, JS `Symbol`/`typeof` uses and the PDF
  symbol-font code.
- Drafts and app style written before the change load unchanged (existing draft-restore tests pass
  untouched).
- Ratchet entries move with renamed files at the same limits.

## Outcome

Done 2026-11-12. Files, components, types, constants, message keys, CSS classes and data attributes
say mark (`MarkNode`, `MarkElement`, `MarkGlyph`, `registry/mark.ts`, `registry/markGlyphs.ts`,
`markButton`, `data-editor-mark`, `.mark`). The stored names stay, each with a comment saying why;
draft-restore tests pass unchanged apart from renamed locals.
