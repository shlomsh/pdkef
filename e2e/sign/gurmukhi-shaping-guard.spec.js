import { test, expect } from '@playwright/test';
import { GURMUKHI_CORPUS } from './fixtures/gurmukhiCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Gurmukhi (Punjabi) correctness guard for the Mukta Mahee catalogue
 * candidate (CLAUDE.md's Bengali/Devanagari entries are the model this
 * follows). Gurmukhi is a Brahmic script sharing the same broad failure mode
 * as every other guard in this directory - glyph *selection* and *visual
 * order*, given an OpenType shaper - so this is a pixel guard on the same
 * model as devanagari-shaping-guard.spec.js and bengali-shaping-guard.spec.js,
 * not the CJK guards' advance-parity model.
 *
 * Gurmukhi is Bidi_Class L (left-to-right internally, like Devanagari and
 * Bengali), so this guard anchors at a fixed left pen position with no RTL
 * handling.
 *
 * **Self-calibrating, not a fixed calibration set - see gurmukhiCorpus.js's
 * module doc for why.** This project has no in-house Gurmukhi shaping
 * reference the way Bengali's akhn/blwf/vatu/pstf/rphf features could be
 * read directly off Noto Sans Bengali's GSUB table, so rather than
 * hand-picking "the plain non-reordering cases" as a calibration set (and
 * risking getting Gurmukhi's actual shaping rules wrong), `autoCalibrate`
 * partitions the corpus by fontkit's own judgment: strings it shapes
 * identically to a plain per-codepoint cmap lookup become the calibration
 * set, strings it applies any contextual substitution to become the cases
 * under test. That is the only set where the browser and fontkit could
 * possibly disagree on a letterform.
 *
 * **Result at last run: 140/140 passed** - of 500 corpus strings, 360 shape
 * with no substitution (calibration set, noise floor 12.88%, tolerance
 * 19.32%) and 140 substitute and are the cases under test.
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
  scriptName: 'Gurmukhi',
  candidateName: 'MuktaMahee',
  fontFileName: 'MuktaMahee-Regular.ttf',
  corpus: GURMUKHI_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  ...GEOMETRY,
  test,
  expect,
});
