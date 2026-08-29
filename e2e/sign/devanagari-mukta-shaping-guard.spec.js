import { test, expect } from '@playwright/test';
import { CONSONANTS, DEVANAGARI_CORPUS } from './fixtures/devanagariCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Devanagari correctness guard for Mukta (FONT-08a - the catalogue's first
 * upright/text-style Devanagari face, added alongside the existing
 * handwriting-only Kalam). Reuses the exact corpus and calibration-set
 * reasoning as devanagari-shaping-guard.spec.js (the Kalam guard) - see that
 * file's module doc for why the calibration set is bare consonants plus
 * consonant+plain-AA-matra pairs rather than a single glyph. This file only
 * supplies a different candidate font; the method, geometry and tolerance
 * discipline are identical, per shapingGuardHarness.js's shared machinery.
 *
 * A separate spec file (not a second call to createShapingGuardTest for the
 * same scriptName in one file) because these run against two different font
 * files - matches the precedent in latin-shaping-guard.spec.js, which loops
 * over multiple candidate faces with an explicit bundleFilename override to
 * avoid two guards racing on the same fontkit bundle path.
 *
 * **Result: 185/185 passed, 0 failing**, rasteriser floor 0.00%, tolerance
 * floored at the 4% minimum - built at the corrected 400px geometry from the
 * start (see the sibling Kalam guard's module doc for why 400px, not the
 * original 100px, matters). **Advance parity, spot-checked separately**
 * (fontkit's summed shaped glyph advances vs. this same browser's
 * `measureText` on the identical string, the SIGN-20-style check the
 * pixel-diff alone cannot make - see CLAUDE.md's Bengali writeup for why a
 * cluster can pass the pixel check while measurably under-advancing): all
 * 185 corpus cases matched to 0.000px, comfortably inside SIGN-19's
 * `glyphCount x 0.5px` rounding bound. Not wired as a standing assertion here
 * (that is SIGN-20's scope, tracked separately in TODO.md) - this was a
 * one-off screening check, not a permanent guard.
 */

const CALIBRATION_VOWEL_SIGN = 'ा'; // plain post-base AA - not pre-base, not tested by the corpus itself
const CALIBRATION_SET = [
  ...CONSONANTS,
  ...CONSONANTS.map((consonant) => consonant + CALIBRATION_VOWEL_SIGN),
];

createShapingGuardTest({
  scriptName: 'Devanagari',
  candidateName: 'Mukta',
  fontFileName: 'Mukta-Regular.ttf',
  direction: 'ltr',
  // Same 400px/4x geometry as the sibling Kalam guard - see that file's
  // comment for why (clears Skia's ~256px bitmap-glyph limit; SIGN-19's fix
  // pattern, applied here from the start rather than needing a follow-up).
  size: 400,
  canvasWidth: 2000,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
  corpus: DEVANAGARI_CORPUS,
  calibrationSet: CALIBRATION_SET,
  // Two guards under scriptName "Devanagari" (this one and Kalam's) would
  // otherwise collide on the same bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-devanagari-mukta-fontkit-bundle.js',
  minTolerancePct: 4,
  test,
  expect,
});
