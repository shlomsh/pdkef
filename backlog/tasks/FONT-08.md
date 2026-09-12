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
## Landed 2026-09-12: Amatic SC closes two (b) gaps - Cyrillic handwriting and Hebrew's second handwriting face

Amatic SC (Google Fonts `ofl/amaticsc`, OFL 1.1, copyright line verified against the font's own
`OFL.txt`: "Copyright 2015 The Amatic SC Project Authors"). Static Regular (151,624 bytes) and Bold
(156,180 bytes), condensed hand-drawn capitals - Latin and Cyrillic lowercase render as small caps,
Hebrew has no case. Screened against the real bytes, not the brief's proposed candidates (Marck
Script/Neucha) - both were superseded once Amatic SC turned out to already cover Hebrew in full, which
neither of those two was screened for.

**Check 1, fontkit crash:** 0 crashes on the full Hebrew niqud corpus (102 order-variant cases from
`hebrewCombiningCorpus.js`), 19 Cyrillic samples, 25 Latin corpus cases (`latinNameCorpus.js`) - both
weights.

**glyf alignment:** passed as shipped (`npm run test:fonts`, 64 fonts checked incl. both Amatic SC
weights) - no repad needed.

**hhea metrics (real bytes, both weights identical):** ascent 1016/1000 = 1.016, descent 245/1000 =
0.245.

**OpenType features (both weights):** `aalt, case, ccmp, dlig, frac, liga, ordn, sups, zero, kern,
mark, mkmk`. No `calt`.

**Coverage (fontkit `hasGlyphForCodePoint` against the real bytes, both weights identical):** Hebrew
43/43 (22 base + 5 sofit + niqud); Latin 52/52; Latin Extended (accented) 80/80; Vietnamese
130/130 (full tone-and-diacritic set, a genuine finding - see below); Greek 5/66 (not claimed); Cyrillic
per language - Russian 66/66, Ukrainian 66/66, Belarusian 64/64, Bulgarian 60/60, Serbian 60/60,
Macedonian 62/62, **Kazakh 66/82** (missing the eight extra letters Ә Ғ Қ Ң Ө Ұ Ү Һ, upper+lower) - so
Amatic SC joins the Cyrillic anchor set for six of the seven TODO.md W7 languages, not Kazakh.

**Check 4 (H8), Hebrew mark placement** (`src/editor/registry/hebrewMarkPlacement.test.js`, run scoped
to Amatic SC): **69/69 passed** (calibration + Tier 1 order-insensitivity + Tier 2 mark containment over
the full enumerated corpus). `acceptance.hebrewMarkPlacement: true` set on that basis -
`HEBREW_CAPABLE_FONTS` now lists `['Gveret Levin', 'Amatic SC']`. Guard A
(`hebrew-font-parity.spec.js`) and Tier 3 (`hebrew-composition-guard.spec.js`) both pick this up
automatically and pass (32/32 combined, both files).

**Check 2/3, Cyrillic shaping correctness + advance parity** (new guard,
`e2e/sign/cyrillic-shaping-guard.spec.js`, corpus `e2e/sign/fixtures/cyrillicCorpus.js` - 8-string
calibration set, 16-case corpus of Russian/Ukrainian names and form fields including ё, ґ, ї, є, і):
Amatic SC has no `calt`, and `liga` never fires on this corpus (0/24 substituting, measured directly) -
so `autoCalibrate` doesn't apply (nothing to partition) and the guard uses a hand-picked calibration set
instead, the same shape Devanagari's and Arabic's guards use. Rendered at 320px (above Skia's ~256px
bitmap-glyph limit). **Result: rasteriser floor 0.01%, advance-quantisation floor 0.00% (this platform
does not quantise), tolerance 3.00% (floored), 0/16 failing.** Sabotage control run once by hand
(reversing corpus-side glyph draw order only, calibration untouched): 16/16 failing at 70-90%+ diff,
confirming the guard can actually fail; reverted before landing (no diff against the harness file in
the final commit).

