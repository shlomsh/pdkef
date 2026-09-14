---
id: "DEBT-08"
title: "Data attributes replace the text-element class-name registry"
status: "done"
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

## Landed (2026-09-14)

`TextNode.tsx` marks display, input, measure, comb, comb-cell and comb-guide with `data-text-part`;
the display node carries `data-comb="on"` only while a comb is active. `registry/text.ts`'s `writeDOM`
selects by `[data-text-part="..."]` and sets/removes `data-comb` directly, still a plain mid-gesture
DOM write. `elementClassNames.ts` (no separate test file existed for it) and the
`registerTextElementClassNames` call are gone; `EditorElement.module.css` styles
`.text-display[data-comb="on"]`. Updated the two `DraggableWrapper.interaction.test.tsx` assertions
to read `data-comb` instead of the retired class, the `elementClassNames` half of the editor.md bullet
(the `registerRenderer` half was left for the parallel renderer rewrite), and
`check-editor-dependency-directions.mjs`'s header comment; also renamed its positive fixture pair
(`elementClassNames.js` to `textParts.js`, unrelated to the real registry) so the module-wide grep for
the retired name stays clean. `grep -rn "text-display-comb|elementClassNames|TextElementClassNames" src
scripts .claude` is empty. Green: the named unit suites, `test:gesture-golden-rule`,
`test:editor-dependency-directions`, `test:module-boundaries`, `check:fast`, and
`form-grid-fill.spec.js` / `sign-editor.spec.js` under `--project=chromium` against a fresh build.
