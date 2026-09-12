import { test, expect } from '@playwright/test';
import { TAMIL_CORPUS } from './fixtures/tamilCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Tamil correctness guard for Tiro Tamil (FONT-08b - the catalogue's second
 * Tamil face, a serif upright added alongside the existing sans Noto Sans
 * Tamil). Reuses the exact corpus as tamil-shaping-guard.spec.js (the Noto
 * Sans Tamil guard) - see that file's module doc and tamilCorpus.js's header
 * for the full reasoning on `autoCalibrate` and why the corpus is smaller and
 * conjunct-light relative to the other Brahmic guards. This file only
 * supplies a different candidate font; the method, geometry and tolerance
 * discipline are identical, per shapingGuardHarness.js's shared machinery.
 *
 * A separate spec file (not a second call to createShapingGuardTest for the
 * same scriptName in one file) because these run against two different font
 * files - matches the precedent in devanagari-mukta-shaping-guard.spec.js
 * and latin-shaping-guard.spec.js, and needs its own `bundleFilename` so the
 * two Tamil guards never race on the same fontkit bundle path.
 *
 * **Screening, ahead of this guard:** fontkit shaped all 329 corpus strings
 * through TiroTamil-Regular.ttf with 0 throws (same clean result Noto Sans
 * Tamil got - Tiro Tamil needed no alternate-face screening the way Noto
 * Sans Gurmukhi/Telugu did), none taking longer than 20ms, `glyf` offsets
 * are already 2-byte aligned (no repad needed), and coverage is full for the
 * Tamil block's assigned codepoints plus Latin ASCII and digits - the same
 * shape of clean screening result the module doc for the Noto Sans Tamil
 * guard describes.
 *
 * **Result at last run: 235/235 passed** - of 329 corpus strings, 94 shape
 * with no substitution (calibration set, rasteriser floor 10.54%, tolerance
 * 15.81%) and 235 substitute and are the cases under test. Tiro Tamil's
 * partition differs from Noto Sans Tamil's (64/265) on the identical corpus -
 * expected, since which strings a font's shaper treats as a contextual
 * substitution is a per-font question, not a per-script one. **Advance
 * parity** (fontkit's shaped glyph advances vs. this same browser's
 * `measureText` on the identical string, the SIGN-20-style spot check the
 * pixel-diff alone cannot make): max `widthDiff` across all 329 corpus +
 * calibration cases was 0.000px, comfortably inside SIGN-19's
 * `glyphCount x 0.5px` rounding bound.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 100,
  canvasWidth: 500,
  canvasHeight: 200,
  anchorX: 20,
  baselineY: 120,
};

createShapingGuardTest({
  scriptName: 'Tamil',
  candidateName: 'TiroTamil',
  fontFileName: 'TiroTamil-Regular.ttf',
  corpus: TAMIL_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  // Two guards under scriptName "Tamil" (this one and Noto Sans Tamil's)
  // would otherwise collide on the same bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-tamil-tiro-fontkit-bundle.js',
  ...GEOMETRY,
  test,
  expect,
});
