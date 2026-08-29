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
 * **Six real, measured fontkit-vs-Chromium disagreements are excluded from
 * the corpus, not tuned away** - see
 * `KNOWN_FONTKIT_DIVERGENCES` in `./fixtures/bengaliCorpus.js` for the exact
 * cases and measurements (three cases where fontkit misplaces a component
 * part attached to a retroflex consonant, one doubled-consonant conjunct
 * fontkit fails to ligate, one conjunct fontkit draws without its headline, and
 * one whose ink is right but whose advance is 18% short). Each was confirmed real by isolating the case with a *fresh*
 * fontkit Font instance (see the next paragraph for why that isolation
 * mattered) before concluding it wasn't the same artifact.
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
 * **Re-geometried 2026-08-29 (SIGN-19).** The size below is 400px rather than
 * 100px, for the reason set out in the "Two artefacts" note in
 * `./fixtures/shapingGuardHarness.js`: above Skia's bitmap-glyph limit
 * (~256px) `fillText` and `Path2D` go through one rasteriser instead of two,
 * and the rasteriser half of the noise stops existing. Measured here: floor
 * 9.65% -> 0.00% on macOS, 5.52% -> 1.41% on Linux. Noto Sans Bengali is
 * already clean at 300px where Scheherazade New is not, which is the second,
 * independent confirmation of where that threshold sits.
 *
 * **Raising the size surfaced a divergence the old geometry hid**, which is
 * the point of raising it: `preBaseVowel:ট+vowelSignI` sat at 13.78% against a
 * 14.48% tolerance on macOS - passing by 0.7 points, which was never evidence
 * of anything - and it is a real disagreement. It is now a named entry in
 * `KNOWN_FONTKIT_DIVERGENCES` with the rest.
 *
 * **The calibration set now spans the corpus's glyph counts.** It used to be
 * one- and two-glyph strings only while the corpus runs to three, and a floor
 * measured on shorter ink than it judges is an under-measurement - that is
 * half of what made this guard read differently on the two platforms. Plain
 * consonant runs are the right filler: Bengali consonants with no virama
 * between them form no conjunct, so a run of two or three carries no shaping
 * ambiguity (verified - they report `substituted: false` at every length), and
 * the harness now asserts that for every calibration string rather than
 * trusting this paragraph.
 *
 * **Result at last run: 256/256 passed** (six known-divergent cases excluded,
 * see `KNOWN_FONTKIT_DIVERGENCES`).
 */

const CALIBRATION_VOWEL_SIGN = 'া'; // plain post-base AA - not pre-base, not tested by the corpus itself
const CALIBRATION_SET = [
  ...CONSONANTS,
  ...CONSONANTS.map((consonant) => consonant + CALIBRATION_VOWEL_SIGN),
  // Three-glyph ink, to match the corpus's longest cases. Consonants with no
  // virama between them never form a conjunct, so these shape one-to-one.
  ...CONSONANTS.map((consonant, i) => consonant + CONSONANTS[(i + 1) % CONSONANTS.length] + CONSONANTS[(i + 2) % CONSONANTS.length]),
];

createShapingGuardTest({
  scriptName: 'Bengali',
  candidateName: 'NotoSansBengali',
  fontFileName: 'NotoSansBengali-Regular.ttf',
  direction: 'ltr',
  size: 400,
  canvasWidth: 2000,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
  corpus: BENGALI_CORPUS,
  calibrationSet: CALIBRATION_SET,
  minTolerancePct: 4,
  test,
  expect,
});
