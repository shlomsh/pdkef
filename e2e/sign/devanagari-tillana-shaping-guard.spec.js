import { test, expect } from '@playwright/test';
import { CONSONANTS, DEVANAGARI_CORPUS } from './fixtures/devanagariCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Devanagari correctness guard for Tillana (FONT-08, second Devanagari
 * handwriting face, landed 2026-09-12 alongside the existing handwriting
 * Kalam and upright Mukta). Reuses the exact corpus and calibration-set
 * reasoning as devanagari-shaping-guard.spec.js (the Kalam guard) and
 * devanagari-mukta-shaping-guard.spec.js (the Mukta guard) - see the
 * Kalam guard's module doc for why the calibration set is bare consonants
 * plus consonant+plain-AA-matra pairs rather than a single glyph. This file
 * only supplies a different candidate font; the method, geometry and
 * tolerance discipline are identical, per shapingGuardHarness.js's shared
 * machinery.
 *
 * A separate spec file (not a second call to createShapingGuardTest for the
 * same scriptName in one file) because these run against two other font
 * files already registered under "Devanagari" - matches the precedent in
 * latin-shaping-guard.spec.js, which loops over multiple candidate faces
 * with an explicit bundleFilename override to avoid guards racing on the
 * same fontkit bundle path.
 *
 * **Screening context (docs/font-candidate-research-brief.md, license and
 * coverage checks):** Tillana (Indian Type Foundry, OFL 1.1, same
 * copyright line as Kalam's own OFL.txt). `glyf` shipped unaligned (Regular
 * 513/1013, Bold 510/1013 odd `loca` offsets) and was repadded to
 * `padding = 4` with fontTools; outlines, hmtx and cmap verified
 * byte-identical for all 1012 glyphs in both weights before the repadded
 * files were committed (`npm run test:fonts` is the standing guard).
 * Fontkit crash screen: 0/185 throws on the full Devanagari corpus, both
 * weights. Coverage: full against the real Hindi/Marathi character set this
 * catalogue is judged against (scripts/font-languages.mjs's `devanagari`/
 * `marathi` entries, 71/71 codepoints - independent vowels, the 35 standard
 * consonants, matras, anusvara/visarga/candrabindu/OM/virama and digits),
 * plus full Latin ASCII and digits, both weights. Available OpenType
 * features: `liga` (no `calt`).
 *
 * **Result: 185/185 passed, 0 failing**, rasteriser floor 0.03%,
 * advance-quantisation floor 0.00% (measured on macOS, which does not
 * quantise), noise floor 0.03%, tolerance floored at the 4% minimum - built
 * at the corrected 400px geometry from the start (see the sibling Kalam
 * guard's module doc for why 400px, not the original 100px, matters).
 *
 * **Advance parity, spot-checked separately** (SIGN-20-style, same method
 * this harness's own `widthDiff` measures: browser `fillText`'s
 * `measureText` width vs. this font's fontkit-shaped total advance):
 * measured across all 185 corpus cases, on macOS. **Worst case 0.0000px**
 * (every case matched to 0.000px) against a SIGN-19 bound of
 * `glyphCount x 0.5px` (1.00px for the two-glyph cases, 0.50px for the
 * one-glyph cases) - not merely inside the bound, exact agreement. Not
 * wired as a standing assertion here (that is SIGN-20's scope, tracked
 * separately in TODO.md) - this was a one-off screening check, not a
 * permanent guard.
 *
 * **Handwriting kerning parity** (this catalogue's specific hazard for a
 * handwriting face - Caveat's Latin `measureText` disagrees with fontkit's
 * shaped advance by 5.1px on "Sarah Levi", the reason
 * latin-shaping-guard.spec.js's Caveat case is `test.skip`ped as red):
 * spot-checked on one Latin name with a space ("Priya Sharma") and three
 * Devanagari names with spaces ("प्रिया शर्मा" Priya Sharma, "राज कुमार" Raj
 * Kumar, "सीता देवी" Sita Devi), each measured the same way
 * hebrew-font-parity.spec.js measures Hebrew - browser `measureText` per
 * space-delimited segment vs. fontkit's shaped advance for that same
 * segment, summed (no bidi resolution needed here, unlike the Hebrew
 * version: Latin and Devanagari are both Bidi_Class L). Measured on macOS:
 * Priya Sharma 0.0001px, प्रिया शर्मा 0.0000px, राज कुमार 0.0001px, सीता
 * देवी 0.0000px - all four sub-thousandth-of-a-pixel, nowhere near Caveat's
 * known 5.1px gap.
 */

const CALIBRATION_VOWEL_SIGN = 'ा'; // plain post-base AA - not pre-base, not tested by the corpus itself
const CALIBRATION_SET = [
  ...CONSONANTS,
  ...CONSONANTS.map((consonant) => consonant + CALIBRATION_VOWEL_SIGN),
];

createShapingGuardTest({
  scriptName: 'Devanagari',
  candidateName: 'Tillana',
  fontFileName: 'Tillana-Regular.ttf',
  direction: 'ltr',
  // Same 400px/4x geometry as the sibling Kalam and Mukta guards - clears
  // Skia's ~256px bitmap-glyph limit (SIGN-19's fix pattern, applied here
  // from the start rather than needing a follow-up).
  size: 400,
  canvasWidth: 2000,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
  corpus: DEVANAGARI_CORPUS,
  calibrationSet: CALIBRATION_SET,
  // Two other guards under scriptName "Devanagari" (Kalam's and Mukta's)
  // would otherwise collide on the same bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-devanagari-tillana-fontkit-bundle.js',
  minTolerancePct: 4,
  test,
  expect,
});
