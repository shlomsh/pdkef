---
id: "FONT-08"
title: "Second-font / missing-style research across every single-font script"
status: "open"
priority: "P3"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Open (FONT-08a's gap (a) fully closed 2026-08-29)"
---

# FONT-08 · Second-font / missing-style research across every single-font script

## Scope and acceptance

**Second-font / missing-style research across every single-font script.** Two distinct gaps. **(a) is closed** (Devanagari and Thai each had only a handwriting face; Mukta and IBM Plex Sans Thai landed 2026-08-29 - record kept below for how the screening went). **(b) is what remains.**

*(a), for the record:* Devanagari and Thai each had exactly one bundled face (Kalam, Mali) and both were handwriting, so an upright choice used to resolve the whole element to a handwritten look. **Devanagari:** Mukta (Ek Type, OFL) passed all three screening checks on the first candidate tried - see the Mukta writeup below. **Thai:** the top two ranked candidates, Sarabun and Kanit, both measurably failed the fontkit-vs-browser advance-parity check (Guard A) on ordinary Thai words (Sarabun 1.4-3.0% of string width, Kanit 0.3-1.0%) despite neither carrying `calt` - a real finding the three-check protocol exists to catch. **IBM Plex Sans Thai** landed instead: it does carry `calt` (flagged, and stress-tested specifically against the classic Thai tall-consonant/tone-mark collision case ปั๊กฝ้ายให้ฟังกิ๊บ) but passed Guard A cleanly (0.05px unhinted tolerance) on every sample including that stress case, so it shipped on the strength of the test rather than the flag - see `e2e/sign/thai-font-parity.spec.js`. **(b) single-font scripts with no second choice for variety** - Bengali, Punjabi/Gurmukhi, Telugu, Tamil, the Arabic family (Scheherazade New), Japanese, Chinese SC/TC, Korean, plus Cyrillic and Greek (both text-only today, no handwriting option either), and now also Thai's *handwriting* side (Mali is still the only Thai handwriting face). Named-but-unscreened candidates already on record: Sriracha (2nd Thai handwriting, same-day runner-up to Mali), a 2nd Cyrillic face, a 2nd Hebrew handwriting face, more Latin handwriting styles. **Research rules and the exact current catalogue to screen against: [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)** - landed in the repo as of `c1d7f13`; an earlier pass of this ticket found it referenced but missing, since fixed.

## 2026-09-12: research pass, verified against bytes

A deep-research agent (Shlomi's, prompted from this ticket) produced a shortlist for every (b) gap;
every claim was then re-checked locally against the Google Fonts TTFs with this repo's fontkit: script
coverage, `calt`/stylistic sets, file size, copyright string, `glyf` alignment, and **check 1 (fontkit
crash) over the repo's own corpora** for Arabic+Pashto, Bengali, Gurmukhi, Telugu, Tamil, Malayalam and
Devanagari. Checks 2 and 3 are not run; they are landing work. Full per-candidate tables are in the
brief; the headlines:

- **Tiro Bangla is out**: fontkit never returns on ফ্র and শ্র (heap exhaustion at every cap tried). A
  hang, not a throw, so a new failure class nothing in `signPdf` could turn into a clean refusal.
  **Hind Siliguri** (0/256) is the only Bengali candidate left.
- **Cairo is out** (no Pashto, variable-only). **Vazirmatn** is the Arabic pick, `calt` flagged.
- **The report's Greek section was inverted**: Patrick Hand has no Greek; Mansalva and Mynerve both do,
  both with `calt`. It also had the wrong foundry for Tillana (ITF, not Ek Type), wrong `calt` claims for
  Sriracha, Marck Script and Vazirmatn, sizes off by up to 3x, and seven of nineteen copyright lines
  wrong. Coverage, licenses and repos were right. Lesson recorded in the brief: never copy a copyright
  line or a `calt` claim from a research report.
- **Amatic SC** covers Hebrew and Cyrillic in one 148KB caps-only file; a candidate for two gaps.
- Clean on check 1 with `glyf` aligned: Vazirmatn, Hind Siliguri, Tiro Gurmukhi, Suranna (610KB, no
  Bold), Tiro Tamil, Mukta Malar, Catamaran, Gayathri, Neucha, Marck Script, Amatic SC, Mansalva,
  Mynerve. Clean but needing the repad: Sriracha (no `calt` in the shipped file, despite the listing),
  Tillana, Amita.

Next step is per-script landing tickets (nine-step unit each), starting where one font closes the most:
Neucha or Amatic SC (Cyrillic, and Hebrew for the latter), then Hind Siliguri, Gayathri, Tiro Gurmukhi.

## Landed 2026-09-12: Gayathri

Malayalam's first (b) landing: Gayathri (Swathanthra Malayalam Computing, OFL 1.1) added next to Anek
Malayalam as the script's first second-choice upright face, closing the "no second choice" gap the
brief's catalogue table names for Malayalam. Static Regular/Bold, 163828/162884 bytes as downloaded.
`kern` only, no `calt`.

- **Check 1 (fontkit crash):** 0/478 on both Regular and Bold against `malayalamCorpus.js`, matching
  the research-pass finding recorded above.
- **`glyf` alignment:** aligned as shipped, no repad needed (`npm run test:fonts`: 64 fonts checked,
  all loca offsets 2-byte aligned).
- **Check 2 (pixel-shape guard, self-calibrating, 400px):** 277/277 passed. Of the corpus's 478
  strings, 201 shape with no contextual substitution (calibration: rasteriser floor 0.00%,
  displacement floor 0.00%) and 277 substitute and are the cases under test - zero
  `KNOWN_FONTKIT_DIVERGENCES` entries needed. See
  `e2e/sign/malayalam-gayathri-shaping-guard.spec.js`.
- **Check 3 (advance-parity spot check against the SIGN-19 bound, `glyphCount x 0.5px`):** 0/478
  divergent, max widthDiff 0.000px, run the same way Anek Malayalam's was (fontkit's summed shaped
  advances vs. this browser's own `measureText` on the identical string). Not wired as a standing
  assertion, same as every other font this catalogue has screened this way.
- **Metrics:** real `hhea` ascent 0.732 / descent 0.488 (`fontkit.create(...).ascent`/`.descent`
  divided by `unitsPerEm`), not transcribed from a spec sheet.
- **Wired:** `scripts/font-manifest.mjs` (source of the generated `fontManifest.js`/`editorFonts.css`),
  `npm run generate:font-coverage` and `npm run generate:font-coverage-report` (both regenerated;
  `LANGUAGE_COVERAGE.malayalam.full` is now `[Anek Malayalam, Gayathri]`), the Sign page's Malayalam
  card note in `src/data/tools.js` naming both faces, `languageCoverage.test.js` updated to match, and
  license attribution (`THIRD_PARTY_LICENSES.md`, `src/pages/licenses.astro`, both generated/derived
  from the manifest - `fontAttribution.test.js` passed without a hand-edit). `exportRenderCorpus.js`
  got a new `malayalam-gayathri` case (എന്റെ, "my/mine", the non-chillu ന്റ cluster spelling); its
  baseline is CI-runner-pinned (`exportRenderBaseline.json`) and was deliberately left untouched per
  `.claude/rules/fonts-and-text.md` - **pending the `update-export-render-baseline` CI workflow run**,
  the same follow-up FONT-03's own Anek Malayalam landing needed.
- **Verification:** `npm test` (2305/2305), `npm run typecheck`, `npm run test:fonts`, `npm run build`,
  `npm run test:csp`, `npm run test:css`, `npm run test:weight` (`/sign/` 346188/400000 brotli budget)
  all green. `PLAYWRIGHT_PORT=4176 npx playwright test
  e2e/sign/malayalam-gayathri-shaping-guard.spec.js e2e/sign/malayalam-shaping-guard.spec.js
  e2e/sign/language-acceptance.spec.js` - 3/3 passed, including the full acceptance matrix now at 117
  language/face combinations (up from 116).
### Landed 2026-09-12: Suranna (2nd Telugu face, closes Telugu's (b) gap)

Telugu had exactly one bundled face, Anek Telugu (upright/sans). Suranna (Silicon Andhra/Cyreal, OFL 1.1, static Regular only, 610KB, upright serif with a book-oriented feel) is docs/font-candidate-research-brief.md's FONT-08b top Telugu candidate, screened per the three-check protocol:

1. **Fontkit crash:** 0/630 on teluguCorpus.js's full corpus (also the corpus's own module doc already named Suranna as one of six OFL faces that crash on none of the 630 cases, screened alongside picking Anek Telugu; re-confirmed here rather than taken on faith).
2. **Pixel guard** (`e2e/sign/telugu-suranna-shaping-guard.spec.js`, self-calibrating, 400px/4x geometry - built at the corrected geometry from the start, unlike the sibling Anek Telugu guard which still runs at the old 100px size): **476/476 passed**. 154 of 630 corpus strings shape with no substitution (rasteriser floor 0.31%, no advance quantisation on the measuring machine), 476 substitute and are the cases under test, tolerance floored at the 4% minimum.
3. **Advance parity spot check** (SIGN-20-style, run once, not a standing assertion): fontkit's summed shaped advances vs. this browser's `measureText` on all 630 corpus strings, max widthDiff 0.00005px - floating-point noise, nowhere near SIGN-19's `glyphCount x 0.5px` bound.

**Sabotage control** (reversing fontkit's glyph draw order on every case the guard classifies as substituting, run once and reverted before committing): 55 of 476 substituting cases failed, calibration/floor unchanged - proof the guard can fail, not just pass.

`glyf` alignment: already 2-byte aligned as shipped, no repad needed (unlike Kalam/Anek Telugu/Mukta). Real `hhea` metrics: ascent 1.412em, descent 0.778em. Coverage: full required Telugu set (77 codepoints - vowels, consonants, vowel signs, marks, digits) plus Latin ASCII and digits; the only Telugu-block gaps are the same historical/archaic letters `teluguCorpus.js` already excludes.

**One real cost, disclosed in the Sign page's Telugu copy and the catalogue itself:** Suranna ships Regular only, no Bold - `src/data/tools.js`'s Telugu note says so plainly, and `languageCoverage.test.js` pins it.

Wired into the catalogue (`scripts/font-manifest.mjs` and its generated artifacts, `src/lib/fontCoverageTable.js`/`fontCoverageReport.js`, `scripts/language-acceptance.mjs` and its generated matrix, `THIRD_PARTY_LICENSES.md`/`licenses.astro`) and `e2e/sign/fixtures/exportRenderCorpus.js` (new `telugu-suranna` case, ప్రియ in Suranna - baseline recapture is CI's `update-export-render-baseline` job, pending as of this commit since `exportRenderBaseline.json` is runner-pinned and never hand-edited). `LANGUAGE_COVERAGE.telugu.full` and the language-acceptance matrix's combination count (117 to 118) both updated to match.
*(a), for the record:* Devanagari and Thai each had exactly one bundled face (Kalam, Mali) and both were handwriting, so an upright choice used to resolve the whole element to a handwritten look. **Devanagari:** Mukta (Ek Type, OFL) passed all three screening checks on the first candidate tried - see the Mukta writeup below. **Thai:** the top two ranked candidates, Sarabun and Kanit, both measurably failed the fontkit-vs-browser advance-parity check (Guard A) on ordinary Thai words (Sarabun 1.4-3.0% of string width, Kanit 0.3-1.0%) despite neither carrying `calt` - a real finding the three-check protocol exists to catch. **IBM Plex Sans Thai** landed instead: it does carry `calt` (flagged, and stress-tested specifically against the classic Thai tall-consonant/tone-mark collision case ปั๊กฝ้ายให้ฟังกิ๊บ) but passed Guard A cleanly (0.05px unhinted tolerance) on every sample including that stress case, so it shipped on the strength of the test rather than the flag - see `e2e/sign/thai-font-parity.spec.js`. **(b) single-font scripts with no second choice for variety** - Bengali, Punjabi/Gurmukhi, Telugu, the Arabic family (Scheherazade New), Japanese, Chinese SC/TC, Korean, plus Cyrillic and Greek (both text-only today, no handwriting option either), and now also Thai's *handwriting* side (Mali is still the only Thai handwriting face). **Tamil's gap closed 2026-09-12** (Tiro Tamil - record kept below). Named-but-unscreened candidates already on record: Sriracha (2nd Thai handwriting, same-day runner-up to Mali), a 2nd Cyrillic face, a 2nd Hebrew handwriting face, more Latin handwriting styles. **Research rules and the exact current catalogue to screen against: [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)** - landed in the repo as of `c1d7f13`; an earlier pass of this ticket found it referenced but missing, since fixed.

## Landed 2026-09-12: Tiro Tamil

FONT-08b's Tamil gap (single-font, Noto Sans Tamil only) closed. **Tiro Tamil** (Tiro Typeworks/"Indigo," OFL 1.1, top-ranked candidate in the research brief's Tamil shortlist) shipped as a second, serif Tamil face. No Bold upstream - shipped Regular + Italic; `faces` in `scripts/font-manifest.mjs` is a plain `{ normal, italic }` object rather than `normal()`/`full()`, since neither helper expresses "italic, no bold" and none of it needed to: `hasRealFace()`/`requestedFontFile()` key off individual face entries already, so Bold is honestly absent from the picker rather than synthesized.

- **License:** copyright line (`Copyright 2020 The Indigo Project Authors (https://github.com/TiroTypeworks/Indigo)`) verified against both the fetched `OFL.txt` and the fonts' own `name` table. Version 1.52.
- **Fontkit crash screen:** 0/329 throws shaping the full Tamil corpus (`e2e/sign/fixtures/tamilCorpus.js`) through `TiroTamil-Regular.ttf`, none slower than 20ms - same clean result Noto Sans Tamil got.
- **`glyf` alignment:** already 2-byte aligned as shipped, no repad needed (`npm run test:fonts` passed on the first try).
- **Coverage:** full for the Tamil block's assigned codepoints (37/37 corpus characters), full Latin ASCII + digits. Real `hhea` ascent/descent (0.755/0.245, unitsPerEm 1000) measured directly from the font, not carried over from Noto Sans Tamil's.
- **Pixel-diff corpus guard** (`e2e/sign/tamil-tiro-shaping-guard.spec.js`, self-calibrating): of 329 corpus strings, 94 shape with no substitution in this font (rasteriser floor 10.54%, tolerance 15.81%) and 235 substitute and are the cases under test - **235/235 passed**. Tiro Tamil's substituting/non-substituting split (94/235) differs from Noto Sans Tamil's (64/265) on the identical corpus, expected since that partition is a per-font shaping question, not a per-script one.
- **Advance-parity spot check** (SIGN-20-style, fontkit's shaped glyph advances vs. this browser's `measureText`): max `widthDiff` across all 329 corpus + calibration cases was 0.000px, well inside SIGN-19's `glyphCount x 0.5px` rounding bound.
- **Export-render corpus:** added `tamil-tiro-tamil` (இந்தியா, "India" - carries the ந்த fused ligature plus a reordering vowel sign) to `e2e/sign/fixtures/exportRenderCorpus.js`. Its baseline entry is **pending CI** - `exportRenderBaseline.json` is runner-pinned (Linux-only) and this guard `test.skip`s on macOS, so it was deliberately left untouched; the `update-export-render-baseline` workflow needs to run and the diff reviewed before merge.

Wired into the catalogue (`font-manifest.mjs` → generated `fontManifest.js`/`editorFonts.css`/`THIRD_PARTY_LICENSES.md`/`licenses.astro`, all generator-driven so no hand-edit was needed there), `scripts/language-acceptance.mjs`'s `tamil` row (families, shaping guards, visual guards + the new export-render case, regenerated `docs/language-font-acceptance-matrix.md`), and the Sign page's Tamil copy in `src/data/tools.js` (now names both fonts; still correctly says there is no handwriting-style Tamil face). Two pre-existing tests pinned the old numbers and were updated to reality per the standing rule (never weaken): `fonts.test.js`'s "no two serif fonts compete" check now covers three (Tinos/Latin, Scheherazade New/Arabic, Tiro Tamil/Tamil, still disjoint scripts) and `languageCoverage.test.js`'s Latin-script family counts (19→20 text fonts) and Tamil row (`['Noto Sans Tamil']` → `['Noto Sans Tamil', 'Tiro Tamil']`).
*(a), for the record:* Devanagari and Thai each had exactly one bundled face (Kalam, Mali) and both were handwriting, so an upright choice used to resolve the whole element to a handwritten look. **Devanagari:** Mukta (Ek Type, OFL) passed all three screening checks on the first candidate tried - see the Mukta writeup below. **Thai:** the top two ranked candidates, Sarabun and Kanit, both measurably failed the fontkit-vs-browser advance-parity check (Guard A) on ordinary Thai words (Sarabun 1.4-3.0% of string width, Kanit 0.3-1.0%) despite neither carrying `calt` - a real finding the three-check protocol exists to catch. **IBM Plex Sans Thai** landed instead: it does carry `calt` (flagged, and stress-tested specifically against the classic Thai tall-consonant/tone-mark collision case ปั๊กฝ้ายให้ฟังกิ๊บ) but passed Guard A cleanly (0.05px unhinted tolerance) on every sample including that stress case, so it shipped on the strength of the test rather than the flag - see `e2e/sign/thai-font-parity.spec.js`. **(b) single-font scripts with no second choice for variety** - Bengali, Punjabi/Gurmukhi (Tiro Gurmukhi landed 2026-09-12, see below), Telugu, Tamil, the Arabic family (Scheherazade New), Japanese, Chinese SC/TC, Korean, plus Cyrillic and Greek (both text-only today, no handwriting option either), and now also Thai's *handwriting* side (Mali is still the only Thai handwriting face). Named-but-unscreened candidates already on record: Sriracha (2nd Thai handwriting, same-day runner-up to Mali), a 2nd Cyrillic face, a 2nd Hebrew handwriting face, more Latin handwriting styles. **Research rules and the exact current catalogue to screen against: [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)** - landed in the repo as of `c1d7f13`; an earlier pass of this ticket found it referenced but missing, since fixed.

## Landed 2026-09-12: Tiro Gurmukhi

Second choice for Punjabi/Gurmukhi (Mukta Mahee is still the default), closing one of (b)'s single-font gaps. Tiro Typeworks/"Indigo," OFL 1.1, static Regular (147KB) + Italic only - **no Bold**. A serif, upright-traditional face, a real style departure from the sans Mukta Mahee.

- License: copyright line `Copyright 2020 The Indigo Project Authors (https://github.com/TiroTypeworks/Indigo)`, verified against the font's own `OFL.txt` byte for byte.
- Fontkit crash screen: 0/500 on `gurmukhiCorpus.js`, both Regular and Italic (re-confirmed; the brief's 2026-08-29 pass had already found this). No pathologically slow case either - the corpus's slowest per-case shape time was noise-level (~100-200ms, dominated by `fontkit.create()`'s own per-call parse cost, not a hang), unlike Tiro Bangla's reported fontkit hang on two Bengali clusters.
- `glyf` alignment: already 2-byte aligned as shipped, no repad needed (`npm run test:fonts`, 64 fonts checked).
- Pixel-diff corpus guard (`e2e/sign/gurmukhi-tiro-shaping-guard.spec.js`, 400px geometry, `autoCalibrate`): **132/132 substituting cases passed** of 500 corpus strings (368 non-substituting/calibration, rasteriser floor 0.01%, displacement floor 0.00%, tolerance floored at 4%). Sabotage control (reverse glyph draw order gated on `substituted(text)`, same technique as `malayalam-shaping-guard.spec.js`): 132/132 failed with the floor unchanged, reverted before committing.
- Advance-parity spot check (SIGN-20-style, one-off): max `widthDiff` across all 500 cases was 0.0000366px, zero cases past the SIGN-19 `glyphCount x 0.5px` rounding bound.
- Coverage: full Gurmukhi block (71/71 codepoints - vowels, 33 base consonants, five nukta letters, nine vowel signs, bindi/visarga/nukta/virama/tippi/addak/iri/ura, digits), full Latin ASCII + digits (so `LANGUAGE_COVERAGE.latin.full` now includes it), 85% of the Latin-Extended accented sample (partial, not full - unaffected the Latin-script card's accented-font count). Real `hhea` ascent/descent 0.755/0.245.
- Italic shipped, Bold not: `hasRealFace`/`resolveTypography` (`src/editor/text/fonts.js`) already clamp Bold/Italic per exact file generically (the same mechanism that disables Bold for every Regular-only handwriting face), so an italic-without-bold face needed no special casing anywhere - the ElementToolbar's Bold button is simply disabled for this family, matching what a real 404 would have done, source-first-then-disable already being the shipped state.
- `exportRenderCorpus.js`: added `gurmukhi-tiro-gurmukhi` (ਸਿੰਘ, "Singh," carrying the tippi mark). Baseline NOT recaptured here (`exportRenderBaseline.json` is runner-pinned) - **pending the `update-export-render-baseline` CI workflow**; `export-render-guard.spec.js` skips locally on this platform regardless.
- Attribution: `THIRD_PARTY_LICENSES.md` and `src/pages/licenses.astro` via `scripts/font-manifest.mjs` + `npm run generate:font-manifest` (`fontAttribution.test.js` green). Sign page copy (`src/data/tools.js`) keeps the existing Noto-crash explanation for Punjabi and adds Tiro Gurmukhi as the named second choice; `languageCoverage.test.js` updated to pin both families. The Latin-script card's font count (19 -> 20 text fonts) updated in the same file/test.
- `npm run build && npm run test:weight`: page weight unaffected (fonts load on demand, not precached) - worst page `/sign/` 346396/400000 doc+JS budget, unchanged bracket.
