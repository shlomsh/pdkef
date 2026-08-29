import { test, expect } from '@playwright/test';
import { MALAYALAM_CORPUS } from './fixtures/malayalamCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Malayalam correctness guard for the Anek Malayalam catalogue candidate
 * (FONT-03, TODO.md). Malayalam is a Brahmic script with vowel-sign
 * reordering and conjunct formation, so - per CLAUDE.md's standing rule for
 * this class of script - this is a PIXEL guard on the Devanagari/Bengali
 * model, never the CJK advance-parity-only model: fontkit and Chromium can
 * pick a genuinely different glyph for a Malayalam cluster, and only pixels
 * catch that. See `./fixtures/malayalamCorpus.js` for the full derivation of
 * Malayalam's real shaping axes (sourced from the Unicode 17.0 chart and
 * r12a's script notes, not guessed) and the deliberate reformed-orthography
 * decision this guard tests against.
 *
 * Malayalam is Bidi_Class L (left-to-right internally, like every other
 * Brahmic script in this directory), so this guard anchors at a fixed left
 * pen position with no RTL handling.
 *
 * **Noto Sans Malayalam was screened first and disqualified before this
 * candidate.** Shaping the full 478-case corpus (this file's own, before
 * Anek Malayalam was tried) through fontkit crashed on 33/35 `reph` cases
 * (RA+virama+consonant, syllable-initial) with the exact fault this
 * catalogue already has a name for - `GPOSProcessor.getAnchor` throwing
 * `Cannot read properties of null (reading 'xCoordinate')` - the same crash
 * class that disqualified Noto Sans Gurmukhi and Noto Sans Telugu (see
 * CLAUDE.md). Confirmed not an artifact of static-instancing the variable
 * upstream file: the original `NotoSansMalayalam[wdth,wght].ttf` crashes the
 * identical 33 cases. Reph is not a rare pattern - it is how Malayalam
 * spells an initial /r/ before a consonant cluster - so this was a
 * disqualifying fraction, not a narrow gap. **Anek Malayalam crashes on
 * 0/478 cases** (checked on the Regular instance, the Bold instance, and the
 * unmodified upstream variable font), matching the precedent set by Anek
 * Telugu (Telugu's own Noto-face replacement) and Mukta Mahee (Gurmukhi's).
 *
 * **Self-calibrating, not a fixed calibration set - same reasoning as
 * gurmukhiCorpus.js/teluguCorpus.js/tamilCorpus.js.** This project has no
 * in-house Malayalam shaping reference to hand-classify "which cases have no
 * shaping ambiguity" the way Bengali's akhn/blwf/vatu/pstf/rphf features
 * could be read directly off Noto Sans Bengali's own GSUB table, so
 * `autoCalibrate` partitions the corpus by fontkit's own judgment: strings
 * it shapes identically to a plain per-codepoint cmap lookup become the
 * calibration set, strings it applies any contextual substitution to become
 * the cases under test.
 *
 * **Sabotage control, run once while authoring this guard (not a shipped
 * assertion - see devanagari-shaping-guard.spec.js's module doc for why a
 * sabotage of a function *shared* between the calibration and test paths can
 * mask itself instead of failing).** `autoCalibrate`'s calibration/cases
 * split is already exactly "did fontkit's shaper apply a contextual
 * substitution to this string" (`substituted(text)` in
 * `shapingGuardHarness.js`), so a sabotage gated on that same predicate hits
 * every case and zero calibration strings *by construction*, unlike
 * Devanagari's harder problem of separating a shared function's two callers.
 * Patched `evalOne`'s reconstruction call, locally and temporarily, to
 * reverse glyph draw order only when `substituted(text)` is true (the same
 * technique Devanagari's guard used, but gated on the exact predicate that
 * already decides bucket membership here, so it cannot mask itself the way a
 * broader change could) and re-ran: **220/245 substituting cases failed,
 * with the 233-string calibration/floor measurement byte-for-byte unchanged
 * (rasteriser floor 0.01%, displacement floor 0.00%, both identical to the
 * clean run)**. The 25 substituting cases that still passed are cases whose
 * reversed draw order happens not to move enough ink to clear tolerance
 * (short two-glyph strings and a few ligated single-output-glyph conjuncts,
 * where reversing a one-element array is a no-op) - an honest partial
 * result, not a clean 100%, and reported as measured rather than rounded up.
 * It is still decisive: the guard caught the overwhelming majority of a
 * real, deliberately-introduced shaping disagreement while leaving the floor
 * untouched, proving it detects rather than rubber-stamps. Reverted before
 * committing; not part of the shipped harness or spec.
 *
 * **Geometry: 400px, matching the current standard (Bengali/Devanagari),
 * not the smaller un-re-geometried size Gurmukhi/Telugu/Tamil still carry.**
 * Above Skia's ~256px bitmap-glyph cache limit, `fillText` and the guard's
 * `Path2D` reconstruction both rasterise through paths instead of disagreeing
 * along antialiased bitmap edges - see the "Two artefacts" note in
 * `shapingGuardHarness.js`. Built fresh, so there is no smaller-geometry
 * result to compare against for this font.
 *
 * **Result at last run: 245/245 passed.** Of 478 corpus strings, 233 shape
 * with no contextual substitution (calibration set: rasteriser floor 0.01%,
 * displacement floor 0.00% - this platform does not quantise advances) and
 * 245 substitute and are the cases under test, all passing at the 4%
 * tolerance floor with zero KNOWN_FONTKIT_DIVERGENCES entries needed. Unlike
 * Bengali/Gurmukhi's Noto faces, Anek Malayalam produced no narrow, isolated
 * divergence to name - every generated case matched Chromium's own
 * rendering.
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
  scriptName: 'Malayalam',
  candidateName: 'AnekMalayalam',
  fontFileName: 'AnekMalayalam-Regular.ttf',
  corpus: MALAYALAM_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  ...GEOMETRY,
  test,
  expect,
});
