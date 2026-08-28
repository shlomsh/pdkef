import { test, expect } from '@playwright/test';
import { TELUGU_CORPUS } from './fixtures/teluguCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Telugu correctness guard for the Anek Telugu catalogue candidate.
 * Same model as devanagari-shaping-guard.spec.js and
 * bengali-shaping-guard.spec.js: a pixel guard, not the CJK guards'
 * advance-parity model, because where fontkit and Chromium can select a
 * genuinely different glyph, only pixels catch it.
 *
 * Telugu is Bidi_Class L, so this guard anchors at a fixed left pen position
 * with no RTL handling.
 *
 * Self-calibrating (`autoCalibrate: true`) for the same reason
 * gurmukhi-shaping-guard.spec.js is - see teluguCorpus.js's module doc.
 *
 * **Result at last run: 486/486 passed** - of 630 corpus strings, 144 shape
 * with no substitution (calibration set, noise floor 10.47%, tolerance
 * 15.70%) and 486 substitute and are the cases under test.
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
  scriptName: 'Telugu',
  candidateName: 'AnekTelugu',
  fontFileName: 'AnekTelugu-Regular.ttf',
  corpus: TELUGU_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  ...GEOMETRY,
  test,
  expect,
});
