---
paths:
  - "src/editor/text/**"
  - "src/editor/registry/text*"
  - "src/editor/adapters/pdf/**"
  - "src/editor/text/fontCoverageTable*"
  - "src/tools/sign/signExportReadiness*"
  - "src/editor-ui/FontPickerMenu*"
  - "src/tools/sign/components/SignatureDialog*"
  - "src/tools/sign/components/FontSupportNotice*"
  - "src/tools/sign/components/ExportReadinessNotice*"
  - "src/tools/sign/components/nodes/**"
  - "src/styles/editorFonts.css"
  - "src/tools/sign/languageAcceptance*"
  - "public/fonts/**"
  - "scripts/fonts/**"
  - "scripts/generate-font-*"
  - "scripts/check-font-*"
  - "scripts/*language-acceptance*"
  - "e2e/sign/*-guard.spec.js"
  - "e2e/sign/*-parity.spec.js"
  - "e2e/sign/fixtures/**"
  - "e2e/export/**"
  - "THIRD_PARTY_LICENSES.md"
  - "src/pages/licenses.astro"
  - "docs/hebrew-text-shaping-export.md"
  - "docs/wysiwyg-text-architecture.md"
  - "docs/shaping-guard-platform-calibration.md"
  - "docs/font-candidate-research-brief.md"
  - "docs/language-font-acceptance-matrix.md"
---

# Fonts, text shaping and the PDF export

Loaded when working on the font catalogue, text coverage, shaping guards, or the text export path. The
editor is Chrome and the exporter is fontkit, so agreement is never assumed: every font is proven per
script by a guard, and the catalogue is ours to curate. Screening rules for a candidate:
[docs/font-candidate-research-brief.md](../../docs/font-candidate-research-brief.md). Measurements
behind every rule below: [docs/font-screening-evidence.md](../../docs/font-screening-evidence.md).
Text pipeline map, verified from code: [docs/wysiwyg-text-architecture.md](../../docs/wysiwyg-text-architecture.md)
(it supersedes [docs/hebrew-text-shaping-export.md](../../docs/hebrew-text-shaping-export.md), which is stale).

## Standing rules

- **The font guards are the `fonts` Playwright project and run only when a font-registry input
  changes** (ARCH-23, 2026-09-18 - superseding the ARCH-20 mechanism below it used to use). The 25
  per-script shaping and font-parity specs matched by `FONT_GUARDS` in `playwright.config.js` were 55%
  of the whole e2e suite while guarding code that changes in roughly one commit in three, and their old
  gate - `e2e/sign/project.json` declaring `editor`, `lib` and `tool-sign` as whole-project
  `implicitDependencies` - ran all of them on any Sign/Redact toolbar or tooltip change with zero
  measured coverage benefit (`backlog/tasks/ARCH-23.md`'s "Measured" sections: 0 of 8 narrow-verdict
  triggers in a 62-push window were rightful). `scripts/affected-scope.mjs` now decides `fonts` with a
  small, explicit file-glob (`matchesFontsGlob`): `public/fonts/**` (font assets), `src/editor/text/**`
  (the whole directory - the catalogue and its shaping/runtime code share one Nx-project directory, so
  this is deliberately a directory rule, not a named subset), `src/styles/editorFonts.css`,
  `scripts/fonts/**`, `scripts/generate-font-*`, `scripts/check-font-*`, the guard specs and fixtures
  under `e2e/sign/`, and `playwright.config.js` (defines the shard split) - plus every existing
  fail-open trigger (an unowned file, the CI oracle itself, no resolvable base) that already forced
  `everything=true` for unrelated reasons and keeps forcing `fonts=true` too, unconditionally, the way
  it always has. What no longer forces it: `editor`/`lib` being core projects for some other reason
  (e.g. a `src/lib/drafts/draftStore.js` change), or `tool-sign`/`editor-ui` being affected for a
  UI-only reason. `docs/nx-affected-ci.md` has the mechanics and the measurement behind choosing a glob
  over a second Nx project. `ci.yml`'s `font-guards` job runs the guards as two time-balanced shards
  (QUAL-06): `fonts-shard-1` in `playwright.config.js` is the six heaviest specs listed by hand,
  `fonts-shard-2` is the rest by complement, so a new guard spec runs (in shard 2) until someone
  rebalances the list. A new guard needs a name the globs match, and a new input a guard reads from
  outside today's list goes into `matchesFontsGlob` in `scripts/affected-scope.mjs` **and** this file's
  own `paths:` frontmatter (two separate lists, kept separate on purpose - see ARCH-23's ticket for
  why). `npm run test:e2e:fonts` runs the 25 guards unconditionally after a build; a nightly schedule
  and every manual dispatch still run them regardless of the glob.

