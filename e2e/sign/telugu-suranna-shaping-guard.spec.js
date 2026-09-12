import { test, expect } from '@playwright/test';
import { TELUGU_CORPUS } from './fixtures/teluguCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Telugu correctness guard for Suranna (FONT-08, the catalogue's second
 * Telugu face, added alongside the existing upright/sans Anek Telugu).
 * Reuses teluguCorpus.js's 630-case systematic sweep and its
 * `autoCalibrate` reasoning unchanged - see that file's module doc for why
 * a self-calibrating partition (fontkit's own substituted()/
 * not-substituted() judgment splits the corpus into the calibration set and
 * the cases under test) is the right mode here rather than a hand-picked
 * calibration set: this project has no in-house Telugu shaping reference to
 * hand-classify which combinations are contextual GSUB substitutions.
 *
 * A separate spec file, not a second call to createShapingGuardTest for the
 * same scriptName in one file, because this runs against a different font
 * file - matches the precedent in devanagari-mukta-shaping-guard.spec.js,
 * the template for landing a second face in an already-shipped script.
 * `bundleFilename` is overridden for the same reason that file's is: two
 * guards named "Telugu" (this one and the existing Anek Telugu guard in
 * telugu-shaping-guard.spec.js) would otherwise race on the same fontkit
 * bundle path.
 *
 * **Geometry: 400px/4x, not the 100px the sibling Anek Telugu guard still
 * runs at.** fonts-and-text.md's screening rules flag Devanagari, Tamil,
 * Telugu and Gurmukhi as "not re-measured" against the corrected pixel-guard
 * geometry (SIGN-19 fixed Arabic/Bengali/Pashto only); this guard is built
 * at the corrected geometry from the start, the same choice
 * devanagari-mukta-shaping-guard.spec.js made for Mukta, so it does not
 * inherit that gap.
 *
 * **Screening, per fonts-and-text.md's three independent checks, all
 * re-confirmed 2026-09-12 (not just inherited from teluguCorpus.js's prior
 * note):**
 * 1. Fontkit crash: 0/630 on the full corpus.
 * 2. Pixel guard (this file): **476/476 passed** - of 630 corpus strings,
 *    154 shape with no substitution (the auto-calibrated calibration set,
 *    rasteriser floor 0.31%, browser does not quantise advances on this
 *    machine so the displacement floor is 0.00%, tolerance floored at the
 *    4% minimum since 0.31% x 1.5 is well under it) and 476 substitute and
 *    are the cases under test.
 * 3. Advance parity (SIGN-20-style spot check, run separately, not a
 *    standing assertion): fontkit's summed shaped glyph advances vs. this
 *    same browser's `measureText` on all 630 corpus strings, max widthDiff
 *    0.00005px (floating-point noise, not a real disagreement) - far inside
 *    SIGN-19's `glyphCount x 0.5px` rounding bound.
 *
 * **Sabotage control, run once while authoring this guard (not a shipped
 * assertion - see malayalam-shaping-guard.spec.js's module doc for the same
 * technique and its reasoning).** Patched `evalOne`'s reconstruction to
 * reverse glyph draw order for every case `autoCalibrate` already classifies
 * as substituting - the same predicate that decides calibration-set
 * membership, so the sabotage cannot mask itself the way a broader change
 * could - and re-ran: **55 of 476 substituting cases failed**, with the
 * 154-string calibration/floor measurement unchanged. The cases that still
 * passed are short two-glyph strings and single-output-glyph conjuncts where
 * reversing a short or one-element array barely moves ink; the failures are
 * proof the guard detects a real, deliberately-introduced disagreement
 * rather than rubber-stamping. Reverted before committing - `git diff` on
 * `shapingGuardHarness.js` is empty.
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
  scriptName: 'Telugu',
  candidateName: 'Suranna',
  fontFileName: 'Suranna-Regular.ttf',
  corpus: TELUGU_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  // Two guards under scriptName "Telugu" (this one and Anek Telugu's) would
  // otherwise collide on the same bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-telugu-suranna-fontkit-bundle.js',
  ...GEOMETRY,
  test,
  expect,
});