**Kerning/advance parity spot-check** (Guard A's method - `shapedAdvancePx` vs. the browser's
`measureText`, one name per script, 32px): Latin "Sarah Levi" delta 0.000px, Cyrillic "Владимир Путин"
delta 0.000px, Hebrew "שרה לוי" delta 0.000px (10/14/7 glyphs respectively). For comparison, Caveat
(the catalogue's other kerning handwriting face) disagrees by 5.1px on a comparable Latin name - Amatic
SC's `kern` table agrees with Chromium to floating-point precision on all three scripts tested.

**Vietnamese, an unplanned finding:** Amatic SC's full Latin Extended coverage turned out to include
every Vietnamese tone-and-diacritic vowel too (130/130), even though it's a capitals-only display face
- a codepoint either has a glyph or it doesn't, independent of the letterform. `languageCoverage.test.js`
and the Sign page's Vietnamese note/FAQ were updated to list it honestly (capitals-only caveat
included), since the existing tests pin the family list against the generated coverage report and would
otherwise go stale.

**Not done, and why:** no Cyrillic guard existed before this ticket for any font (Greek and Cyrillic
were both "no guard, no handwriting option" per the research brief), so this is a new script row, not a
port. `exportRenderCorpus.js` gained one Hebrew case (`hebrew-nikud-amatic-sc`) and one Cyrillic case
(`cyrillic-amatic-sc`); `exportRenderBaseline.json` was deliberately left untouched (it is runner-pinned
and only the `update-export-render-baseline` CI workflow can regenerate it) - `export-render-guard.spec.js`
skips locally as expected and needs that workflow run before it covers the two new cases.

Wired into the catalogue: `scripts/font-manifest.mjs` (source), regenerated `fontManifest.js` and
`editorFonts.css`, `THIRD_PARTY_LICENSES.md` and `src/pages/licenses.astro` (both derive from the
manifest, no hand-edit needed), `src/lib/fontCoverageTable.js` and `fontCoverageReport.js`
(regenerated), the Sign page's Hebrew and Cyrillic copy and FAQ in `src/data/tools.js`, and
`src/editor/text/fonts.test.js`'s substitution-ranking test (Cyrillic now rescues to Amatic SC from a
handwriting request, the same shape as Mukta's Devanagari precedent). Full test suite (2380 tests),
typecheck, build, CSP, CSS, page-weight and the font-touching Playwright specs all green - see the
FONT-08 landing commit for the exact command output.
## Landed 2026-09-12: Neucha (FONT-08b, Cyrillic handwriting gap)

Cyrillic was text-only (Arimo/Tinos/Cousine/PT Sans, all upright) with no handwriting option at
all - one of the two gaps `docs/font-candidate-research-brief.md`'s 2026-08-29 pass named. Neucha
(Jovanny Lemonad, OFL 1.1, static Regular only, 138KB) was that brief's top pick, over Marck Script
(discarded: its own docs flag "intelligent OpenType features," the same `calt`-risk shape that sank
Playpen Sans Hebrew).

- **License**: fetched the real `ofl/neucha/Neucha.ttf` + `OFL.txt` from the google/fonts mirror.
  Name-table copyright `Copyright (c) 2005-2010 by Jovanny Lemonad. All rights reserved.` verified
  against the font's own `name` table; `OFL.txt`'s line (`Copyright (c) 2008-2010 by Jovanny Lemonad
  (http://www.jovanny.ru)`, different year range, same person) is what's recorded in the manifest, per
  the standing rule to use the license file's own line.
- **Screen 1 (crash)**: 0/18 crashes on a mixed Russian/Ukrainian/Latin corpus through `font.layout()`.
- **Screen (GSUB/features)**: `!!font.GSUB === false` - Neucha has no GSUB table at all, so there is no
  `calt`/`liga` mechanism through which fontkit and the browser could ever choose a different glyph for
  the same input. `availableFeatures` is `['kern']` only (GPOS).
