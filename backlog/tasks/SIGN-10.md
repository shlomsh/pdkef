---
id: "SIGN-10"
title: "A language/font source of truth and acceptance matrix"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-02"
---

# SIGN-10 · A language/font source of truth and acceptance matrix

## Scope and acceptance

**A language/font source of truth and acceptance matrix.** Consolidate duplicated catalogue, CSS, coverage, licensing and precache metadata into one font manifest, continuing the existing language catalogue work. Name popular languages and regional variants in rollout order; test real font coverage, shaping, visual output, and searchable text in Chrome for supported styles. Reconcile in-flight font migrations and stale fixtures without widening visual tolerances to hide failures.

**Completed 2026-09-02.** `scripts/font-manifest.mjs` is now the one editable record for all 27 bundled families and 60 real faces: family/kind/style, vertical metrics, exact files, Hebrew mark-placement participation, license metadata, and precache policy. It generates the lean browser catalogue and Sign-only `@font-face` CSS; the exporter reads exact face filenames instead of synthesizing a URL and probing a known 404; coverage generation, `/licenses/`, `THIRD_PARTY_LICENSES.md`, and precache selection all consume the same record. Build fails if either generated artifact is stale or the manifest and `public/fonts/` disagree.

The generated [language/font acceptance matrix](../../docs/language-font-acceptance-matrix.md) names 18 shipped rollout groups (including Simplified vs Traditional Chinese region signals, Marathi/Assamese distinctions, the Urdu Naskh caveat, direction, and native digits) followed by Gujarati/Kannada/Odia and emoji as explicit planned groups. Unit guards bind every shipped row to real alphabet coverage, every real accepted face, and named shaping/visual evidence. `e2e/sign/language-acceptance.spec.js` runs the real exporter in Chrome and proved visible, extractable text across all **117 language/family/weight/style combinations**. The full Chrome suite passed **91 tests with 2 deliberate platform/known-gap skips**, including every existing shaping/advance guard; no visual tolerance or baseline changed. Migration drift was repaired in the generator, Hebrew/Thai guards and export harness, and the stale Almarai extraction fixture now uses Scheherazade New.