- **The export render guard and language acceptance are their own `export-guards` project**
  (`e2e/export/`, ARCH-23), not part of `fonts` above. Both esbuild the real export path
  (`src/editor/adapters/pdf/sign.js`, `src/tools/sign/languageAcceptance.js`) rather than only fixtures,
  so - unlike `fonts` - their Nx project (`e2e/export/project.json`) keeps a coarse, whole-project
  `implicitDependencies` edge to `font-assets`, `editor`, `lib` and `tool-sign` on purpose: a Sign
  toolbar or tooltip change still runs these two (cheap, well under a minute combined, decided the
  normal Nx-affected way), it just no longer drags the other 25 guards along with it.
  `npm run test:e2e:export-guards` runs them unconditionally after a build. `temporaryBundle.js`
  (the shared esbuild-and-serve harness) stays in `e2e/sign/fixtures/` rather than moving with them,
  because `cjk-advance-parity-guard.spec.js` (a `fonts` guard) and `shapingGuardHarness.js` also import
  it; the two `e2e/export/` specs import it across the directory boundary instead of duplicating it.
- **Resolve every family through `src/editor/text/fonts.js`** (`resolveFontFamily(family, text)`),
  from `TextNode`, `SignatureDialog` and `src/editor/registry/text.ts` alike. The browser substitutes a
  system font per missing glyph; a PDF embeds one font per run and draws an empty rectangle. Latin-only
  handwriting faces (Caveat, Dancing Script, Great Vibes, Pacifico, Sacramento) send Hebrew to Gveret
  Levin (handwriting) or Arimo (upright) for the whole element, so both sides agree exactly.
- **`SCRIPT_FALLBACKS` is the feature.** One row per script (pattern, fonts that can draw it, a
  handwriting and an upright fallback). A bundled font with no row still dies at download (Mali
  shipped for Thai that way). `fontCoverage.test.js` checks every row against the real TTFs in both
  directions: every listed font can draw the script and **every omitted font cannot**; never weaken
  the second assertion.
- **Substitution is explained, never silent** (`resolveFontSubstitution` returns the forcing script and
  the editor shows a notice), and **a refusal happens while typing, not at Download.** Two modules must
  agree: `src/editor/text/textCoverage.js` (export side, walks the document against real font bytes,
  owns the message strings, is what `signPdf` refuses with) and `src/editor/text/textFontSupport.js`
  (editing side, synchronous, from the generated glyph data; rendered by `FontPickerMenu.tsx` and by
  `TextNode.tsx` via `FontSupportNotice.tsx`). Both resolve through `fonts.js`, both truncate
  comb fields via `textForCoverage` in `comb.js`, both run the same missing-glyph transforms.
  `textCoverage.test.js` compares their answers against real TTFs; never add a rule to one side only,
  and never reintroduce a third path (the old `useFontCoverageNotice.js`).
- **The catalogue is ours to curate.** A font that cannot be made to match the editor is dropped or
  marked Latin-only (Playpen Sans Hebrew was removed for an 88% systemic disagreement), never given a
  special path. **Never fix a rendering mismatch by rasterising text**: the download stops being text.
