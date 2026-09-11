---
paths:
  - "src/editor/text/**"
  - "src/editor/registry/text*"
  - "src/editor/adapters/pdf/**"
  - "src/lib/*ont*"
  - "src/lib/languageCoverage*"
  - "src/lib/signExportReadiness*"
  - "src/components/FontPickerMenu*"
  - "src/components/SignatureDialog*"
  - "src/components/SignTool/FontSupportNotice*"
  - "src/components/SignTool/ExportReadinessNotice*"
  - "src/components/SignTool/nodes/**"
  - "src/styles/editorFonts.css"
  - "public/fonts/**"
  - "scripts/font-*"
  - "scripts/fonts/**"
  - "scripts/generate-font-*"
  - "scripts/check-font-*"
  - "scripts/display-only-fonts.mjs"
  - "scripts/*language-acceptance*"
  - "e2e/sign/*-guard.spec.js"
  - "e2e/sign/*-parity.spec.js"
  - "e2e/sign/language-acceptance.spec.js"
  - "e2e/sign/fixtures/**"
  - "THIRD_PARTY_LICENSES.md"
  - "src/pages/licenses.astro"
  - "docs/hebrew-text-shaping-export.md"
  - "docs/wysiwyg-text-architecture.md"
  - "docs/shaping-guard-platform-calibration.md"
  - "docs/font-candidate-research-brief.md"
  - "docs/language-font-acceptance-matrix.md"
---

# Fonts, text shaping and the PDF export

Loaded when working on the font catalogue, text coverage, shaping guards, or the text export path.
The one-line version in CLAUDE.md is: **the editor is Chrome and the exporter is fontkit, so every
font is proven per script by a guard, and the catalogue is ours to curate.** Everything below is the
evidence and the procedure behind that line. Screening rules for a *candidate* font live in
[docs/font-candidate-research-brief.md](../../docs/font-candidate-research-brief.md).

