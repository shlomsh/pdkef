import { test, expect } from '@playwright/test';
import { CONSONANTS, preBaseVowelCases, rephCases, raphalaCases, yaphalaCases, conjunctCases } from './fixtures/bengaliCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Bengali correctness guard for Hind Siliguri (FONT-08b - the catalogue's
 * second Bengali/Assamese face, added alongside the existing Noto Sans
 * Bengali). Reuses the exact case-generation logic bengaliCorpus.js already
 * has for the five shaping axes (preBaseVowel, reph, raphala, yaphala,
 * conjuncts - see that file's module doc for the full derivation), but
 * imports the raw per-group arrays rather than `BENGALI_CORPUS` itself:
 * `BENGALI_CORPUS` already excludes the six `KNOWN_FONTKIT_DIVERGENCES`
 * measured against Noto Sans Bengali, and per .claude/rules/fonts-and-text.md's
 * Bengali paragraph, "those are Noto's, not yours" - inheriting that filter
 * here would silently exempt Hind Siliguri from exactly the cases most likely
 * to expose a font-specific disagreement, rather than measuring its own.
 * This file's corpus is therefore the full, unfiltered 262 cases.
 *
 * Bengali is Bidi_Class L, so this guard anchors at a fixed left pen position
 * with no RTL handling - same as the Noto Sans Bengali guard.
 *
 * **Self-calibrating (`autoCalibrate: true`), not a fixed calibration set -
 * unlike the Noto Sans Bengali guard.** That guard could hand-pick "every
 * consonant plus every consonant + the plain AA sign" as zero-ambiguity ink
 * because Noto Sans Bengali's own akhn/blwf/vatu/pstf/rphf GSUB features were
 * read directly off its font tables first. This project has no equivalent
 * in-house reference for Hind Siliguri's shaping rules, so per the same
 * reasoning gurmukhiCorpus.js/teluguCorpus.js/tamilCorpus.js/malayalamCorpus.js
 * give for their own guards, `autoCalibrate` partitions the corpus by
 * fontkit's own judgment instead: strings it shapes identically to a plain
 * per-codepoint cmap lookup become the calibration set, strings it applies
 * any contextual substitution to become the cases under test - the only set
 * where fontkit and the browser could possibly disagree on a letterform.
 *
 * **Geometry: 400px, matching the current standard (Bengali/Devanagari/
 * Malayalam), not the smaller un-re-geometried size Gurmukhi/Telugu/Tamil
 * still carry.** Above Skia's ~256px bitmap-glyph cache limit, `fillText` and
 * the guard's `Path2D` reconstruction both rasterise through paths instead of
 * disagreeing along antialiased bitmap edges - see the "Two artefacts" note
 * in `shapingGuardHarness.js`. Built fresh at this geometry, so there is no
 * smaller-geometry result to compare against for this font.
 *
 * **The five axis groups alone give `autoCalibrate` nothing to partition
 * from.** Unlike Gurmukhi/Telugu/Tamil/Malayalam's corpora, which are broad
 * systematic cross-products wide enough to contain plenty of naturally
 * non-substituting combinations, `bengaliCorpus.js`'s five groups are each
 * curated specifically to trigger a shaping feature (pre-base reordering,
 * reph, ra-phala, ya-phala, conjunct ligation) - every one of the 262 cases
 * substitutes in fontkit by construction, so a first pass at this guard
 * measured 0/262 non-substituting and failed outright (`need >= 5 to
 * calibrate a noise floor`). Filler with the same shape of zero-ambiguity ink
 * the Noto Sans Bengali guard's own hand-picked `CALIBRATION_SET` uses - bare
 * consonants and consonant+plain-AA pairs, both already proven non-reordering
 * and non-conjunct-forming there - is added below so `autoCalibrate` has
 * material to partition; unlike that guard, membership here is still decided
 * by fontkit's own measured `substituted()` result, not asserted.
 *
 * **Result at last run (2026-09-12): 262/262 passed, zero divergent cases.**
 * 322 corpus strings total (262 shaping-axis cases + 60 calibration filler);
 * 60 non-substituting (calibration set: rasteriser floor 0.00%,
 * advance-quantisation floor 0.00% - this platform does not quantise
 * advances), 262 substituting and under test, all at the 4% tolerance floor.
 * Unlike Noto Sans Bengali's six named divergences, Hind Siliguri produced no
 * narrow, isolated disagreement to name - every generated case matched
 * Chromium's own rendering, on all five shaping axes (pre-base vowel
 * reordering, reph, ra-phala, ya-phala, conjuncts).
 *
 * **Sabotage control, run once while authoring this guard (not a shipped
 * assertion - see malayalam-shaping-guard.spec.js's module doc for the same
 * technique and why it is safe against masking itself here).** Patched
 * `evalOne`'s reconstruction call, locally and temporarily, to reverse glyph
 * draw order only when `substituted(text)` is true, and re-ran: **208/262
 * substituting cases failed, with the 60-string calibration/floor
 * measurement unchanged (rasteriser floor 0.00%, advance-quantisation floor
 * 0.00%, both identical to the clean run)**. The 54 substituting cases that
 * still passed are cases whose reversed draw order happens not to move
 * enough ink to clear tolerance (two-glyph ya-phala/ra-phala strings and a
 * few ligated single-output-glyph conjuncts, where reversing a one- or
 * two-element array can be a no-op or near-no-op) - an honest partial
 * result, not a clean 100%, reported as measured. It is still decisive: the
 * guard caught the large majority of a real, deliberately-introduced
 * shaping disagreement while leaving the floor untouched, proving it
 * detects rather than rubber-stamps. Reverted before committing; not part
 * of the shipped harness or spec.
 *
 * **Advance-parity spot check (SIGN-20-style, not a shipped assertion - see
 * devanagari-mukta-shaping-guard.spec.js's module doc for the same
 * one-off-check discipline).** fontkit's summed shaped glyph advances vs.
 * this same browser's `measureText` on all 322 corpus + calibration strings:
 * **max widthDiff 0.000px**, comfortably inside SIGN-19's `glyphCount x
 * 0.5px` rounding bound (zero cases exceeded it). Not wired as a standing
 * assertion here (SIGN-20's scope, tracked separately in TODO.md) - a
 * one-off screening check, not a permanent guard.
 */

const CALIBRATION_VOWEL_SIGN = 'া'; // plain post-base AA - see bengali-shaping-guard.spec.js's own use of this sign
const calibrationFillerCases = [
  ...CONSONANTS.map((consonant) => ({ id: `calibrationFiller:${consonant}`, text: consonant })),
  ...CONSONANTS.map((consonant) => ({ id: `calibrationFiller:${consonant}+AA`, text: consonant + CALIBRATION_VOWEL_SIGN })),
];

const FULL_BENGALI_CORPUS = [
  ...preBaseVowelCases,
  ...rephCases,
  ...raphalaCases,
  ...yaphalaCases,
  ...conjunctCases,
  ...calibrationFillerCases,
];

const GEOMETRY = {
  direction: 'ltr',
  size: 400,
  canvasWidth: 2000,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
};

createShapingGuardTest({
  scriptName: 'Bengali',
  candidateName: 'HindSiliguri',
  fontFileName: 'HindSiliguri-Regular.ttf',
  corpus: FULL_BENGALI_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  // Two guards under scriptName "Bengali" (this one and Noto Sans Bengali's)
  // would otherwise collide on the same fontkit bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-bengali-hindsiliguri-fontkit-bundle.js',
  ...GEOMETRY,
  test,
  expect,
});
