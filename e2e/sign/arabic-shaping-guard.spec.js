import { test, expect } from '@playwright/test';
import { ARABIC_CORPUS, DUAL_JOINING_LETTERS, NON_JOINING_LETTERS } from './fixtures/arabicCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Arabic correctness guard for the Almarai catalogue candidate (TODO.md,
 * "Internationalization: fonts for scripts beyond Hebrew/Latin", the Arabic
 * entry). Modeled on devanagari-shaping-guard.spec.js's method, and now
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
 */

const ALPHABET = [...DUAL_JOINING_LETTERS, ...NON_JOINING_LETTERS];

createShapingGuardTest({
  scriptName: 'Arabic',
  candidateName: 'Almarai',
  fontFileName: 'Almarai-Regular.ttf',
  direction: 'rtl',
  size: 80,
  canvasWidth: 600,
  canvasHeight: 200,
  anchorX: 570, // CANVAS_W (600) - 30, the right anchor edge text grows leftward from
  baselineY: 130,
  corpus: ARABIC_CORPUS,
  calibrationSet: ALPHABET,
  minTolerancePct: 3,
  test,
  expect,
});
