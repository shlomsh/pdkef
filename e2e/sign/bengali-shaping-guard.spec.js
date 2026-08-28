import { test, expect } from '@playwright/test';
import { CONSONANTS, BENGALI_CORPUS } from './fixtures/bengaliCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Bengali correctness guard for the Noto Sans Bengali catalogue candidate
 * (CLAUDE.md's Bengali entry). Bengali is a complex Brahmic script sharing
 * Devanagari's failure modes - vowel-sign reordering, conjunct ligation,
 * and post-forms (reph, ra-phala, ya-phala) that move relative to where
 * they were typed - so this is a PIXEL guard on the same model as
 * devanagari-shaping-guard.spec.js, not the CJK guards' advance-parity
 * model: where fontkit and Chromium can select a genuinely different glyph,
 * only pixels catch it. The shared mechanics (bundling, canvas
 * reconstruction, pixel-diff, pass/fail reporting) live in
 * `./fixtures/shapingGuardHarness.js`; this file supplies only what's
 * Bengali-specific: the corpus, the calibration set, and the geometry.
 *
 * Bengali is Bidi_Class L (left-to-right internally, unlike Hebrew/Arabic),
 * so this guard anchors at a fixed left pen position with no RTL handling -
 * same as Devanagari.
 *
 * **Calibration set, same shape of reasoning as the Devanagari guard's.**
 * Devanagari's own history (see that spec's module doc) proved a single
 * bare-glyph calibration set understates noise, and that the right shape of
 * calibration ink is "every base letter, plus every base letter with a
 * plain non-reordering, non-conjunct second glyph" - not because Bengali
 * necessarily fails the same way, but because there is no reason to expect
 * its antialiasing noise is a smaller unit than Devanagari's turned out to
 * be, and the cost of calibrating narrower is a false failure, not a missed
 * one. The calibration set here is every consonant alone, plus every
 * consonant + the plain post-base AA vowel sign ('া', U+09BE) - AA never
 * reorders and never triggers a conjunct in Bengali either, so it carries
 * no shaping ambiguity and is not circular with anything this guard judges.
 *
 * **Three real, measured fontkit-vs-Chromium disagreements were found and
 * are excluded from the corpus, not tuned away** - see
 * `KNOWN_FONTKIT_DIVERGENCES` in `./fixtures/bengaliCorpus.js` for the exact
 * cases and measurements (two retroflex-consonant ra-phala positioning
 * cases, one doubled-consonant conjunct fontkit fails to ligate). Both were
 * confirmed real by isolating each case with a *fresh* fontkit Font
 * instance (see the next paragraph for why that isolation mattered) before
 * concluding it wasn't the same artifact.
 *
 * **A second, unrelated thing looked like a shaper disagreement and
 * was not one.** Building this guard, `ঢা` (a single consonant + the plain
 * AA sign - exactly the shape the calibration set is supposed to have zero
 * ambiguity on) initially failed at 52% diff, with fontkit inserting a
 * spurious dotted-circle glyph as though the vowel sign had no valid base.
 * Bisecting found the real cause: `shapingGuardHarness.js`'s `shape()` used
 * to reuse *one* fontkit Font instance across the whole run, and calling
 * `glyph.path` (needed for canvas reconstruction) on roughly a dozen prior,
 * unrelated Bengali strings left that shared instance's internal state such
 * that a later, independent `layout()` call on a completely different
 * string returned a wrong glyph sequence - reproduced in plain Node with no
 * browser involved, and confirmed to require `.path` access specifically
 * (a loop of bare `layout()` calls, however long, never corrupted anything).
 * That is a defect in this test methodology's reuse of one Font object, not
 * in Noto Sans Bengali or in fontkit's shaping of this text - and it does
 * not reach the real export, which never calls `.path` (pdf-lib copies
 * `glyf` bytes directly rather than rendering an SVG outline). Fixed in the
 * shared harness (`shape()`/`substituted()` now create a fresh instance per
 * call), which is why this file does not special-case `ঢা` and every other
 * guard using the harness still passes at its original count.
 *
 * **Result at last run: 259/259 passed** (three known-divergent cases
 * excluded, see above), noise floor 9.65%, tolerance 14.48%.
 */

const CALIBRATION_VOWEL_SIGN = 'া'; // plain post-base AA - not pre-base, not tested by the corpus itself
const CALIBRATION_SET = [
  ...CONSONANTS,
  ...CONSONANTS.map((consonant) => consonant + CALIBRATION_VOWEL_SIGN),
];

createShapingGuardTest({
  scriptName: 'Bengali',
  candidateName: 'NotoSansBengali',
  fontFileName: 'NotoSansBengali-Regular.ttf',
  direction: 'ltr',
  size: 100,
  canvasWidth: 500,
  canvasHeight: 200,
  anchorX: 20,
  baselineY: 120,
  corpus: BENGALI_CORPUS,
  calibrationSet: CALIBRATION_SET,
  minTolerancePct: 4,
  test,
  expect,
});
