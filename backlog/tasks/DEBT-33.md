---
id: "DEBT-33"
title: "The shared colour picker commits on every drag step under preact/compat"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# DEBT-33 · The shared colour picker commits on every drag step under preact/compat

*Found 2026-10-02 by RED-53's review.* Every island loads preact/compat (`astro.config.mjs`:
`preact({ compat: true })`), and compat rewrites a JSX `onChange` on range and colour inputs to the
`input` event, which fires on every step of a picker drag. RED-53 fixed this for Redact's own controls
(`src/tools/redact/useNativeChange.ts`, guarded by `compatInputs.test.tsx`), but the shared
`src/editor-ui/ColorPicker.tsx` still has `onChange={(e) => onChange(...)}` on its `type="color"` input.

Its users:

- Redact's brush colour menu (`BrushControls.tsx`, through `ColorPickerMenu`): `rememberColor` runs on
  every step, a state dispatch and a localStorage write each time.
- Sign's element toolbar and signature dialog (`ElementToolbar.tsx`, `SignatureDialog.tsx`): an element's
  colour updates on every step. Steps within 500ms fold into one undo entry, so a pause mid-drag splits
  one choice into several.

## Acceptance

- Choosing a colour in the shared picker is one commit (one undo step where it has history), with a live
  preview while the picker is open wherever the host shows one today.
- `useNativeChange` moves to a shared layer once it has a second consumer (module-boundaries rule 9), and
  `compatInputs.test.tsx`'s source scan covers `src/editor-ui` and `src/tools/sign` too.
