import { test, expect } from '@playwright/test';
import { ARABIC_CORPUS, PASHTO_CORPUS, DUAL_JOINING_LETTERS, NON_JOINING_LETTERS } from './fixtures/arabicCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Arabic correctness guard for the Scheherazade New catalogue candidate
 * (TODO.md, "Internationalization: fonts for scripts beyond Hebrew/Latin",
 * the Pashto entry - Scheherazade New replaced Almarai 2026-08-28 after a
 * five-candidate screening found it the only face that also draws Pashto's
 * eleven missing letters; see RETIRED_FONTS in src/lib/fonts.js). Modeled on
 * devanagari-shaping-guard.spec.js's method, and now
 * built on the same shared harness (`./fixtures/shapingGuardHarness.js`) -
 * but Arabic's correctness question is different from Devanagari's: it is
 * *joining* (does fontkit's ArabicShaper pick the right init/medi/fina/isol
 * glyph and connect it correctly), not reordering or conjunct formation. See
 * arabicCorpus.js's own doc comment for exactly which joining rules the four
 * generated groups each target.
 *
 * **RTL anchoring, unlike the Devanagari guard.** Devanagari is Bidi_Class L
 * (left-to-right internally), so that guard anchors at a fixed left pen
 * position with no direction handling at all. Arabic is Bidi_Class AL and
 * the app renders and exports it right-anchored (see `usesRtlAnchoring` in
 * src/editor/registry/text.ts and the RTL text box growth behavior it exists
 * for) - so this guard fixes a RIGHT edge and grows leftward
 * (`direction: 'rtl'` below drives both the native `ctx.direction`/
 * `textAlign` and the `fk.layout()` direction argument inside the shared
 * harness). This was calibrated interactively before being written into this
 * file: the first attempt anchored native `fillText` with `ctx.textAlign =
 * 'left'` at a fixed x while computing the reconstruction's start pen as `x
 * - totalWidth` (i.e. simulating right anchoring from a left-anchored
 * primitive) and appeared to disagree by 70-85% - which turned out to be a
 * test-harness bug (a stale `FontFace` registered on a page since navigated
 * away from, so "native" was silently measuring a fallback system font, not
 * Almarai - the exact hazard CLAUDE.md's Layer-1-harness section warns
 * about: "assert the measurement discriminates before trusting what it
 * says"). With the font correctly loaded and RTL anchoring used natively
 * (verified to agree pixel-for-pixel, 0% diff, with a left-anchored render
 * placed at the measured width), the true shaping agreement is in the same
 * single-digit-percent band the Devanagari guard found.
 *
 * **The noise floor is calibrated across the whole alphabet, not one glyph -
 * unlike Devanagari's consonant+mark pairs, and measured before being
 * assumed.** The first version of this file used a single calibration glyph
 * ('م', mirroring the Devanagari guard's original one bare consonant) and
 * every real case failed against it, including single-letter isolated-form
 * cases with exactly one glyph and zero shaping decisions involved
 * (`isolated:ب`, glyph count 1). That is the "guard fails on literally
 * nothing to get wrong" signature of a harness problem, not a shaper
 * problem - confirmed by measuring the same zero-shaping isolated-form diff
 * for all 28 base letters: it ranges from 0.63% (ا, a single straight
 * stroke) to 11.44% (ز, a thin curve plus a small dot, the kind of fine
 * detail whose antialiased edge is a large fraction of the glyph's own ink).
 * Arabic letterforms in this font are far more heterogeneous in stroke
 * weight and fine detail than Devanagari's or Latin's, so a single
 * calibration glyph can land anywhere in that range by chance - 'م' happened
 * to land low (5.45%), which is what produced the false failures. The fix is
 * the same principle applied elsewhere (assert a probe discriminates before
 * trusting it): calibrate against the *maximum* zero-shaping diff across
 * every base letter in the corpus's own alphabet.
 *
 * **Two honest limits of that calibration, so nobody reads more into a green
 * run than it earns.** First, the floor is a max over the isolated forms,
 * and the corpus contains those same isolated forms, so the `isolated:*`
 * cases cannot fail by construction - the joining, ligature and word cases
 * are what actually carry this guard. Second, a max-based tolerance is
 * deliberately permissive: it buys freedom from false failures at the cost
 * of not detecting a divergence smaller than the noisiest glyph's own
 * antialiasing. What it does still catch was verified rather than assumed -
 * disabling joining entirely (shaping each character alone and
 * concatenating, i.e. exactly the "no Arabic support" defect this font was
 * added to fix) fails 79 of the 131 cases. The 52 that survive that sabotage
 * are the ones where joining is a no-op: isolated forms and the non-joining
 * letters. **Result at last run: 131/131 passing**, noise floor 12.91%,
 * tolerance 19.37%.
 *
 * **Extended 2026-08-25 to cover Dari/Farsi**, added to `ARABIC_CORPUS`
 * rather than a new guard file - see `persianPositionalFormsCases`/
 * `persianNonJoiningFormsCases`/`persianRealisticCases` in
 * `./fixtures/arabicCorpus.js` for why one guard covers both scripts.
 *
 * **Re-geometried 2026-08-29 (SIGN-19), because this guard passed on macOS and
 * failed 18/151 on the Linux CI runner.** The size below is 320px rather than
 * 80px and the canvas grew with it. That is not cosmetic: above Skia's
 * bitmap-glyph size limit (~256px) `fillText` rasterises through the same path
 * rasteriser `Path2D` uses, so the rasteriser half of the disagreement stops
 * existing. Measured on this corpus: the noise floor drops 14.89% -> 0.00% on
 * macOS and 2.76% -> 0.00% on Linux, so the tolerance falls from 22.33% to the
 * 3% declared minimum - **a 7x tightening, not a loosening** - while the
 * sabotage control (shaping every character in isolation, i.e. no joining at
 * all) still fails 119 of 151 cases. 240px was measured too and is NOT enough
 * (floor 5.79%), which is what locates the threshold. See the "Two artefacts"
 * note in `./fixtures/shapingGuardHarness.js` for the second artefact, the one
 * that could not be removed and is measured instead.
 *
 * **The calibration set is still the alphabet, and that is now a stated
 * limit rather than an oversight.** Arabic joins, so every multi-glyph string
 * shapes through a substitution and there is no such thing as multi-glyph
 * zero-ambiguity Arabic ink to calibrate a pen-accumulation floor from - this
 * was measured, not assumed: runs of "non-joining" letters report
 * `substituted: true` from two letters upward. That is exactly why the
 * harness measures the accumulation term separately, off the reconstruction's
 * own rounded self rather than off a calibration string.
 */

const ALPHABET = [...DUAL_JOINING_LETTERS, ...NON_JOINING_LETTERS];

/**
 * Shared by both guards below. 320px clears Skia's bitmap-glyph limit (see the
 * module doc); the canvas is 4x the old 600x200 so the widest corpus string
 * (`phrase:jumhuriya`, 1,932px at this size) still fits inside `anchorX`, which
 * the harness now asserts rather than leaving to inspection.
 */
const GEOMETRY = {
  size: 320,
  canvasWidth: 2400,
  canvasHeight: 800,
  anchorX: 2280, // canvasWidth - 120, the right anchor edge text grows leftward from
  baselineY: 520,
};

createShapingGuardTest({
  scriptName: 'Arabic',
  candidateName: 'Scheherazade New',
  fontFileName: 'ScheherazadeNew-Regular.ttf',
  direction: 'rtl',
  ...GEOMETRY,
  corpus: ARABIC_CORPUS,
  calibrationSet: ALPHABET,
  minTolerancePct: 3,
  test,
  expect,
});

/**
 * Pashto's eleven letters, screened separately from the rest of ARABIC_CORPUS
 * (see PASHTO_CORPUS's doc comment in ./fixtures/arabicCorpus.js) because
 * they have no Arabic joining-rule equivalent to check against - only
 * whether Scheherazade New draws them at all, isolated and joined. Uses its
 * own `bundleFilename` so this test's fontkit bundle doesn't race the Arabic
 * guard's above (see createShapingGuardTest's doc comment on why two guards
 * sharing one bundle path is unsafe).
 */
createShapingGuardTest({
  scriptName: 'Pashto',
  candidateName: 'Scheherazade New',
  fontFileName: 'ScheherazadeNew-Regular.ttf',
  direction: 'rtl',
  ...GEOMETRY,
  corpus: PASHTO_CORPUS,
  calibrationSet: ALPHABET,
  minTolerancePct: 3,
  bundleFilename: '__e2e-pashto-fontkit-bundle.js',
  test,
  expect,
});