- **Having all five stages is not agreement.** The export has normalization (`composeHebrewClusters`,
  NFC plus gated Hebrew presentation-form recomposition), bidi (`resolveBidiRuns`, UAX#9 via `bidi-js`,
  from the element's explicit direction, never auto-detected), itemization with refusal, shaping
  (fontkit, per bidi run, spaces inside the run) and positioning (per-glyph `Tm`/`Tj`/`Ts`). These
  once presented as unrelated bugs; swapping fontkit for a bigger shaper would have fixed one. Shaping
  is still proven per font, per script, by a guard, and a green Hebrew run says nothing about Latin.
- **A run is shaped whole; never split it at spaces.** The editor is DOM layout, which shapes a text
  run in one call, so a kern pair spanning a space (Arimo's `space + A/Δ`, 113 units; PT Sans up to 8px
  on a name) fires on screen and must fire in the export. H9 split runs at spaces to match canvas
  `measureText` with no `textRendering`, the one Chromium path that shapes word by word; measured
  across all 35 fonts it helped nowhere and cost nine fonts (reverted 2026-09-12,
  [docs/wysiwyg-text-architecture.md](../../docs/wysiwyg-text-architecture.md) §1.2 item 5). When a
  guard and the export disagree on a spaced string, first ask which browser path the guard measured.
- **A guard proves agreement on the machine that ran it**, which for a release is the `ubuntu-latest`
  runner. Arabic, Pashto and Bengali give the same verdict on macOS and Linux since SIGN-19 removed the
  measuring-browser artefacts, and the runner's whole-pixel advances are read back per glyph rather
  than modelled as `Math.round` (it rounds a half-pixel tie down; that pixel failed Amatic SC's
  "12.09.2026" before §5d). Two caveats: the exported-PDF render guard's baseline is runner-pinned
  and **skips locally**, so only CI's green covers it; and there are no Linux users, so the runner is
  an instrument to correct, never a fidelity target
  ([docs/shaping-guard-platform-calibration.md](../../docs/shaping-guard-platform-calibration.md),
  §5a for the two artefacts, §5d for the measured advance model). A guard's log says how many glyphs
  the model measured and how many it fell back to rounding on; read it before excluding a case.

## Screening a candidate: three independent checks

A candidate that clears one has not been screened.

1. **Does fontkit crash on it?** Shape the whole generated corpus through fontkit and count uncaught
   throws. Noto Sans Gurmukhi (203 of 500 cases) and Noto Sans Telugu (4 of 630) throw
   `Cannot read properties of null (reading 'xCoordinate')` in `GPOSProcessor.getAnchor`, the same
   crash that blocks Noto Nastaliq Urdu. It reaches the export as a raw `TypeError` instead of a clean
   `UnrepresentableTextError`, and nothing else detects it: coverage is full, `glyf` alignment passes,
   Chromium renders it fine. Punjabi ships Mukta Mahee and Telugu Anek Telugu for this reason, and the
   Sign card says so (`languageCoverage.test.js` pins the explanation).
2. **Does fontkit pick the same glyphs as Chromium?** The per-script pixel guard, rendered **above
   ~256px**: below Skia's bitmap-glyph limit `fillText` draws cached bitmaps while the guard fills
   outlines through `Path2D`, and the difference swamps real findings. Every guard accepted before
   2026-08-29 ran at the small size with a loose tolerance (Arabic 22.33%, Bengali 14.48%); fixing the
   geometry took Bengali's known divergences from three to six with no font change. Arabic, Pashto and
   Bengali are re-measured; **Devanagari, Tamil, Telugu and Gurmukhi are not**, so re-screen before
   leaning on them.
3. **Does fontkit report the same advances as Chromium?** **Nothing checks this yet (SIGN-20).** A
   pixel diff is nearly blind to it because the error lives in trailing space: Bengali হ্ন is 21px (28%)
   short at a 6.16% diff and ক্ত 20px short at 7.27%, and both pass. Rounding bound from SIGN-19,
   confirmed per glyph on the runner in §5d (max 0.50px across every guard): browser advance rounding
   moves a cluster by at most `glyphCount x 0.5px`; anything past that is the font or the shaper. Handwriting faces add kerning: Caveat's `measureText` disagrees with fontkit by
   5.1px on "Sarah Levi", so screen handwriting candidates for **kerning parity** too. The Latin/Caveat
   guard is `test.skip`ped as red; the other Latin greens do not cover it.

Bengali ships with **six named divergences** in `KNOWN_FONTKIT_DIVERGENCES`
(`e2e/sign/fixtures/bengaliCorpus.js`): ট্র, ঠ্র, টি (component placement on a retroflex) and ক্ক, স্ক, দ্ধ
(conjunct assembly), 256 of 262 matching. The Sign page's Bengali FAQ names all six. **A seventh should
change the drop-or-keep answer, not extend the list.** Bengali's calibration set is fixed (259/259);
Gurmukhi (140), Telugu (486) and Tamil (265) use `autoCalibrate`, because hand-classifying
"unambiguous" cases without an in-house reference would produce a falsely wide tolerance. Keep it.

## Adding a font: nine steps, as one unit

Every expensive failure here was an omission.

1. **Screen** against the three checks, plus license (OFL 1.1 or Apache-2.0 only; copyright line copied
   from the font's own `OFL.txt`) and static-vs-variable.
2. **Add the TTFs to `public/fonts/`** and run `npm run test:fonts`. If `glyf` is unaligned, repad to
   `padding = 4` in fontTools and verify outlines, metrics and cmap byte-identical per glyph (about half
   the Brahmic faces needed it).
3. **Register** the family in `src/editor/text/fontManifest.js` (kind, styleTag, metrics, faces -
   `HANDWRITING_FONTS`/`TEXT_FONTS` in `src/editor/text/fonts.js` derive from this, nothing to edit
   there directly) and its license metadata in the sibling `src/editor/text/fontLicenses.js`, then run
   `npm run generate:font-manifest` to refresh `src/styles/editorFonts.css` and the
   `THIRD_PARTY_LICENSES.md` font lists. Add a label in `src/editor-ui/FontPickerMenu.tsx` if needed.
4. **New script: add a `SCRIPT_FALLBACKS` row.**
5. **Update `src/editor/text/languageAlphabets.js`** for a new language or character set, then regenerate and
   commit both GENERATED files: `npm run generate:font-coverage` (`src/editor/text/fontCoverageTable.js`) and
   `npm run generate:font-coverage-report` (`src/editor/text/fontCoverageReport.js`). Their tests regenerate in
   memory and fail on disagreement.
6. **Add a per-script shaping guard** (corpus + spec on `shapingGuardHarness.js`) rendered above
   ~256px, recording its floor, tolerance and sabotage-control result in the spec's module doc. A guard
   whose sabotage control cannot fail it measures nothing.
7. **Add an `exportRenderCorpus.js` case and recapture the baseline.** `exportRenderBaseline.json` is
   runner-pinned: run the CI workflow with the `update-export-render-baseline` input and commit the
   printed file after reviewing the diff, which should be purely additive. Missed once (FONT-05 added
   three CJK cases with no baseline and CI went red).
8. **Attribution** via the `src/editor/text/fontLicenses.js` entry from step 3, checked against
   `THIRD_PARTY_LICENSES.md` and `src/pages/licenses.astro` by `fontAttribution.test.js`, and
   **user-facing copy** in `src/data/tools.js`: language list, per-language note, FAQ. Any known
   divergence is named to the user there.
9. **Check page weight**; fonts load on demand but repo and per-font size still count.

## Export mechanics

- **Fonts are subsetted on export** (`signPdf` embeds `{ subset: true }`; one Arimo box 279 KB → 5.7
  KB). `drawShapedRun` emits glyph ids itself, so `remapGlyphForSubset` in `text.ts` does the subset
  embedder's bookkeeping (`includeGlyph`, `glyphs`, `glyphIdMap`, `glyphCache.invalidate()`, which the
  `/W` widths and ToUnicode CMap are built from) and **throws** if a pdf-lib upgrade renames any; never
  soften that into a fallback, since a raw id against a subset draws plausible wrong glyphs.
- **fontkit's subsetter cannot read unaligned outlines.** Kalam's odd-length `.notdef` made every glyph
  after it garbage, seen only as one drifted case in the render guard. `npm run test:fonts`
  (`check-font-glyf-alignment.js`) fails on any odd `loca` offset. Outline format does not predict
  this; test the font, not the format.
- **`page.drawText()` discards the shaping it computed.** pdf-lib's `encodeText` runs `font.layout()`
  and keeps only `glyphs[].id`, dropping `positions`, so marks land by `/W` widths. Emit each glyph at
  its shaped position; never rasterise, and **never batch glyphs into a shared `showText` run**, which
  advances by `/W` and silently drifts wherever the shaper disagrees (checking against `hmtx` does not
  catch it).
