---
id: "UNDO-03"
title: "A Redo control in the editor toolbar, once its width is measured"
status: "open"
priority: "P3"
epic: "undo-and-redo"
phase: "longer-term"
depends_on: ["UNDO-01"]
---

# UNDO-03 · A Redo control in the editor toolbar, once its width is measured

*Filed 2026-09-20.* UNDO-01 ships redo on the keyboard and in the Undo dialog, deliberately without a
toolbar control. **The honest cost of that: redo is not discoverable on touch.** This ticket is the
button, and it exists separately because the button is the expensive part.

## Why it is its own ticket

Sign is already at twelve controls. `SignToolbar.module.css` carries the only hand-computed numbers in
the codebase (the 239px and 251px container-query thresholds), and the desktop row measures roughly
1050px to 1120px against an 1172px box. SIGN-18's post-mortem proved a tenth control silently broke the
row-balance maths and that **no** value of `--controls-per-row` could fix it, because the 44px WCAG
floor binds before the cap does. `.claude/rules/editor.md` states that a new labelled control has to be
paid for by re-measuring in a real browser, wide font included.

So this needs a measurement session, not a CSS edit: a width sweep with the real toolbar, a re-tune of
both thresholds, and `e2e/tool-toolbars/toolbar-desktop-one-line.spec.js` plus
`toolbar-touch-targets.spec.js` green at every width they list. Screenshots before and after at 390px.

Note `ToolShell.tsx:53-59` already avoids a circular-arrows glyph for Replace because it "would collide
with the editor toolbar's Undo icon", so the icon vocabulary is tight too.
