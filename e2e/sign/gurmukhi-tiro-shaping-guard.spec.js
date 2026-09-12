import { test, expect } from '@playwright/test';
import { GURMUKHI_CORPUS } from './fixtures/gurmukhiCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Gurmukhi (Punjabi) correctness guard for Tiro Gurmukhi (FONT-08b - the
 * catalogue's second Gurmukhi face, a serif alternative to the existing
 * sans Mukta Mahee). Reuses the exact corpus and self-calibration reasoning
 * as gurmukhi-shaping-guard.spec.js (the Mukta Mahee guard) - see that
 * file's module doc and gurmukhiCorpus.js's own header for why
 * `autoCalibrate` is the right mode here (this project has no in-house
 * Gurmukhi shaping reference to hand-pick a calibration set from). This file
 * only supplies a different candidate font and the current geometry; the
 * method and tolerance discipline are identical, per shapingGuardHarness.js's
 * shared machinery.
 *
 * A separate spec file (not a second call to `createShapingGuardTest` for
 * the same scriptName in one file), matching the devanagari/devanagari-mukta
 * precedent - these run against two different font files, and each needs
 * its own bundleFilename so the two guards' `beforeAll`/`afterAll` fontkit
 * bundles never race on the same path.
 *
 * Gurmukhi is Bidi_Class L (left-to-right internally, like Devanagari and
 * Bengali), so this guard anchors at a fixed left pen position with no RTL
 * handling.
 *
 * **Rendered at 400px, not the sibling Mukta Mahee guard's original 100px.**
 * That guard predates SIGN-19's render-size fix (.claude/rules/fonts-and-text.md:
 * "Devanagari, Tamil, Telugu and Gurmukhi are not [re-measured]") and this is
 * a new guard, so it starts at the corrected geometry from the start, the
 * same precedent devanagari-mukta-shaping-guard.spec.js set for Mukta:
 * above Skia's ~256px bitmap-glyph cache limit, `fillText` rasterises via
 * paths on both sides of the comparison instead of cached bitmaps on one
 * side only, which is what collapses the rasteriser-mismatch floor to zero.
 *
 * **Result at last run: 132/132 substituting cases passed** - of 500 corpus
 * strings, 368 shape with no substitution (calibration set: rasteriser floor
 * 0.01%, displacement floor 0.00% - this platform does not quantise
 * advances) and 132 substitute and are the cases under test, all passing at
 * the 4% tolerance floor (noise floor measured at 0.01%, well under it).
 *
 * **Sabotage control, run once while authoring this guard (not a shipped
 * assertion - see malayalam-shaping-guard.spec.js's module doc for the
 * technique and why it is gated on `substituted(text)` rather than reversing
 * unconditionally).** Patched `evalOne`'s reconstruction call, locally and
 * temporarily, to reverse glyph draw order only when `substituted(text)` is
 * true, and re-ran: **132/132 substituting cases failed, with the
 * 368-string calibration/floor measurement unchanged (rasteriser floor
 * 0.01%, displacement floor 0.00%, identical to the clean run)**. Reverted
 * before committing; not part of the shipped harness or spec.
 *
 * **Advance-parity spot check (SIGN-20-style, one-off, not a standing
 * assertion here - same caveat as the Mukta/Devanagari writeup).** Ran
 * `runShapingGuardInPage` directly (not through `createShapingGuardTest`)
 * and took the max `widthDiff` (native `measureText` vs. the fontkit
 * reconstruction, at the 400px geometry above) across all 500 corpus and
 * calibration cases: **0.0000366px**, on a two-glyph case ("ਸਾ"). Zero cases
 * exceeded the SIGN-19 `glyphCount x 0.5px` rounding bound. This platform
 * does not quantise `measureText` advances (macOS Chromium; see
 * shapingGuardHarness.js's "Two artefacts" note), matching
 * `displacementFloorPct`'s own 0.00% measurement above.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 400,
  canvasWidth: 2000,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
};

createShapingGuardTest({
  scriptName: 'Gurmukhi',
  candidateName: 'TiroGurmukhi',
  fontFileName: 'TiroGurmukhi-Regular.ttf',
  corpus: GURMUKHI_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  // Two guards under scriptName "Gurmukhi" (this one and Mukta Mahee's)
  // would otherwise collide on the same bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-gurmukhi-tiro-fontkit-bundle.js',
  ...GEOMETRY,
  test,
  expect,
});