- **glyf alignment**: passed as shipped, no repad needed (`npm run test:fonts`, 63 fonts checked).
- **Coverage**: 74/74 Cyrillic probe letters (full Russian alphabet + Ukrainian ґ/і/ї/є + ё), 62/62
  Latin ASCII+digits, all missing 0. Against the generated coverage report specifically: **full** on
  Russian, Ukrainian, Belarusian, Bulgarian, Serbian and Macedonian; **0.805 partial on Kazakh**
  (missing all 16 of ә/ғ/қ/ң/ө/ұ/ү/һ, upper+lower - Kazakh's eight extra letters are simply absent from
  Neucha's cmap, confirmed against the real bytes, not a shaping question). This is why Neucha could not
  join the existing `cyrillic` row in `scripts/language-acceptance.mjs` (every family in a row must be
  full on every language the row declares) and instead landed as its own `cyrillic-handwriting` row
  (six languages, no Kazakh).
- **Metrics**: real hhea ascent/descent via fontkit, `font.ascent / font.unitsPerEm` = 0.7686 →
  **0.769**, `Math.abs(font.descent) / font.unitsPerEm` = 0.2852 → **0.285**.
- **Shaping guard** (`e2e/sign/cyrillic-shaping-guard.spec.js`, new - Cyrillic had no shaping guard
  before this): `calibrationSet` mode (not `autoCalibrate` - a font with no GSUB never substitutes, so
  every corpus string would land in the "no substitution" bucket and the harness would correctly refuse
  to run). 18 corpus cases (Russian/Ukrainian names and form words incl. ё, ґ, ї, є, і, and mixed
  Cyrillic+digits) against an 86-string calibration set (76 bare letters + 10 kerning pairs), rendered
  at 300px. **Result (macOS): 18/18 passed, rasteriser floor 0.00%, advance-quantisation floor 0.00%,
  tolerance floored at 4%.** Not yet re-measured on the CI (ubuntu-latest) runner.
- **Kerning/advance parity spot check** (Guard A method, `shapedAdvancePx` vs. browser `measureText`,
  the scale Caveat's 5.1px gap on "Sarah Levi" set): Latin "Sarah Levi" 121.250px both sides (delta
  0.000px); Cyrillic "Александра Смирнова" 269.125px both sides (delta 0.000px); Cyrillic "Владимир
  Петров" 217.125px both sides (delta 0.000px). Exact agreement on all three, unlike Caveat.
- **Catalogue wiring**: `scripts/font-manifest.mjs` (`kind: 'handwriting'`), regenerated
  `fontManifest.js`/`editorFonts.css`/`THIRD_PARTY_LICENSES.md`; `npm run generate:font-coverage` and
  `generate:font-coverage-report`; `scripts/language-acceptance.mjs` gained the `cyrillic-handwriting`
  row (order 9, renumbering every row after it) with `e2e/sign/cyrillic-shaping-guard.spec.js` as its
  shaping/visual evidence; `e2e/sign/fixtures/exportRenderCorpus.js` gained a `cyrillic-neucha` case
  (baseline recapture pending the `update-export-render-baseline` CI workflow - not touched here).
- **Copy**: `src/data/tools.js`'s Cyrillic "supported" note now names Neucha and its Kazakh gap;
  `languageCoverage.test.js` updated to match (the old "no handwriting-style Cyrillic face" assertion
  is gone, replaced by a test pinning Neucha's six-of-seven coverage). The Cyrillic/Thai FAQ answer
  (`src/data/tools.js`, "Can I type Russian, Ukrainian, or Thai...") was **deliberately left unchanged**:
  it's one of the 12 fields `TOOL_SOURCE_FIELDS` hashes for the published `/he/sign/` translation's
  freshness gate, editing it marks that translation stale and fails the build, and this task has no
  Hebrew-review authority to clear that gate. Follow-up: fold a Neucha mention into that FAQ answer
  together with the next reviewed Hebrew `/sign/` pass.
- **One behavior change**: `resolveFontSubstitution('Caveat', 'Привіт')` now resolves to `Neucha`
  instead of `Arimo` (a handwriting request for Cyrillic text now prefers the handwriting candidate,
  same tagRank/classRank tiebreak Kalam and Mali already won for Devanagari/Thai) - `fonts.test.js`
  updated to match.
- **No Bold face** (Neucha ships Regular only, matching Google Fonts' own single-static-weight
  distribution); `requestedFontFile('Neucha', 'bold', ...)` falls back to Regular like every other
  Regular-only bundled face.
*(a), for the record:* Devanagari and Thai each had exactly one bundled face (Kalam, Mali) and both were handwriting, so an upright choice used to resolve the whole element to a handwritten look. **Devanagari:** Mukta (Ek Type, OFL) passed all three screening checks on the first candidate tried - see the Mukta writeup below. **Thai:** the top two ranked candidates, Sarabun and Kanit, both measurably failed the fontkit-vs-browser advance-parity check (Guard A) on ordinary Thai words (Sarabun 1.4-3.0% of string width, Kanit 0.3-1.0%) despite neither carrying `calt` - a real finding the three-check protocol exists to catch. **IBM Plex Sans Thai** landed instead: it does carry `calt` (flagged, and stress-tested specifically against the classic Thai tall-consonant/tone-mark collision case ปั๊กฝ้ายให้ฟังกิ๊บ) but passed Guard A cleanly (0.05px unhinted tolerance) on every sample including that stress case, so it shipped on the strength of the test rather than the flag - see `e2e/sign/thai-font-parity.spec.js`. **(b) single-font scripts with no second choice for variety** - Bengali, Punjabi/Gurmukhi, Telugu, Tamil, Japanese, Chinese SC/TC, Korean, plus Cyrillic and Greek (both text-only today, no handwriting option either), and Thai's *handwriting* side (Mali is still the only Thai handwriting face). The Arabic family closed 2026-09-12 (Vazirmatn, below). Named-but-unscreened candidates already on record: Sriracha (2nd Thai handwriting, same-day runner-up to Mali), a 2nd Cyrillic face, a 2nd Hebrew handwriting face, more Latin handwriting styles. **Research rules and the exact current catalogue to screen against: [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)** - landed in the repo as of `c1d7f13`; an earlier pass of this ticket found it referenced but missing, since fixed.

## 2026-09-12: Vazirmatn (Arabic family's second choice)

Screened per docs/font-candidate-research-brief.md's rules, that brief's own top pick for "a modern-feel second choice" alongside Scheherazade New (traditional Naskh): Vazirmatn (rastikerdar, OFL 1.1, upright geometric/humanist sans - the sharpest stylistic contrast to Scheherazade New available). **Landed.**

This is the documented risk class: Vazirmatn carries `calt` and `ss01` (plus liga, rlig, kern, mark, mkmk), the same feature class that sank Playpen Sans Hebrew (88% systemic shaping disagreement). The guard decided rather than the feature list, the same way IBM Plex Sans Thai (also `calt`) was judged on its guard result, not pre-judged on the flag:

- **License/source**: upstream statics (`rastikerdar/vazirmatn` `master/fonts/ttf/`, not the Google Fonts variable-only mirror), Regular/Bold ~123KB each. Copyright verified against the font's own embedded name table and the upstream `OFL.txt`, both reading `Copyright 2015 The Vazirmatn Project Authors (https://github.com/rastikerdar/vazirmatn)`. Latin glyphs are combined from Roboto by Vazirmatn's own build script (confirmed in the upstream README); Roboto's current Google Fonts distribution is itself OFL 1.1 (`Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic)`, verified against `google/fonts/ofl/roboto/OFL.txt`), so both halves of the dual attribution are OFL and both are recorded verbatim in THIRD_PARTY_LICENSES.md.
- **Fontkit crash screen**: 0/155 Arabic, 0/22 Pashto - no throws on the full generated corpus (`e2e/sign/fixtures/arabicCorpus.js`).
- **Coverage**: full against the font-languages.mjs Arabic (45/45), Farsi (50/50), Urdu (57/57), Pashto (61/61) and Latin (52/52 ASCII + digits) definitions, checked against the real TTF bytes.
- **`glyf` alignment**: already 2-byte aligned as shipped, no repad needed (`npm run test:fonts`).
- **Shaping correctness guard** (`e2e/sign/arabic-vazirmatn-shaping-guard.spec.js`, 320px geometry, same method as the Scheherazade New guard): Arabic 155/155 passing at 0.00% rasteriser floor, 0.00% advance-quantisation floor, 3.00% tolerance (the declared minimum). Pashto 22/22 passing at the same tolerance. A one-off sabotage control (shaping every character in isolation, i.e. no joining at all) failed 123/155 Arabic cases and 11/22 Pashto cases against the same tolerance, confirming the guard has real detection power on this font's letterforms.
- **Advance parity** (`e2e/sign/arabic-vazirmatn-font-parity.spec.js`, the Guard A method from `hebrew-font-parity.spec.js`): twelve ordinary Arabic/Farsi/Urdu/Pashto words with spaces, including a shadda+fatha stack (`مُحَمَّد`, the case that sank both Noto Arabic faces during the original five-candidate screening) and a lam-alef-heavy phrase (`لا إله إلا الله`). Max delta measured: **0.000px (0.00% of string width) on all twelve cases** - fontkit's shaped advance matched the browser's `measureText` to floating-point precision throughout, on this (unhinted) machine.
- **A real, measured behavior change**: `resolveFontSubstitution` now prefers Vazirmatn over Scheherazade New when substituting Arabic-family text from a sans-tagged requested font (e.g. the Arimo/Assistant defaults), since Vazirmatn's `sans` style tag matches and Scheherazade New's `serif` tag does not - the same style-tag-first ranking rule that made Mukta the FONT-08a Devanagari preference over Kalam. Updated fixtures/tests to match: `src/test/fixtures/wysiwygStrings.js`'s A1-A7 cases, `FontPickerMenu.test.tsx`, `TextNode.test.tsx`, `textCoverage.test.js`.

Wired into the catalogue (`scripts/font-manifest.mjs` → regenerated `fontManifest.js`/`editorFonts.css`/`THIRD_PARTY_LICENSES.md`), `fontCoverageTable.js`/`fontCoverageReport.js` (regenerated), an `exportRenderCorpus.js` case (`arabic-vazirmatn`, baseline capture pending the `update-export-render-baseline` CI workflow - this session cannot trigger it, same as FONT-03's Malayalam case), the Sign page's Arabic/Farsi/Urdu/Pashto copy (languages card notes and FAQ answers, now naming both fonts) and `licenses.astro` (reads `FONT_MANIFEST` directly, no manual edit needed). One unrelated build gate crossed in passing: changing the Sign page's English FAQ invalidated `/he/sign/`'s published-translation `sourceHash` (LOC-03) even though none of the four edited FAQ answers are in that page's translated 10-item subset - reviewed the diff, confirmed no Hebrew-visible text changed, and refreshed the hash with a note in the yaml's `reviewNotes` rather than a full retranslation.
## Landed 2026-09-12: Tillana

Devanagari's *second handwriting* face (Kalam was the only one; Mukta, landed under (a) above, is upright). **Tillana** (Indian Type Foundry, OFL 1.1, same copyright line as Kalam's own `OFL.txt`: "Copyright (c) 2014, Indian Type Foundry (info@indiantypefoundry.com)"). Static Regular/Bold, structured calligraphic brush handwriting.

- **License and coverage:** fetched Regular (329,148 bytes) and Bold (306,716 bytes) from the google/fonts mirror. Fontkit crash screen: 0/185 throws on the full Devanagari corpus, both weights. Coverage: full (71/71 codepoints) against `scripts/font-languages.mjs`'s real Hindi/Marathi character set (independent vowels, the 35 standard consonants, matras, anusvara/visarga/candrabindu/OM/virama, digits), both weights; full Latin ASCII (26/26 + 26/26) and digits (10/10). Available OpenType features: `liga` (no `calt`).
- **`glyf` alignment:** shipped unaligned (Regular 513/1013, Bold 510/1013 odd `loca` offsets, matching the brief's "roughly half of Brahmic candidates need this"). Repadded with fontTools (`padding = 4`); verified byte-identical outlines, hmtx and cmap for all 1012 glyphs in both weights before overwriting the bundled files (`npm run test:fonts` is the standing guard - 64 fonts, all aligned after this landed).
- **Pixel-diff shaping guard** (`e2e/sign/devanagari-tillana-shaping-guard.spec.js`, same corpus/method as the Kalam and Mukta guards): **185/185 passed**, rasteriser floor 0.03%, tolerance floored at 4%.
- **Advance parity spot-check** (SIGN-20-style, browser `measureText` vs. fontkit's shaped advance): across all 185 corpus cases, **every case matched to 0.0000px** against a SIGN-19 bound of `glyphCount x 0.5px` (0.50-1.00px depending on case).
- **Handwriting kerning parity** (this catalogue's specific hazard for a handwriting face - Caveat's Latin `measureText` disagrees with fontkit by 5.1px on "Sarah Levi"): spot-checked one Latin name with a space and three Devanagari names with spaces. "Priya Sharma" 0.0001px, "प्रिया शर्मा" 0.0000px, "राज कुमार" 0.0001px, "सीता देवी" 0.0000px - all sub-thousandth-of-a-pixel, nowhere near Caveat's gap.
- **Wired into the catalogue**: `scripts/font-manifest.mjs` (kind `handwriting`, styleTag `handwriting`, metrics from the real `hhea`: ascent 1.158, descent 0.484), generated `fontManifest.js`/`editorFonts.css`/license lists via `npm run generate:font-manifest`; `npm run generate:font-coverage` and `npm run generate:font-coverage-report` regenerated (`LANGUAGE_COVERAGE.devanagari.full` and `.marathi.full` now `[Kalam, Tillana, Mukta]`, order from `HANDWRITING_FONTS` then `TEXT_FONTS`). `languageCoverage.test.js` updated to match, including the Latin-script and Turkish notes' handwriting-face counts (eight -> nine faces catalogue-wide; three of nine, not two of eight, carry the full Latin accented set - Tillana measured full there too).
- **Copy**: `src/data/tools.js`'s Hindi/Marathi languages-card note and FAQ answer, plus the Latin-script and Turkish notes/FAQ, updated to name Tillana and the new counts.
- **Export-render corpus**: `devanagari-tillana` case added to `e2e/sign/fixtures/exportRenderCorpus.js` (नमस्ते, matching `devanagari-kalam`'s string). `exportRenderBaseline.json` deliberately not touched (runner-pinned, CI-only) - `export-render-guard.spec.js` skips locally on macOS as expected; the new case needs `update-export-render-baseline` on the next CI run before that guard covers it.
- **Side effect on the Hebrew `/he/sign/` page**: the FAQ text change (Hindi/Marathi and Turkish answers, which the Hebrew page does not translate - see its own file comment) changed the English `sign` tool's `sourceHash`, which the published Hebrew translation pins. Verified none of the changed fields are part of Hebrew's translated FAQ subset, so no re-review was needed; bumped the pin in `src/content/localized-tools/he/sign.yaml` with a dated comment explaining why, rather than leaving the build broken or taking the page offline.
## Landed 2026-09-12: Hind Siliguri (Bengali/Assamese second choice)

**Bengali's second choice, closed.** Noto Sans Bengali was the only bundled Bengali face; Hind Siliguri
(Indian Type Foundry, OFL 1.1, static Regular 250,052 bytes / Bold 287,660 bytes, upright humanist
sans) joins it, per the top-ranked FONT-08b candidate in
[docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)'s Bengali row. License
copyright (`Copyright (c) 2015 Indian Type Foundry (info@indiantypefoundry.com)`) verified against the
font's own `OFL.txt` fetched from the google/fonts mirror and against the embedded name table's
`copyright` field - identical. Embedded version `1.001` (from the name table's `Version 1.001;PS
1.0;...` string, same convention as every other manifest entry).

- **Screen 1 (fontkit crash):** 0/262 throws shaping `bengaliCorpus.js`'s full, unfiltered case set
  (the five shaping-axis groups - preBaseVowel, reph, raphala, yaphala, conjuncts - concatenated
  without Noto's own `KNOWN_FONTKIT_DIVERGENCES` filter, since those exclusions are Noto's, not Hind
  Siliguri's).
- **Screen 2 (pixel guard, `e2e/sign/bengali-hind-siliguri-shaping-guard.spec.js`):** self-calibrating
  (`autoCalibrate`), 400px geometry (above Skia's ~256px bitmap-glyph limit, matching the current
  Bengali/Devanagari/Malayalam standard). The five curated axis groups alone gave `autoCalibrate`
  nothing to partition from (0/262 non-substituting on a first pass, since every case is constructed to
  trigger a shaping feature) - extended the corpus with 60 calibration-filler cases (bare consonants and
  consonant+plain-AA pairs, the same zero-ambiguity shape the Noto Sans Bengali guard's own hand-picked
  `CALIBRATION_SET` uses), for 322 corpus strings total. Result: 60 non-substituting (calibration:
  rasteriser floor 0.00%, advance-quantisation floor 0.00%), 262 substituting and under test, **262/262
  passed at the 4% tolerance floor - zero divergent cases**, unlike Noto Sans Bengali's six. Sabotage
  control (glyph draw order reversed on every substituting case, run once locally, not shipped): 208/262
  failed with the calibration/floor measurement unchanged, proving the guard detects rather than
  rubber-stamps.
- **Screen 3 (advance parity, SIGN-20-style spot check, not a shipped assertion):** fontkit's summed
  shaped glyph advances vs. the same browser's `measureText` across all 322 corpus + calibration
  strings - **max widthDiff 0.000px**, zero cases past SIGN-19's `glyphCount x 0.5px` rounding bound.
- **`glyf` alignment:** passed as shipped, no repad needed (`npm run test:fonts`, 64 fonts checked).
- **Coverage:** full Bengali base alphabet (vowels, consonants, khanda ta, vowel signs, marks, digits),
  full Assamese extras (ৰ, ৱ), full Latin ASCII + digits - all verified against the real TTF bytes via
  fontkit's `hasGlyphForCodePoint`.

**Wired into the catalogue** (`scripts/font-manifest.mjs` → regenerated
`src/editor/text/fontManifest.js`, `src/styles/editorFonts.css`, `THIRD_PARTY_LICENSES.md`;
`src/lib/fontCoverageTable.js` and `src/lib/fontCoverageReport.js` regenerated), the Sign page's Bengali
language-card note and FAQ (now two fonts, Hind Siliguri's zero divergences named alongside Noto's six,
which stay named because they are still real for that font), and
`e2e/sign/fixtures/exportRenderCorpus.js` (`bengali-hind-siliguri` case, স্বাগতম "welcome", a real
conjunct-bearing word - `exportRenderBaseline.json` not touched; pending the `update-export-render-
baseline` CI workflow per the nine-step rule, since that file is runner-pinned).

**Known issue surfaced by this change, not fixed here:** editing the Sign tool's English FAQ (required
by this landing) invalidates `/he/sign/`'s published-translation `sourceHash`
(`src/i18n/documentationFreshness.ts`), which `npm run build` correctly refuses as a build error per
LOC-10's accepted design ("a stale published Hebrew page is worse than none"). This is not specific to
Hind Siliguri - any font landing that touches the Sign FAQ hits the same gate, and several are landing
in parallel right now. Needs Shlomi's own review of `/he/sign/` (native review, not an AI self-attestation
per LOC-09's standing rule) before this branch - or the merged set of parallel font-landing branches -
can build clean again.
## 2026-09-12: Greek handwriting (Mynerve/Mansalva)

Greek was text-only (Arimo, Tinos, Cousine), no handwriting option - the gap docs/font-candidate-research-brief.md's "Greek handwriting gap" section named as genuinely scarce (confirmed by an independent TypeDrawers thread on the same gap), with exactly two candidates found: Mynerve and Mansalva, both by Carolina Short, both OFL 1.1, both flagged for `calt` at screening time (the same feature class that got Playpen Sans Hebrew dropped for an 88% shaping disagreement).

**Mynerve screened first and passed on every check - landed, Mansalva was not needed.**

- License: OFL 1.1, copyright verified against Mynerve's own `OFL.txt` and its embedded name table (both agree): `Copyright 2022 The Mynerve Project Authors (https://github.com/carolinashort/MyNerve)`. Static, single weight (Regular only), 279KB.
- Fontkit crash screen: 0/37 throws on an ad hoc corpus of Greek names, phrases, mixed digits and repeated letters.
- `glyf`/`loca` alignment: already 2-byte aligned as shipped, no repad needed (`npm run test:fonts` passes on all 63 bundled fonts including this one).
- Coverage verified against the real font bytes (fontkit `hasGlyphForCodePoint`, not the label): full 66-codepoint Greek set (`scripts/font-languages.mjs`'s `GREEK` - base alphabet plus every tonos and dialytika letter), full Latin ASCII (62/62, letters + digits). Bonus finding, not part of the Greek screen: also full Vietnamese tone/diacritic coverage (102/102), so it joined `LANGUAGE_COVERAGE.vietnamese.full` alongside Arimo/Tinos/Cousine/Mali.
- Real `hhea` ascent/descent: 0.930/0.380.
- **Pixel-diff shaping guard** (`e2e/sign/greek-shaping-guard.spec.js`, self-calibrating on a 91-string corpus of base letters, every tonos/dialytika letter, ten names/phrases with spaces, mixed Greek+digits, and repeated letters - `e2e/sign/fixtures/greekCorpus.js`): 87 non-substituting (calibration), 4 substituting (cases under test), **0/4 failing**, rasteriser floor 0.01%, tolerance 3.00%.
- **Advance parity** (`e2e/sign/greek-font-parity.spec.js`, Hebrew-Guard-A style: fontkit's shaped advance vs. this browser's own `measureText`), ten Greek names/phrases with spaces: **10/10 passed, 0.000px disagreement on every case** (first measured per-segment; per-run since `6879e01`, see the next item).
- **Caveat, not blocking:** a one-off spot-check (not wired as a standing assertion, same precedent as the Mukta/Devanagari screening note) against a Latin name, `'Sarah Levi'`, measured fontkit 146.464px vs. browser 142.816px, a **3.648px / 2.55%-of-string-width** disagreement on 10 glyphs - the same class of handwriting-`calt`-kerning divergence already documented and accepted for Caveat (`.claude/rules/fonts-and-text.md`: Caveat disagrees by 5.1px on this identical string). Mynerve joins the catalogue for Greek, where seven-plus other bundled faces already cover Latin cleanly, so this was not treated as disqualifying.
- **Finding surfaced while building the parity guard, since resolved:** shaping `'Νικόλαος Δημητρίου'` (pure Greek, no Mynerve involved) through the *existing* upright faces Arimo and Tinos disagreed with the browser by ~1.77px (113 font units) on both, while Mynerve shaped the identical string at 0.000px. The guard was scoped to Mynerve only so the gap did not block the landing. Root cause was the export, not the fonts: a `space + Δ` kern pair (-113, same as `space + A/Α/Λ`) that DOM layout applies because it shapes a run whole and the export's per-space split (H9) never reached. The split was reverted in `6879e01` (2026-09-12); the guard now shapes each run whole like the Hebrew, Thai and Arabic Guard A specs, and Arimo and Tinos joined its `FAMILIES`: **30/30 passed** (three families, ten samples) on macOS at the 0.05px subpixel tolerance.

Wired into the catalogue as one unit: `scripts/font-manifest.mjs` (source of generated `fontManifest.js`/`editorFonts.css`/`THIRD_PARTY_LICENSES.md`'s font list), `public/fonts/Mynerve-Regular.ttf`, the Greek and Vietnamese entries in `src/data/tools.js`, `scripts/language-acceptance.mjs`'s Greek row (now `shaping: guarded`, families gains Mynerve), a new `greek-mynerve-handwriting` case in `e2e/sign/fixtures/exportRenderCorpus.js` (baseline addition pending a CI run with `update-export-render-baseline`, per `.claude/rules/fonts-and-text.md` - not touched locally), and the generated coverage table/report (`npm run generate:font-coverage`, `npm run generate:font-coverage-report`). `src/editor/text/fonts.js`, `FontPickerMenu.tsx` and `licenses.astro` needed no manual edit - all three now derive from the manifest.

Mansalva was fetched and screened for coverage/crash-risk as a fallback (66/66 Greek, 62/62 Latin ASCII, 0/37 fontkit throws, copyright `Copyright 2019 The Mansalva Project Authors` per its own `OFL.txt` - note this differs from the 2022 date in its embedded name table, OFL.txt is the source of record) but never wired into the catalogue or run through the shaping/parity guards, since Mynerve passed cleanly on the first attempt.
