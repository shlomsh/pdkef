import { test, expect } from '@playwright/test';
import { TAMIL_CORPUS } from './fixtures/tamilCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Tamil correctness guard for the Noto Sans Tamil catalogue candidate. Same
 * pixel-guard model as devanagari-shaping-guard.spec.js and
 * bengali-shaping-guard.spec.js - where fontkit and Chromium can select a
 * genuinely different glyph, only pixels catch it.
 *
 * Tamil is Bidi_Class L, so this guard anchors at a fixed left pen position
 * with no RTL handling.
 *
 * Self-calibrating (`autoCalibrate: true`) for the same reason
 * gurmukhi-shaping-guard.spec.js is - see tamilCorpus.js's module doc, which
 * also explains why this corpus is smaller and conjunct-light relative to
 * the other Brahmic guards: modern Tamil orthography mostly does not ligate
 * consonant clusters at all.
 *
 * **Result at last run: 265/265 passed** - of 329 corpus strings, 64 shape
 * with no substitution (calibration set, noise floor 8.49%, tolerance
 * 12.74%) and 265 substitute and are the cases under test. Noto Sans Tamil
 * needed no alternate-face screening: unlike Noto Sans Gurmukhi and Noto
 * Sans Telugu (see the other two corpora), it shapes all 329 cases without
 * crashing fontkit.
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
  candidateName: 'NotoSansTamil',
  fontFileName: 'NotoSansTamil-Regular.ttf',
  corpus: TAMIL_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  ...GEOMETRY,
  test,
  expect,
});