- **Fonts must render identically on screen and in the export**: `src/editor/text/fonts.js` owns the catalogue and `resolveFontFamily(family, text)`, which both `TextNode.jsx` (editor), `SignatureDialog.jsx` (typed signatures), and `src/editor/registry/text.ts` (export) call — never bypass it by rendering `element.fontFamily` directly. Reason: the editor loads each TTF via `@font-face` and the browser silently substitutes a *system* font per character for glyphs the file lacks, while a PDF embeds one font per run with no fallback, so a missing glyph exports as an empty rectangle. That mismatch is invisible in the app and only shows up in the downloaded file; it shipped once as Latin-only Heebo/Assistant builds turning Hebrew into boxes. Latin-only handwriting faces (Caveat, Dancing Script, Great Vibes, Pacifico, Sacramento) have no Hebrew glyphs by design, so Hebrew in them substitutes to Gveret Levin (handwriting) or Arimo (upright), for the whole element rather than per character so both sides can agree exactly. `src/lib/fontCoverage.test.js` checks the real asset bytes of every family claimed Hebrew-capable — if you add a font, add it to the catalogue and let that test judge it.

  **The substitution is table-driven, and the table is the feature, not a detail.** `SCRIPT_FALLBACKS` in `fonts.js` carries one row per script (Hebrew, Devanagari, Thai, Cyrillic, Greek): a pattern, the fonts that can actually draw it, and a handwriting and an upright fallback. Hebrew is just the first row. **Adding a font for a new script is not finished until it has a row** - Mali shipped bundled and advertised for Thai with no row, so Thai text still resolved to a font without Thai glyphs and still died at download, which is exactly the bug the whole module exists to prevent. `fontCoverage.test.js` verifies every row against the real TTFs in both directions: every font listed can draw the script, and **every font left off cannot**. That second assertion is the one that catches a bundled-but-unrouted face, so do not weaken it into a one-way check.

  **Two rules follow from the table, and both are about not lying to the user.** A substitution must be *explained*, never silent - `resolveFontSubstitution` returns the script that forced the change and the editor shows a notice, because the font visibly changes under the user as they type. And when no bundled font can draw something at all (Arabic, CJK, emoji), the honest answer is still a refusal, but it belongs **while they are typing**, not at Download. That
  guarantee is now split across two modules that must keep agreeing. `src/editor/text/textCoverage.js` is the
  *export* side: it walks the document against the real font bytes, owns the document-level message
  strings, and is what `signPdf` refuses with. `src/editor/text/textFontSupport.js` is the *editing* side: a
  synchronous presentation model derived from the generated glyph data in `fonts.js`, rendered by
  `FontPickerMenu.tsx` and by `TextNode.tsx` through `SignTool/FontSupportNotice.tsx`, so a text box can
  be marked as needing attention while it is being typed into. **Neither is allowed to answer a coverage
  question on its own terms:** both resolve the family through `fonts.js`, both truncate comb fields
  through `textForCoverage` in `comb.js`, and both run the same missing-glyph transforms, which is what
  keeps the live notice and the refusal from naming different characters. `textCoverage.test.js` compares
  the two answers against real TTFs; that comparison is the guard, so do not add a coverage rule to one
  side without the other. (The former `useFontCoverageNotice.js` hook is gone; do not reintroduce a third
  path.)

  **Bengali ships with six named shaper disagreements, and that is a curation decision, not an
  oversight.** `e2e/sign/bengali-shaping-guard.spec.js` pixel-checks 262 generated cases against
  Chromium; 256 match. The six that do not are listed by id in `KNOWN_FONTKIT_DIVERGENCES` in
  `e2e/sign/fixtures/bengaliCorpus.js` with their measurements, and they fall into two named groups.
  **Component placement on a retroflex consonant:** ট্র and ঠ্র place the zero-advance ra-phala tail
  differently against a retroflex half-form (about 42% pixel diff at an *identical* advance width, so
  a positioning disagreement rather than a missing glyph, and the other eight consonants tested pass),
  and টি misplaces the TTA flag at an exactly matching advance. **Conjunct assembly:** ক্ক is a GSUB
  gap where fontkit emits three unligated glyphs with a visible virama at 161.4px where Chromium
  ligates to 78.9px; স্ক is drawn with no headline component over its KA part and under-reports its
  advance by 14%; and দ্ধ draws correctly but reports an 18%-short advance. They are excluded from the
  enforced corpus so the guard still protects the other 256, and each exclusion is named rather than
  dropped. **The precedent this is measured against is Playpen Sans Hebrew, which was removed from the
  catalogue entirely for an 88% systemic disagreement.** 2.3% across six narrow, enumerable clusters in
  two named groups is a different thing, and the Sign page's Bengali FAQ names all six to the user
  rather than claiming parity we do not have. **The list is now at the size where the next finding
  should change the answer rather than extend it**: if a seventh appears, or if SIGN-20 shows the
  advance class is wider than the clusters named here, re-open the drop-or-keep decision instead of
  adding a line. Note also that দ্ধ's defect is one this pixel guard is structurally poor at seeing -
  হ্ন and ক্ত carry the same advance error and still pass, because their ink matches (SIGN-20).

  **A font's Noto face is not automatically the right one, and "does fontkit crash on it" is the first
  thing to measure.** Punjabi and Telugu (landed 2026-08-28) both ship on a **non-Noto** face, because
  fontkit throws an uncaught `Cannot read properties of null (reading 'xCoordinate')` inside
  `GPOSProcessor.getAnchor` on Noto Sans Gurmukhi (203 of 500 generated cases, and most ordinary words -
  ਸਿੰਘ "Singh" included) and on Noto Sans Telugu (4 of 630, all consonant+virama+RA, which is ప్ర, which
  is in ఆంధ్రప్రదేశ్). **This is the same crash that blocks Noto Nastaliq Urdu**, so it is a general
  fontkit limit, not a Nastaliq quirk. Two things make it worth a standing rule rather than a footnote.
  First, it **reaches the real export path**: `signPdf` rejects with that raw `TypeError`, not a clean
  `UnrepresentableTextError`, so shipping it means a crashing Download rather than an honest refusal -
  the one outcome this whole module exists to prevent. Second, it is **invisible to every other check** -
  coverage is full, the `glyf` alignment guard passes, the font is real and OFL and looks correct in the
  browser, because Chromium's shaper has no such problem. Only running the generated corpus through
  fontkit finds it. So: **before wiring any new font, shape the whole corpus through fontkit and count
  the crashes.** It costs one script and it eliminated two candidates here. Replacements are screened the
  way the Arabic candidates were (Mukta Mahee for Punjabi, Anek Telugu for Telugu; Noto Sans Tamil needed
  no screening and shipped as-is), and the Sign card *says* why the font is not the expected Noto one
  rather than quietly substituting - `languageCoverage.test.js` pins that explanation.

  **Font screening protocol: three independent checks, and a candidate that clears one has not been
  screened.** Learned the expensive way across the Gurmukhi/Telugu crashes and SIGN-19.
  (1) **Does fontkit crash on it?** Shape the whole generated corpus through fontkit and count uncaught
  throws - the paragraph above. (2) **Does fontkit pick the same glyphs as Chromium?** The per-script
  pixel guard - but that guard only means something if it renders **above ~256px**, because below Skia's
  bitmap-glyph limit `fillText` draws cached bitmaps while the guard's reconstruction fills outlines
  through `Path2D`, and the two rasterisers disagree enough to swamp real findings. (3) **Does fontkit
  report the same advances as Chromium?** **Nothing checks this yet - SIGN-20.** A pixel diff is close to
  blind to it, because an advance error lives in the trailing space *after* the ink: Bengali হ্ন is 21px
  (28%) short at a 6.16% pixel diff and ক্ত is 20px short at 7.27%, and both still pass the enforced
  corpus. In an export that overlaps whatever follows. Until SIGN-20 lands, do not read a green shaping
  guard as a statement about cluster advances.

  **Handwriting faces are the hard case, and thin ones are the hardest.** They are the noisiest under
  every pixel comparison here - the only two exported-PDF render baseline cases that ever drifted across
  platforms were Caveat and Great Vibes - and they carry a failure the upright faces do not: Caveat's
  `measureText` disagrees with fontkit's summed advances by **5.1px on "Sarah Levi"** on macOS, which is
  kerning one side applies and the other does not. So screen a handwriting candidate for **kerning
  parity**, not just glyph coverage and shaping. The Latin/Caveat guard is already `test.skip`ped as red
  for a related reason; do not read the other Latin guards' green as covering it.

  **Separating a real advance divergence from the browser's own rounding has a clean bound**, established
  under SIGN-19: whole-pixel advance rounding can move a cluster by at most `glyphCount x 0.5px`, so
  anything past that is the font or the shaper. Checked against every known case, it separates them
  cleanly (হ্ন 21px against a 1.5px bound; `phrase:jumhuriya` 2.008px against an 8.5px bound).

  **Every font accepted before 2026-08-29 was screened against a tolerance loose enough to hide a real
  divergence, so re-screen before trusting an old green.** The Arabic guard's tolerance was **22.33%** -
  it admitted roughly a quarter of the pixels differing - and Bengali's was 14.48%. This is not
  theoretical: fixing the geometry immediately surfaced two real divergences in a face that had been
  shipping as clean (`টি` had been *passing by 0.7 points* and is genuinely malformed; `স্ক` is drawn with
  no bar across its top), taking Noto Sans Bengali's known-divergence list from three entries to six
  without the font changing at all. **Arabic, Pashto and Bengali have been re-measured at the new
  geometry; Devanagari, Tamil, Telugu and Gurmukhi have not** - they still run at the old small render
  size, and their greens are in exactly the category Bengali's was. Re-screening them is a one-line
  geometry change per guard and is the cheap move before leaning on those scripts or adding a language.

  **Adding a font: the work required.** Derived from what the last additions actually touched, because
  the expensive failures here have all been *omissions* rather than mistakes. Do these as one unit.

  1. **Screen the candidate** against the three checks above, plus license (OFL 1.1 or Apache-2.0 only,
     copyright line taken from the font's own `OFL.txt`, never paraphrased) and static-vs-variable.
  2. **Add the TTFs to `public/fonts/`** and run `npm run test:fonts`. If the `glyf` table is unaligned,
     repad to `padding = 4` in fontTools and verify outlines, metrics and cmap are byte-identical across
     every glyph - roughly half the Brahmic faces landed so far needed this.
  3. **Register it in `src/editor/text/fonts.js`** (`HANDWRITING_FONTS` or `TEXT_FONTS`) and add an `@font-face`
     to `src/styles/editorFonts.css`. Add it to `src/components/FontPickerMenu.tsx` if it needs a label.
  4. **For a new script, add a `SCRIPT_FALLBACKS` row.** A bundled-but-unrouted face is the exact bug
     that module exists to prevent - Mali shipped advertised for Thai with no row and still died at
     download. `fontCoverage.test.js` judges the row in both directions against the real bytes.
  5. **Update `scripts/font-languages.mjs`** if the font brings a new language or character set, then
     **regenerate both derived files and commit them**: `npm run generate:font-coverage` writes
     `src/lib/fontCoverageTable.js`, and `npm run generate:font-coverage-report` writes
     `src/lib/fontCoverageReport.js`. Both are marked GENERATED - do not hand-edit; their tests
     regenerate in memory and fail on any disagreement.
  6. **Add a per-script shaping guard** (corpus + spec on `shapingGuardHarness.js`) **rendered above
     ~256px**, and record its measured floor, tolerance and sabotage-control result in the spec's module
     doc. A guard whose sabotage control cannot fail it is measuring nothing.
  7. **Add an `exportRenderCorpus.js` case, and recapture the baseline** - `exportRenderBaseline.json` is
     **runner-pinned** and can no longer be captured on a dev machine, so run the CI workflow manually
     with the `update-export-render-baseline` input and commit the printed file after reviewing the
     diff. **This is the step that has already been missed once**: FONT-05 added three CJK cases without
     baselines and CI went red on "these corpus cases have no baseline, so nothing checked them". Expect
     the diff to be purely additive; existing signatures changing means a rendering change to look at,
     not a baseline to rubber-stamp.
  8. **Add the attribution** to `THIRD_PARTY_LICENSES.md` and `src/pages/licenses.astro`
     (`fontAttribution.test.js` pins this), and **update the user-facing copy** in `src/data/tools.js` -
     the language list, the per-language note, and the FAQ answer. Any known divergence must be named to
     the user there, not left for them to find.
  9. **Check page weight.** Fonts load on demand rather than being precached wholesale, but repo weight
     and per-font download size still count; flag anything oversized rather than landing it quietly.

  **The four Brahmic guards and what each actually proves.** Bengali is a fixed calibration set
  (259/259); Gurmukhi (140/140), Telugu (486/486) and Tamil (265/265) use `autoCalibrate`, which
  partitions the corpus by fontkit's own substituted/not-substituted judgment instead of a hand-picked
  set. That choice is deliberate and worth keeping: Bengali's calibration set could be hand-built because
  its akhn/blwf/vatu/pstf/rphf features were readable straight off the font's GSUB table, and this
  project has no equivalent in-house reference for the other three - so hand-classifying "which cases
  have no shaping ambiguity" would have been a guess, and a wrong guess there produces a falsely wide
  tolerance rather than a visible failure. Let the harness partition it.

  **Fonts are subsetted on export, and that is a recent inversion of a long-standing invariant.**
  `signPdf` embeds with `{ subset: true }`, so a downloaded PDF carries only the glyphs it draws: one
  Arimo text box went from 279 KB to 5.7 KB, and Arimo + Heebo + Pacifico together from 348 KB to
  11 KB. Two rules hold it up. First, `drawShapedRun` emits glyph ids itself rather than going through
  `encodeText`, so it must do the subset embedder's own bookkeeping - `includeGlyph` for the remapped
  id, plus `glyphs`, `glyphIdMap` and `glyphCache.invalidate()`, which are what the `/W` widths and the
  ToUnicode CMap are later built from. `remapGlyphForSubset` in `text.ts` does all four and **throws**
  if a pdf-lib upgrade renames any of them; do not soften that into a fallback, because emitting a raw
  id against a subsetted font draws plausible-looking wrong glyphs rather than failing.
  Second, **fontkit's TTF subsetter cannot read unaligned glyph outlines**. Kalam shipped with a
  51-byte (odd) `.notdef`, and since every subset includes glyph 0, every glyph after it was garbage -
  which reached the W1 render guard as one drifted case out of 21 and nothing else. It was repadded
  (`font['glyf'].padding = 4` in fontTools; outlines, metrics and cmap all verified byte-identical
  across all 1,027 glyphs) and `npm run test:fonts` now fails the build on any unaligned bundled font.
  The lesson generalises past this one bug: **outline format does not predict whether a font subsets
  correctly.** Five other bundled families share Kalam's `indexToLocFormat` and are all fine. Test the
  font, not the format - and note that the older records disagree about this (TODO.md blames CFF and
  variable builds, the design record says corruption reproduces on a static `glyf` font). Both
  generalised from one sample; alignment was the actual variable.

  **Glyph coverage is one stage of five, and all five now exist.** Drawing text correctly is
  normalization, bidi, itemization, shaping, positioning. The export has normalization
  (`composeHebrewClusters`, NFC plus gated Hebrew presentation-form recomposition), bidi
  (`resolveBidiRuns`, UAX#9 via `bidi-js`, resolved with the element's explicit paragraph direction and
  never auto-detected), element-level itemization plus a refusal for anything no font covers, shaping
  (fontkit, per bidi run then per whitespace segment) and positioning (per-glyph `Tm`/`Tj`/`Ts`).
  **These once presented as unrelated bugs and were not**, and swapping fontkit for a bigger shaper would
  have fixed exactly one of the three, which is why it was the most expensive wrong move available.
  Full analysis and the per-font measurements are in
  **[docs/hebrew-text-shaping-export.md](./docs/hebrew-text-shaping-export.md)** - **note that document
  is stale on current state** (its layer 1/2/3 headers still say "open" and all three shipped);
  **[docs/wysiwyg-text-architecture.md](./docs/wysiwyg-text-architecture.md)** supersedes it there and
  carries the map verified from code.
  Three standing rules come out of it. First, **the catalogue is ours to curate**: we owe correct output
  for the fonts we ship, not for every font that exists, so a font that cannot be made to match the
  editor gets dropped or marked Latin-only rather than given a special path. Second, **never fix a
  rendering mismatch by rasterising text to an image** - it makes the download stop being text
  (no selection, search, copy or accessibility) to paper over a positioning bug. Third, and this is the
  one that is easy to lose: **having all five stages is not agreement.** The editor is still Chrome and
  the exporter is still fontkit, so shaping specifically is proven per font, per script, by a guard - and
  five of the seven shipped scripts do not have one. Do not read a green run on Hebrew as a statement
  about Latin.

  **And be precise about which platform a guard proves agreement on.** The per-font shaping guards
  compare fontkit against *the browser that runs them*, so what they prove is agreement on the machine
  that ran them - which, for a release, means the `ubuntu-latest` CI runner, since that is what gates
  `main`. That used to be a much weaker statement than it looked: the guards passed on macOS and failed
  on Linux on the same commit, because the comparison was picking up two artefacts of the measuring
  browser rather than of the exported PDF (SIGN-19). Both are now removed or measured, so the Arabic,
  Pashto and Bengali guards give the same verdict on both platforms and a green run means the same
  thing wherever it happened. Two caveats survive that fix and should not be quietly dropped. The
  **exported-PDF render guard is different**: its baseline is platform-bound, pinned to the CI runner,
  and it **skips** on a developer's machine - so a green local `npm run test:e2e` has not run it at all,
  and only CI's green covers it. And **there are no Linux users** - macOS, Windows, iPhone and Android
  are the platforms, Linux is the build machine - so where the runner's rasteriser differs from a
  user's, the runner is an instrument to correct, never a fidelity target to calibrate towards. Full
  record: [docs/shaping-guard-platform-calibration.md](./docs/shaping-guard-platform-calibration.md).


## Export-side hazard: pdf-lib discards the shaping it computed

- **`page.drawText()` throws away the shaping it just computed.** pdf-lib's `encodeText` calls
  `font.layout()` (full GSUB/GPOS, so it picks the right glyphs) and then keeps only `glyphs[].id`,
  discarding the `positions` array that says where each mark attaches. The PDF places everything by the
  `/W` widths instead, so Hebrew vowel points land wrong and, in the worst font, letters overlap. The
  shaping is not missing, it is discarded, so the fix is to emit each glyph at its shaped position, not
  to rasterise. **Do not batch glyphs into a shared `showText` run** as an optimisation: a batched run
  advances by `/W`, not by the shaper's advances, and where they disagree the rest of the run silently
  drifts. Guarding the batch against the glyph's `hmtx` advance does not catch it. Full analysis,
  including why HarfBuzz WASM is not needed and how to calibrate a parity harness, in
  **[docs/hebrew-text-shaping-export.md](./docs/hebrew-text-shaping-export.md)**.

## CI guard

9. **Bundled font `glyf` alignment** (`check-font-glyf-alignment.js`, `npm run test:fonts`) - no bundled
   TTF may have an odd `loca` offset. See "Fonts are subsetted on export" below for why an unaligned
   font silently corrupts the download.


