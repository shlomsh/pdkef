---
id: "ARCH-03"
title: "Give text policy its own home, and stop composing English sentences inside it"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# ARCH-03 · Give text policy its own home, and stop composing English sentences inside it

## Scope and acceptance

**Give text policy its own home, and stop composing English sentences inside it.** Create `src/editor/text/` and move `bidiRuns.js`, `hebrewComposition.js`, `hebrewCombiningCorpus.js`, `comb.js`, `textFontSupport.js`, `textTransforms.js`, and the coverage-policy parts of `fonts.js`/`textCoverage.js` out of `lib/`. While moving it, fix a real violation this pass found: `src/lib/textCoverage.js:115` returns the literal hardcoded sentence `` `${requested} has no match for: ${list}, so this text box is using ${family} instead...` `` — policy code composing user-facing copy, not just reporting facts. Return structured data (requested family, substituted family, character list) from `editor/text`; compose the sentence one layer up (`components/SignTool` or a small messages module), matching "should not depend on UI messages" and making the string extractable once `i18n` (ARCH-07) exists. `signPdf` and the live-typing notice both call this path today and must keep showing identical wording — a refactor, not a copy change.

**Completed 2026-08-30.** Text policy modules and tests now live under `src/editor/text/`; substitution and coverage return structured facts, while shared English copy is composed by `components/SignTool/textMessages.ts`. Existing export and editor behavior is preserved.
