import { test, expect } from '@playwright/test';
import { CALIBRATION_SET, CYRILLIC_CORPUS } from './fixtures/cyrillicCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Cyrillic correctness guard for Neucha (FONT-08b), the catalogue's first
 * Cyrillic handwriting face - closing the gap
 * docs/font-candidate-research-brief.md's "Cyrillic and Greek handwriting
 * gap" section named and screened Neucha as the top pick for. Same shared
 * machinery as every other guard in this directory
 * (`./fixtures/shapingGuardHarness.js`): shape each string with fontkit,
 * reconstruct it on a `<canvas>` at fontkit's reported glyph positions, and
 * pixel-diff that against this browser's own native `fillText()` of the
 * identical string in the identical font.
 *
 * **Why `calibrationSet`, not `autoCalibrate`, and why that is not a weaker
 * guard.** Screened 2026-09-12 against the real font bytes: Neucha has
 * **no GSUB table at all** (`!!font.GSUB === false`) and its only listed
 * OpenType feature is `kern` (GPOS). `autoCalibrate` (used by every
 * self-calibrating guard in this directory - Gurmukhi, Telugu, Tamil,
 * Malayalam, the four Latin `calt` faces) partitions a corpus into strings
 * fontkit substitutes a glyph on versus strings it doesn't, and judges only
 * the former - with no GSUB, fontkit's `layout()` can never choose a
 * different glyph than a plain per-codepoint cmap lookup would, so every
 * corpus string would fall into the "no substitution" bucket and the
 * harness would correctly refuse to run at zero cases under test. That is
 * not a loophole this guard ducks by switching modes - it is the accurate
 * reading of a font with no substitution mechanism, and it means this guard
 * cannot fail the way Gurmukhi's or Malayalam's could (choosing the wrong
 * conjunct). What it still can fail: a font-wide rendering disagreement (a
 * corrupted outline, a `glyf`/`loca` misread) large enough to swamp the
 * measured noise floor on the same corpus - see
 * `./fixtures/cyrillicCorpus.js` for the corpus's own reasoning and its
 * `calibrationSet` (every base letter of the six anchor alphabets Neucha
 * covers, plus ten adjacent-letter pairs chosen to expose Neucha's one real
 * non-cmap feature, GPOS kerning, as calibration ink rather than as an
 * untested variable).
 *
 * **Coverage boundary, not a shaping question.** Kazakh's eight extra
 * letters (ә, ғ, қ, ң, ө, ұ, ү, һ) are absent from Neucha's cmap entirely
 * (`src/lib/fontCoverageReport.js`'s `cyrillicKazakh` row: 0.805 partial,
 * Neucha not in `.full`) and are correctly excluded from this guard's
 * corpus - a missing glyph is what `fontCoverage.test.js` guards, not this
 * file, and a guard cannot meaningfully test shaping on a character the font
 * cannot draw at all.
 *
 * Cyrillic is Bidi_Class L (left-to-right internally, like every other
 * script guarded in this directory except Hebrew/Arabic), so this guard
 * anchors at a fixed left pen position with no RTL handling.
 *
 * **Geometry: 300px, not the 400px other recent guards use.** Still well
 * clear of Skia's ~256px bitmap-glyph cache limit - above that limit
 * `fillText` and this guard's own `Path2D` reconstruction both rasterise
 * through paths instead of disagreeing along antialiased bitmap edges (see
 * the "Two artefacts" note in `shapingGuardHarness.js`) - but a full
 * two-word name (this corpus's longest case, "Підписано: О. Ковальчук", 24
 * characters) measures 2639px wide at 300px, already wider than any other
 * guard's canvas in this directory; 400px would need a canvas wider still
 * for no floor-quality benefit once the 256px threshold is already cleared.
 *
 * **Result at landing (2026-09-12, measured on macOS): 18/18 corpus cases
 * passed** against a calibration floor measured from 86 calibration strings
 * (76 bare letters + 10 kerning pairs) - rasteriser floor 0.00%,
 * advance-quantisation floor 0.00% (this platform does not quantise
 * advances), tolerance floored at the 4% minimum. Re-measure on the CI
 * runner (`docs/shaping-guard-platform-calibration.md`'s two-artefact split
 * applies to this guard exactly like every other one here) before trusting
 * this number cross-platform.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 300,
  canvasWidth: 2800,
  canvasHeight: 450,
  anchorX: 60,
  baselineY: 320,
};

createShapingGuardTest({
  scriptName: 'Cyrillic',
  candidateName: 'Neucha',
  fontFileName: 'Neucha-Regular.ttf',
  corpus: CYRILLIC_CORPUS,
  calibrationSet: CALIBRATION_SET,
  // No GSUB means there is no letterform-substitution mechanism to fail on;
  // this floor only has to absorb ordinary rasteriser/kerning noise, the
  // same class of floor Devanagari (4%) and Malayalam (4%) settled on.
  minTolerancePct: 4,
  ...GEOMETRY,
  test,
  expect,
});

// Amatic SC landed the same day as Cyrillic's other handwriting face (FONT-08,
// caps-only, also Hebrew). It runs over the same corpus and calibration set
// as Neucha above so the two are measured against one floor; its original
// standalone guard (8-string calibration, 16 cases, 0 failing at a 3% floor)
// was folded in here at merge time.
//
// `field-date` ("12.09.2026") was briefly excluded on the Linux runner only:
// measured on ubuntu-latest (CI run 34705365402) it read 28.21% against a
// 27.06% tolerance (rasteriser floor 4.35%, advance-quantisation floor
// 18.04%) while measuring 0.00% on macOS with no kern pair anywhere in it.
// The excess was one pixel of advance the floor model could not see: the
// runner rounds a half-pixel tie down (Amatic SC's "1" is 82.5px at this
// size, 82 on the runner, 83 to `Math.round`), so the string is 845px there
// against the 846px round-to-nearest predicted (847.8px exact), and on
// digits this thin one pixel is a lot of ink. The instrument was corrected
// rather than the tolerance widened: the harness reads each glyph's hinted
// advance back from the browser (`hintedAdvancePx` in
// `./fixtures/shapingGuardHarness.js`) and measures the floor on that
// placement. Re-measured on the runner (CI run 34717406027): floor 28.26%,
// tolerance 42.39%, native width reproduced on 18/18 cases, 0 failing, and
// the case runs on every platform again.
createShapingGuardTest({
  scriptName: 'Cyrillic',
  candidateName: 'AmaticSC',
  fontFileName: 'AmaticSC-Regular.ttf',
  corpus: CYRILLIC_CORPUS,
  calibrationSet: CALIBRATION_SET,
  // No GSUB means there is no letterform-substitution mechanism to fail on;
  // this floor only has to absorb ordinary rasteriser/kerning noise, the
  // same class of floor Devanagari (4%) and Malayalam (4%) settled on.
  minTolerancePct: 4,
  ...GEOMETRY,
  bundleFilename: '__e2e-cyrillic-amaticsc-fontkit-bundle.js',
  test,
  expect,
});
