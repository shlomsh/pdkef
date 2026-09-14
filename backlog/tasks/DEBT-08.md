---
id: "DEBT-08"
title: "Data attributes replace the text-element class-name registry"
status: "open"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-08 · Delete `elementClassNames.ts`

*Filed 2026-09-14*, finding 5 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`src/editor/text/elementClassNames.ts` exists only so `registry/text.ts`'s `writeDOM` can
`querySelector` the hashed CSS Module classes of `EditorElement.module.css` and toggle
`text-display-comb` mid-gesture. `TextNode.tsx` registers seven resolved class names at module load;
`getTextElementClassNames()` throws if nothing has. A registry, a throw, a test and a load-order
contract, for six DOM-part lookups and one class toggle.

## Scope

- `TextNode.tsx` marks its parts with `data-text-part="display|input|measure|comb|comb-cell|comb-guide"`.
- `writeDOM` selects by `[data-text-part="..."]` and toggles `data-comb="on"` on the display node in
  place of the `text-display-comb` class; `EditorElement.module.css` styles
  `.text-display[data-comb="on"]` (Tailwind is not involved; CSS Modules only).
- Delete `elementClassNames.ts`, its `registerTextElementClassNames` call, its test and the
  `text.ts -> elementClassNames` paragraph in `.claude/rules/editor.md` and
  `check-editor-dependency-directions.mjs`'s header comment.

## Acceptance

- `src/editor/text/elementClassNames.ts` does not exist; `grep -r "text-display-comb" src` is empty.
- `src/tools/sign/components/DraggableWrapper.gestureInvariants.test.tsx` and the comb resize unit
  tests green; `src/tools/sign/e2e/form-grid-fill.spec.js` and `sign-editor.spec.js` green (comb
  resize is what they exercise); `test:gesture-golden-rule` green.
