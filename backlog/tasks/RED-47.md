---
id: "RED-47"
title: "Desktop review: a lighter blur range, an Every page button that explains itself, a swatch that looks clickable"
status: "done"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-47 · Desktop review: a lighter blur range, an Every page button that explains itself, a swatch that looks clickable

*Shlomi's desktop review, 2026-10-01.*

- **The lightest blur is still strong.** The whole range moves down: 0.05 to 0.55, default 0.3 (was 0.1 to 0.7, default 0.4). 0.3 is the old "light", which already read as a smear on a real export. Legacy names keep their numbers, so saved drafts render as before.
- **Duplicate and Repeat on every page looked alike.** The repeat button carries a word: "Every page", and "On 12 pages" once linked.
- **The colour swatch didn't look clickable.** It gets a ring in the toolbar's ink and a caret, in Sign and Redact alike.

## Acceptance
- Slider min 0.05, max 0.55, default tick 0.3; new boxes start at 0.3 unless the document or app-wide style says otherwise.
- The repeat button and the linked trigger show their word; the swatch shows the caret.

## Result

- `blurStrength.ts`: 0.05 to 0.55, default 0.3; legacy names unchanged; the slider's default tick stays mid-track. (960513ee)
- `ElementToolbar.tsx`: the repeat button reads "Every page", the linked trigger "On 12 pages". `ColorPickerMenu.tsx`: the swatch has a ring in the toolbar's ink and a caret, in Sign and Redact. (fa1ede90)
