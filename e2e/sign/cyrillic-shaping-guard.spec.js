import { test, expect } from '@playwright/test';
import { CALIBRATION_SET, CYRILLIC_CORPUS } from './fixtures/cyrillicCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Cyrillic correctness guard for Amatic SC (FONT-08), the first handwriting
 * face Cyrillic has ever had in this catalogue - closing the gap
 * docs/font-candidate-research-brief.md's Cyrillic row named ("no handwriting
 * option at all"). Every other Cyrillic-capable family (Arimo, Tinos,
 * Cousine, PT Sans) is upright/sans and has never needed a guard of this
 * kind, so this is a new script row, not a new candidate on an existing one.
 *
 * **Why this is not `autoCalibrate`, unlike latin-shaping-guard.spec.js.**
 * That guard partitions its corpus by whether fontkit's `layout()` picks a
 * different glyph than a plain per-codepoint `cmap` lookup would - the
 * `calt`/`liga` contextual-substitution question. Measured against the real
 * bytes (see cyrillicCorpus.js's module doc): Amatic SC has no `calt` table
 * at all, and its `liga` feature never fires on any string in this corpus
 * (0 of 24 substitute). `autoCalibrate` would find zero substituting cases
 * and `shapingGuardHarness.js` fails on exactly that ("0 of N corpus strings
 * trigger any contextual substitution... not proof of agreement") rather
 * than passing vacuously - so this guard uses a hand-picked
 * `calibrationSet` instead, the same shape Devanagari's and Arabic's guards
 * use. That is also the honest description of what this guard actually
 * checks: not glyph *selection* (this font/script combination has none to
 * get wrong) but glyph *placement* - `kern` is a real, present OpenType
 * feature in this font, confirmed against the bytes, so fontkit's kerned
 * advances disagreeing with the browser's own rendering is a real thing this
 * guard can catch and a bare cmap-lookup reconstruction could not.
 *
 * **Sabotage control (the check that a guard which never fails proves
 * nothing).** Corrupting the corpus-side `shape()` call alone - not
 * `drawReconstruction` or anything calibration also calls, per
 * devanagari-shaping-guard.spec.js's own module-doc precedent for why that
 * distinction matters - by reversing each string's glyph draw order
 * reproduces a large, obvious failure (all 16 corpus cases fail, at
 * 60-90%+ diff each) against the unchanged calibration floor. Reverted
 * before landing; not left as a permanent test since none of the other
 * per-script guards in this directory keep theirs as one either - this is
 * the same one-time proof-of-life every guard here relies on.
 *
 * **Render size.** 320px, above Skia's ~256px bitmap-glyph cache limit (see
 * shapingGuardHarness.js's "Two artefacts" note) - the same correction
 * Devanagari, Arabic and Bengali needed once re-measured. Canvas geometry is
 * sized for the longest corpus string ('телефон +380 44 123 4567', 24
 * characters) at this size.
 *
 * **Measured 2026-09-12:** 8 calibration strings (all zero-ambiguity, real
 * Cyrillic ink - short names and words, not bare letters, per the Latin
 * guard's own lesson about single-glyph calibration understating noise on a
 * hand-drawn face), 16 corpus cases. Numbers are printed by the harness at
 * run time (`console.log`) and reported in FONT-08's landing notes
 * (backlog/tasks/FONT-08.md) rather than hand-copied here, so this comment
 * never drifts from a number a future re-run could contradict.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 320,
  canvasWidth: 3600,
  canvasHeight: 900,
  anchorX: 60,
  baselineY: 620,
};

// Same absolute floor every other per-script guard in this directory uses.
const MIN_TOLERANCE_PCT = 3;

createShapingGuardTest({
  scriptName: 'Cyrillic',
  candidateName: 'AmaticSC',
  fontFileName: 'AmaticSC-Regular.ttf',
  corpus: CYRILLIC_CORPUS,
  calibrationSet: CALIBRATION_SET,
  minTolerancePct: MIN_TOLERANCE_PCT,
  ...GEOMETRY,
  test,
  expect,
});
